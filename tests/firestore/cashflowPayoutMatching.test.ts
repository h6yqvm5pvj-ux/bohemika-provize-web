import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EntryDoc } from "../../src/app/cashflow/types";
import { generateCashflow } from "../../src/app/cashflow/generator";

const state = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  get adminDb() { return state.db; }, adminAuth: null, adminMessaging: null, adminStorage: null,
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: async (req: NextRequest) => {
    const email = req.headers.get("x-test-viewer");
    if (!email?.startsWith("payout-match-") || !email.endsWith("@example.test")) return { ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) };
    return { ok: true, ctx: { email, uid: email, decoded: { email }, actorEmail: email, actorUid: email, isImpersonating: false, impersonation: null } };
  },
  withRateLimitHeaders: (response: Response) => response,
}));
import { POST } from "../../src/app/api/contracts/payout-plan/route";
import { handleContractsList } from "../../src/app/api/contracts/_lib/contractsApi";

const owner = "payout-match-owner@example.test";
const manager = "payout-match-manager@example.test";
const outside = "payout-match-outside@example.test";
let app: App;
const entryRef = () => state.db!.doc(`users/${owner}/entries/car`);
const invoke = (email: string, body: Record<string, unknown>) => POST(new NextRequest("https://example.test/api/contracts/payout-plan", {
  method: "POST", headers: { "Content-Type": "application/json", "x-test-viewer": email },
  body: JSON.stringify({ ownerEmail: owner, entryId: "car", ...body }),
}));
const list = async (email: string) => {
  const response = await handleContractsList(new NextRequest(`https://example.test/api/contracts/list?scope=${email === owner ? "my" : "team"}&shape=cashflow&limit=500`, { headers: { "x-test-viewer": email } }), { freshCashflowContext: true });
  expect(response.status).toBe(200);
  return (await response.json()).contracts as EntryDoc[];
};

beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180" || process.env.GCLOUD_PROJECT !== "demo-bohemika-rules") throw new Error("This test requires the local demo Firestore emulator.");
  app = initializeApp({ projectId: "demo-bohemika-rules" }, "cashflow-payout-matching");
  const db = state.db = getFirestore(app);
  for (const email of [owner, manager, outside]) {
    await db.doc(`users/${email}`).set({ email, name: "Testovací uživatel", position: email === manager ? "manazer8" : "poradce2", commissionMode: "standard", accountType: "advisor", ...(email === owner ? { managerEmail: manager } : {}) });
    await db.doc(`usersPrivate/${email}`).set({ subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" });
  }
});
beforeEach(async () => {
  await entryRef().set({
    userEmail: owner, clientName: "Testovací klient", contractNumber: "TEST-C", productKey: "kooperativaAuto", frequencyRaw: "annual", entryType: "contract",
    contractSignedDate: new Date(2023, 1, 10), policyStartDate: new Date(2023, 1, 12), createdAt: new Date(2023, 1, 10),
    items: [{ title: "Následná provize", code: "B101", amount: 300 }],
    managerEmailSnapshot: manager, managerChain: [{ email: manager, position: "manazer8", commissionMode: "standard" }],
    managerOverrides: [{ email: manager, position: "manazer8", commissionMode: "standard", items: [{ title: "Následná provize", code: "B101", amount: 40 }], total: 40 }],
    commissionPayouts: [
      { key: "own-c1", code: "C101", amount: 320, status: "paid", writtenBy: owner, payoutMonthKey: "2024-3" },
      { key: "own-c2", code: "C102", amount: 330, status: "paid", writtenBy: owner, payoutMonthKey: "2025-3" },
      { key: "manager-c1", code: "C101", amount: 45, status: "paid", writtenBy: manager, payoutMonthKey: "2024-3" },
    ],
  });
});
afterAll(async () => {
  if (state.db) {
    for (const email of [owner, manager, outside]) {
      await state.db.recursiveDelete(state.db.doc(`users/${email}`));
      await state.db.doc(`usersPrivate/${email}`).delete();
    }
    await state.db.terminate();
  }
  if (app) await deleteApp(app);
});

describe("automatic C payouts through the contract API", () => {
  it("uses actual C payouts without saved associations and preserves recipient privacy", async () => {
    const stored = (await entryRef().get()).data()!;
    expect(stored.cashflowPayoutMatches).toBeUndefined();
    const ownContracts = await list(owner);
    expect(JSON.stringify(ownContracts[0].commissionPayouts)).not.toContain("manager-c1");
    const items = generateCashflow(ownContracts, 10, owner, new Date(2026, 8, 18));
    expect(items.find(item => item.commissionPayoutKey === "own-c1")).toMatchObject({ amount: 320, commissionCode: "C101", payoutStatus: "paid" });
    expect(items.find(item => item.commissionPayoutKey === "own-c2")).toMatchObject({ amount: 330, commissionCode: "C102", payoutStatus: "paid" });
    expect(items.some(item => ["B101", "B102"].includes(item.commissionCode ?? ""))).toBe(false);
    expect((await entryRef().get()).data()).toEqual(stored);
  });

  it("rejects old manual operations without writing associations or history", async () => {
    const before = (await entryRef().get()).data();
    for (const operation of ["preview", "assign", "remove"]) {
      expect((await invoke(owner, { operation, payoutKey: "own-c1", targetKey: "B102" })).status).toBe(410);
    }
    expect((await entryRef().get()).data()).toEqual(before);
  });

  it("uses an updated actual amount automatically without a renewed confirmation", async () => {
    const stored = (await entryRef().get()).data()!;
    stored.commissionPayouts[0].amount = 350;
    await entryRef().update({ commissionPayouts: stored.commissionPayouts });
    const items = generateCashflow(await list(owner), 10, owner, new Date(2026, 8, 18));
    expect(items.find(item => item.commissionPayoutKey === "own-c1")).toMatchObject({ amount: 350, commissionCode: "C101", payoutStatus: "paid" });
    expect(items.some(item => item.commissionCode === "B101")).toBe(false);
  });

  it("denies an unrelated account without changing source or associations", async () => {
    expect((await invoke(outside, { operation: "assign", writtenBy: owner })).status).toBe(403);
    const stored = (await entryRef().get()).data()!;
    expect(stored.cashflowPayoutMatches).toBeUndefined();
    expect(stored.commissionPayouts).toHaveLength(3);
  });
});
