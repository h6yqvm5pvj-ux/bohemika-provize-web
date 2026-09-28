import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { buildTeamOverviewOwnerProjections, loadTeamOverviewOwnerStats, readTeamOverviewEntries, TEAM_OVERVIEW_ENTRY_FIELDS } from "../../src/lib/server/teamOverviewProjection";
import { withContractHistory } from "../../src/lib/server/contractHistory";
import { markHallOwnerDirty } from "../../src/lib/server/hallOfFameProjection";

const mocks = vi.hoisted(() => ({ db: null as Firestore | null, verify: vi.fn(), access: vi.fn() }));
vi.mock("../../src/lib/server/firebaseAdmin", () => ({ get adminDb() { return mocks.db; }, adminAuth: { verifyIdToken: mocks.verify } }));
vi.mock("../../src/lib/server/advisorSetupGuard", () => ({ getAdvisorAccessError: mocks.access }));
vi.mock("../../src/lib/server/loginAttemptLockout", () => ({ getLoginAttemptLockoutError: async () => null }));
vi.mock("../../src/lib/server/impersonation", () => ({ resolveServerImpersonation: async () => ({ ok: true, impersonation: null }) }));
vi.mock("../../src/lib/server/rateLimit", () => ({ consumeRateLimit: async () => ({ allowed: true }), applyRateLimitHeaders: () => {} }));

let app: App, db: Firestore, sequence = 0;
const now = new Date(2026, 8, 28, 12);
const owner = () => `team-projection-${process.pid}-${++sequence}@example.test`;
const base = (email: string) => ({ userEmail: email, productKey: "neon", inputAmount: 1000, contractSignedDate: new Date(2026, 8, 1) });
beforeAll(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Only local demo Firestore is allowed.");
  app = initializeApp({ projectId: "demo-bohemika-rules" }, "team-overview-projection-tests"); db = getFirestore(app); mocks.db = db;
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await db?.terminate(); if (app) await deleteApp(app); });
async function seed(email: string, rows: Record<string, unknown>[]) {
  for (let offset = 0; offset < rows.length; offset += 400) {
    const batch = db.batch();
    rows.slice(offset, offset + 400).forEach((data, index) => batch.set(db.doc(`users/${email}/entries/${String(offset + index).padStart(5, "0")}`), { ...base(email), ...data }));
    await batch.commit();
  }
}
async function change(ref: DocumentReference, patch: Record<string, unknown>) {
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    tx.set(ref, withContractHistory(tx, ref, snap.data() ?? {}, patch, { actorEmail: "synthetic@example.test" }), { merge: true });
  });
}
async function reference(emails: string[], date = now) {
  const docs = (await db.collectionGroup("entries").where("userEmail", "in", emails).get()).docs;
  const projected = buildTeamOverviewOwnerProjections(docs, emails, date);
  return { all: Object.fromEntries(emails.map(email => [email, projected[email].all])),
    active: Object.fromEntries(emails.map(email => [email, projected[email].active])) };
}

describe("team overview projections with real Firestore transactions", () => {
  it("matches full documents for legacy dates, inheritance, lifecycle, categories and duplicate paths", async () => {
    const email = owner(), other = owner();
    await seed(email, [
      { clientName: "Do not load", items: [{ amount: 999999 }] },
      { contractSignedDate: "2026-09-10" }, { contractSignedDate: "10. 9. 2026" },
      { contractSignedDate: new Date(2026, 8, 10).getTime() },
      { contractSignedDate: { seconds: new Date(2026, 8, 10).getTime() / 1000, nanoseconds: 0 } },
      { contractSignedDate: ["2026-09-10"] },
      { contractSignedDate: null, createdAt: new Date(2026, 8, 10) },
      { contractSignedDate: "invalid", createdAt: now }, { contractSignedDate: "", createdAt: now },
      { contractSignedDate: new Date(2026, 7, 28, 12, 0, 0, 1) },
      { contractSignedDate: new Date(2026, 7, 28, 12) },
      { contractSignedDate: Timestamp.fromMillis(+now + 1) },
      { acquisitionType: "inherited" }, { status: "stornovaná" }, { status: "dožitá" },
      { policyEndDate: new Date(2026, 8, 27) }, { policyEndDate: now },
      { productKey: "conseqzenit", policyEndDate: now },
      { productKey: "flexi", policyStartDate: new Date(2025, 8, 28), durationYears: 1 },
      { productKey: "maxcizinkomplex", policyStartDate: new Date(2026, 7, 28), durationMonths: 1 },
      { productKey: "cppAuto", frequencyRaw: "quarterly", inputAmount: 2500 },
      { productKey: "cppsimplex", frequencyRaw: "semiannual", inputAmount: 4000 },
      { productKey: "domex", frequencyRaw: "annual", inputAmount: 6000 },
      { contractSignedDate: new Date(2020, 0, 1) },
    ]);
    await seed(other, [{ inputAmount: 5000 }]);
    await db.doc(`users/000-${email}/entries/00000`).set({ ...base(email), inputAmount: 3000 });
    const emails = [email, other];
    const projectedDocs = await readTeamOverviewEntries(db, emails);
    expect(projectedDocs.every(doc => Object.keys(doc.data()).every(key => (TEAM_OVERVIEW_ENTRY_FIELDS as readonly string[]).includes(key)))).toBe(true);
    const actual = await loadTeamOverviewOwnerStats(db, emails, now);
    expect(actual).toEqual(await reference(emails));
    expect(actual.all[email]).toMatchObject({ total: 24, month: 17, previousMonth: 2, previousMonthToDate: 1 });
    expect(actual.active[email].total).toBe(18);
    expect(await loadTeamOverviewOwnerStats(db, emails, new Date(+now + 1))).toEqual(await reference(emails, new Date(+now + 1)));
  });

  it("reuses aggregates after twenty minutes and reads only one changed owner's history", async () => {
    const emails = [owner(), owner()];
    for (const email of emails) await seed(email, Array.from({ length: 1000 }, (_, index) => ({ contractSignedDate: new Date(index < 990 ? 2020 : 2026, 8, 1), note: "unused".repeat(100) })));
    let documents = 0;
    const read = vi.fn(async (batch: string[]) => { const docs = await readTeamOverviewEntries(db, batch); documents += docs.length; return docs; });
    const first = await loadTeamOverviewOwnerStats(db, emails, now, read);
    expect(documents).toBe(2000); expect(first).toEqual(await reference(emails));
    const later = new Date(+now + 20 * 60_000);
    expect(await loadTeamOverviewOwnerStats(db, emails, later, read)).toEqual(first);
    expect(documents).toBe(2000); expect(read).toHaveBeenCalledOnce();
    await change(db.doc(`users/${emails[0]}/entries/00999`), { inputAmount: 2000 });
    const changed = await loadTeamOverviewOwnerStats(db, emails, later, read);
    expect(changed).toEqual(await reference(emails, later));
    expect(documents).toBe(3000); expect(read).toHaveBeenLastCalledWith([emails[0]]);
    console.info(JSON.stringify({ scenario: "team-overview-synthetic", owners: 2, contracts: 2000,
      oldExpiredReadContracts: 2000, unchangedReadContracts: 0, oneChangedOwnerReadContracts: 1000 }));
  });

  it("refreshes after create, amount/date/frequency edits, inheritance, storno, maturity, transfer and delete", async () => {
    const email = owner(), destinationEmail = owner(), emails = [email, destinationEmail];
    const source = db.doc(`users/${email}/entries/contract`), destination = db.doc(`users/${destinationEmail}/entries/contract`);
    const verify = async () => {
      const value = await loadTeamOverviewOwnerStats(db, emails, now); expect(value).toEqual(await reference(emails)); return value;
    };
    expect((await verify()).all[email].total).toBe(0);
    await change(source, base(email)); expect((await verify()).all[email].month).toBe(1);
    await change(source, { inputAmount: 2000 }); expect((await verify()).all[email].monthMetrics.annualPremium).toBe(24000);
    await change(source, { contractSignedDate: new Date(2026, 7, 1) }); expect((await verify()).all[email].previousMonth).toBe(1);
    await change(source, { productKey: "cppAuto", frequencyRaw: "quarterly" }); expect((await verify()).all[email].previousMonthMetrics.annualPremium).toBe(8000);
    await change(source, { frequencyRaw: "annual" }); expect((await verify()).all[email].previousMonthMetrics.annualPremium).toBe(2000);
    await change(source, { acquisitionType: "inherited" }); expect((await verify()).all[email].previousMonth).toBe(0);
    await change(source, { status: "storno" }); expect((await verify()).active[email].total).toBe(0);
    await change(source, { status: "active", policyEndDate: new Date(2026, 8, 27) }); expect((await verify()).active[email].total).toBe(0);
    await change(source, { policyEndDate: null }); expect((await verify()).active[email].total).toBe(1);
    await change(source, { productKey: "flexi", policyStartDate: new Date(2025, 8, 28), durationYears: 1 }); expect((await verify()).active[email].total).toBe(0);
    await change(source, { durationYears: 2 }); expect((await verify()).active[email].total).toBe(1);
    await db.runTransaction(async tx => {
      const snap = await tx.get(source);
      tx.set(destination, withContractHistory(tx, source, snap.data()!, { ...snap.data(), userEmail: destinationEmail }, { actorEmail: email, kind: "transfer" }));
      tx.delete(source);
    });
    const transferred = await verify(); expect(transferred.all[email].total).toBe(0); expect(transferred.all[destinationEmail].total).toBe(1);
    const batch = db.batch(); batch.delete(destination); markHallOwnerDirty(batch, db, destinationEmail); await batch.commit();
    expect((await verify()).all[destinationEmail].total).toBe(0);
  });

  it("does not publish the old amount when a real source transaction commits during a build", async () => {
    const email = owner(), ref = db.doc(`users/${email}/entries/contract`);
    await change(ref, base(email));
    let reads = 0;
    const result = await loadTeamOverviewOwnerStats(db, [email], now, async emails => {
      const docs = await readTeamOverviewEntries(db, emails);
      if (++reads === 1) await change(ref, { inputAmount: 3000 });
      return docs;
    });
    expect(reads).toBe(2); expect(result.all[email].monthMetrics.annualPremium).toBe(36000);
    const unused = vi.fn(async () => []);
    expect(await loadTeamOverviewOwnerStats(db, [email], now, unused)).toEqual(result); expect(unused).not.toHaveBeenCalled();
  });

  it("keeps the API's live team membership, TIP stats, privacy and auth on cached requests", async () => {
    const manager = owner(), child = owner(), outsider = owner(), tipster = owner();
    const batch = db.batch();
    for (const [email, data] of [
      [manager, { fullName: "Manager", position: "manazer4" }],
      [child, { fullName: "Advisor", position: "poradce3", managerEmail: manager }],
      [outsider, { fullName: "Outside", position: "poradce3" }],
      [tipster, { fullName: "Tip", accountType: "tipster", tipRecipientEmail: manager }],
    ] as const) batch.set(db.doc(`users/${email}`), data);
    await batch.commit();
    await seed(manager, [{}]); await seed(child, [{ tipContractTipsterEmail: tipster }]); await seed(outsider, [{}]);
    mocks.verify.mockResolvedValue({ email: manager, uid: "synthetic-manager" }); mocks.access.mockResolvedValue(null);
    const { GET } = await import("../../src/app/api/team-overview/route");
    const request = (token = "synthetic-token") => new NextRequest("https://example.test/api/team-overview", { headers: { authorization: `Bearer ${token}` } });
    const response = await GET(request()); const first = await response.json();
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(Object.keys(first.contractCounts).sort()).toEqual([manager, child, tipster].sort());
    expect(first.contractCounts[child].total).toBe(1); expect(first.contractCounts[tipster].total).toBe(1);
    expect(first.tipCounts[tipster].contracted).toBe(1);
    expect(JSON.stringify(first)).not.toContain(outsider);
    await db.doc(`users/${child}`).update({ managerEmail: outsider });
    const second = await (await GET(request())).json();
    expect(second.contractCounts[child]).toBeUndefined();
    expect(second.members.some((member: { email: string }) => member.email === child)).toBe(false);
    expect(second.contractCounts[tipster].total).toBe(1); // Existing global TIP assignment semantics.
    mocks.access.mockResolvedValue({ status: 403, error: "Přístup zamítnut" });
    expect((await GET(request())).status).toBe(403);
    mocks.verify.mockRejectedValue(new Error("revoked"));
    expect((await GET(request())).status).toBe(401);
  });
});
