import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(),
  lockout: vi.fn(), rateLimit: vi.fn(), send: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminAuth: mocks }));
vi.mock("@/lib/server/loginAttemptLockout", () => ({ getLoginAttemptLockoutError: mocks.lockout }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: mocks.rateLimit, applyRateLimitHeaders: vi.fn() }));
vi.mock("@/lib/server/firebaseAuthEmail", () => ({ sendFirebaseAuthEmail: mocks.send, FirebaseAuthEmailError: class extends Error {} }));

import { POST as confirm } from "./confirm-email-for-mfa/route";
import { POST as send } from "./email-verification-link/route";

const user = { uid: "synthetic-user", email: "synthetic@example.test", emailVerified: false, disabled: false };
function request(token: string | null = "test-token") {
  return new Request("http://localhost/api/auth/email-verification", {
    method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ emailVerified: true, email: "different@example.test" }),
  });
}

describe("email verification API security", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verifyIdToken.mockResolvedValue({ uid: user.uid, email: user.email, auth_time: Date.now() / 1000 });
    mocks.getUser.mockResolvedValue({ ...user });
    mocks.lockout.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.send.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { expect(mocks.updateUser).not.toHaveBeenCalled(); vi.restoreAllMocks(); });

  it("rejects the original bypass even with recent login and a forged body", async () => {
    const result = await confirm(request());
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ ok: false });
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.verifyIdToken).toHaveBeenCalledExactlyOnceWith("test-token", true);
  });
  it("only acknowledges an account already verified in Firebase", async () => {
    mocks.getUser.mockResolvedValue({ ...user, emailVerified: true });
    const result = await confirm(request());
    expect(await result.json()).toEqual({ ok: true, emailVerified: true, alreadyVerified: true });
  });
  it.each([confirm, send])("requires a valid bearer before account access", async (route) => {
    expect((await route(request(null))).status).toBe(401);
    mocks.verifyIdToken.mockRejectedValue(new Error("invalid"));
    expect((await route(request())).status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([{ disabled: true }, { email: "changed@example.test" }])("blocks disabled or mismatched accounts: %j", async (change) => {
    mocks.getUser.mockResolvedValue({ ...user, ...change });
    expect((await confirm(request())).status).toBe(403);
    expect((await send(request())).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("sends only to the authenticated owner, ignoring a supplied recipient", async () => {
    const result = await send(request());
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ requestType: "VERIFY_EMAIL", email: user.email });
    expect(await result.json()).toEqual({ ok: true, sent: true });
    expect(user.emailVerified).toBe(false);
  });
  it("does not resend to an already verified account", async () => {
    mocks.getUser.mockResolvedValue({ ...user, emailVerified: true });
    expect(await (await send(request())).json()).toEqual({ ok: true, alreadyVerified: true });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("enforces the resend rate limit", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    expect((await send(request())).status).toBe(429);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not report success or expose details on delivery failure", async () => {
    mocks.send.mockRejectedValue(new Error("synthetic@example.test token=private"));
    const result = await send(request());
    expect(result.status).toBe(503);
    expect(await result.text()).not.toMatch(/synthetic@|private/);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/synthetic@|private/);
  });
});
