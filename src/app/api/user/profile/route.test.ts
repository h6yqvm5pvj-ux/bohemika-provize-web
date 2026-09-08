import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getUserByEmail: vi.fn(),
  write: vi.fn(),
  profiles: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminAuth: {
    verifyIdToken: mocks.verifyIdToken,
    getUserByEmail: mocks.getUserByEmail,
  },
  adminDb: {
    collection: (collection: string) => ({
      doc: (email: string) => ({
        set: async (patch: Record<string, unknown>, options: { merge: boolean }) => {
          mocks.write(collection, email, patch, options);
          mocks.profiles.set(email, { ...mocks.profiles.get(email), ...patch });
        },
      }),
    }),
  },
}));
vi.mock("@/lib/server/loginAttemptLockout", () => ({
  getLoginAttemptStatus: vi.fn().mockResolvedValue({ locked: false }),
  loginAttemptLockoutMessage: vi.fn(),
}));
vi.mock("@/lib/server/rateLimit", () => ({
  consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  applyRateLimitHeaders: vi.fn(),
}));
vi.mock("@/lib/server/advisorSetupGuard", () => ({
  checkAdvisorSetup: vi.fn(),
  advisorSetupError: vi.fn(),
}));

// Keep the real authentication context, impersonation resolver, scope validation,
// and patch builder. Only Firebase and unrelated external services are replaced.
import { ADMIN_IMPERSONATION_HEADER } from "@/lib/adminImpersonationShared";
import { PATCH } from "./route";

const ADMIN_EMAIL = "admin@example.test";
const TARGET_EMAIL = "advisor@example.test";
const ORIGINAL_ADMIN = {
  email: ADMIN_EMAIL,
  position: "manazer10",
  positionTimeline: [{ id: "admin-career", position: "manazer10", validFrom: "2020-01-01", validTo: null }],
};
const ORIGINAL_TARGET = {
  email: TARGET_EMAIL,
  fullName: "Testovací poradce",
  position: "poradce5",
  positionTimeline: [{ id: "advisor-career", position: "poradce5", validFrom: "2020-01-01", validTo: null }],
};
const NEW_TIMELINE = [
  { id: "advisor-career", position: "poradce5", validFrom: "2020-01-01", validTo: "2025-05-01" },
  { id: "advisor-promotion", position: "manazer7", validFrom: "2025-05-01", validTo: null },
];

function request({
  header = TARGET_EMAIL,
  target = TARGET_EMAIL,
  timeline = NEW_TIMELINE,
}: {
  header?: string | null;
  target?: string | null;
  timeline?: typeof NEW_TIMELINE;
} = {}) {
  const url = new URL("https://example.test/api/user/profile");
  if (target != null) url.searchParams.set("targetEmail", target);
  const headers = new Headers({ Authorization: "Bearer admin-token", "Content-Type": "application/json" });
  if (header != null) headers.set(ADMIN_IMPERSONATION_HEADER, header);
  return new NextRequest(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ positionTimeline: timeline }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profiles.clear();
  mocks.profiles.set(ADMIN_EMAIL, structuredClone(ORIGINAL_ADMIN));
  mocks.profiles.set(TARGET_EMAIL, structuredClone(ORIGINAL_TARGET));
  mocks.verifyIdToken.mockResolvedValue({ email: ADMIN_EMAIL, uid: "admin-uid", admin: true, adminRole: "admin" });
  mocks.getUserByEmail.mockResolvedValue({ email: TARGET_EMAIL, uid: "advisor-uid", disabled: false, customClaims: {} });
});

function expectNoProfileChanges() {
  expect(mocks.write).not.toHaveBeenCalled();
  expect(mocks.profiles.get(ADMIN_EMAIL)).toEqual(ORIGINAL_ADMIN);
  expect(mocks.profiles.get(TARGET_EMAIL)).toEqual(ORIGINAL_TARGET);
}

describe("PATCH career history while impersonating", () => {
  it("updates only the represented user's history and current position, preserving the admin profile", async () => {
    const response = await PATCH(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, email: TARGET_EMAIL });
    expect(mocks.verifyIdToken).toHaveBeenCalledExactlyOnceWith("admin-token", true);
    expect(mocks.getUserByEmail).toHaveBeenCalledExactlyOnceWith(TARGET_EMAIL);
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith(
      "users", TARGET_EMAIL,
      { positionTimeline: NEW_TIMELINE, position: "manazer7" },
      { merge: true }
    );
    expect(mocks.profiles.get(TARGET_EMAIL)).toEqual({
      ...ORIGINAL_TARGET, positionTimeline: NEW_TIMELINE, position: "manazer7",
    });
    expect(mocks.profiles.get(ADMIN_EMAIL)).toEqual(ORIGINAL_ADMIN);
  });

  it.each([
    { header: null, target: TARGET_EMAIL },
    { header: TARGET_EMAIL, target: null },
    { header: TARGET_EMAIL, target: ADMIN_EMAIL },
    { header: TARGET_EMAIL, target: "different@example.test" },
  ])("rejects incomplete or mismatched scope without falling back to the admin: %o", async (scope) => {
    expect((await PATCH(request(scope))).status).toBe(403);
    expectNoProfileChanges();
  });

  it("normalizes the target consistently before selecting the profile document", async () => {
    const response = await PATCH(request({ header: "ADVISOR@EXAMPLE.TEST", target: " Advisor@Example.Test " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, email: TARGET_EMAIL });
    expect(mocks.profiles.get(ADMIN_EMAIL)).toEqual(ORIGINAL_ADMIN);
    expect(mocks.profiles.get(TARGET_EMAIL)?.position).toBe("manazer7");
    expect([...mocks.profiles.keys()]).toEqual([ADMIN_EMAIL, TARGET_EMAIL]);
  });

  it("rejects impersonation by an ordinary user before writing either profile", async () => {
    mocks.verifyIdToken.mockResolvedValue({ email: ADMIN_EMAIL, uid: "admin-uid" });
    expect((await PATCH(request())).status).toBe(403);
    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
    expectNoProfileChanges();
  });

  it("rejects a missing represented account instead of updating the admin", async () => {
    mocks.getUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });
    expect((await PATCH(request())).status).toBe(404);
    expectNoProfileChanges();
  });

  it.each([
    { disabled: true, customClaims: {} },
    { disabled: false, customClaims: { admin: true, adminRole: "admin" } },
  ])("rejects an ineligible represented account: %o", async (account) => {
    mocks.getUserByEmail.mockResolvedValue({ email: TARGET_EMAIL, uid: "advisor-uid", ...account });
    expect((await PATCH(request())).status).toBe(403);
    expectNoProfileChanges();
  });

  it("does not change either profile when career history is invalid", async () => {
    const timeline = [{ ...NEW_TIMELINE[0], position: "invalid-position" }];
    expect((await PATCH(request({ timeline }))).status).toBe(400);
    expectNoProfileChanges();
  });

  it("updates the signed-in user's own career when no impersonation is requested", async () => {
    const response = await PATCH(request({ header: null, target: null }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, email: ADMIN_EMAIL });
    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
    expect(mocks.profiles.get(ADMIN_EMAIL)?.positionTimeline).toEqual(NEW_TIMELINE);
    expect(mocks.profiles.get(TARGET_EMAIL)).toEqual(ORIGINAL_TARGET);
  });
});
