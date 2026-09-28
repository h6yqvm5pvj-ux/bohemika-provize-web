import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, Query, Timestamp, type Firestore, type QueryDocumentSnapshot, type DocumentReference } from "firebase-admin/firestore";
import { readHallEntryDocuments, hallEntryReadWindow } from "../../src/lib/server/hallOfFameEntries";
import { aggregateHallEntries, buildHallRankingsFromStats, hallDayKey, hallPeriodRanges, type HallProductionEntry } from "../../src/lib/server/hallOfFame";
import { loadHallOwnerStats, markHallOwnerDirty } from "../../src/lib/server/hallOfFameProjection";
import { toDate } from "../../src/app/lib/formatters";
import { isInheritedContract } from "../../src/app/lib/inheritedContracts";
import { withContractHistory } from "../../src/lib/server/contractHistory";

let app: App, db: Firestore, sequence = 0;
const now = new Date("2026-09-28T10:00:00Z");
const fields = ["userEmail", "productKey", "inputAmount", "frequencyRaw", "contractSignedDate", "createdAt", "acquisitionType"];
const owner = () => `hall-queries-${process.pid}-${++sequence}@example.test`;
beforeAll(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Only local demo Firestore is allowed.");
  app = initializeApp({ projectId: "demo-bohemika-rules" }, "hall-bounded-read-tests"); db = getFirestore(app);
});
afterAll(async () => { await db?.terminate(); if (app) await deleteApp(app); });
const baseData = (email: string) => ({ userEmail: email, productKey: "neon", inputAmount: 1000, frequencyRaw: "monthly", createdAt: new Date("2020-01-01") });
async function seed(email: string, rows: Record<string, unknown>[]) {
  for (let offset = 0; offset < rows.length; offset += 400) {
    const batch = db.batch(); rows.slice(offset, offset + 400).forEach((data, index) => batch.set(db.collection("users").doc(email).collection("entries").doc(String(offset + index).padStart(5, "0")), { ...baseData(email), ...data })); await batch.commit();
  }
}
// Freeze the existing route's date precedence, inheritance filter and lifecycle
// semantics. All fixtures are life products; product/frequency math is unchanged
// and independently covered by the route's category tests.
function production(docs: QueryDocumentSnapshot[], emails: string[], date = now): HallProductionEntry[] {
  const range = hallPeriodRanges(date).year;
  return docs.flatMap(doc => {
    const data = doc.data(); if (isInheritedContract(data)) return [];
    const signed = toDate(data.contractSignedDate ?? data.createdAt); if (!signed) return [];
    const signedDate = hallDayKey(signed);
    const ownerEmail = String(data.userEmail ?? doc.ref.parent.parent?.id).trim().toLowerCase();
    if (!emails.includes(ownerEmail) || signedDate < range.startDate || signedDate > range.endDate) return [];
    return [{ id: doc.id, ownerEmail, signedDate, category: "life" as const, annualPremium: Number(data.inputAmount) * 12 }];
  });
}
async function fullRead(emails: string[]) {
  return (await db.collectionGroup("entries").where("userEmail", "in", emails).select(...fields).get()).docs;
}
async function change(ref: DocumentReference, patch: Record<string, unknown>) {
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    tx.set(ref, withContractHistory(tx, ref, current.data() ?? {}, patch, { actorEmail: "synthetic@example.test" }), { merge: true });
  });
}

describe("bounded hall reads in real Firestore", () => {
  it("matches the full scan for every supported date representation, null/missing precedence and duplicates", async () => {
    const email = owner(), other = owner(); const { from, to } = hallEntryReadWindow(now);
    const recent = new Date("2026-09-10T12:00:00Z");
    await seed(email, [
      { contractSignedDate: recent },
      { contractSignedDate: recent, createdAt: recent }, // Returned by both fields, counted once.
      { contractSignedDate: "2026-09-10" },
      { contractSignedDate: "10. 9. 2026" },
      { contractSignedDate: "2026-09-10T12:00:00+02:00" },
      { contractSignedDate: recent.getTime() },
      { contractSignedDate: { seconds: recent.getTime() / 1000, nanoseconds: 0 } },
      { contractSignedDate: ["2026-09-10"] },
      { createdAt: recent },
      { contractSignedDate: null, createdAt: "10. 9. 2026" },
      { contractSignedDate: null, createdAt: recent.getTime() },
      { createdAt: { seconds: recent.getTime() / 1000 } },
      { contractSignedDate: "invalid", createdAt: recent }, // No fallback for present invalid signing dates.
      { contractSignedDate: "", createdAt: recent },
      { contractSignedDate: new Date("2020-01-01"), createdAt: recent }, // Recent import is not new production.
      { contractSignedDate: recent, acquisitionType: "inherited" },
      { contractSignedDate: new Date(from.getTime() - 2) },
      { contractSignedDate: from },
      { contractSignedDate: new Timestamp(to.getTime() / 1000 - 1, 999999999) },
      { contractSignedDate: to },
      { contractSignedDate: "2026-09-28T23:59:59.999+02:00" },
      { contractSignedDate: "2026-09-29T00:00:00+02:00" },
      { contractSignedDate: null, createdAt: null },
      { contractSignedDate: new Timestamp(from.getTime() / 1000 - 1, 999999999) },
      { contractSignedDate: new Timestamp(from.getTime() / 1000 - 1, 999500000) },
      { contractSignedDate: null, createdAt: new Timestamp(from.getTime() / 1000 - 1, 999999999) },
    ]);
    await seed(other, [{ contractSignedDate: recent, inputAmount: 2222 }]);
    // Same ID and stored owner, different document paths. Preserve former order.
    await db.collection("users").doc("000-hall-duplicate").collection("entries").doc("00000").set({ ...baseData(email), contractSignedDate: recent, inputAmount: 9000 });
    const emails = [email, other];
    const full = await fullRead(emails), bounded = await readHallEntryDocuments(db, emails, now);
    expect(production(bounded, emails)).toEqual(production(full, emails));
    for (const id of ["00023", "00024", "00025"]) expect(production(bounded, emails).some(row => row.id === id)).toBe(true);
    expect(new Set(bounded.map(doc => doc.ref.path)).size).toBe(bounded.length);
    expect(bounded.some(doc => doc.id === "00016")).toBe(false);
    expect(bounded.some(doc => doc.id === "00019")).toBe(false);
    expect(bounded.every(doc => Object.keys(doc.data()).every(key => fields.includes(key)))).toBe(true);
    const members = emails.map(email => ({ email, name: email, profileAvatar: "" }));
    const previous = buildHallRankingsFromStats(members, aggregateHallEntries(production(full, emails), now), now);
    const actual = await loadHallOwnerStats(db, emails, now, async batch => production(await readHallEntryDocuments(db, batch, now), batch));
    expect(buildHallRankingsFromStats(members, actual, now)).toEqual(previous);
  });

  it.each(["2026-03-28T12:00:00Z", "2026-03-29T12:00:00Z", "2026-10-24T12:00:00Z", "2026-10-25T12:00:00Z", "2026-12-31T23:01:00Z"])("matches the full scan at Prague boundaries on %s", async iso => {
    const email = owner(), date = new Date(iso), { from, to } = hallEntryReadWindow(date);
    const instants = [from.getTime() - 1, from.getTime(), from.getTime() + 1, to.getTime() - 1, to.getTime(), to.getTime() + 1];
    await seed(email, instants.flatMap(time => [{ contractSignedDate: new Date(time) }, { contractSignedDate: time }, { contractSignedDate: null, createdAt: new Date(time) }]));
    const expected = production(await fullRead([email]), [email], date);
    expect(expected).toHaveLength(9);
    expect(production(await readHallEntryDocuments(db, [email], date), [email], date)).toEqual(expected);
  });

  it("reads only recent native dates on cold load and no contracts when durable aggregates are reused", async () => {
    const email = owner();
    await seed(email, [
      ...Array.from({ length: 1000 }, () => ({ contractSignedDate: new Date("2020-01-01") })),
      ...Array.from({ length: 12 }, () => ({ contractSignedDate: new Date("2026-09-01"), createdAt: new Date("2026-09-01"), clientName: "Must not be returned" })),
    ]);
    const old = await fullRead([email]); expect(old).toHaveLength(1012);
    let returnedDocs = 0, queryCount = 0;
    const original = Query.prototype.get;
    const spy = vi.spyOn(Query.prototype, "get").mockImplementation(async function (this: Query) {
      const result = await original.call(this); returnedDocs += result.size; queryCount++; return result;
    });
    try {
      const read = async (batch: string[]) => production(await readHallEntryDocuments(db, batch, now), batch);
      const first = await loadHallOwnerStats(db, [email], now, read);
      expect(first.month[email].categoryMetrics.life).toMatchObject({ contracts: 12, annualPremium: 144000 });
      expect(returnedDocs).toBe(24); expect(queryCount).toBe(6);
      const second = await loadHallOwnerStats(db, [email], now, read);
      expect(second).toEqual(first); expect(queryCount).toBe(6); expect(returnedDocs).toBe(24);
      console.info(JSON.stringify({ scenario: "hall-bounded-synthetic", fullScanDocuments: old.length, coldDocuments: returnedDocs, coldQueries: queryCount, cachedContractQueries: 0 }));
    } finally { spy.mockRestore(); }
  });

  it("handles mutations, a date move, transfer and delete, including a mutation during the read", async () => {
    const email = owner(), destinationEmail = owner();
    const source = db.collection("users").doc(email).collection("entries").doc("contract");
    const destination = db.collection("users").doc(destinationEmail).collection("entries").doc(source.id);
    const read = async (batch: string[]) => production(await readHallEntryDocuments(db, batch, now), batch);
    const load = () => loadHallOwnerStats(db, [email, destinationEmail], now, read);
    await change(source, { ...baseData(email), contractSignedDate: new Date("2026-09-01") });
    expect((await load()).month[email].categoryMetrics.life?.annualPremium).toBe(12000);
    await change(source, { inputAmount: 2000 });
    expect((await load()).month[email].categoryMetrics.life?.annualPremium).toBe(24000);
    await change(source, { contractSignedDate: new Date("2026-08-31T21:59:59Z") });
    const moved = await load(); expect(moved.month[email].categoryMetrics).toEqual({}); expect(moved["3months"][email].categoryMetrics.life?.contracts).toBe(1);
    await db.runTransaction(async tx => {
      const current = await tx.get(source), patch = { ...current.data(), userEmail: destinationEmail };
      tx.set(destination, withContractHistory(tx, source, current.data()!, patch, { actorEmail: email, kind: "transfer" })); tx.delete(source);
    });
    const transferred = await load(); expect(transferred.year[email].categoryMetrics).toEqual({}); expect(transferred.year[destinationEmail].categoryMetrics.life?.contracts).toBe(1);
    const batch = db.batch(); markHallOwnerDirty(batch, db, destinationEmail); await batch.commit();
    let reads = 0;
    const result = await loadHallOwnerStats(db, [destinationEmail], now, async owners => {
      const entries = await read(owners);
      if (++reads === 1) await change(destination, { inputAmount: 3000 });
      return entries;
    });
    expect(reads).toBe(2); expect(result.year[destinationEmail].categoryMetrics.life?.annualPremium).toBe(36000);
    const deletion = db.batch(); deletion.delete(destination); markHallOwnerDirty(deletion, db, destinationEmail); await deletion.commit();
    expect((await load()).year[destinationEmail].categoryMetrics).toEqual({});
  });
});
