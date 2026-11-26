import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(), getUserByEmail: vi.fn(), write: vi.fn(),
  profiles: new Map<string, Record<string, unknown>>(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => {
  const snapshot = (id: string) => ({ id, exists: mocks.profiles.has(id), data: () => mocks.profiles.get(id) });
  return {
    adminAuth: { verifyIdToken: mocks.verifyIdToken, getUserByEmail: mocks.getUserByEmail },
    adminDb: { collection: (collection: string) => ({
      doc: (id: string) => ({
        get: async () => collection === "users" ? snapshot(id) : { exists: false },
        set: async (patch: Record<string, unknown>) => {
          mocks.write(collection, id, patch);
          mocks.profiles.set(id, { ...mocks.profiles.get(id), ...patch });
        },
      }),
      where: (field: string, _op: string, value: unknown) => {
        const query = { limit: () => query, select: () => query, get: async () => {
          const docs = collection === "users" ? [...mocks.profiles.entries()]
            .filter(([, data]) => field.split(".").reduce<unknown>((row, key) =>
              row && typeof row === "object" ? (row as Record<string, unknown>)[key] : undefined, data) === value)
            .map(([id]) => snapshot(id)) : [];
          return { docs, empty: docs.length === 0 };
        } };
        return query;
      },
    }) },
  };
});
vi.mock("@/lib/server/loginAttemptLockout", () => ({
  getLoginAttemptStatus: vi.fn().mockResolvedValue({ locked: false }), loginAttemptLockoutMessage: vi.fn(),
}));
vi.mock("@/lib/server/rateLimit", () => ({
  consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true }), applyRateLimitHeaders: vi.fn(),
}));
vi.mock("@/lib/server/advisorSetupGuard", () => ({ checkAdvisorSetup: vi.fn(), advisorSetupError: vi.fn() }));

import { GET, PATCH } from "./route";

const owner = "owner@example.test";
const other = "other@example.test";
const card = (email: unknown) => ({
  enabled: true, slug: "test-advisor", fullName: "Test Advisor", email,
  title: "", phone: "", website: "", bio: "", location: "", officeLabel: "", officePhotos: [],
});
const request = (email: unknown, options: { authenticated?: boolean; target?: string; extra?: Record<string, unknown> } = {}) =>
  new NextRequest(`https://example.test/api/user/profile${options.target ? `?targetEmail=${options.target}` : ""}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", ...(options.authenticated === false ? {} : { Authorization: "Bearer test-token" }) },
    body: JSON.stringify({ onlineCard: card(email), ...options.extra }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profiles.clear();
  mocks.profiles.set(owner, { email: owner });
  mocks.profiles.set(other, { email: other, fullName: "Other Advisor" });
  mocks.verifyIdToken.mockResolvedValue({ email: owner, uid: "owner-uid" });
});

describe("independent online card contact email", () => {
  it("saves and reloads a different contact email while retaining the verified owner", async () => {
    expect((await PATCH(request(" CONTACT@Example.Test ", { extra: { onlineCard: { ...card(" CONTACT@Example.Test "), ownerEmail: other } } }))).status).toBe(200);
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith("users", owner, expect.objectContaining({
      onlineCard: expect.objectContaining({ email: "contact@example.test", ownerEmail: owner }),
    }));
    const response = await GET(new NextRequest("https://example.test/api/user/profile", { headers: { Authorization: "Bearer test-token" } }));
    expect(await response.json()).toMatchObject({ email: owner, profile: { email: owner, onlineCard: { email: "contact@example.test", ownerEmail: owner } } });
    expect(mocks.profiles.get(other)).toEqual({ email: other, fullName: "Other Advisor" });
  });

  it("allows another account's address as contact without writing to that account", async () => {
    expect((await PATCH(request(other))).status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith("users", owner, expect.anything());
    expect(mocks.profiles.get(other)).toEqual({ email: other, fullName: "Other Advisor" });
  });

  it.each(["", null])("keeps the login email as the default for %s", async email => {
    expect((await PATCH(request(email))).status).toBe(200);
    expect(mocks.profiles.get(owner)?.onlineCard).toMatchObject({ email: owner, ownerEmail: owner });
  });

  it("reads a legacy card with a blank contact email without publishing the login email as its contact", async () => {
    mocks.profiles.set(owner, { email: owner, onlineCard: card("") });
    const response = await GET(new NextRequest("https://example.test/api/user/profile", { headers: { Authorization: "Bearer test-token" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ email: owner, profile: { onlineCard: { email: "", ownerEmail: owner } } });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(["invalid", "a@b", "a@example.test\r\nBcc: x@example.test", 123, {}, [other], `${"a".repeat(161)}@example.test`])("rejects invalid email %j without writing", async email => {
    expect((await PATCH(request(email))).status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated changes", async () => {
    expect((await PATCH(request(other, { authenticated: false }))).status).toBe(401);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("rejects another user's target and privilege escalation", async () => {
    expect((await PATCH(request(other, { target: other }))).status).toBe(403);
    expect((await PATCH(request(other, { extra: { admin: true } }))).status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
