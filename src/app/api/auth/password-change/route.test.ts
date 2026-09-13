import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), user: vi.fn(), limit: vi.fn(), prepare: vi.fn(), authorize: vi.fn(), complete: vi.fn(), after: vi.fn() }));
vi.mock("next/server", async () => ({ ...await vi.importActual("next/server"), after: mocks.after }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminAuth: { verifyIdToken: mocks.verify, getUser: mocks.user } }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: mocks.limit, getRequestIp: () => "127.0.0.1", applyRateLimitHeaders: vi.fn() }));
vi.mock("@/lib/server/passwordChange", () => ({ preparePasswordChange: mocks.prepare, authorizePasswordChange: mocks.authorize, completePasswordChange: mocks.complete, PasswordChangeError: class extends Error {} }));
vi.mock("@/lib/server/passwordChangeEmail", () => ({ deliverPasswordChanged: vi.fn() }));
import { POST } from "./route";
const req = (body: unknown, headers: Record<string, string> = {}) => new Request("https://bohemka.app/api/auth/password-change", {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-token", ...headers }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks(); mocks.verify.mockResolvedValue({ uid: "synthetic-uid", email: "advisor@example.test" });
  mocks.user.mockResolvedValue({ uid: "synthetic-uid", email: "advisor@example.test" }); mocks.limit.mockResolvedValue({ allowed: true, store: "firestore" });
  mocks.prepare.mockResolvedValue({ challengeId: "synthetic-id", method: "email", waitMs: 100 });
  mocks.complete.mockResolvedValue({ changed: true, notificationSent: false, pendingNoticeId: "internal-id" });
});
describe("password change API boundary", () => {
  it("rejects missing, invalid and revoked bearer tokens", async () => {
    expect((await POST(req({ action: "prepare" }, { Authorization: "" }))).status).toBe(401);
    mocks.verify.mockRejectedValue(new Error("private-token")); expect((await POST(req({ action: "prepare" }))).status).toBe(401);
    expect(mocks.verify).toHaveBeenCalledWith("synthetic-token", true); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("rejects foreign origin and cross-site submissions", async () => {
    expect((await POST(req({ action: "prepare" }, { origin: "https://foreign.test" }))).status).toBe(403);
    expect((await POST(req({ action: "prepare" }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("rejects forged recipients and excessive input before invoking business logic", async () => {
    expect((await POST(req({ action: "prepare", email: "victim@example.test" }))).status).toBe(400);
    expect((await POST(req({ action: "prepare", extra: "x".repeat(5000) }))).status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("fails closed when rate limit storage is unavailable", async () => {
    mocks.limit.mockResolvedValue({ allowed: false, store: "unavailable" });
    expect((await POST(req({ action: "prepare" }))).status).toBe(503); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("rejects a disabled account and a token whose email no longer matches", async () => {
    mocks.user.mockResolvedValue({ disabled: true, email: "advisor@example.test" });
    expect((await POST(req({ action: "prepare" }))).status).toBe(401);
    mocks.user.mockResolvedValue({ email: "changed@example.test" }); expect((await POST(req({ action: "prepare" }))).status).toBe(401);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("does not expose pending notification IDs and responds with no-store", async () => {
    const response = await POST(req({ action: "complete", challengeId: "00000000-0000-0000-0000-000000000000", password: "Synthetic-secret-99!", code: "123456" }));
    expect(await response.json()).toEqual({ ok: true, changed: true, notificationSent: false });
    expect(response.headers.get("cache-control")).toContain("no-store"); expect(mocks.after).toHaveBeenCalledOnce();
  });
  it("never returns raw SDK exceptions", async () => {
    mocks.user.mockRejectedValue(new Error("private-email@example.test synthetic-token"));
    const response = await POST(req({ action: "prepare" })); expect(await response.text()).not.toMatch(/private-email|synthetic-token/);
  });
});
