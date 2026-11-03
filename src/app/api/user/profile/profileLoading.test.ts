import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../../tests/helpers/privateEncryptionTestKey";
import { sealPrivateValue } from "@/lib/server/privateEncryption";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getUserByEmail: vi.fn(),
  records: new Map<string, Record<string, unknown>>(),
  reads: [] as string[],
  gate: null as Promise<void> | null,
}));
vi.mock("@/lib/server/firebaseAdmin", () => {
  const snapshot = (path: string, fields?: string[]) => ({
    id: path.split("/").at(-1),
    exists: mocks.records.has(path),
    data: () => {
      const data = mocks.records.get(path);
      return data && fields ? Object.fromEntries(Object.entries(data).filter(([key]) => fields.includes(key))) : data;
    },
  });
  const collection = (path: string) => ({
    doc: (id: string) => ({ get: async () => {
      mocks.reads.push(`${path}/${id}`);
      await mocks.gate;
      return snapshot(`${path}/${id}`);
    } }),
    where: (field: string, _op: string, value: unknown) => {
      const query = (limit: number, fields?: string[]) => ({
        limit: (n: number) => query(n, fields),
        select: (...selected: string[]) => query(limit, selected),
        get: async () => {
          mocks.reads.push(`${path}?${field}=${value}`);
          await mocks.gate;
          const docs = [...mocks.records.entries()]
            .filter(([key, data]) => key.startsWith(`${path}/`) && data[field] === value)
            .slice(0, limit).map(([key]) => snapshot(key, fields));
          return { docs, empty: docs.length === 0 };
        },
      });
      return query(100);
    },
  });
  return { adminDb: { collection }, adminAuth: { verifyIdToken: mocks.verifyIdToken, getUserByEmail: mocks.getUserByEmail } };
});
vi.mock("@/lib/server/loginAttemptLockout", () => ({
  getLoginAttemptStatus: vi.fn().mockResolvedValue({ locked: false }),
  loginAttemptLockoutMessage: vi.fn(),
}));
vi.mock("@/lib/server/rateLimit", () => ({
  consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  applyRateLimitHeaders: vi.fn(),
}));
vi.mock("@/lib/server/advisorSetupGuard", () => ({ checkAdvisorSetup: vi.fn(), advisorSetupError: vi.fn() }));

import { GET, PATCH } from "./route";

const email = "advisor@example.test";
const rawEmail = "Advisor@Example.Test";
const request = () => new NextRequest("https://example.test/api/user/profile", {
  headers: { Authorization: "Bearer test-token" },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.reads.length = 0;
  mocks.gate = null;
  mocks.verifyIdToken.mockResolvedValue({ uid: "advisor-uid", email: rawEmail });
});

describe("profile database loading", () => {
  it("starts the independent lookups together and preserves canonical and private-field precedence", async () => {
    mocks.records.set(`users/${email}`, { email, fullName: "Canonical", phoneNumber: "public" });
    mocks.records.set("users/legacy", { email: rawEmail, userId: "advisor-uid", fullName: "Legacy" });
    mocks.records.set(`usersPrivate/${email}`, { phoneNumber: "private", monthlyGoal: 4000 });
    mocks.records.set(`usersPrivate/${rawEmail}`, { phoneNumber: "legacy-private" });
    mocks.records.set("users/child", { managerEmail: email });
    mocks.records.set("users/tipster", { tipRecipientEmail: email, userRole: "TIPSTER" });
    let release!: () => void;
    mocks.gate = new Promise(resolve => { release = resolve; });
    const pending = GET(request());
    try {
      await vi.waitFor(() => expect(mocks.reads).toHaveLength(8));
    } finally { release(); }
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true, hasProfile: true, hasTeam: true, hasTipsters: true,
      profile: { fullName: "Canonical", phoneNumber: "legacy-private", monthlyGoal: 4000 },
    });
    expect(mocks.verifyIdToken).toHaveBeenCalledExactlyOnceWith("test-token", true);
  });

  it("still finds a legacy profile through UID and handles missing private profiles", async () => {
    mocks.records.set("users/legacy-uid-doc", { userId: "advisor-uid", fullName: "Legacy User" });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({
      hasProfile: true, hasTeam: false, hasTipsters: false, profile: { fullName: "Legacy User" },
    });
  });

  it("returns no profile for an unknown user", async () => {
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ hasProfile: false, hasTeam: false, hasTipsters: false, profile: {} });
  });

  it("does not read database profiles before authentication", async () => {
    const response = await GET(new NextRequest("https://example.test/api/user/profile"));
    expect(response.status).toBe(401);
    expect(mocks.reads).toEqual([]);
  });

  it("returns paid rewards only from the owner-bound private ledger without audit metadata", async () => {
    const payout = { id: "reward", title: "Mimořádná odměna", amountCzk: 1200, payoutMonthKey: "2026-02", status: "paid" };
    mocks.records.set(`users/${email}`, { cashflowExtraPayouts: [{ ...payout, amountCzk: 999999 }] });
    mocks.records.set(`usersPrivate/${email}`, {
      cashflowExtraPayouts: sealPrivateValue([{ ...payout, source: "internal", recordedAtMs: 123 }], `usersPrivate/${email}:cashflowExtraPayouts`),
      cashflowExtraPayoutsUpdatedAtMs: 123,
    });
    vi.stubEnv("PRIVATE_DATA_ENCRYPTION_REQUIRED", "true");
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.profile.cashflowExtraPayouts).toEqual([payout]);
    expect(body.profile).not.toHaveProperty("cashflowExtraPayoutsUpdatedAtMs");
    expect(JSON.stringify(body)).not.toMatch(/privateEncryption|recordedAtMs|internal/);
  });

  it("ignores forged public-profile rewards and refuses owner writes through PATCH", async () => {
    const forged = [{ id: "forged", title: "Reward", amountCzk: 999999, payoutMonthKey: "2026-02", status: "paid" }];
    mocks.records.set(`users/${email}`, { cashflowExtraPayouts: forged });
    const loaded = await (await GET(request())).json();
    expect(loaded.profile).not.toHaveProperty("cashflowExtraPayouts");
    mocks.reads.length = 0;
    const patched = await PATCH(new NextRequest("https://example.test/api/user/profile", {
      method: "PATCH", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ cashflowExtraPayouts: forged }),
    }));
    expect(patched.status).toBe(400);
    expect(mocks.reads).toEqual([]);
    expect((await patched.json()).error).toContain("není povolené");
  });

  it("denies a regular user's attempt to read another private reward ledger", async () => {
    const req = request();
    req.headers.set("x-bohemika-impersonate-email", "other@example.test");
    expect((await GET(req)).status).toBe(403);
    expect(mocks.reads).toEqual([]);
    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
  });

  it("opens a verified impersonation's ledger with the target's encryption context", async () => {
    const target = "represented@example.test";
    const payout = { id: "target-reward", title: "Reward", amountCzk: 100, payoutMonthKey: "2026-03", status: "paid" };
    mocks.verifyIdToken.mockResolvedValue({ uid: "admin-uid", email: "admin@example.test", admin: true, adminRole: "admin" });
    mocks.getUserByEmail.mockResolvedValue({ uid: "target-uid", email: target, disabled: false });
    mocks.records.set(`users/${target}`, { email: target });
    mocks.records.set(`usersPrivate/${target}`, {
      cashflowExtraPayouts: sealPrivateValue([payout], `usersPrivate/${target}:cashflowExtraPayouts`),
    });
    const req = request();
    req.headers.set("x-bohemika-impersonate-email", target);
    const response = await GET(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ email: target, profile: { cashflowExtraPayouts: [payout] } });
    expect(mocks.reads.some(path => path.startsWith(`usersPrivate/${email}`))).toBe(false);
  });
});
