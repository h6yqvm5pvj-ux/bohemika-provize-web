import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), direct: vi.fn(), select: vi.fn(), context: vi.fn(), listUsers: vi.fn(), profiles: vi.fn(), privateProfiles: vi.fn() }));
vi.mock("@/lib/server/adminAuth", () => ({ getAdminAuthContext: mocks.context, adminAuthErrorResponse: () => NextResponse.json({ ok: false }, { status: 403 }) }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminAuth: { listUsers: mocks.listUsers, getUserByEmail: mocks.getUser },
  adminDb: { collection: (name: string) => ({
    get: name === "users" ? mocks.profiles : mocks.privateProfiles,
    select: (...fields: string[]) => { mocks.select(name, fields); return { get: name === "users" ? mocks.profiles : mocks.privateProfiles }; },
    doc: (id: string) => ({ get: () => mocks.direct(name, id) }),
  }) },
}));
import { GET } from "./route";

const avatar = "https://firebasestorage.googleapis.com/v0/b/demo.test/o/profile-avatars%2Fadvisor%2Favatar.webp?alt=media";
const request = (query = "") => new NextRequest(`http://localhost/api/admin/users${query}`);
const profile = (data: Record<string, unknown>) => ({ id: "advisor@example.test", data: () => data });

describe("admin user profile pictures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ adminUid: "admin" });
    mocks.listUsers.mockResolvedValue({ users: [{ uid: "advisor", email: "advisor@example.test", displayName: "Anna", disabled: false, emailVerified: true, metadata: {} }] });
    mocks.profiles.mockResolvedValue({ docs: [profile({ fullName: "Anna", profileAvatar: avatar })] });
    mocks.privateProfiles.mockResolvedValue({ docs: [] });
  });

  it("includes the same managed profile picture used elsewhere in the application", async () => {
    // Private profile data must not override the public profile picture.
    mocks.privateProfiles.mockResolvedValue({ docs: [profile({ profileAvatar: "https://outside.example.test/photo.jpg" })] });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).users[0]).toMatchObject({ fullName: "Anna", profileAvatar: avatar });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each([undefined, "", "https://outside.example.test/photo.jpg"])("leaves a missing or unsupported avatar to the shared default: %s", async (profileAvatar) => {
    mocks.profiles.mockResolvedValue({ docs: [profile({ profileAvatar })] });
    expect((await (await GET(request())).json()).users[0].profileAvatar).toBe("");
  });

  it("requires administrator access before returning profile pictures", async () => {
    mocks.context.mockResolvedValue({ error: "forbidden" });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.listUsers).not.toHaveBeenCalled();
    expect(mocks.profiles).not.toHaveBeenCalled();
  });
  it("returns a small directory without security details or career history", async () => {
    const body = await (await GET(request("?view=directory"))).json();
    expect(body.users[0]).toMatchObject({ email: "advisor@example.test", profileAvatar: avatar, missingItems: expect.any(Array) });
    for (const key of ["mfa", "onlineCard", "positionTimeline", "lastSignInAt", "createdAt"]) expect(body.users[0]).not.toHaveProperty(key);
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.select.mock.calls[0][1]).not.toContain("onlineCard");
    expect(mocks.select.mock.calls[0][1]).not.toContain("pushTokens");
  });
  it("fetches the selected account without listing any other auth accounts or profiles", async () => {
    mocks.getUser.mockResolvedValue({ uid: "advisor", email: "advisor@example.test", disabled: false, emailVerified: true, metadata: {}, multiFactor: { enrolledFactors: [{ uid: "factor-1", factorId: "totp" }] } });
    mocks.direct.mockResolvedValue({ exists: true, id: "advisor@example.test", data: () => ({ fullName: "Anna", profileAvatar: avatar }) });
    const response = await GET(request("?email=advisor%40example.test"));
    const body = await response.json();
    expect(body.user).toMatchObject({ fullName: "Anna", mfa: { enabled: true, factorCount: 1 } });
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith("advisor@example.test");
    expect(mocks.direct).toHaveBeenCalledTimes(2);
    expect(mocks.listUsers).not.toHaveBeenCalled(); expect(mocks.profiles).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects invalid and unauthorized detail requests before looking up accounts", async () => {
    expect((await GET(request("?email=invalid"))).status).toBe(400);
    mocks.context.mockResolvedValue({ error: "forbidden" });
    expect((await GET(request("?email=advisor%40example.test"))).status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("returns a missing-account response when a selected user was deleted", async () => {
    mocks.getUser.mockRejectedValue({ code: "auth/user-not-found" });
    expect((await GET(request("?email=advisor%40example.test"))).status).toBe(404);
  });

});
