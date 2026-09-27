import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, Query, type Firestore, type DocumentReference } from "firebase-admin/firestore";
import { loadOwnerHomeProduction } from "../../src/lib/server/homeProduction";
import { withContractHistory } from "../../src/lib/server/contractHistory";
import { markHallOwnerDirty } from "../../src/lib/server/hallOfFameProjection";

let app: App;
let db: Firestore;
const owner = "home-monthly@example.test";
const period = { from: Date.parse("2026-08-01T00:00:00+02:00"), split: Date.parse("2026-09-01T00:00:00+02:00"), to: Date.parse("2026-10-01T00:00:00+02:00") };
beforeAll(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Only local demo Firestore is allowed.");
  app = initializeApp({ projectId: "demo-bohemika-rules" }, "home-monthly-tests");
  db = getFirestore(app);
});
afterAll(async () => { await db?.terminate(); if (app) await deleteApp(app); });
async function change(ref: DocumentReference, patch: Record<string, unknown>) {
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    tx.set(ref, withContractHistory(tx, ref, current.data() ?? {}, patch, { actorEmail: owner }), { merge: true });
  });
}
const data = { userEmail: owner, contractSignedDate: new Date("2026-09-15"), createdAt: new Date("2026-09-20"),
  productKey: "cppAuto", frequencyRaw: "quarterly", inputAmount: 1000,
  items: [{ code: "A101", amount: 100, title: "Provize" }],
  managerOverrides: [{ email: "boss@example.test", total: 25 }],
};

describe("home sums in real Firestore emulator", () => {
  it("covers create, reuse, commission-only edit, date move, inherited transfer and deletion atomically", async () => {
    const source = db.collection("users").doc(owner).collection("entries").doc("monthly-contract");
    await change(source, data);
    const reads = vi.spyOn(Query.prototype, "get");
    try {
      const first = await loadOwnerHomeProduction(db, owner, period);
      expect(first.current).toMatchObject({ count: 1, immediate: 100, managers: { "boss@example.test": 25 }, premiums: { otherAnnual: 4000 } });
      expect(reads).toHaveBeenCalledTimes(2);
      expect(await loadOwnerHomeProduction(db, owner, period)).toEqual(first);
      expect(reads).toHaveBeenCalledTimes(2); // Cached load reads no contracts.
      await change(source, { items: [{ code: "A101", amount: 250, title: "Provize" }], managerOverrides: [{ email: "boss@example.test", total: 60 }] });
      expect((await loadOwnerHomeProduction(db, owner, period)).current).toMatchObject({ immediate: 250, managers: { "boss@example.test": 60 } });
      await change(source, { contractSignedDate: new Date("2026-08-31T21:59:59Z") });
      const moved = await loadOwnerHomeProduction(db, owner, period);
      expect(moved.current.count).toBe(0); expect(moved.previous.immediate).toBe(250);
      const other = "home-destination@example.test";
      await loadOwnerHomeProduction(db, other, period); // Cached zero must be invalidated too.
      const destination = db.collection("users").doc(other).collection("entries").doc(source.id);
      await db.runTransaction(async tx => {
        const current = await tx.get(source);
        const patch = { ...current.data(), userEmail: other, acquisitionType: "inherited" };
        tx.create(destination, withContractHistory(tx, source, current.data()!, patch, { actorEmail: owner, kind: "transfer" }));
        tx.delete(source);
      });
      expect((await loadOwnerHomeProduction(db, owner, period)).previous.count).toBe(0);
      expect((await loadOwnerHomeProduction(db, other, period)).previous.count).toBe(0);
      await change(destination, { acquisitionType: null, contractSignedDate: new Date("2026-09-15") });
      expect((await loadOwnerHomeProduction(db, other, period)).current.count).toBe(1);
      const batch = db.batch(); batch.delete(destination); markHallOwnerDirty(batch, db, other); await batch.commit();
      expect((await loadOwnerHomeProduction(db, other, period)).current.count).toBe(0);
    } finally { reads.mockRestore(); }
  });
  it("handles missing signing dates and excludes an old contract imported this month", async () => {
    const email = "home-legacy@example.test";
    const entries = db.collection("users").doc(email).collection("entries");
    await change(entries.doc("fallback"), { ...data, userEmail: email, contractSignedDate: null });
    await change(entries.doc("old-import"), { ...data, userEmail: email, contractSignedDate: new Date("2020-01-01") });
    await change(entries.doc("end-boundary"), { ...data, userEmail: email, contractSignedDate: new Date(period.to) });
    const summary = await loadOwnerHomeProduction(db, email, period);
    expect(summary.current.count).toBe(1); expect(summary.current.immediate).toBe(100);
  });
});
