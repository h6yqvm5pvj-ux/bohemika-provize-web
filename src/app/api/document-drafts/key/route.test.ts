import "../../../../../tests/helpers/privateEncryptionTestKey";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), records: new Map<string, Record<string, unknown>>(), reads: [] as string[],
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminAuth: { verifyIdToken: mocks.verify },
  adminDb: {
    collection: (name: string) => ({ doc: (id: string) => `${name}/${id}` }),
    runTransaction: async (fn: (tx: unknown) => unknown) => fn({
      get: async (path: string) => { mocks.reads.push(path); return { exists: mocks.records.has(path), data: () => mocks.records.get(path) }; },
      update: (path: string, data: Record<string, unknown>) => mocks.records.set(path, { ...mocks.records.get(path), ...data }),
      create: (path: string, data: Record<string, unknown>) => mocks.records.set(path, data),
    }),
  },
}));
vi.mock("@/lib/server/loginAttemptLockout", () => ({ getLoginAttemptStatus: async () => ({ locked: false }) }));
vi.mock("@/lib/server/rateLimit", () => ({
  consumeRateLimit: async () => ({ allowed: true }), applyRateLimitHeaders: () => {},
}));
import { POST } from "./route";
const path = (uid: string) => `documentDraftKeys/${createHash("sha256").update(uid).digest("hex")}`;
const request = (suffix = "", init: NonNullable<ConstructorParameters<typeof NextRequest>[1]> = {}) => new NextRequest(`https://app.example.test/api/document-drafts/key${suffix}`, {
  method: "POST", headers: { Authorization: "Bearer valid-token" }, ...init,
});
beforeEach(() => {
  vi.clearAllMocks(); mocks.records.clear(); mocks.reads.length = 0;
  mocks.verify.mockResolvedValue({ uid: "author-a", email: "a@example.test" });
});

describe("private draft key authorization", () => {
  it("requires a valid non-revoked token before reading any key", async () => {
    expect((await POST(request("", { headers: {} }))).status).toBe(401);
    mocks.verify.mockRejectedValue(new Error("Revoked token"));
    expect((await POST(request())).status).toBe(401);
    expect(mocks.reads).toEqual([]);
    expect(mocks.verify).toHaveBeenCalledWith("valid-token", true);
  });
  it("creates a stable secret for the verified UID with private response headers", async () => {
    const first = await POST(request());
    const payload = await first.json();
    expect(payload.ownerUid).toBe("author-a");
    expect(JSON.stringify(mocks.records.get(path("author-a")))).not.toContain(payload.key);
    expect(Buffer.from(payload.key, "base64")).toHaveLength(32);
    expect((await (await POST(request())).json()).key).toBe(payload.key);
    expect(mocks.reads).toEqual([path("author-a"), path("author-a")]);
    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(first.headers.get("vary")).toBe("Authorization");
  });
  it("accepts the empty POST body stream exposed by production adapters", async () => {
    const req = request("", { body: "" });
    expect(req.body).not.toBeNull();
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect((await response.json()).ownerUid).toBe("author-a");
  });
  it.each(["{}", " ", "ownerUid=author-b"])("rejects any nonempty body: %s", async body => {
    expect((await POST(request("", { body }))).status).toBe(400);
    expect(mocks.reads).toEqual([]);
  });
  it.each([{}, { admin: true, adminRole: "admin" }, { admin: true, adminRole: "owner" }, { manager: true }])(
    "never grants a different author's key for roles %j", async claims => {
      const first = await (await POST(request())).json();
      mocks.verify.mockResolvedValue({ uid: "author-b", email: "b@example.test", ...claims });
      const second = await (await POST(request())).json();
      expect(second.ownerUid).toBe("author-b");
      expect(second.key).not.toBe(first.key);
      expect(mocks.reads.at(-1)).toBe(path("author-b"));
    },
  );
  it.each(["?uid=author-b", "?email=b@example.test", "?ownerUid=author-b"])("rejects an owner selector %s", async suffix => {
    expect((await POST(request(suffix))).status).toBe(400);
    expect(mocks.reads).toEqual([]);
  });
  it("rejects forged body ownership and administrator impersonation before accessing keys", async () => {
    expect((await POST(request("", { body: JSON.stringify({ ownerUid: "author-b" }) }))).status).toBe(400);
    mocks.verify.mockResolvedValue({ uid: "admin-uid", email: "admin@example.test", admin: true, adminRole: "owner" });
    expect((await POST(request("", { headers: { Authorization: "Bearer valid-token", "x-bohemika-impersonate-email": "b@example.test" } }))).status).toBe(403);
    expect(mocks.reads).toEqual([]);
  });
  it("fails closed for inconsistent ownership in storage", async () => {
    mocks.records.set(path("author-a"), { ownerUid: "author-b", version: 1, key: Buffer.alloc(32, 7).toString("base64") });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(Buffer.alloc(32, 7).toString("base64"));
  });
  it("wraps an existing key atomically without invalidating the author's existing drafts", async () => {
    const key = Buffer.alloc(32, 19).toString("base64");
    mocks.records.set(path("author-a"), { ownerUid: "author-a", version: 1, key });
    expect((await (await POST(request())).json()).key).toBe(key);
    expect(mocks.records.get(path("author-a"))?.key).toHaveProperty("privateEncryption", 1);
    expect(JSON.stringify(mocks.records.get(path("author-a")))).not.toContain(key);
    expect((await (await POST(request())).json()).key).toBe(key);
  });
  it("never stores an unwrapped new key when server encryption is unavailable", async () => {
    vi.stubEnv("MAILBOX_ENCRYPTION_KEY", "");
    expect((await POST(request())).status).toBe(503);
    expect(mocks.records.size).toBe(0);
  });
});
