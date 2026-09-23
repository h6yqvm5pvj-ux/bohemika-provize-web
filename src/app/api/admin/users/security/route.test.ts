import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), target: vi.fn(), change: vi.fn(), reset: vi.fn(), update: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/server/adminAuth", () => ({ getAdminAuthContext: mocks.context, adminAuthErrorResponse: () => NextResponse.json({ ok: false }, { status: 403 }) }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminAuth: { getUserByEmail: mocks.target, updateUser: mocks.update }, adminDb: {} }));
vi.mock("@/lib/server/firebaseAuthEmail", () => ({ sendFirebaseAuthEmail: mocks.send }));
vi.mock("@/lib/server/adminAccountAccess", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/server/adminAccountAccess")>(), changeAdminAccountAccess: mocks.change, resetAccountMfa: mocks.reset }));
import { POST } from "./route";
import { POST as markEmailVerified } from "@/app/api/auth/mark-email-verified/route";

const request = (action: string) => new NextRequest("https://app.example.test/api/admin/users/security", {
  method: "POST", body: JSON.stringify({ targetEmail: "target@example.test", action }),
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ adminUid: "admin" });
  mocks.target.mockResolvedValue({ uid: "target", email: "target@example.test", emailVerified: true });
  mocks.change.mockResolvedValue({ state: "active", reason: null });
});
afterEach(() => vi.restoreAllMocks());
describe("admin account access actions", () => {
  it.each(["activateAccount", "blockAccount"])("requires administrator authentication before %s", async action => {
    mocks.context.mockResolvedValue({ error: "forbidden" });
    expect((await POST(request(action))).status).toBe(403);
    expect(mocks.context.mock.calls[0][1].minimumRole).toBe("admin");
    expect(mocks.target).not.toHaveBeenCalled();
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("resets MFA into mandatory setup without disabling the account", async () => {
    mocks.reset.mockResolvedValue({ state: "setup", reason: "mfa-enrollment" });
    const response = await POST(request("resetMfa"));
    expect(response.status).toBe(200);
    expect(mocks.reset).toHaveBeenCalledWith(expect.objectContaining({ uid: "target", actorUid: "admin" }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ access: { state: "setup" } });
  });
  it("prevents an administrator from blocking their own account", async () => {
    mocks.target.mockResolvedValue({ uid: "admin" });
    expect((await POST(request("blockAccount"))).status).toBe(400);
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it.each(["activateAccount", "blockAccount"])("executes an explicit %s action for the resolved target", async action => {
    const response = await POST(request(action));
    expect(response.status).toBe(200);
    expect(mocks.change).toHaveBeenCalledWith(expect.objectContaining({ uid: "target", actorUid: "admin", active: action === "activateAccount" }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("explains that an account without TOTP is activated only for setup", async () => {
    mocks.change.mockResolvedValue({ state: "setup", reason: "mfa-enrollment" });
    const body = await (await POST(request("activateAccount"))).json();
    expect(body.message).toContain("nastavení 2FA");
    expect(body.access.state).toBe("setup");
  });
  it("does not mutate an unknown target", async () => {
    mocks.target.mockRejectedValue({ code: "auth/user-not-found" });
    expect((await POST(request("activateAccount"))).status).toBe(404);
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("sends a verification link instead of administratively verifying the email", async () => {
    mocks.target.mockResolvedValue({ uid: "target", email: "canonical@example.test", emailVerified: false });
    const response = await POST(request("verifyEmail"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, emailVerified: false });
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ requestType: "VERIFY_EMAIL", email: "canonical@example.test" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("does not resend to an already verified address", async () => {
    expect(await (await POST(request("verifyEmail"))).json()).toMatchObject({ ok: true, emailVerified: true });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not claim success or expose private errors when sending fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.target.mockResolvedValue({ uid: "target", email: "target@example.test", emailVerified: false });
    mocks.send.mockRejectedValue(new Error("private-token target@example.test"));
    const response = await POST(request("verifyEmail"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/private-token|target@/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("requires an admin before sending verification mail", async () => {
    mocks.context.mockResolvedValue({ error: "forbidden" });
    expect((await POST(request("verifyEmail"))).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("retires the legacy manual-verification endpoint without changing any user", async () => {
    const response = await markEmailVerified(request("verifyEmail"));
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(mocks.target).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
