import { afterEach, expect, it, vi } from "vitest";
import { makeWorkerFixture } from "../../../scripts/cashflow-worker/fixtures";
import { createCashflowModel } from "./cashflowModel";
import type { CashflowWorkerRequest, CashflowWorkerResponse } from "./cashflowWorker.client";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("runs the real worker message handler and returns only hashes for comparison", async () => {
  const asOf = new Date(2026, 9, 8);
  const dataset = { ...makeWorkerFixture(12, asOf), asOf };
  let handler!: (event: { data: CashflowWorkerRequest }) => Promise<void>;
  const postMessage = vi.fn<(response: CashflowWorkerResponse) => void>();
  const close = vi.fn();
  vi.stubGlobal("self", {
    addEventListener: (_event: string, callback: typeof handler) => { handler = callback; }, postMessage, close,
  });
  vi.resetModules();
  await import("./cashflow.worker");
  const send = (data: CashflowWorkerRequest) => handler({ data: structuredClone(data) });
  const options = { scopeFilter: "combined" as const, productFilter: "all" as const, tipsterMode: false,
    showPastYears: true, intelligentPredictionEnabled: true, contractNumberQuery: "" };
  await send({ kind: "init", id: 0, dataset });
  await send({ kind: "verify", id: 1, revision: 0 });
  expect(postMessage.mock.calls.at(-1)![0].ok).toBe(false);
  await send({ kind: "view", id: 2, revision: 1, options });
  const view = postMessage.mock.calls.at(-1)![0];
  expect(view.kind).toBe("view");
  const reference = createCashflowModel(dataset);
  expect(view).toMatchObject({ result: reference.view(options) });
  await send({ kind: "verify", id: 3, revision: 1 });
  expect(postMessage.mock.calls.at(-1)![0]).toEqual({ kind: "verify", id: 3, revision: 1, ok: true, result: await reference.verification!() });
  if (view.kind !== "view" || !view.ok) throw new Error("View missing");
  const key = view.result.months[0].key;
  await send({ kind: "month", id: 4, revision: 1, key });
  expect(postMessage.mock.calls.at(-1)![0]).toMatchObject({ result: reference.month(key) });
  await send({ kind: "dispose" });
  expect(close).toHaveBeenCalledOnce();
  await send({ kind: "verify", id: 5, revision: 1 });
  expect(postMessage.mock.calls.at(-1)![0].ok).toBe(false);
  reference.dispose();
});
