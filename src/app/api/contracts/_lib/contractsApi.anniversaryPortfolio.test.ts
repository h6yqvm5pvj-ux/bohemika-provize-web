import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidPortfolioCursorError, readAnniversaryPortfolioPage } from "./contractsApi.anniversaryPortfolio";
import type { ContractDoc } from "./contractsApi.types";

const contract = (overrides: Partial<ContractDoc> = {}): ContractDoc => ({
  entryType: "contract", productKey: "neon", status: "active",
  policyStartDate: new Date("2020-09-10T12:00:00Z"), ...overrides,
});
type StoredDoc = { id: string; data: ContractDoc };
function database(entries: Record<string, StoredDoc[]>) {
  const reads: Array<{ owner: string; after: string | null; limit: number; returned: number }> = [];
  const db = { collection: (collection: string) => {
    expect(collection).toBe("users");
    return { doc: (owner: string) => ({ collection: (nested: string) => {
      expect(nested).toBe("entries");
      let after: string | null = null;
      let limit = Infinity;
      const query = {
        select: (...fields: string[]) => { expect(fields).not.toContain("clientBirthNumber"); return query; },
        orderBy: (field: FieldPath) => { expect(field.isEqual(FieldPath.documentId())).toBe(true); return query; },
        startAfter: (id: string) => { after = id; return query; },
        limit: (count: number) => { limit = count; return query; },
        get: async () => {
          const docs = [...(entries[owner] ?? [])].sort((a, b) => a.id < b.id ? -1 : 1)
            .filter(doc => after === null || doc.id > after).slice(0, limit);
          reads.push({ owner, after, limit, returned: docs.length });
          return { docs: docs.map(doc => ({ id: doc.id, data: () => doc.data })) };
        },
      };
      return query;
    } }) };
  } } as unknown as Firestore;
  return { db, reads };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-06T12:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("Radar server portfolio scan", () => {
  it("finds old anniversaries after multiple empty pages without rescanning the entire portfolio", async () => {
    const entries = Array.from({ length: 600 }, (_, i) => ({
      id: String(i).padStart(4, "0"), data: contract({ policyStartDate: new Date("2020-03-10T12:00:00Z") }),
    }));
    entries.push({ id: "0999", data: contract() });
    const { db, reads } = database({ "own@example.test": entries });
    const first = await readAnniversaryPortfolioPage({ db, owners: ["own@example.test"], cursor: null });
    expect(first.contracts).toEqual([]);
    expect(first.hasMore).toBe(true);
    const second = await readAnniversaryPortfolioPage({ db, owners: ["own@example.test"], cursor: first.nextCursor });
    expect(second.contracts).toEqual([]);
    const third = await readAnniversaryPortfolioPage({ db, owners: ["own@example.test"], cursor: second.nextCursor });
    expect(third.contracts.map(doc => doc.id)).toEqual(["0999"]);
    expect(third.hasMore).toBe(false);
    expect(reads.map(read => read.after)).toEqual([null, "0249", "0499"]);
    expect(reads.reduce((sum, read) => sum + read.returned, 0)).toBe(603);
  });

  it("loads more than 30 team owners and every contract across owner/page boundaries", async () => {
    const owners = Array.from({ length: 36 }, (_, i) => `team${String(i).padStart(2, "0")}@example.test`);
    const entries = Object.fromEntries(owners.map(owner => [owner, Array.from({ length: 25 }, (_, i) => ({
      id: `same-id-${String(i).padStart(2, "0")}`, data: contract(),
    }))]));
    const { db } = database(entries);
    let cursor: string | null = null;
    const found: string[] = [];
    let pages = 0;
    do {
      const page = await readAnniversaryPortfolioPage({ db, owners: [...owners].reverse(), cursor });
      found.push(...page.contracts.map(doc => `${doc.adviserEmail}/${doc.id}`));
      cursor = page.nextCursor;
      if (++pages > 5) throw new Error("Pagination failed to terminate");
    } while (cursor);
    expect(found).toHaveLength(900);
    expect(new Set(found).size).toBe(900);
    expect(found.at(-1)).toBe(`${owners.at(-1)}/same-id-24`);
  });

  it("includes legacy dates, respects the 90-day window/lifecycle and only returns Radar fields", async () => {
    const { db } = database({ "own@example.test": [
      { id: "legacy", data: contract({ clientName: "Test Client", userEmail: "stale@example.test", clientBirthNumber: "private" } as Partial<ContractDoc>) },
      { id: "later", data: contract({ policyStartDate: new Date("2020-11-20T12:00:00Z") }) },
      { id: "new", data: contract({ policyStartDate: new Date("2026-09-10T12:00:00Z") }) },
      { id: "storno", data: contract({ status: "storno" }) },
      { id: "matured", data: contract({ policyEndDate: new Date("2025-09-10T12:00:00Z") }) },
      { id: "non-contract", data: contract({ entryType: "note" } as Partial<ContractDoc>) },
    ] });
    const page = await readAnniversaryPortfolioPage({ db, owners: ["own@example.test"], cursor: null });
    expect(page.contracts.map(doc => doc.id)).toEqual(["later", "legacy"]);
    expect(page.contracts[1]).toMatchObject({ adviserEmail: "own@example.test", userEmail: "own@example.test", policyStartDate: Date.parse("2020-09-10T12:00:00Z"), createdAt: null });
    expect(page.contracts[1]).not.toHaveProperty("clientBirthNumber");
  });

  it("rejects malformed and unauthorized cursors before reading any data", async () => {
    const { db, reads } = database({});
    for (const cursor of ["invalid", Buffer.from(JSON.stringify({ owner: "other@example.test", entry: null })).toString("base64url"), Buffer.from(JSON.stringify({ owner: "own@example.test", entry: "../../other" })).toString("base64url")]) {
      await expect(readAnniversaryPortfolioPage({ db, owners: ["own@example.test"], cursor })).rejects.toBeInstanceOf(InvalidPortfolioCursorError);
    }
    expect(reads).toEqual([]);
  });
});
