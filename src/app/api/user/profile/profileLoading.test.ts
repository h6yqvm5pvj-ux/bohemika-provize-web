import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
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
  return { adminDb: { collection }, adminAuth: { verifyIdToken: mocks.verifyIdToken } };
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

import { GET } from "./route";

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
});
