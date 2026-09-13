import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import {
  beginCashflowMutation, captureCashflowRevision, completeCashflowMutation, initializeCashflowCacheState,
} from "./cashflowCacheState";

function fakeState(data: unknown) {
  const snapshot = { exists: data !== undefined, data: () => data };
  const tx = { get: vi.fn(async () => snapshot), create: vi.fn(), set: vi.fn(), update: vi.fn() };
  const db = {
    doc: vi.fn(() => ({ get: async () => snapshot })),
    runTransaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  } as unknown as Firestore;
  return { db, tx };
}
const epoch = "00000000-0000-0000-0000-000000000000";

describe("cashflow barrier fails closed", () => {
  it("a missing state cannot certify a snapshot", async () => {
    const { db } = fakeState(undefined);
    await expect(captureCashflowRevision(db)).resolves.toBeNull();
  });

  it.each([
    null, {}, { epoch, revision: -1, activeCount: 0 },
    { epoch, revision: 1.5, activeCount: 0 },
    { epoch, revision: 0, activeCount: -1 },
    { epoch, revision: 0, activeCount: 1.5 },
    { epoch: "old", revision: 0, activeCount: 0 },
  ])("never silently repairs malformed state %j", async data => {
    const { db, tx } = fakeState(data);
    await expect(captureCashflowRevision(db)).resolves.toBeNull();
    await expect(initializeCashflowCacheState(db)).rejects.toMatchObject({ code: "invalid_state" });
    await expect(beginCashflowMutation(db, "test-write")).rejects.toMatchObject({ code: "invalid_state" });
    expect(tx.create).not.toHaveBeenCalled();
    expect(tx.set).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects revision overflow without writing", async () => {
    const { db, tx } = fakeState({ epoch, revision: Number.MAX_SAFE_INTEGER, activeCount: 0 });
    await expect(beginCashflowMutation(db, "test-write")).rejects.toMatchObject({ code: "invalid_state" });
    expect(tx.set).not.toHaveBeenCalled();
  });

  it("rejects invalid operation IDs before database access", async () => {
    await expect(completeCashflowMutation({} as Firestore, { id: "../global", epoch })).rejects.toMatchObject({ code: "invalid_mutation" });
  });
});
