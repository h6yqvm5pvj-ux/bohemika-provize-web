import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), getUserByEmail: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/server/adminAuth", () => ({ getAdminAuthContext: mocks.context, adminAuthErrorResponse: () => NextResponse.json({ ok: false }, { status: 403 }) }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminAuth: { getUserByEmail: mocks.getUserByEmail } }));
vi.mock("@/lib/server/firebaseAuthEmail", () => ({ sendFirebaseAuthEmail: mocks.send }));
import { POST } from "./route";

const request = () => new NextRequest("http://localhost/api/admin/users/security", {
  method: "POST", body: JSON.stringify({ action: "sendPasswordReset", targetEmail: "synthetic@example.test" }),
});
describe("admin password reset email", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ adminUid: "synthetic-admin" });
    mocks.getUserByEmail.mockResolvedValue({ uid: "synthetic-user" });
    mocks.send.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });
  it("requests delivery of the selected account's Firebase action link", async () => {
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ requestType: "PASSWORD_RESET", email: "synthetic@example.test" });
    expect(await result.json()).toMatchObject({ ok: true });
  });
  it("does not send or read users when the caller is not an admin", async () => {
    mocks.context.mockResolvedValue({ error: "forbidden" });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("reports delivery failure without leaking recipients or tokens", async () => {
    mocks.send.mockRejectedValue(new Error("recipient@example.test token=private"));
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(await result.text()).not.toMatch(/recipient@|private/);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/recipient@|private/);
  });
});
