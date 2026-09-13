import { Firestore, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as import("firebase-admin/firestore").Firestore | null }));
const email = "tip-home-sdk@example.test";
vi.mock("@/lib/server/firebaseAdmin", () => ({
  get adminDb() { return state.db; },
  adminAuth: { verifyIdToken: async () => ({ email: "tip-home-sdk@example.test", uid: "synthetic-tip-home" }) },
}));
vi.mock("@/lib/server/advisorSetupGuard", () => ({ getAdvisorSetupError: async () => null }));
vi.mock("@/lib/server/loginAttemptLockout", () => ({ getLoginAttemptLockoutError: async () => null }));
vi.mock("@/lib/server/impersonation", () => ({ resolveServerImpersonation: async () => ({ ok: true }) }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: async () => ({ allowed: true }), applyRateLimitHeaders: () => {} }));

import { GET } from "../../src/app/api/tip-payouts/list/route";

const from = Date.UTC(2026, 7, 1);
const current = Date.UTC(2026, 8, 1);
const to = Date.UTC(2026, 9, 1);
const read = async (home: boolean, limit = 1, cursor?: string) => {
  const query = new URLSearchParams({ payoutFrom: String(from), limit: String(limit),
    ...(home ? { shape: "home", productionFrom: String(from), productionTo: String(to) } : {}),
  });
  if (cursor) query.set("cursor", cursor);
  const response = await GET(new NextRequest(`https://example.test/api/tip-payouts/list?${query}`, {
    headers: { authorization: "Bearer synthetic-tip-home" },
  }));
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    payouts: Array<{ id: string; amount: number; payoutDate: number | null; sourceContractSignedDate: number | null; sourceToken: string | null }>;
    hasMore: boolean;
    nextCursorToken: string | null;
  }>;
};

beforeAll(() => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")) {
    throw new Error("TIP home SDK tests require a local Firestore emulator; live Firestore is forbidden.");
  }
  state.db = new Firestore({ projectId: "demo-bohemika-rules" });
});
beforeEach(async () => {
  await state.db!.collection("users").doc(email).set({ email, fullName: "Synthetic TIP Home" });
});
afterEach(async () => {
  if (state.db) await state.db.recursiveDelete(state.db.collection("users").doc(email));
});
afterAll(async () => { if (state.db) await state.db.terminate(); });

describe("home TIP projection with the real Firestore SDK", () => {
  it("keeps payout ordering and cursors across an empty production page with the selected fields", async () => {
    const payouts = state.db!.collection("users").doc(email).collection("tipPayouts");
    const common = { amount: 25.5, sourceKey: "synthetic-source", note: "synthetic unused field".repeat(500), clientName: "Synthetic Client", sourceOwnerName: "Synthetic Owner" };
    const batch = state.db!.batch();
    batch.set(payouts.doc("z-outside"), { ...common, payoutDate: new Date(to), sourceContractSignedDate: new Date(from - 1) });
    batch.set(payouts.doc("b-inside"), { ...common, payoutDate: new Date(current), sourceContractSignedDate: new Date(current) });
    batch.set(payouts.doc("a-inside"), { ...common, payoutDate: new Date(current), sourceContractSignedDate: null });
    batch.set(payouts.doc("missing-payout"), { ...common, sourceContractSignedDate: new Date(current) });
    batch.set(payouts.doc("before-payout-window"), { ...common, payoutDate: new Date(from - 1), sourceContractSignedDate: new Date(current) });
    await batch.commit();

    const projected = await payouts.orderBy("payoutDate", "desc")
      .where("payoutDate", ">=", new Date(from))
      .select("payoutDate", "amount", "sourceKey", "sourceContractSignedDate").get();
    expect(projected.docs).toHaveLength(3);
    expect(projected.docs.every(doc => !Object.hasOwn(doc.data(), "note") && !Object.hasOwn(doc.data(), "clientName"))).toBe(true);

    const first = await read(true);
    expect(first.payouts).toEqual([]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursorToken).toBeTruthy();
    const second = await read(true, 1, first.nextCursorToken!);
    expect(second.payouts.map(row => row.id)).toEqual(["b-inside"]);
    expect(second.hasMore).toBe(true);
    const third = await read(true, 1, second.nextCursorToken!);
    expect(third.payouts.map(row => row.id)).toEqual(["a-inside"]);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursorToken).toBeNull();
    const full = await read(false, 100);
    expect(full.payouts.map(row => row.id)).toEqual(["z-outside", "b-inside", "a-inside"]);
    expect([...second.payouts, ...third.payouts].reduce((sum, row) => sum + row.amount, 0)).toBe(51);
  });

  it("preserves mixed legacy source date representations and exact month boundaries", async () => {
    const payouts = state.db!.collection("users").doc(email).collection("tipPayouts");
    const dates: unknown[] = [
      Timestamp.fromMillis(from), current, new Date(current).toISOString(), null,
      "invalid", new Date(from - 1), new Date(to),
    ];
    const batch = state.db!.batch();
    dates.forEach((sourceDate, index) => batch.set(payouts.doc(`legacy-${index}`), {
      payoutDate: new Date(current), sourceContractSignedDate: sourceDate,
      amount: index + 0.25, sourceKey: `synthetic-${index}`,
      clientName: "Synthetic Client", sourceOwnerName: "Synthetic Owner",
    }));
    batch.set(payouts.doc("legacy-missing-source-date"), { payoutDate: new Date(current), amount: 10.25 });
    await batch.commit();
    const full = await read(false, 100);
    const home = await read(true, 100);
    const expected = full.payouts.filter(row => {
      const production = row.sourceContractSignedDate ?? row.payoutDate;
      return production != null && production >= from && production < to;
    }).map(row => ({
      id: row.id, payoutDate: row.payoutDate, amount: row.amount,
      sourceToken: row.sourceToken, sourceContractSignedDate: row.sourceContractSignedDate,
    }));
    expect(home.payouts).toEqual(expected);
    expect(home.payouts).toHaveLength(6);
  });
});
