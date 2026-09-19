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
const preview = async (email = owner) => {
  const response = await invoke(email, { operation: "preview" });
  expect(response.status).toBe(200);
  return (await response.json()).preview;
};
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

describe("C payout matching through real Firestore transactions and contract API", () => {
  it("persists a match, returns it in cashflow shape, and preserves recipient privacy", async () => {
    for (const [email, payoutKey] of [[owner, "own-c1"], [manager, "manager-c1"]]) {
      const initial = await preview(email);
      expect((await invoke(email, { operation: "assign", payoutKey, targetKey: initial.targets[0].key, revision: initial.revision })).status).toBe(200);
    }
    const stored = (await entryRef().get()).data()!;
    expect(stored.cashflowPayoutMatches).toHaveLength(2);
    expect(stored.commissionPayouts).toHaveLength(3);
    const ownContracts = await list(owner);
    expect(ownContracts[0].cashflowPayoutMatches).toHaveLength(1);
    expect(ownContracts[0].cashflowPayoutMatches![0].writtenBy).toBe(owner);
    expect(JSON.stringify(ownContracts[0].commissionPayouts)).not.toContain("manager-c1");
    const items = generateCashflow(ownContracts, 10, owner, new Date(2026, 8, 18));
    expect(items.find(item => item.commissionPayoutKey === "own-c1")).toMatchObject({ amount: 320, commissionCode: "C101", payoutPlanStatus: "matched", matchedPlannedCode: "B101" });
    expect(items.some(item => item.commissionCode === "B101")).toBe(false);
    const history = await state.db!.collection("contractHistories").doc(stored.contractHistoryId).collection("events").get();
    const matchingEvents = history.docs.map(doc => doc.data()).filter(event => event.title === "Upraveno přiřazení výplaty v cashflow");
    expect(matchingEvents).toHaveLength(2);
    expect(matchingEvents.every(event => event.changes.length === 0)).toBe(true);
  });
  it("commits only one of two simultaneous assignments to the same target", async () => {
    const initial = await preview();
    const responses = await Promise.all(["own-c1", "own-c2"].map(payoutKey => invoke(owner, { operation: "assign", payoutKey, targetKey: initial.targets[0].key, revision: initial.revision })));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect((await entryRef().get()).data()!.cashflowPayoutMatches).toHaveLength(1);
  });
  it("keeps changed source payouts but stops using their old confirmation", async () => {
    const initial = await preview();
    await invoke(owner, { operation: "assign", payoutKey: "own-c1", targetKey: initial.targets[0].key, revision: initial.revision });
    const stored = (await entryRef().get()).data()!;
    stored.commissionPayouts[0].amount = 350;
    await entryRef().update({ commissionPayouts: stored.commissionPayouts });
    const items = generateCashflow(await list(owner), 10, owner, new Date(2026, 8, 18));
    expect(items.find(item => item.commissionPayoutKey === "own-c1")).toMatchObject({ amount: 350, isStatementOnly: true, payoutPlanStatus: "unmatched" });
    expect(items.some(item => item.commissionCode === "B101")).toBe(true);
  });
  it("denies an unrelated account without changing source or associations", async () => {
    expect((await invoke(outside, { operation: "preview" })).status).toBe(403);
    const stored = (await entryRef().get()).data()!;
    expect(stored.cashflowPayoutMatches).toBeUndefined();
    expect(stored.commissionPayouts).toHaveLength(3);
  });
});
