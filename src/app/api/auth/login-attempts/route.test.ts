import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ audit: vi.fn(), counter: vi.fn(), check: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminAuth: null }));
vi.mock("@/lib/server/loginActivity", () => ({ recordLoginFailure: state.audit }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: state.rate, applyRateLimitHeaders: vi.fn(), getRequestIp: () => "198.51.100.42" }));
vi.mock("@/lib/server/loginAttemptLockout", () => ({ normalizeLoginAttemptEmail: (v: unknown) => typeof v === "string" ? v.toLowerCase() : "", LOGIN_ATTEMPT_MAX_FAILED_ATTEMPTS: 5,
  getClientReportedLoginAttemptStatus: state.check, recordClientReportedLoginAttemptFailure: state.counter,
  buildLoginAttemptLockedResponse: () => new Response(null, { status: 429 }), clearLoginAttemptFailures: vi.fn(), getLoginAttemptStatus: vi.fn(),
}));
import { POST } from "./route";
const req = (factor: string, email = "synthetic@example.test") => new Request("https://bohemka.app/api/auth/login-attempts", { method: "POST", body: JSON.stringify({ action: "failure", factor, email }) });
beforeEach(() => { vi.clearAllMocks(); state.rate.mockResolvedValue({ allowed: true }); state.audit.mockResolvedValue(undefined); state.check.mockResolvedValue({ locked: false }); state.counter.mockResolvedValue({ locked: false, attemptsRemaining: 4 }); });
it("logs reported MFA failures without incrementing or checking password lockout counters", async () => {
  expect((await POST(req("mfa"))).status).toBe(200); expect(state.check).not.toHaveBeenCalled(); expect(state.counter).not.toHaveBeenCalled();
  expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ stage: "mfa", outcome: "reported_failure", identityVerified: false }));
});
it("keeps password failure counting and reports unverified provenance", async () => {
  expect((await POST(req("password"))).status).toBe(200); expect(state.counter).toHaveBeenCalledOnce();
  expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ stage: "password", outcome: "reported_failure", identityVerified: false }));
});
it("rate limits reported events before any audit write", async () => {
  state.rate.mockResolvedValue({ allowed: false }); expect((await POST(req("mfa"))).status).toBe(429); expect(state.audit).not.toHaveBeenCalled();
});
it("rejects malformed account identifiers before storage", async () => { expect((await POST(req("password", "../invalid"))).status).toBe(400); expect(state.audit).not.toHaveBeenCalled(); });
