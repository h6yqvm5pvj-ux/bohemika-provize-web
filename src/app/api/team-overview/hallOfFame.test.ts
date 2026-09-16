import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hallParticipantId } from "@/lib/server/hallOfFame";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), access: vi.fn(), setup: vi.fn(), rate: vi.fn(), users: vi.fn(), group: vi.fn(), impersonation: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminAuth: { verifyIdToken: mocks.verify },
  adminDb: {
    collection: () => ({ select: () => ({ get: mocks.users }) }),
    collectionGroup: () => ({ where: (_field: string, _op: string, owners: string[]) => ({ get: () => mocks.group(owners) }) }),
  },
}));
vi.mock("@/lib/server/advisorSetupGuard", () => ({ getAdvisorAccessError: mocks.access, getAdvisorSetupError: mocks.setup }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: mocks.rate, applyRateLimitHeaders: vi.fn() }));
vi.mock("@/lib/server/loginAttemptLockout", () => ({ getLoginAttemptLockoutError: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/server/impersonation", () => ({ resolveServerImpersonation: mocks.impersonation }));

const request = (action = "hallOfFame", token: string | null = "test-token") => new NextRequest(`https://example.test/api/team-overview?action=${action}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const profile = (email: string, name: string) => ({ id: email, exists: true, data: () => ({ fullName: name, position: "poradce3", phoneNumber: "private-phone", managerEmail: "private-manager" }) });
const contract = (id: string, owner: string, signedDate: string | null, amount: number, extra = {}) => ({
  id, ref: { parent: { parent: { id: owner } } },
  data: () => ({ userEmail: owner, productKey: "neon", inputAmount: amount, contractSignedDate: signedDate, ...extra }),
});

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-14T10:00:00Z"));
  mocks.verify.mockResolvedValue({ email: "a@example.test", uid: "ordinary-advisor" });
  mocks.access.mockResolvedValue(null); mocks.setup.mockResolvedValue(null);
  mocks.impersonation.mockResolvedValue({ ok: true, impersonation: null });
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.users.mockResolvedValue({ docs: [profile("a@example.test", "Anna"), profile("other-team@example.test", "Boris")] });
  mocks.group.mockResolvedValue({ docs: [contract("a", "a@example.test", "2026-09-01", 1000), contract("b", "other-team@example.test", "2026-09-12", 9000)] });
});
afterEach(() => vi.useRealTimers());

describe("global hall API access and periods", () => {
  it("includes all business products in property totals and ranks, respecting payment frequency and periods", async () => {
    mocks.group.mockResolvedValue({ docs: [
      contract("property-a", "a@example.test", "2026-09-01", 12000, { productKey: "domex" }),
      contract("simplex-a", "a@example.test", "2026-09-02", 1000, { productKey: "cppsimplex", frequencyRaw: "monthly" }),
      contract("pmop-b", "other-team@example.test", "2026-09-03", 15000, { productKey: "kooppmop" }),
      contract("pprs-b", "other-team@example.test", "2026-09-04", 3000, { productKey: "cppPPRs", frequencyRaw: "quarterly" }),
      contract("pprbez-a", "a@example.test", "2026-07-01", 5000, { productKey: "cppPPRbez", frequencyRaw: "semiannual" }),
      contract("inherited", "other-team@example.test", "2026-09-02", 999999, { productKey: "cppsimplex", acquisitionType: "inherited" }),
      contract("future", "other-team@example.test", "2026-09-15", 999999, { productKey: "cppsimplex" }),
    ] });
    const { GET } = await import("./route");
    const month = await (await GET(request())).json();
    expect(month.rankings.property).toEqual([
      expect.objectContaining({ name: "Boris", annualPremium: 27000, contracts: 2, rank: 1 }),
      expect.objectContaining({ name: "Anna", annualPremium: 24000, contracts: 2, rank: 2 }),
    ]);
    for (const period of ["3months", "6months", "year"]) {
      const body = await (await GET(request(`hallOfFame&period=${period}`))).json();
      expect(body.rankings.property).toEqual([
        expect.objectContaining({ name: "Anna", annualPremium: 34000, contracts: 3, rank: 1 }),
        expect.objectContaining({ name: "Boris", annualPremium: 27000, contracts: 2, rank: 2 }),
      ]);
      expect(body.rankings.life).toEqual([]);
      expect(body.rankings.auto).toEqual([]);
      expect(body.rankings.gold).toEqual([]);
    }
    expect(mocks.group).toHaveBeenCalledOnce();
  });

  it("lets an ordinary adviser see another team's result and keeps cached requester identity separate", async () => {
    const { GET } = await import("./route");
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rankings.life.map((row: { name: string }) => row.name)).toEqual(["Boris", "Anna"]);
    expect(body.period).toEqual({ key: "month", startDate: "2026-09-01", endDate: "2026-09-14" });
    expect(body.rankings.life[0]).toMatchObject({ annualPremium: 108000, contracts: 1 });
    expect(body.currentUserId).toBe(hallParticipantId("a@example.test"));
    expect(JSON.stringify(body)).not.toContain("@example.test");
    expect(JSON.stringify(body)).not.toMatch(/private-phone|managerEmail|contractCounts|userEmail/);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    mocks.verify.mockResolvedValue({ email: "other-team@example.test", uid: "another-advisor" });
    const next = await (await GET(request())).json();
    expect(next.currentUserId).toBe(hallParticipantId("other-team@example.test"));
    expect(mocks.users).toHaveBeenCalledTimes(1);
    expect(mocks.group).toHaveBeenCalledTimes(1);
  });
  it("rejects tipsters from the hall and team details before loading rankings", async () => {
    mocks.access.mockResolvedValue({ status: 403, error: "Tipař nemá přístup", missing: [] });
    const { GET } = await import("./route");
    expect((await GET(request())).status).toBe(403);
    expect(mocks.setup).not.toHaveBeenCalled();
    expect(mocks.access).toHaveBeenCalledOnce();
    expect(mocks.users).not.toHaveBeenCalled();
    expect(mocks.group).not.toHaveBeenCalled();
    expect((await GET(request("members"))).status).toBe(403);
    expect(mocks.access).toHaveBeenCalledTimes(2);
  });
  it("does not expose previously cached rankings to a tipster", async () => {
    const { GET } = await import("./route");
    expect((await GET(request())).status).toBe(200);
    mocks.access.mockResolvedValue({ status: 403, error: "Tipař nemá přístup", missing: [] });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.users).toHaveBeenCalledOnce();
  });
  it("checks the tipster's access when an administrator is viewing their account", async () => {
    mocks.verify.mockResolvedValue({ email: "admin@example.test", uid: "admin-user", admin: true });
    mocks.impersonation.mockResolvedValue({ ok: true, impersonation: { targetEmail: "tipster@example.test", targetUid: "tipster-user" } });
    mocks.access.mockResolvedValue({ status: 403, error: "Tipař nemá přístup", missing: [] });
    const { GET } = await import("./route");
    expect((await GET(request())).status).toBe(403);
    expect(mocks.access).toHaveBeenCalledWith({ email: "tipster@example.test", uid: "tipster-user" });
    expect(mocks.users).not.toHaveBeenCalled();
  });
  it.each(["missing", "invalid", "setup", "rate"])("rejects %s access before loading global data", async (kind) => {
    if (kind === "invalid") mocks.verify.mockRejectedValue(new Error("Invalid token"));
    if (kind === "setup") mocks.access.mockResolvedValue({ status: 403, error: "Dokonči profil", missing: ["phoneNumber"] });
    if (kind === "rate") mocks.rate.mockResolvedValue({ allowed: false });
    const { GET } = await import("./route");
    const response = await GET(request("hallOfFame", kind === "missing" ? null : "test-token"));
    expect(response.status).toBe(kind === "rate" ? 429 : kind === "setup" ? 403 : 401);
    expect(mocks.users).not.toHaveBeenCalled();
  });
  it("changes ranks and totals with the signing period, sharing one scan across all periods", async () => {
    mocks.group.mockResolvedValue({ docs: [
      contract("current-a", "a@example.test", "2026-09-01", 1000),
      contract("current-b", "other-team@example.test", "2026-09-14", 2000),
      contract("quarter-a", "a@example.test", "2026-07-01", 2000),
      contract("half-b", "other-team@example.test", "2026-04-01", 4000),
      contract("year-a", "a@example.test", "2025-10-01", 9000),
      contract("old", "other-team@example.test", "2025-09-30", 999999),
      contract("future", "other-team@example.test", "2026-09-15", 999999),
      contract("inherited", "other-team@example.test", "2026-09-02", 999999, { acquisitionType: "inherited" }),
      contract("undated", "other-team@example.test", null, 999999),
    ] });
    const { GET } = await import("./route");
    for (const [period, winner, premium, contracts] of [["month", "Boris", 24000, 1], ["3months", "Anna", 36000, 2], ["6months", "Boris", 72000, 2], ["year", "Anna", 144000, 3]]) {
      const response = await GET(request(`hallOfFame&period=${period}`));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.period.key).toBe(period);
      expect(body.rankings.life[0]).toMatchObject({ name: winner, annualPremium: premium, contracts });
    }
    expect(mocks.group).toHaveBeenCalledOnce();
  });
  it("uses creation date for legacy entries and counts shared tip contracts only for their owner", async () => {
    mocks.group.mockResolvedValue({ docs: [contract("legacy", "other-team@example.test", null, 1000, { createdAt: new Date("2026-09-01T10:00:00Z"), tipContractTipsterEmail: "a@example.test" })] });
    const { GET } = await import("./route");
    const body = await (await GET(request())).json();
    expect(body.rankings.life).toEqual([expect.objectContaining({ name: "Boris", contracts: 1, annualPremium: 12000 })]);
  });
  it("rejects invalid periods before loading data", async () => {
    const { GET } = await import("./route");
    expect((await GET(request("hallOfFame&period=all"))).status).toBe(400);
    expect((await GET(request("hallOfFame&period=toString"))).status).toBe(400);
    expect(mocks.users).not.toHaveBeenCalled();
  });
  it("expires the cache at the Prague month boundary even within its normal lifetime", async () => {
    vi.setSystemTime(new Date("2026-09-30T21:59:50Z"));
    const { GET } = await import("./route");
    expect((await (await GET(request())).json()).rankings.life).toHaveLength(2);
    vi.setSystemTime(new Date("2026-09-30T22:00:01Z"));
    const next = await (await GET(request())).json();
    expect(next.period).toEqual({ key: "month", startDate: "2026-10-01", endDate: "2026-10-01" });
    expect(next.rankings.life).toEqual([]);
    expect(mocks.group).toHaveBeenCalledTimes(2);
  });
});
