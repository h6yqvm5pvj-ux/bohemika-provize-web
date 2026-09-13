import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  createJiti: vi.fn(),
  withMutation: vi.fn(),
  trackWrite: vi.fn(),
}));
vi.mock("jiti", () => ({ createJiti: mocks.createJiti }));

const importBridge = () => import("../../../scripts/cashflow-mutation.mjs");

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.createJiti.mockReturnValue(mocks.load);
  mocks.load.mockReturnValue({
    withCashflowMutation: mocks.withMutation,
    trackCashflowWrite: mocks.trackWrite,
  });
  mocks.withMutation.mockImplementation((_reason: string, work: () => Promise<unknown>) => work());
  mocks.trackWrite.mockImplementation((work: () => Promise<unknown>) => work());
});
afterEach(() => vi.unstubAllEnvs());

describe("maintenance script cashflow bridge", () => {
  it("passes through results and original failures without loading the runtime when disabled", async () => {
    vi.stubEnv("CASHFLOW_CACHE_TRACK_WRITES", "");
    const { withCashflowScriptMutation, trackCashflowScriptWrite } = await importBridge();
    const db = {} as import("firebase-admin/firestore").Firestore;
    const result = { written: 2 };
    expect(await withCashflowScriptMutation("test", () => trackCashflowScriptWrite(async () => result, db))).toBe(result);
    const failure = new Error("original SDK failure");
    await expect(withCashflowScriptMutation("test", () => trackCashflowScriptWrite(async () => { throw failure; }, db))).rejects.toBe(failure);
    expect(mocks.createJiti).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("lazily shares the existing runtime and passes the script's own Firestore instance", async () => {
    vi.stubEnv("CASHFLOW_CACHE_TRACK_WRITES", "1");
    const { withCashflowScriptMutation, trackCashflowScriptWrite } = await importBridge();
    expect(mocks.createJiti).not.toHaveBeenCalled();
    const db = {} as import("firebase-admin/firestore").Firestore;
    const first = vi.fn(async () => 1);
    const second = vi.fn(async () => 2);
    const result = await withCashflowScriptMutation("maintenance:two-batches", () => Promise.all([
      trackCashflowScriptWrite(first, db),
      trackCashflowScriptWrite(second, db),
    ]));
    expect(result).toEqual([1, 2]);
    expect(mocks.createJiti).toHaveBeenCalledOnce();
    expect(mocks.createJiti.mock.calls[0]?.[1]).toEqual({ alias: { "@": expect.stringMatching(/\/src$/) } });
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith("../src/lib/server/cashflowMutationTracking.ts");
    expect(mocks.withMutation).toHaveBeenCalledWith("maintenance:two-batches", expect.any(Function));
    expect(mocks.trackWrite).toHaveBeenNthCalledWith(1, first, db);
    expect(mocks.trackWrite).toHaveBeenNthCalledWith(2, second, db);
  });

  it("does not start a script write if loading the enabled tracking runtime fails", async () => {
    vi.stubEnv("CASHFLOW_CACHE_TRACK_WRITES", "1");
    const failure = new Error("tracking runtime unavailable");
    mocks.load.mockImplementation(() => { throw failure; });
    const { withCashflowScriptMutation } = await importBridge();
    const work = vi.fn(async () => "written");
    await expect(withCashflowScriptMutation("test", work)).rejects.toBe(failure);
    expect(work).not.toHaveBeenCalled();
  });
});
