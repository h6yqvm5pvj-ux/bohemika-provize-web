import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), user: vi.fn(), limit: vi.fn(), prepare: vi.fn(), complete: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminAuth: { verifyIdToken: mocks.verify, getUser: mocks.user } }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: mocks.limit, getRequestIp: () => "127.0.0.1", applyRateLimitHeaders: vi.fn() }));
vi.mock("@/lib/server/mfaRemoval", () => ({ prepareMfaRemoval: mocks.prepare, completeMfaRemoval: mocks.complete,
  MfaRemovalError: class extends Error { constructor(readonly code: string, message: string, readonly status = 400) { super(message); } },
}));
import { POST } from "./route";
const challengeId = "00000000-0000-4000-8000-000000000001";
const token = { uid: "synthetic", email: "synthetic@example.test" }, user = { ...token };
const request = (body: unknown = { action: "prepare" }, headers: Record<string, string> = {}) => new Request("https://app.example.test/api/auth/mfa-removal", {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-token", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks(); mocks.verify.mockResolvedValue(token); mocks.user.mockResolvedValue(user);
  mocks.limit.mockResolvedValue({ allowed: true, store: "firestore" });
  mocks.prepare.mockResolvedValue({ challengeId, waitMs: 150 }); mocks.complete.mockResolvedValue({ removed: true });
});
describe("self-scoped MFA removal API", () => {
  it.each(["prepare", "complete"])("authenticates %s and derives its target only from the bearer token", async action => {
    const response = await POST(request({ action, ...(action === "complete" ? { challengeId } : {}) }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.verify).toHaveBeenCalledWith("synthetic-token", true); expect(mocks.user).toHaveBeenCalledWith(token.uid);
    if (action === "prepare") expect(mocks.prepare).toHaveBeenCalledWith(token, user);
    else expect(mocks.complete).toHaveBeenCalledWith(token, user, challengeId, "synthetic-token");
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it.each([
    [{ action: "prepare" }, { Authorization: "" }, 401],
    [{ action: "prepare" }, { Origin: "https://foreign.test" }, 403],
    [{ action: "prepare" }, { "Sec-Fetch-Site": "cross-site" }, 403],
    [{ action: "prepare" }, { "Content-Type": "text/plain" }, 415],
    [{ action: "complete", challengeId, uid: "victim" }, {}, 400],
    [{ action: "complete", challengeId, email: "victim@example.test" }, {}, 400],
    [{ action: "complete", challengeId, factorUid: "foreign" }, {}, 400],
    [{ action: ["prepare"] }, {}, 400],
    [{ action: "complete" }, {}, 400],
    [{ action: "unknown" }, {}, 400],
    ["not-json", {}, 400],
    ["x".repeat(2049), {}, 400],
  ])("rejects missing authority and manipulated input", async (body, headers, status) => {
    expect((await POST(request(body, headers as Record<string, string>))).status).toBe(status);
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("rejects expired, blocked or non-MFA authentication without leaking SDK errors", async () => {
    mocks.verify.mockRejectedValue(new Error("private-provider-response"));
    const response = await POST(request()); expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("private-provider-response"); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it.each(["ip", "user", "unavailable"])("fails closed for %s rate limiting", async scope => {
    if (scope === "user") mocks.limit.mockResolvedValueOnce({ allowed: true, store: "firestore" });
    mocks.limit.mockResolvedValueOnce({ allowed: false, store: scope === "unavailable" ? "unavailable" : "firestore" });
    expect((await POST(request())).status).toBe(scope === "unavailable" ? 503 : 429);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("does not leak raw failures during a removal", async () => {
    mocks.complete.mockRejectedValue(new Error("synthetic-token private-account-data"));
    const response = await POST(request({ action: "complete", challengeId })); expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/synthetic-token|private-account-data/);
  });
});
