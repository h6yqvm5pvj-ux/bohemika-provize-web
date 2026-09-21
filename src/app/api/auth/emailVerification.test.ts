import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(),
  lockout: vi.fn(), rateLimit: vi.fn(), send: vi.fn(), block: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminAuth: mocks,
  getEmailVerificationUser: async (token: string) => {
    const { getEmailSetupUser } = await import("@/lib/server/emailSetupSecurity");
    return getEmailSetupUser(mocks as never, { collection: () => ({ doc: () => ({ get: mocks.block }) }) } as never, token);
  },
}));
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
    mocks.verifyIdToken.mockResolvedValue({ uid: user.uid, email: user.email, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: "password" } });
    mocks.getUser.mockResolvedValue({ ...user });
    mocks.block.mockResolvedValue({ data: () => undefined });
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
    expect((await send(request())).status).toBe(401);
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
  it("allows the setup-only account to request a link without granting application access", async () => {
    mocks.block.mockResolvedValue({ data: () => ({ reason: "missing-totp" }) });
    const response = await send(request());
    expect(response.status).toBe(200);
    expect(mocks.verifyIdToken).toHaveBeenCalledExactlyOnceWith("test-token", true);
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ requestType: "VERIFY_EMAIL", email: user.email });
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(await response.json()).toEqual({ ok: true, sent: true });
  });
  it.each(["admin-block", "admin-access-change", "unknown"])("blocks email delivery for a persistent %s block", async reason => {
    mocks.block.mockResolvedValue({ data: () => ({ reason }) });
    expect((await send(request())).status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([
    { validAfterSeconds: Math.floor(Date.now() / 1000) + 60, generation: "00000000-0000-0000-0000-000000000000", pendingOperations: {} },
    { validAfterSeconds: 0, generation: "00000000-0000-0000-0000-000000000000", pendingOperations: { "11111111-1111-1111-1111-111111111111": true } },
    { validAfterSeconds: "invalid" },
  ])("rejects revoked, pending or malformed revocation state: %j", async revocation => {
    mocks.block.mockResolvedValue({ data: () => ({ reason: "missing-totp", revocation }) });
    expect((await send(request())).status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(["anonymous", "custom", "google.com"])("rejects a %s token for the password setup flow", async provider => {
    mocks.verifyIdToken.mockResolvedValue({ uid: user.uid, email: user.email, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: provider } });
    expect((await send(request())).status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.block).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([-601, 61])("requires recent authentication and rejects a time offset of %i seconds", async offset => {
    mocks.verifyIdToken.mockResolvedValue({ uid: user.uid, email: user.email, auth_time: Math.floor(Date.now() / 1000) + offset, firebase: { sign_in_provider: "password" } });
    expect((await send(request())).status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("fails closed when the revocation store is unavailable", async () => {
    mocks.block.mockRejectedValue(new Error("unavailable"));
    expect((await send(request())).status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("honors the login lockout without sending a link", async () => {
    mocks.lockout.mockResolvedValue({ error: "Locked", status: 429, retryAfterSeconds: 60 });
    const response = await send(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
