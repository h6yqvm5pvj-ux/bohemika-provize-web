// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeWorkerFixture } from "../../../scripts/cashflow-worker/fixtures";
import type { CashflowViewOptions } from "./buildCashflowView";
import { createCashflowModel } from "./cashflowModel";
import { CASHFLOW_SERVER_PILOT_VERSION } from "./cashflowServerProtocol";
import type { CashflowWorkerClient } from "./cashflowWorker.client";
import type { CashflowDataset } from "./cashflowWorker.types";

const mocks = vi.hoisted(() => ({
  user: { email: "advisor@example.test", getIdToken: vi.fn(async () => "synthetic-token") },
  createClient: vi.fn(),
  data: vi.fn(),
}));
vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("../firebase", () => ({ auth: { currentUser: mocks.user } }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: typeof mocks.user) => void) => {
    callback(mocks.user);
    return () => {};
  },
}));
vi.mock("@/app/lib/userProfileCache", () => ({
  getUserProfileCached: async () => ({ hasProfile: true, profile: { accountType: "advisor" } }),
}));
vi.mock("./useCashflowData", () => ({ useCashflowData: mocks.data }));
vi.mock("./cashflowWorker.client", () => ({
  createCashflowWorkerClient: ({ dataset }: { dataset: CashflowDataset }) => mocks.createClient(dataset),
}));

import CashflowPage from "./page";

const consoleProbe = readFileSync(resolve(process.cwd(), "scripts/cashflow-pilot-scope-console.js"), "utf8");
const runConsoleProbe = () => runInNewContext(consoleProbe, {
  document, sessionStorage, performance, setTimeout, console, URL,
});

describe("pilot comparisons through the actual page scope buttons", () => {
  let root: Root;
  let container: HTMLDivElement;
  let fixture: ReturnType<typeof makeWorkerFixture>;
  let sent: CashflowViewOptions[];

  const read = () => JSON.parse(sessionStorage.getItem("cashflow_server_pilot_last_result") ?? "null");
  const clickScope = async (label: string) => {
    const group = container.querySelector('[role="group"][aria-label="Smlouvy"]');
    expect(group).not.toBeNull();
    const button = [...group!.querySelectorAll("button")].find(value => value.textContent === label);
    expect(button).toBeDefined();
    await act(async () => button!.click());
  };
  const waitForMatch = () => act(async () => {
    await vi.waitFor(() => expect(read()?.status).toBe("match"));
  });

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubEnv("NEXT_PUBLIC_CASHFLOW_SERVER_PILOT_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_CASHFLOW_SHADOW_ENABLED", "0");
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("cashflow_server_pilot_mode", "compare");
    fixture = makeWorkerFixture(12, new Date());
    sent = [];
    mocks.createClient.mockReset().mockImplementation((dataset: CashflowDataset): CashflowWorkerClient => {
      const model = createCashflowModel(dataset);
      return {
        executionPath: "fallback",
        view: async options => model.view(options),
        month: async key => model.month(key),
        verification: () => model.verification!(),
        dispose: () => model.dispose(),
      };
    });
    mocks.data.mockReset().mockImplementation(({ enabled, forceDeferredCalculation }: { enabled: boolean; forceDeferredCalculation: boolean }) => ({
      ready: true,
      loading: false,
      error: null,
      rawSnapshot: enabled ? fixture.snapshot : null,
      snapshotUpdatedAt: Date.now(),
      calculationDeferred: Boolean(enabled && forceDeferredCalculation),
      cashflowItems: [],
      verificationInput: null,
      hasTeam: true,
      loadingProgress: { percent: 100, label: "", detail: null },
    }));
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url !== "/api/cashflow/view") {
        return Response.json({ ok: true, items: [], hasMore: false, processingComplete: true });
      }
      const body = JSON.parse(init!.body as string);
      sent.push(body.options);
      const model = createCashflowModel({ ...fixture, statements: [], asOf: new Date(body.asOfMs) });
      try {
        const overview = model.view(body.options);
        return Response.json({
          ok: true,
          version: CASHFLOW_SERVER_PILOT_VERSION,
          kind: "view",
          overview,
          ...await model.verification!(),
        });
      } finally {
        model.dispose();
      }
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("records a new own/team comparison after only the previous diagnostic is removed", async () => {
    await act(async () => root.render(<CashflowPage />));
    await waitForMatch();
    expect(sent.at(-1)?.scopeFilter).toBe("combined");
    for (const [label, scope] of [["Týmové", "team"], ["Vlastní", "own"], ["Týmové", "team"], ["Vlastní", "own"]] as const) {
      const count = sent.length;
      sessionStorage.removeItem("cashflow_server_pilot_last_result");
      await clickScope(label);
      await waitForMatch();
      expect(sent).toHaveLength(count + 1);
      expect(sent.at(-1)?.scopeFilter).toBe(scope);
      expect(sessionStorage.getItem("cashflow_server_pilot_mode")).toBe("compare");
    }
  });

  it("stops comparisons when the tab explicitly switches to baseline mode", async () => {
    await act(async () => root.render(<CashflowPage />));
    await waitForMatch();
    const count = sent.length;
    sessionStorage.setItem("cashflow_server_pilot_mode", "baseline");
    await act(async () => window.dispatchEvent(new Event("cashflow:pilot-mode")));
    sessionStorage.removeItem("cashflow_server_pilot_last_result");
    await clickScope("Vlastní");
    expect(read()).toBeNull();
    expect(sent).toHaveLength(count);
    expect(mocks.data).toHaveBeenLastCalledWith(expect.objectContaining({ forceDeferredCalculation: false }));
  });

  it("runs the exact console probe from either selected scope and waits for a fresh comparison", async () => {
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});
    await act(async () => root.render(<CashflowPage />));
    await waitForMatch();
    await clickScope("Týmové");
    await waitForMatch();
    for (const [before, after, scope] of [["Týmové", "Vlastní", "own"], ["Vlastní", "Týmové", "team"]]) {
      const count = sent.length;
      await act(async () => {
        const result = await runConsoleProbe();
        expect(result).toMatchObject({
          predtim: before,
          pozadovanyFiltr: after,
          aktualniFiltr: after,
          porovnani: { kind: "view", status: "match" },
        });
      });
      expect(sent).toHaveLength(count + 1);
      expect(sent.at(-1)?.scopeFilter).toBe(scope);
    }
    expect(logged).toHaveBeenCalledTimes(2);
    expect(logged.mock.calls.flat().join(" ")).not.toMatch(/advisor@example\.test|synthetic-token|clientName|contractNumber/);
  });

  it("refuses the console probe without compare mode and preserves the current diagnostic", async () => {
    await act(async () => root.render(<CashflowPage />));
    await waitForMatch();
    const count = sent.length;
    const previous = sessionStorage.getItem("cashflow_server_pilot_last_result");
    sessionStorage.setItem("cashflow_server_pilot_mode", "baseline");
    await act(async () => window.dispatchEvent(new Event("cashflow:pilot-mode")));
    await expect(runConsoleProbe()).rejects.toThrow("V této kartě není zapnutý režim compare.");
    expect(sent).toHaveLength(count);
    expect(sessionStorage.getItem("cashflow_server_pilot_last_result")).toBe(previous);
  });
});
