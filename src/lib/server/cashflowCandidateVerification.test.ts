import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { hashCashflowValue, CASHFLOW_SHADOW_VERSION } from "@/app/cashflow/shadowProtocol";
import { serializeCashflowSnapshot, type CashflowSnapshotResult } from "@/app/cashflow/cashflowSnapshotWire";
const mocks = vi.hoisted(() => ({ capture: vi.fn(), publish: vi.fn(), read: vi.fn() }));
vi.mock("./cashflowCacheState", () => ({ captureCashflowRevision: mocks.capture }));
vi.mock("./cashflowCandidateStore", () => ({ publishCashflowCandidate: mocks.publish, readCashflowCandidate: mocks.read }));
import { beginCashflowCandidateBuild, verifyCashflowCandidateStorage, type CashflowCandidateBuild } from "./cashflowCandidateVerification";

const db = {} as Firestore;
const revision = { epoch: "epoch", revision: 4 };
const context = {
  uid: "token-uid", email: "own@example.test", version: CASHFLOW_SHADOW_VERSION,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, asOfMs: Date.now(),
  options: { scopeFilter: "own", productFilter: "all", tipsterMode: false, showPastYears: true, intelligentPredictionEnabled: false, contractNumberQuery: "" } as const,
};
const build: CashflowCandidateBuild = { db, revision, context };
const result: CashflowSnapshotResult = { items: [], months: [] };
const inputHash = "a".repeat(64);
const expected = async () => ({ itemsHash: await hashCashflowValue(result.items), monthsHash: await hashCashflowValue(result.months) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CASHFLOW_CANDIDATES_ENABLED", "1");
  vi.stubEnv("CASHFLOW_CACHE_TRACK_WRITES", "1");
  mocks.capture.mockResolvedValue(revision);
  mocks.publish.mockResolvedValue(true);
  mocks.read.mockResolvedValue({ revision, inputHash, payload: serializeCashflowSnapshot(result) });
});
afterEach(() => vi.unstubAllEnvs());

describe("cashflow candidate diagnostic verification", () => {
  it.each(["CASHFLOW_CANDIDATES_ENABLED", "CASHFLOW_CACHE_TRACK_WRITES"])("does no control reads with %s disabled", async flag => {
    vi.stubEnv(flag, "");
    expect(await beginCashflowCandidateBuild(db, context)).toBeNull();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it("captures a build fence without creating or resetting control state", async () => {
    expect(await beginCashflowCandidateBuild(db, context)).toEqual(build);
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(db);
  });
  it("falls back on missing database, active mutation, malformed state, or failed control read", async () => {
    expect(await beginCashflowCandidateBuild(null, context)).toBeNull();
    mocks.capture.mockResolvedValue(null);
    expect(await beginCashflowCandidateBuild(db, context)).toBeNull();
    mocks.capture.mockRejectedValue(new Error("unavailable"));
    expect(await beginCashflowCandidateBuild(db, context)).toBeNull();
  });
  it("verifies a complete persisted and reconstructed snapshot", async () => {
    expect(await verifyCashflowCandidateStorage(build, inputHash, result, await expected())).toBe("verified");
    expect(mocks.publish.mock.calls[0][1]).toMatchObject({ context, revision, inputHash });
  });
  it("never calls a rejected publication a verified candidate", async () => {
    mocks.publish.mockResolvedValue(false);
    expect(await verifyCashflowCandidateStorage(build, inputHash, result, await expected())).toBe("revision_changed");
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([null, { revision: { ...revision, revision: 5 } }, { revision: { ...revision, epoch: "new-epoch" } }])("rejects stale or replaced generation on readback (%j)", async stored => {
    mocks.read.mockResolvedValue(stored);
    expect(await verifyCashflowCandidateStorage(build, inputHash, result, await expected())).toBe("revision_changed");
  });
  it("detects a source fingerprint changed in storage", async () => {
    mocks.read.mockResolvedValue({ revision, inputHash: "b".repeat(64), payload: serializeCashflowSnapshot(result) });
    expect(await verifyCashflowCandidateStorage(build, inputHash, result, await expected())).toBe("storage_mismatch");
  });
  it("detects malformed storage and discrepancies in either output hash", async () => {
    expect(await verifyCashflowCandidateStorage(build, inputHash, result, { ...await expected(), monthsHash: "0".repeat(64) })).toBe("storage_mismatch");
    expect(await verifyCashflowCandidateStorage(build, inputHash, result, { ...await expected(), itemsHash: "0".repeat(64) })).toBe("storage_mismatch");
    mocks.read.mockResolvedValue({ revision, inputHash, payload: { version: "bad" } });
    expect(await verifyCashflowCandidateStorage(build, inputHash, result, await expected())).toBe("storage_mismatch");
  });
  it.each(["publish", "read"] as const)("contains %s failures without blocking current cashflow", async operation => {
    mocks[operation].mockRejectedValue(new Error("private database error"));
    expect(await verifyCashflowCandidateStorage(build, inputHash, result, await expected())).toBe("not_stored");
  });
  it("honors cancellation before publication and after publication", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await verifyCashflowCandidateStorage(build, inputHash, result, await expected(), controller.signal)).toBe("not_stored");
    expect(mocks.publish).not.toHaveBeenCalled();
    const later = new AbortController();
    mocks.publish.mockImplementation(async () => { later.abort(); return true; });
    expect(await verifyCashflowCandidateStorage(build, inputHash, result, await expected(), later.signal)).toBe("not_stored");
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
