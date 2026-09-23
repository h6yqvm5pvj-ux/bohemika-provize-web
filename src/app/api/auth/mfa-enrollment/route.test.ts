import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), config: vi.fn(), resume: vi.fn(), request: vi.fn(), verify: vi.fn(), complete: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ getMfaEnrollmentContext: mocks.context }));
vi.mock("@/lib/server/firebaseAuthEmail", () => ({ requireAuthEmailConfig: mocks.config,
  FirebaseAuthEmailError: class extends Error { constructor(readonly code: string) { super("Odesílání e-mailů není správně nastavené. Kontaktuj podporu."); } },
}));
vi.mock("@/lib/server/mfaEnrollment", () => ({ requestMfaEnrollment: mocks.request, verifyMfaEnrollmentEmail: mocks.verify, finishMfaEnrollment: mocks.complete,
  resumeEmailConfirmedEnrollment: mocks.resume,
  MfaEnrollmentError: class extends Error { constructor(readonly code: string, message: string, readonly status = 400, readonly retryAfterSeconds?: number) { super(message); } },
}));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: mocks.limit, getRequestIp: () => "127.0.0.1", applyRateLimitHeaders: () => {} }));
import { POST } from "./route";
import { MfaEnrollmentError } from "@/lib/server/mfaEnrollment";
import { FirebaseAuthEmailError } from "@/lib/server/firebaseAuthEmail";
const context = { uid: "synthetic", email: "synthetic@example.test", emailVerified: true, authTime: 1000 };
const challengeId = "00000000-0000-4000-8000-000000000001";
function request(body: unknown = { action: "request" }, headers: Record<string, string> = {}) {
  return new Request("https://app.example.test/api/auth/mfa-enrollment", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-token", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.context.mockResolvedValue(context); mocks.limit.mockResolvedValue({ allowed: true, store: "firestore" });
  mocks.resume.mockResolvedValue({ challengeId, secretKey: "SYNTHETIC" });
  mocks.request.mockResolvedValue({ challengeId }); mocks.verify.mockResolvedValue({ challengeId, secretKey: "SYNTHETIC" }); mocks.complete.mockResolvedValue({ enrolled: true });
});
describe("MFA email enrollment API", () => {
  it.each(["start", "request", "verify", "complete"])("authenticates and dispatches %s without issuing cookies", async action => {
    const starting = action === "request" || action === "start";
    const response = await POST(request({ action, ...(starting ? {} : { challengeId, code: "012345" }) }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(mocks.context).toHaveBeenCalledWith("synthetic-token");
    const call = starting ? mocks.request : action === "verify" ? mocks.verify : mocks.complete;
    expect(call).toHaveBeenCalledWith(...(starting ? [context] : [context, "synthetic-token", challengeId, "012345"]));
  });
  it.each([
    [{ action: "request" }, { Authorization: "" }, 401],
    [{ action: "request" }, { Origin: "https://foreign.example.test" }, 403],
    [{ action: "request" }, { "Sec-Fetch-Site": "cross-site" }, 403],
    [{ action: "request" }, { "Content-Type": "text/plain" }, 415],
    [{ action: "unknown" }, {}, 400],
    [{ action: "request", email: "foreign@example.test" }, {}, 400],
    [{ action: "start", skipEmail: true }, {}, 400],
    [{ action: "verify", challengeId, code: "123" }, {}, 400],
    [{ action: "complete", challengeId, code: "123456", sessionInfo: "forged" }, {}, 400],
    ["not-json", {}, 400],
    ["x".repeat(2049), {}, 400],
  ])("rejects invalid input before authentication", async (body, headers, status) => {
    const response = await POST(request(body, headers as Record<string, string>));
    expect(response.status).toBe(status); expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("refuses failed authentication without forwarding raw errors", async () => {
    mocks.context.mockRejectedValue(new Error("private-token"));
    const response = await POST(request()); expect(response.status).toBe(401); expect(await response.text()).not.toContain("private-token");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each(["ip", "user", "unavailable"])("fails closed for %s rate limiting", async scope => {
    if (scope === "user") mocks.limit.mockResolvedValueOnce({ allowed: true, store: "firestore" });
    mocks.limit.mockResolvedValueOnce({ allowed: false, store: scope === "unavailable" ? "unavailable" : "firestore" });
    const response = await POST(request()); expect(response.status).toBe(scope === "unavailable" ? 503 : 429); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("returns safe actionable enrollment errors", async () => {
    mocks.verify.mockRejectedValue(new MfaEnrollmentError("mfa/expired", "Vyžádej nový kód.", 409));
    const response = await POST(request({ action: "verify", challengeId, code: "123456" }));
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: "mfa/expired", error: "Vyžádej nový kód." });
  });
  it("does not consume the user's email quota when delivery is not configured", async () => {
    mocks.config.mockImplementation(() => { throw new FirebaseAuthEmailError("auth/configuration-not-found"); });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "auth/configuration-not-found", error: expect.stringContaining("Odesílání e-mailů") });
    expect(mocks.limit).toHaveBeenCalledOnce(); // only the IP abuse limit
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("preserves the remaining resend cooldown", async () => {
    mocks.request.mockRejectedValue(new MfaEnrollmentError("mfa/resend-wait", "Chvíli počkej.", 429, 25));
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("25");
  });
  it("requires email delivery configuration on every setup start", async () => {
    const response = await POST(request({ action: "start" }));
    expect(response.status).toBe(200); expect(mocks.config).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledWith(context); expect(mocks.resume).not.toHaveBeenCalled();
  });
  it("resumes only a server-confirmed email challenge with the fresh bearer token", async () => {
    const response = await POST(request({ action: "enroll", challengeId }));
    expect(response.status).toBe(200);
    expect(mocks.resume).toHaveBeenCalledWith(context, "synthetic-token", challengeId);
    expect(mocks.request).not.toHaveBeenCalled(); expect(response.headers.has("set-cookie")).toBe(false);
  });
});
