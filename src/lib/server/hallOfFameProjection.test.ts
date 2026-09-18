import { describe, expect, it, vi } from "vitest";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { aggregateHallEntries, hallParticipantId, type HallProductionEntry } from "./hallOfFame";
import { invalidateHallContractChange, loadHallOwnerStats, markHallOwnerDirty } from "./hallOfFameProjection";

const now = new Date("2026-09-18T10:00:00Z");
const owners = ["a@example.test", "b@example.test"];
const entry = (ownerEmail: string, id = ownerEmail, signedDate = "2026-09-01"): HallProductionEntry => ({ id, ownerEmail, signedDate, category: "business", annualPremium: 12000 });
function database() {
  const rows = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({ path, id: path.split("/").at(-1), firestore: db, parent: { parent: { id: owners[0] } } });
  const snapshot = (reference: { path: string }) => { const data = rows.get(reference.path); return { ref: reference, data: () => data }; };
  const set = vi.fn((reference: { path: string }, data: Record<string, unknown>) => { rows.set(reference.path, data); });
  const tx = { getAll: async (...refs: { path: string }[]) => refs.map(snapshot), set };
  const db = { collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }), getAll: vi.fn(async (...refs: { path: string }[]) => refs.map(snapshot)), runTransaction: vi.fn(async (run: (transaction: typeof tx) => Promise<void>) => run(tx)) };
  return { db: db as unknown as Firestore, rows, writer: { set }, ref: ref as unknown as (path: string) => DocumentReference };
}

describe("persistent hall aggregates", () => {
  it("uses the persisted totals on another load without reading any contracts", async () => {
    const { db } = database();
    const entries = [entry(owners[0]), entry(owners[1]), entry(owners[0], "old", "2026-07-01"), entry(owners[0], "future", "2026-09-19")];
    const read = vi.fn(async () => entries);
    const first = await loadHallOwnerStats(db, owners, now, read);
    expect(first).toEqual(aggregateHallEntries(entries, now));
    expect(await loadHallOwnerStats(db, owners, now, read)).toEqual(first);
    expect(read).toHaveBeenCalledOnce();
  });
  it("rebuilds only the changed owner's aggregates, including removal of the last contract", async () => {
    const { db, writer } = database();
    const read = vi.fn(async () => owners.map((owner) => entry(owner)));
    await loadHallOwnerStats(db, owners, now, read);
    markHallOwnerDirty(writer, db, owners[0]);
    read.mockResolvedValue([]);
    const result = await loadHallOwnerStats(db, owners, now, read);
    expect(read).toHaveBeenLastCalledWith([owners[0]]);
    expect(result.month[owners[0]].categoryMetrics).toEqual({});
    expect(result.month[owners[1]].categoryMetrics.business?.contracts).toBe(1);
  });
  it("never replaces a revision written while its contracts are being scanned", async () => {
    const { db, rows, writer } = database();
    await loadHallOwnerStats(db, [owners[0]], now, async () => {
      markHallOwnerDirty(writer, db, owners[0]);
      return [entry(owners[0])];
    });
    expect(rows.get(`hallOfFameOwners/${hallParticipantId(owners[0])}`)).toEqual({ revision: expect.any(String) });
    const read = vi.fn(async () => []);
    await loadHallOwnerStats(db, [owners[0]], now, read);
    expect(read).toHaveBeenCalledOnce();
  });
  it("invalidates both sides of a transfer and skips unrelated changes", () => {
    const { writer, ref } = database();
    const source = ref(`users/${owners[0]}/entries/contract`);
    invalidateHallContractChange(writer, source, { userEmail: owners[0], inputAmount: 10 }, { inputAmount: 10, note: "changed" });
    expect(writer.set).not.toHaveBeenCalled();
    invalidateHallContractChange(writer, source, { userEmail: owners[0] }, { userEmail: owners[1] });
    expect(writer.set.mock.calls.map(([reference]) => reference.path)).toEqual(owners.map((email) => `hallOfFameOwners/${hallParticipantId(email)}`));
  });
  it.each(["inputAmount", "frequencyRaw", "productKey", "contractSignedDate", "createdAt", "acquisitionType"])("invalidates changes to %s", (field) => {
    const { writer, ref } = database();
    invalidateHallContractChange(writer, ref(`users/${owners[0]}/entries/contract`), { userEmail: owners[0] }, { [field]: "new" });
    expect(writer.set).toHaveBeenCalledOnce();
  });
  it("rebuilds after Czech midnight, including month/year boundaries", async () => {
    const { db } = database();
    const read = vi.fn(async () => [entry(owners[0], "december", "2026-12-31"), entry(owners[0], "january", "2027-01-01")]);
    const first = await loadHallOwnerStats(db, [owners[0]], new Date("2026-12-31T22:59:00Z"), read);
    const next = await loadHallOwnerStats(db, [owners[0]], new Date("2026-12-31T23:01:00Z"), read);
    expect(first.month[owners[0]].categoryMetrics.business?.contracts).toBe(1);
    expect(next.month[owners[0]].categoryMetrics.business?.contracts).toBe(1);
    expect(next.year[owners[0]].categoryMetrics.business?.contracts).toBe(2);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("does not persist partial results after a failed source read", async () => {
    const { db, rows } = database();
    await expect(loadHallOwnerStats(db, owners, now, async () => { throw new Error("unavailable"); })).rejects.toThrow("unavailable");
    expect(rows.size).toBe(0);
  });
  it("still returns the computed totals if persisting them fails", async () => {
    const { db } = database();
    vi.mocked(db.runTransaction).mockRejectedValue(new Error("unavailable"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await loadHallOwnerStats(db, [owners[0]], now, async () => [entry(owners[0])]);
    expect(result.month[owners[0]].categoryMetrics.business?.annualPremium).toBe(12000);
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
});
