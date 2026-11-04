import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const doubles = vi.hoisted(() => ({ verify: vi.fn(), write: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => {
  const query: Record<string, unknown> = {};
  for (const method of ["collection", "doc", "orderBy", "startAt", "endAt"]) query[method] = () => query;
  query.get = doubles.read;
  query.set = doubles.write;
  return { adminAuth: { verifyIdToken: doubles.verify }, adminDb: query };
});
vi.mock("@/lib/server/advisorSetupGuard", () => ({ getAdvisorAccessError: async () => null }));
vi.mock("@/lib/server/loginAttemptLockout", () => ({ getLoginAttemptStatus: async () => ({ locked: false }), loginAttemptLockoutMessage: () => "locked" }));
vi.mock("@/lib/server/impersonation", () => ({ resolveServerImpersonation: async () => ({ ok: true, impersonation: null }) }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: async () => ({ allowed: true }), applyRateLimitHeaders: () => {} }));

import { GET, POST } from "./route";

const owner = "advisor@example.test";
const payload = (product: unknown = "cppAuto") => ({ action: "saveDay", year: 2026, month: 9, dayIndex: 0,
  payload: { outreach: 1, agreed: 1, meetings: 1, workedHours: 1, contracts: [{ product, premium: 1000 }] } });
const post = (body: unknown, bearer = true) => POST(new NextRequest("https://app.example.test/api/user-stats", {
  method: "POST", headers: { "content-type": "application/json", ...(bearer ? { authorization: "Bearer synthetic" } : {}) }, body: JSON.stringify(body),
}));

beforeEach(() => {
  vi.clearAllMocks();
  doubles.verify.mockResolvedValue({ email: owner, uid: "synthetic-advisor" });
  doubles.read.mockResolvedValue({ docs: [] });
  doubles.write.mockResolvedValue(undefined);
});

describe("daily statistics after product retirement", () => {
  it("saves supported contracts without obsolete gold payment fields", async () => {
    expect((await post(payload())).status).toBe(200);
    expect(doubles.write).toHaveBeenCalledWith(expect.objectContaining({ contracts: [{ product: "cppAuto", premium: 1000 }] }), { merge: true });
  });
  it.each(["comfortcc", " COMFORTCC ", { product: "comfortcc" }, ""])("rejects retired or manipulated product input %j before writing", async product => {
    expect((await post(payload(product))).status).toBe(400);
    expect(doubles.write).not.toHaveBeenCalled();
  });
  it("filters legacy retired rows from reads while keeping supported rows and activity", async () => {
    doubles.read.mockResolvedValue({ docs: [{ id: "2026-09-01", data: () => ({ outreach: 2, workedHours: 4,
      contracts: [{ product: "comfortcc", premium: 100000 }, { product: "cppAuto", premium: 1000 }],
    }) }] });
    const response = await GET(new NextRequest("https://app.example.test/api/user-stats?mode=daily&year=2026&month=9", { headers: { authorization: "Bearer synthetic" } }));
    expect(response.status).toBe(200);
    expect((await response.json()).dailyStats).toEqual([expect.objectContaining({ outreach: 2, contracts: [{ product: "cppAuto", premium: 1000 }] })]);
    expect(doubles.write).not.toHaveBeenCalled();
  });
  it("still rejects unauthenticated and forged requests before writes", async () => {
    expect((await post(payload(), false)).status).toBe(401);
    doubles.verify.mockRejectedValueOnce(new Error("synthetic invalid token"));
    expect((await post(payload())).status).toBe(401);
    expect(doubles.write).not.toHaveBeenCalled();
  });
  it("does not let an advisor assign another owner or elevate privileges in the payload", async () => {
    expect((await post({ ...payload(), ownerEmail: "other@example.test", admin: true, role: "owner" })).status).toBe(403);
    expect(doubles.write).not.toHaveBeenCalled();
    expect(doubles.read).not.toHaveBeenCalled();
  });
});
