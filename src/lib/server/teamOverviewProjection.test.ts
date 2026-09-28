import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentReference, Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { markHallOwnerDirty } from "./hallOfFameProjection";
import { buildTeamOverviewOwnerProjections, loadTeamOverviewOwnerStats } from "./teamOverviewProjection";

const owners = ["a@example.test", "b@example.test"];
const now = new Date(2026, 8, 18, 12);
const entry = (email = owners[0], id = "contract", data: Record<string, unknown> = {}) => ({
  id, ref: { parent: { parent: { id: email } } },
  data: () => ({ userEmail: email, productKey: "neon", inputAmount: 1000, contractSignedDate: new Date(2026, 8, 1), ...data }),
}) as unknown as QueryDocumentSnapshot;

function database() {
  const rows = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({ path });
  const snapshot = (reference: { path: string }) => {
    const data = structuredClone(rows.get(reference.path));
    return { ref: reference, data: () => data };
  };
  const set = vi.fn((reference: { path: string }, data: Record<string, unknown>) => { rows.set(reference.path, structuredClone(data)); });
  const tx = { getAll: async (...refs: { path: string }[]) => refs.map(snapshot), set };
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    getAll: vi.fn(async (...refs: { path: string }[]) => refs.map(snapshot)),
    runTransaction: vi.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return { db: db as unknown as Firestore, rows, writer: { set: set as unknown as (ref: DocumentReference, data: Record<string, unknown>) => void } };
}
afterEach(() => vi.restoreAllMocks());

describe("team overview owner projections", () => {
  it("reuses durable results past the old five-minute expiry and stores compatible monthly documents", async () => {
    const { db, rows } = database();
    const read = vi.fn(async () => [entry()]);
    const first = await loadTeamOverviewOwnerStats(db, owners, now, read);
    expect(first.all[owners[0]].monthMetrics).toEqual({ contracts: 1, annualPremium: 12000, monthlyPremium: 1000 });
    expect(first.all[owners[1]].total).toBe(0);
    expect(await loadTeamOverviewOwnerStats(db, owners, new Date(+now + 20 * 60_000), read)).toEqual(first);
    expect(read).toHaveBeenCalledOnce();
    expect(rows.get(`teamOverviewMonthly/${owners[0]}___2026-09`)).toMatchObject({ monthCount: 1, activeMonthCount: 1 });
    expect(rows.get(`teamOverviewTotals/${owners[0]}`)).toMatchObject({ total: 1, ownerEmail: owners[0], activeContractStats: { total: 1 } });
  });

  it("refreshes only the changed owner, including deleting their last contract", async () => {
    const { db, writer } = database();
    const read = vi.fn(async () => owners.map(email => entry(email)));
    await loadTeamOverviewOwnerStats(db, owners, now, read);
    markHallOwnerDirty(writer, db, owners[0]); read.mockResolvedValue([]);
    const result = await loadTeamOverviewOwnerStats(db, owners, now, read);
    expect(read).toHaveBeenLastCalledWith([owners[0]]);
    expect(result.all[owners[0]].total).toBe(0); expect(result.all[owners[1]].total).toBe(1);
  });

  it("retries only owners edited while their contracts were being read", async () => {
    const { db, writer } = database();
    const read = vi.fn(async () => [] as QueryDocumentSnapshot[]).mockImplementationOnce(async () => {
      markHallOwnerDirty(writer, db, owners[0]); return owners.map(email => entry(email));
    });
    const result = await loadTeamOverviewOwnerStats(db, owners, now, read);
    expect(read).toHaveBeenCalledTimes(2); expect(read).toHaveBeenLastCalledWith([owners[0]]);
    expect(result.all[owners[0]].total).toBe(0); expect(result.all[owners[1]].total).toBe(1);
  });

  it("fails continuous source changes and never publishes unverified totals", async () => {
    const { db, writer, rows } = database();
    const read = vi.fn(async () => { markHallOwnerDirty(writer, db, owners[0]); return [entry()]; });
    await expect(loadTeamOverviewOwnerStats(db, [owners[0]], now, read)).rejects.toThrow("právě mění");
    expect(read).toHaveBeenCalledTimes(3); expect(rows.has(`teamOverviewTotals/${owners[0]}`)).toBe(false);
  });

  it("can return verified totals after a cache write failure, but fails if verification also fails", async () => {
    const { db, rows } = database();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi.mocked(db.runTransaction).getMockImplementation()!;
    vi.mocked(db.runTransaction).mockImplementation((work, options) => options?.readOnly ? run(work, options) : Promise.reject(new Error("cache write failed")));
    const result = await loadTeamOverviewOwnerStats(db, [owners[0]], now, async () => [entry()]);
    expect(result.all[owners[0]].total).toBe(1); expect(rows.size).toBe(0);
    vi.mocked(db.getAll).mockRejectedValue(new Error("source verification failed"));
    await expect(loadTeamOverviewOwnerStats(db, [owners[0]], now, async () => [entry()])).rejects.toThrow("source verification failed");
  });

  it("does not save incomplete reads", async () => {
    const { db, rows } = database();
    await expect(loadTeamOverviewOwnerStats(db, owners, now, async () => { throw new Error("source failed"); })).rejects.toThrow("source failed");
    expect(rows.size).toBe(0);
  });

  it.each(["legacy", "version", "owner", "clock", "stats", "updatedAt"])("rebuilds %s cache data instead of silently returning zero or stale counts", async kind => {
    const { db, rows } = database(); const read = vi.fn(async () => [entry()]);
    await loadTeamOverviewOwnerStats(db, [owners[0]], now, read);
    const cached = rows.get(`teamOverviewTotals/${owners[0]}`)!;
    const projection = cached.projection as Record<string, unknown>;
    if (kind === "legacy") delete cached.projection;
    if (kind === "version") cached.version = 0;
    if (kind === "owner") cached.ownerEmail = owners[1];
    if (kind === "clock") projection.clock = {};
    if (kind === "stats") projection.all = { total: 1 };
    if (kind === "updatedAt") cached.updatedAtMs = +now + 1;
    expect((await loadTeamOverviewOwnerStats(db, [owners[0]], now, read)).all[owners[0]].total).toBe(1);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each(["current", "previous"])("rebuilds at the exact %s month signing boundary, including milliseconds", async period => {
    const { db } = database();
    const boundary = new Date(2026, 8, 18, 12, 15, 0, 321);
    const signed = new Date(2026, period === "current" ? 8 : 7, 18, 12, 15, 0, 321);
    const read = vi.fn(async () => [entry(owners[0], "boundary", { contractSignedDate: signed })]);
    const key = period === "current" ? "month" : "previousMonthToDate";
    expect((await loadTeamOverviewOwnerStats(db, [owners[0]], now, read)).all[owners[0]][key]).toBe(0);
    expect((await loadTeamOverviewOwnerStats(db, [owners[0]], new Date(+boundary - 1), read)).all[owners[0]][key]).toBe(0);
    expect(read).toHaveBeenCalledOnce();
    expect((await loadTeamOverviewOwnerStats(db, [owners[0]], boundary, read)).all[owners[0]][key]).toBe(1);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("handles the shorter previous month and resets active contracts and periods after midnight", async () => {
    const { db } = database();
    const date = new Date(2026, 2, 31, 10);
    const read = vi.fn(async () => [
      entry(owners[0], "feb", { contractSignedDate: new Date(2026, 1, 28, 11) }),
      entry(owners[0], "march", { contractSignedDate: new Date(2026, 2, 1), policyEndDate: new Date(2026, 2, 31) }),
    ]);
    expect((await loadTeamOverviewOwnerStats(db, [owners[0]], date, read)).all[owners[0]].previousMonthToDate).toBe(0);
    expect((await loadTeamOverviewOwnerStats(db, [owners[0]], new Date(2026, 2, 31, 11), read)).all[owners[0]].previousMonthToDate).toBe(1);
    const april = await loadTeamOverviewOwnerStats(db, [owners[0]], new Date(2026, 3, 1), read);
    expect(april.all[owners[0]]).toMatchObject({ total: 2, month: 0, previousMonth: 1 });
    expect(april.active[owners[0]].total).toBe(1);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("rebuilds for clock rollback and after the periodic six-hour verification limit", async () => {
    const { db } = database(); const read = vi.fn(async () => [entry()]);
    await loadTeamOverviewOwnerStats(db, [owners[0]], now, read);
    await loadTeamOverviewOwnerStats(db, [owners[0]], new Date(+now - 1), read);
    await loadTeamOverviewOwnerStats(db, [owners[0]], new Date(+now + 6 * 3600_000), read);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["2026-03-29T00:30:00Z", "2026-03-29T01:30:00Z", "2026-02-28T01:00:00Z"],
    ["2026-10-25T00:30:00Z", "2026-10-25T01:15:00Z", "2026-09-25T00:20:00Z"],
    ["2026-12-31T23:59:59Z", "2027-01-01T00:00:00Z", "2026-12-01T00:00:00Z"],
  ])("matches a fresh calculation across calendar transitions %s -> %s", async (from, to, signed) => {
    const { db } = database(); const docs = [entry(owners[0], "boundary", { contractSignedDate: new Date(signed) })];
    const read = vi.fn(async () => docs);
    await loadTeamOverviewOwnerStats(db, [owners[0]], new Date(from), read);
    const result = await loadTeamOverviewOwnerStats(db, [owners[0]], new Date(to), read);
    const expected = buildTeamOverviewOwnerProjections(docs, [owners[0]], new Date(to))[owners[0]];
    expect(result.all[owners[0]]).toEqual(expected.all);
    expect(result.active[owners[0]]).toEqual(expected.active);
  });

  it("keeps inherited/storno/matured contracts in totals with unchanged premium and date precedence", () => {
    const docs = [
      entry(owners[0], "life", { frequencyRaw: "annual" }), // Life is always monthly premium.
      entry(owners[0], "auto", { productKey: "cppAuto", inputAmount: 3000, frequencyRaw: "quarterly", status: "stornovaná" }),
      entry(owners[0], "business", { productKey: "cppsimplex", frequencyRaw: "semiannual", acquisitionType: "inherited" }),
      entry(owners[0], "ended", { policyEndDate: new Date(2026, 8, 17) }),
      entry(owners[0], "invalid-date", { contractSignedDate: "invalid", createdAt: now }),
      entry(owners[0], "fallback", { contractSignedDate: null, createdAt: now }),
      entry(owners[1], "outside-team"), entry(owners[0], "auto", { inputAmount: 99999 }),
    ];
    const { all, active } = buildTeamOverviewOwnerProjections(docs, [owners[0]], now)[owners[0]];
    expect(all).toMatchObject({ total: 6, month: 4, categories: { life: 4, auto: 1, business: 1 } });
    expect(all.categoryMetrics.life.annualPremium).toBe(48000);
    expect(all.categoryMetrics.auto.annualPremium).toBe(12000);
    expect(all.categoryMetrics.business.annualPremium).toBe(2000);
    expect(active).toMatchObject({ total: 4, month: 2 });
  });

  it("limits concurrent cold owner queries to four batches of ten", async () => {
    const { db } = database(); const emails = Array.from({ length: 45 }, (_, n) => `owner${n}@example.test`);
    const pending: (() => void)[] = [];
    const read = vi.fn((batch: string[]) => new Promise<QueryDocumentSnapshot[]>(resolve => { pending.push(() => resolve(batch.map(email => entry(email)))); }));
    const load = loadTeamOverviewOwnerStats(db, emails, now, read);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(4));
    expect(read.mock.calls.every(([batch]) => batch.length === 10)).toBe(true);
    pending.shift()!(); await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(5));
    pending.splice(0).forEach(resolve => resolve());
    expect(Object.keys((await load).all)).toHaveLength(45);
    expect(await loadTeamOverviewOwnerStats(db, [], now, read)).toEqual({ all: {}, active: {} });
  });
});
