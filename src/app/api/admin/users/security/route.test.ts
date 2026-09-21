import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), target: vi.fn(), change: vi.fn() }));
vi.mock("@/lib/server/adminAuth", () => ({ getAdminAuthContext: mocks.context, adminAuthErrorResponse: () => NextResponse.json({ ok: false }, { status: 403 }) }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminAuth: { getUserByEmail: mocks.target }, adminDb: {} }));
vi.mock("@/lib/server/adminAccountAccess", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/server/adminAccountAccess")>(), changeAdminAccountAccess: mocks.change }));
import { POST } from "./route";

const request = (action: string) => new NextRequest("https://app.example.test/api/admin/users/security", {
  method: "POST", body: JSON.stringify({ targetEmail: "target@example.test", action }),
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ adminUid: "admin" });
  mocks.target.mockResolvedValue({ uid: "target", emailVerified: true });
  mocks.change.mockResolvedValue({ state: "active", reason: null });
});
describe("admin account access actions", () => {
  it.each(["activateAccount", "blockAccount"])("requires administrator authentication before %s", async action => {
    mocks.context.mockResolvedValue({ error: "forbidden" });
    expect((await POST(request(action))).status).toBe(403);
    expect(mocks.context.mock.calls[0][1].minimumRole).toBe("admin");
    expect(mocks.target).not.toHaveBeenCalled();
    expect(mocks.change).not.toHaveBeenCalled();
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
});
