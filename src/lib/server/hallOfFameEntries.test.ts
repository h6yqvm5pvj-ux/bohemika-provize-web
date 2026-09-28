import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { hallEntryReadWindow, readHallEntryDocuments } from "./hallOfFameEntries";

const now = new Date("2026-09-28T10:00:00Z");
describe("hall source query bounds", () => {
  it.each([
    ["2026-09-28T10:00:00Z", "2025-09-30T22:00:00.000Z", "2026-09-28T22:00:00.000Z"],
    ["2026-03-29T10:00:00Z", "2025-03-31T22:00:00.000Z", "2026-03-29T22:00:00.000Z"],
    ["2026-03-28T10:00:00Z", "2025-03-31T22:00:00.000Z", "2026-03-28T23:00:00.000Z"],
    ["2026-10-25T10:00:00Z", "2025-10-31T23:00:00.000Z", "2026-10-25T23:00:00.000Z"],
    ["2026-10-24T10:00:00Z", "2025-10-31T23:00:00.000Z", "2026-10-24T22:00:00.000Z"],
    ["2026-12-31T23:01:00Z", "2026-01-31T23:00:00.000Z", "2027-01-01T23:00:00.000Z"],
  ])("uses Czech calendar boundaries at %s", (date, from, to) => {
    const result = hallEntryReadWindow(new Date(date));
    expect(result.from.toISOString()).toBe(from); expect(result.to.toISOString()).toBe(to);
  });

  function database(fail = false) {
    const calls: unknown[][][] = [];
    const selection = vi.fn();
    const doc = (path: string) => ({ id: path.split("/").at(-1), ref: { path } });
    const query = (steps: unknown[][] = []): any => ({
      where: (...args: unknown[]) => query([...steps, ["where", ...args]]),
      orderBy: (...args: unknown[]) => query([...steps, ["orderBy", ...args]]),
      startAt: (...args: unknown[]) => query([...steps, ["startAt", ...args]]),
      select: (...fields: string[]) => { selection(...fields); return query(steps); },
      get: async () => { calls.push(steps); if (fail && calls.length === 2) throw new Error("source failed");
        return { docs: [doc("users/z/entries/same-id"), doc("users/a/entries/same-id")] }; },
    });
    const group = vi.fn(() => query());
    return { db: { collectionGroup: group } as unknown as Firestore, calls, selection, group };
  }
  it("uses both date fields, numeric ranges and legacy cursors without exposing unused fields", async () => {
    const fake = database();
    const docs = await readHallEntryDocuments(fake.db, ["a@example.test"], now);
    expect(fake.calls).toHaveLength(6);
    for (const field of ["contractSignedDate", "createdAt"]) {
      const { from, to } = hallEntryReadWindow(now);
      for (const [lower, upper] of [[new Date(from.getTime() - 1), to], [from.getTime(), to.getTime()]]) {
        expect(fake.calls).toContainEqual([["where", "userEmail", "in", ["a@example.test"]], ["where", field, ">=", lower], ["where", field, "<", upper]]);
      }
      expect(fake.calls).toContainEqual([["where", "userEmail", "in", ["a@example.test"]], ["orderBy", field], ["startAt", ""]]);
    }
    expect(fake.selection).toHaveBeenCalledExactlyOnceWith("userEmail", "productKey", "inputAmount", "frequencyRaw", "contractSignedDate", "createdAt", "acquisitionType");
    expect(docs.map(doc => doc.ref.path)).toEqual(["users/a/entries/same-id", "users/z/entries/same-id"]);
  });
  it("rejects incomplete reads without returning partial documents", async () => {
    await expect(readHallEntryDocuments(database(true).db, ["a@example.test"], now)).rejects.toThrow("source failed");
  });
  it("skips empty batches and rejects unbounded batches", async () => {
    const fake = database();
    expect(await readHallEntryDocuments(fake.db, [], now)).toEqual([]);
    await expect(readHallEntryDocuments(fake.db, Array(11).fill("a@example.test"), now)).rejects.toThrow();
    expect(fake.group).not.toHaveBeenCalled();
  });
});
