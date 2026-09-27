import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { loadOwnerHomeProduction, parseProductionWindow } from "./homeProduction";
import { markHallOwnerDirty } from "./hallOfFameProjection";

const email = "owner@example.test";
const window = { from: Date.parse("2026-08-01"), split: Date.parse("2026-09-01"), to: Date.parse("2026-10-01") };
function database() {
  const documents = new Map<string, Record<string, unknown>>();
  let entries: Array<{ id: string } & Record<string, unknown>> = [{ id: "contract", contractSignedDate: new Date("2026-09-10"), inputAmount: 1000, productKey: "cppAuto", items: [{ code: "A101", amount: 50, title: "Provize" }] }];
  const readEntries = vi.fn(async () => ({ docs: entries.map(entry => ({ id: entry.id, data: () => entry })) }));
  const query = { where: vi.fn(() => query), select: vi.fn(() => query), get: readEntries };
  const ref = (path: string): any => ({ path, collection: (name: string) => name === "entries" ? query : ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }) });
  const snapshot = (reference: { path: string }) => { const data = documents.get(reference.path); return { data: () => data }; };
  const writer = { set: (reference: { path: string }, data: Record<string, unknown>) => documents.set(reference.path, data) };
  const tx = { ...writer, get: vi.fn(async (reference: { path: string }) => snapshot(reference)), getAll: async (...refs: { path: string }[]) => refs.map(snapshot) };
  const db = { collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }), runTransaction: async (run: (t: typeof tx) => unknown) => run(tx) } as unknown as Firestore;
  return { db, documents, writer, tx, readEntries, query, empty: () => { entries = []; }, malformed: () => { entries[0].items = {}; entries[0].managerOverrides = {}; } };
}

describe("persisted home production", () => {
  it("reads only the requested date interval and reuses totals with zero contract reads on the next request", async () => {
    const { db, readEntries, query } = database();
    const first = await loadOwnerHomeProduction(db, email, window);
    expect(first.current.count).toBe(1); // Deduplicated signed + created streams.
    expect(readEntries).toHaveBeenCalledTimes(2);
    expect(query.where).toHaveBeenCalledWith("contractSignedDate", ">=", new Date(window.from));
    expect(query.where).toHaveBeenCalledWith("createdAt", "<", new Date(window.to));
    expect(await loadOwnerHomeProduction(db, email, window)).toEqual(first);
    expect(readEntries).toHaveBeenCalledTimes(2);
  });
  it("rebuilds after removing the last contract", async () => {
    const fake = database();
    await loadOwnerHomeProduction(fake.db, email, window);
    fake.empty();
    markHallOwnerDirty(fake.writer as any, fake.db, email);
    expect((await loadOwnerHomeProduction(fake.db, email, window)).current.count).toBe(0);
    expect(fake.readEntries).toHaveBeenCalledTimes(4);
  });
  it("honors an explicit refresh even for an otherwise valid cached generation", async () => {
    const fake = database();
    await loadOwnerHomeProduction(fake.db, email, window);
    fake.empty();
    expect((await loadOwnerHomeProduction(fake.db, email, window, true)).current.count).toBe(0);
    expect(fake.readEntries).toHaveBeenCalledTimes(4);
  });
  it("does not publish a result from before a concurrent write, and retries from fresh data", async () => {
    const fake = database();
    fake.tx.get.mockImplementationOnce(async reference => {
      markHallOwnerDirty(fake.writer as any, fake.db, email);
      fake.empty();
      return { data: () => fake.documents.get(reference.path) };
    });
    expect((await loadOwnerHomeProduction(fake.db, email, window)).current.count).toBe(0);
    expect(fake.readEntries).toHaveBeenCalledTimes(4);
  });
  it("fails closed after repeated concurrent writes", async () => {
    const fake = database();
    fake.tx.get.mockImplementation(async reference => {
      markHallOwnerDirty(fake.writer as any, fake.db, email);
      return { data: () => fake.documents.get(reference.path) };
    });
    await expect(loadOwnerHomeProduction(fake.db, email, window)).rejects.toThrow("právě mění");
    expect([...fake.documents.keys()].some(path => path.includes("/homeProduction/"))).toBe(false);
  });
  it("does not store a partial result after a failed source read", async () => {
    const fake = database();
    fake.readEntries.mockRejectedValueOnce(new Error("offline"));
    await expect(loadOwnerHomeProduction(fake.db, email, window)).rejects.toThrow("offline");
    expect(fake.documents.size).toBe(0);
  });
  it("bounds input periods and accepts month-end DST differences", () => {
    vi.useFakeTimers(); vi.setSystemTime("2026-11-10");
    const parameters = new URLSearchParams({ signedFrom: String(Date.parse("2026-10-01T00:00:00+02:00")), summarySplit: String(Date.parse("2026-11-01T00:00:00+01:00")), summaryTo: String(Date.parse("2026-12-01T00:00:00+01:00")) });
    expect(parseProductionWindow(parameters)).not.toBeNull();
    parameters.set("signedFrom", "0"); expect(parseProductionWindow(parameters)).toBeNull();
    expect(parseProductionWindow(new URLSearchParams())).toBeNull();
    vi.useRealTimers();
  });
  it("matches the existing serializer for legacy non-array commission fields", async () => {
    const fake = database(); fake.malformed();
    expect((await loadOwnerHomeProduction(fake.db, email, window)).current).toMatchObject({ count: 1, immediate: 0, managers: {} });
  });
});
