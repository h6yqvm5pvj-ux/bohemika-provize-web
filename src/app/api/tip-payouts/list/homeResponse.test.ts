import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), setup: vi.fn(), lockout: vi.fn(), impersonation: vi.fn(), rate: vi.fn(),
  reads: vi.fn(), records: new Map<string, Record<string, unknown>>(), failBounded: false,
}));
vi.mock("@/lib/server/firebaseAdmin", () => {
  const ms = (value: unknown): number => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    if (typeof value === "string") return new Date(value).getTime();
    const timestamp = value as { toMillis?: () => number } | null;
    return timestamp?.toMillis?.() ?? Number.NaN;
  };
  const query = (fields?: string[], limit = 100, from?: Date, cursor?: [Date, string]) => ({
    orderBy: () => query(fields, limit, from, cursor),
    where: (_field: string, _operator: string, value: Date) => query(fields, limit, value, cursor),
    limit: (value: number) => query(fields, value, from, cursor),
    select: (...value: string[]) => query(value, limit, from, cursor),
    startAfter: (date: Date, id: string) => query(fields, limit, from, [date, id]),
    get: async () => {
      mocks.reads({ kind: "payout", fields, limit, from, cursor });
      if (from && mocks.failBounded) throw new Error("Synthetic query failure");
      const rows = [...mocks.records.entries()]
        .filter(([, row]) => Object.hasOwn(row, "payoutDate"))
        .sort(([leftId, left], [rightId, right]) => ms(right.payoutDate) - ms(left.payoutDate) || rightId.localeCompare(leftId))
        .filter(([id, row]) => (!from || ms(row.payoutDate) >= from.getTime()) &&
          (!cursor || ms(row.payoutDate) < cursor[0].getTime() || (ms(row.payoutDate) === cursor[0].getTime() && id < cursor[1])))
        .slice(0, limit);
      const docs = rows.map(([id, raw]) => ({
        id,
        data: () => fields ? Object.fromEntries(Object.entries(raw).filter(([key]) => fields.includes(key))) : raw,
      }));
      return { docs, empty: docs.length === 0 };
    },
  });
  return {
    adminAuth: { verifyIdToken: mocks.verify },
    adminDb: {
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => { mocks.reads({ kind: "profile", id }); return { id, exists: true, data: () => ({ fullName: "Synthetic Source" }) }; },
          collection: (child: string) => {
            if (name === "users" && child === "tipPayouts") return query();
            if (name === "users" && child === "entries") return {
              doc: (entry: string) => ({ get: async () => {
                mocks.reads({ kind: "entry", id, entry });
                return { data: () => ({ clientName: "Synthetic Client" }) };
              } }),
            };
            throw new Error("Unexpected collection in synthetic test");
          },
        }),
      }),
    },
  };
});
vi.mock("@/lib/server/advisorSetupGuard", () => ({ getAdvisorSetupError: mocks.setup }));
vi.mock("@/lib/server/loginAttemptLockout", () => ({ getLoginAttemptLockoutError: mocks.lockout }));
vi.mock("@/lib/server/impersonation", () => ({ resolveServerImpersonation: mocks.impersonation }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: mocks.rate, applyRateLimitHeaders: () => {} }));

import { GET } from "./route";

const from = Date.UTC(2026, 7, 1);
const monthStart = Date.UTC(2026, 8, 1);
const to = Date.UTC(2026, 9, 1);
const compactKeys = ["id", "payoutDate", "amount", "sourceToken", "sourceContractSignedDate"];
type Row = { id: string; payoutDate: number | null; amount: number; sourceToken: string | null; sourceContractSignedDate: number | null };
const params = (home: boolean, overrides: Record<string, string> = {}) => new URLSearchParams({
  limit: "100", payoutFrom: String(from),
  ...(home ? { shape: "home", productionFrom: String(from), productionTo: String(to) } : {}), ...overrides,
});
const request = (query: URLSearchParams, authorized = true) => new NextRequest(`https://example.test/api/tip-payouts/list?${query}`, {
  headers: authorized ? { authorization: "Bearer synthetic-token" } : {},
});
const read = async (query: URLSearchParams) => {
  const response = await GET(request(query));
  expect(response.status).toBe(200);
  return await response.json() as { payouts: Row[]; hasMore: boolean; nextCursorToken: string | null };
};
const inPeriod = (row: Row) => {
  const date = row.sourceContractSignedDate ?? row.payoutDate;
  return date != null && date >= from && date < to;
};
const totals = (rows: Row[]) => {
  let current = 0;
  let previous = 0;
  const contracts = new Set<string>();
  for (const row of rows) {
    const date = row.sourceContractSignedDate ?? row.payoutDate;
    if (date == null || date < from || date >= to || !(row.amount > 0)) continue;
    if (date < monthStart) previous += row.amount;
    else {
      current += row.amount;
      contracts.add(row.sourceToken?.trim() || `payout:${row.id.trim() || String(row.payoutDate ?? "")}`);
    }
  }
  return { current, previous, contracts: contracts.size };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.failBounded = false;
  mocks.verify.mockResolvedValue({ email: "advisor@example.test", uid: "synthetic-uid" });
  mocks.setup.mockResolvedValue(null);
  mocks.lockout.mockResolvedValue(null);
  mocks.impersonation.mockResolvedValue({ ok: true });
  mocks.rate.mockResolvedValue({ allowed: true });
});

describe("home TIP response projection", () => {
  it("preserves current/previous sums, source deduplication and signed-date precedence", async () => {
    const rows = [
      { payoutDate: new Date(monthStart), sourceContractSignedDate: new Date(from), amount: 20, sourceKey: "same" },
      { payoutDate: new Date(to), sourceContractSignedDate: Timestamp.fromMillis(monthStart), amount: 1.25, sourceKey: "same" },
      { payoutDate: new Date(to), sourceContractSignedDate: monthStart, amount: 2.25, sourceKey: "same" },
      { payoutDate: new Date(to), sourceContractSignedDate: new Date(monthStart).toISOString(), amount: 3.25, sourceKey: "other" },
      { payoutDate: new Date(monthStart), amount: 4.25 },
      { payoutDate: new Date(monthStart), sourceContractSignedDate: "invalid", amount: 5.25 },
      { payoutDate: new Date(monthStart), sourceContractSignedDate: null, amount: 6.25 },
      { payoutDate: new Date(monthStart), sourceContractSignedDate: new Date(from - 1), amount: 900 },
      { payoutDate: new Date(monthStart), sourceContractSignedDate: new Date(to), amount: 900 },
      { payoutDate: new Date(monthStart), sourceContractSignedDate: new Date(monthStart), amount: -1 },
      // Existing payoutFrom selection is intentionally preserved, even though
      // the source signing date would otherwise fall into the production range.
      { payoutDate: new Date(from - 1), sourceContractSignedDate: new Date(monthStart), amount: 900 },
    ];
    rows.forEach((row, index) => mocks.records.set(`row-${index}`, row));
    const full = await read(params(false));
    const home = await read(params(true));
    expect(home.payouts).toEqual(full.payouts.filter(inPeriod).map(row => Object.fromEntries(compactKeys.map(key => [key, row[key as keyof Row]]))));
    expect(totals(home.payouts)).toEqual(totals(full.payouts));
    expect(totals(home.payouts)).toEqual({ current: 22.5, previous: 20, contracts: 5 });
    expect(home.payouts.find(row => row.id === "row-1")?.sourceToken).toBe(createHash("sha256").update("same").digest("hex").slice(0, 24));
    expect(home.payouts.some(row => row.id === "row-10")).toBe(false);
  });

  it("keeps a scanned cursor when a whole page is outside the production period", async () => {
    mocks.records.set("outside", { payoutDate: new Date(to), sourceContractSignedDate: new Date(from - 1), amount: 50 });
    mocks.records.set("inside", { payoutDate: new Date(monthStart), amount: 75 });
    const first = await read(params(true, { limit: "1" }));
    expect(first.payouts).toEqual([]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursorToken).toBeTruthy();
    const second = await read(params(true, { limit: "1", cursor: first.nextCursorToken! }));
    expect(second.payouts.map(row => row.id)).toEqual(["inside"]);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursorToken).toBeNull();
  });

  it("retains the same query failure fallback and filters its unbounded selection afterward", async () => {
    mocks.failBounded = true;
    mocks.records.set("legacy", { payoutDate: new Date(from - 1), sourceContractSignedDate: new Date(monthStart), amount: 35 });
    const full = await read(params(false));
    const home = await read(params(true));
    expect(totals(home.payouts)).toEqual(totals(full.payouts));
    expect(home.payouts[0].amount).toBe(35);
    const queries = mocks.reads.mock.calls.map(([entry]) => entry).filter(entry => entry.kind === "payout");
    expect(queries.map(query => Boolean(query.from))).toEqual([true, false, true, false]);
    expect(queries[3].fields).toEqual(["payoutDate", "amount", "sourceKey", "sourceContractSignedDate"]);
  });

  it("reduces synthetic response bytes and enrichment reads without reducing payout-document reads", async () => {
    for (let index = 0; index < 100; index++) {
      mocks.records.set(`payout-${String(index).padStart(3, "0")}`, {
        payoutDate: new Date(monthStart + index), sourceContractSignedDate: new Date(monthStart),
        amount: 1.25, sourceKey: `source-${index}`, sourceOwnerEmail: "source@example.test", sourceEntryId: `entry-${index}`,
        note: "Synthetic unused note ".repeat(40), productKey: "cppAuto", frequencyRaw: "annual", tipsterPercent: 10,
      });
    }
    const full = await read(params(false));
    const fullReads = mocks.reads.mock.calls.map(([entry]) => entry);
    mocks.reads.mockClear();
    const home = await read(params(true));
    const homeReads = mocks.reads.mock.calls.map(([entry]) => entry);
    expect(home.payouts).toHaveLength(full.payouts.length);
    expect(totals(home.payouts)).toEqual(totals(full.payouts));
    expect(fullReads.filter(entry => entry.kind === "payout")).toHaveLength(1);
    expect(homeReads.filter(entry => entry.kind === "payout")).toHaveLength(1);
    expect(fullReads.filter(entry => entry.kind === "entry")).toHaveLength(100);
    expect(fullReads.filter(entry => entry.kind === "profile")).toHaveLength(2);
    expect(homeReads.filter(entry => entry.kind === "entry")).toHaveLength(0);
    expect(homeReads.filter(entry => entry.kind === "profile")).toHaveLength(1);
    const evidence = {
      rows: home.payouts.length,
      fullBytes: Buffer.byteLength(JSON.stringify(full)), homeBytes: Buffer.byteLength(JSON.stringify(home)),
      payoutQueryCalls: { full: 1, home: 1 }, enrichmentDocumentReads: { full: 101, home: 0 },
    };
    expect(evidence.homeBytes).toBeLessThan(evidence.fullBytes / 3);
    console.info("Synthetic TIP projection evidence (not production latency):", JSON.stringify(evidence));
  });

  it.each<Record<string, string>>([
    { productionFrom: "" }, { productionTo: "" }, { productionFrom: "NaN" },
    { productionFrom: "1.5" }, { productionTo: String(from) },
    { productionTo: String(from + 94 * 86_400_000) }, { productionTo: "9007199254740991" },
  ])("rejects invalid home bounds %j before any payout query", async overrides => {
    expect((await GET(request(params(true, overrides)))).status).toBe(400);
    expect(mocks.reads.mock.calls.some(([entry]) => entry.kind === "payout")).toBe(false);
  });

  it("does not apply home validation to the existing full list", async () => {
    expect((await GET(request(params(false, { productionFrom: "invalid", shape: "other" })))).status).toBe(200);
  });

  it("keeps authentication, impersonation and rate-limit guards before payout reads", async () => {
    expect((await GET(request(params(true), false))).status).toBe(401);
    expect(mocks.reads).not.toHaveBeenCalled();
    mocks.impersonation.mockResolvedValueOnce({ ok: false, status: 403, error: "Synthetic scope denied" });
    expect((await GET(request(params(true)))).status).toBe(403);
    expect(mocks.reads).not.toHaveBeenCalled();
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect((await GET(request(params(true)))).status).toBe(429);
    expect(mocks.reads.mock.calls.some(([entry]) => entry.kind === "payout")).toBe(false);
  });
});
