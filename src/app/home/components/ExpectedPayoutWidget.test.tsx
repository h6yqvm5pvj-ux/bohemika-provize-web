// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../homePerformance", () => ({ startHomeTiming: () => () => {} }));
const mocks = vi.hoisted(() => ({ data: vi.fn(), calculate: vi.fn(), section: vi.fn() }));
vi.mock("@/app/cashflow/useCashflowData", () => ({ useCashflowData: mocks.data }));
vi.mock("../expectedPayout.client", () => ({ calculateExpectedPayout: mocks.calculate }));
vi.mock("./ExpectedPayoutSection", () => ({ ExpectedPayoutSection: mocks.section }));
import { ExpectedPayoutWidget } from "./ExpectedPayoutWidget";

describe("home payout source synchronization", () => {
  let root: Root;
  let resolveFetch: (response: Response) => void;
  let resolveCalculation: (result: unknown) => void;
  const user = { uid: "test", getIdToken: vi.fn(async () => "synthetic") } as unknown as User;
  const snapshot = { email: "advisor@example.test", ownEntries: [], teamEntriesRaw: [] };
  const render = (reloadKey = 0, advisor = snapshot.email) => act(async () => root.render(<ExpectedPayoutWidget language="cs" user={user}
    advisorDataEmail={advisor} homeReloadKey={reloadKey} periodLabel="září" isLiteUI />));
  const current = () => mocks.section.mock.calls.at(-1)![0];
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.data.mockReturnValue({ loading: false, ready: true, rawSnapshot: snapshot, snapshotUpdatedAt: 1_790_000_000_000, error: null });
    mocks.section.mockReturnValue(null);
    mocks.calculate.mockImplementation(() => new Promise(resolve => { resolveCalculation = resolve; }));
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { resolveFetch = resolve; })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    root = createRoot(document.createElement("div"));
  });
  afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });


  it("preserves the last good payout and its source time on failed refresh, then recovers", async () => {
    await render();
    await act(async () => resolveFetch(Response.json({ ok: true, items: [], hasMore: false, processingComplete: true })));
    await act(async () => resolveCalculation({ grossAmount: 100, stornoFundAmount: 10, netAmount: 90 }));
    const updatedAt = current().updatedAt;
    expect(updatedAt).toBe(1_790_000_000_000);
    await render(1);
    expect(current()).toMatchObject({ loading: true, updatedAt, netAmount: 90 });
    expect(mocks.calculate).toHaveBeenCalledOnce();
    await act(async () => resolveFetch(Response.json({ ok: false }, { status: 503 })));
    expect(current()).toMatchObject({ loading: false, updatedAt, netAmount: 90 });
    expect(current().error).toBeTruthy();
    await render(2);
    await act(async () => resolveFetch(Response.json({ ok: true, items: [], hasMore: false, processingComplete: true })));
    await act(async () => resolveCalculation({ grossAmount: 200, stornoFundAmount: 20, netAmount: 180 }));
    expect(current()).toMatchObject({ loading: false, error: null, netAmount: 180 });
  });

  it("does not calculate from cached contracts when their refresh failed", async () => {
    mocks.data.mockReturnValue({ loading: false, ready: true, rawSnapshot: snapshot, error: "Podklady selhaly" });
    await render();
    await act(async () => resolveFetch(Response.json({ ok: true, items: [], hasMore: false, processingComplete: true })));
    expect(current()).toMatchObject({ loading: false, error: "Podklady selhaly" });
    expect(mocks.calculate).not.toHaveBeenCalled();
  });

  it("hides the old payout immediately on account changes", async () => {
    await render();
    await act(async () => resolveFetch(Response.json({ ok: true, items: [], hasMore: false, processingComplete: true })));
    await act(async () => resolveCalculation({ grossAmount: 100, stornoFundAmount: 10, netAmount: 90 }));
    mocks.data.mockReturnValue({ loading: true, ready: false, rawSnapshot: null });
    await render(0, "another@example.test");
    expect(current()).toMatchObject({ loading: true, updatedAt: undefined, netAmount: 0 });
  });

  it("waits for complete statements and inputs, computes once, and requests no duplicate main-thread calculation", async () => {
    await render();
    expect(current().loading).toBe(true); expect(mocks.calculate).not.toHaveBeenCalled();
    expect(mocks.data).toHaveBeenCalledWith(expect.objectContaining({ snapshotOnly: true }));
    await act(async () => resolveFetch(Response.json({ ok: true, items: [], hasMore: false, processingComplete: true })));
    expect(mocks.calculate).toHaveBeenCalledOnce();
    expect(current().loading).toBe(true);
    await act(async () => resolveCalculation({ grossAmount: 100, stornoFundAmount: 10, netAmount: 90 }));
    expect(current()).toMatchObject({ loading: false, error: null, netAmount: 90 });
  });
  it.each(["failure", "truncated", "processing"])("shows an error instead of a false zero when statements are %s", async reason => {
    await render();
    await act(async () => resolveFetch(reason === "failure" ? Response.json({ ok: false }, { status: 503 })
      : Response.json({ ok: true, items: [], hasMore: reason === "truncated", processingComplete: reason !== "processing" })));
    expect(current().error).toContain("nepodařilo načíst úplně");
    expect(current().loading).toBe(false); expect(mocks.calculate).not.toHaveBeenCalled();
  });
  it("cancels the active calculation on unmount and ignores its late result", async () => {
    await render();
    await act(async () => resolveFetch(Response.json({ ok: true, items: [], hasMore: false, processingComplete: true })));
    const signal = mocks.calculate.mock.calls[0][1] as AbortSignal;
    const commits = mocks.section.mock.calls.length;
    await act(async () => root.unmount());
    expect(signal.aborted).toBe(true);
    await act(async () => resolveCalculation({ grossAmount: 999, stornoFundAmount: 0, netAmount: 999 }));
    expect(mocks.section).toHaveBeenCalledTimes(commits);
    root = createRoot(document.createElement("div"));
  });
});
