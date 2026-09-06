import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  verifyIdToken: vi.fn(), getUser: vi.fn(), createCustomToken: vi.fn(), revokeRefreshTokens: vi.fn(),
  collection: vi.fn(), transaction: vi.fn(), batch: vi.fn(),
  read: vi.fn(), write: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminAuth: { verifyIdToken: mocks.verifyIdToken, getUser: mocks.getUser, createCustomToken: mocks.createCustomToken, revokeRefreshTokens: mocks.revokeRefreshTokens },
  adminDb: { collection: mocks.collection, runTransaction: mocks.transaction },
}));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "server-time", delete: () => "delete-field" } }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: async () => ({ allowed: true }), getRequestIp: () => "127.0.0.1", applyRateLimitHeaders: () => {} }));
vi.mock("@/lib/server/loginAttemptLockout", () => ({ getLoginAttemptStatus: async () => ({ locked: false }), buildLoginAttemptLockedResponse: vi.fn() }));
vi.mock("@/lib/server/advisorSetupGuard", () => ({ loadUserProfileForAdvisorSetup: async () => null, getAdvisorSetupError: vi.fn(), buildAdvisorSetupResponse: vi.fn() }));

import { APP_SESSION_COOKIE_NAME, createAppSessionCookieValue } from "@/lib/appSession";
import { verifyActiveAppSession } from "./activeAppSession";
import { recordAppSession, revokeOtherAppSessions } from "./appSessionRegistry";
import { GET as listSessions, POST as mutateSessions } from "@/app/api/auth/sessions/route";
import { POST as login, DELETE as logout } from "@/app/api/auth/session/route";
import { proxy as middleware } from "../../proxy";

const uid = "test-user";
const email = "test@example.invalid";
const sessionPath = (id: string) => `usersPrivate/${email}/appSessions/${id}`;
const nowMs = 1_800_000_000_250;
const baseUser = { uid, email, disabled: false, tokensValidAfterTime: new Date(0).toISOString(), multiFactor: { enrolledFactors: [] as { factorId: string }[] } };
const decoded = (authTime = Math.floor(nowMs / 1000) - 3600, secondFactor?: string) => ({
  uid, email, auth_time: authTime,
  firebase: { sign_in_provider: "password", ...(secondFactor ? { sign_in_second_factor: secondFactor } : {}) },
});
const request = (path: string, cookie?: string, body?: unknown, token = true) => new NextRequest(`https://bohemka.app${path}`, {
  method: body === undefined ? "GET" : "POST",
  headers: { ...(cookie ? { Cookie: `${APP_SESSION_COOKIE_NAME}=${cookie}` } : {}), ...(token ? { Authorization: "Bearer valid-test-token" } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
function snapshot(path: string) {
  return { id: path.split("/").at(-1), ref: ref(path), exists: mocks.store.has(path), data: () => mocks.store.get(path) };
}
function update(path: string, data: Record<string, unknown>) {
  mocks.write(path, data);
  if (!mocks.store.has(path)) throw new Error("not found");
  const next = { ...mocks.store.get(path) };
  for (const [key, value] of Object.entries(data)) {
    if (value === "delete-field") delete next[key]; else next[key] = value;
  }
  mocks.store.set(path, next);
}
function ref(path: string) {
  return { path, id: path.split("/").at(-1),
    collection: (name: string) => collection(`${path}/${name}`),
    get: async () => { mocks.read(path); return snapshot(path); },
    create: async (data: Record<string, unknown>) => { mocks.write(path, data); if (mocks.store.has(path)) throw new Error("already exists"); mocks.store.set(path, data); },
    update: async (data: Record<string, unknown>) => update(path, data),
  };
}
function collection(path: string) {
  return { doc: (id: string) => ref(`${path}/${id}`),
    firestore: { runTransaction: mocks.transaction, batch: mocks.batch },
    where: (field: string, _op: string, value: number) => ({ get: async () => ({ docs: [...mocks.store].filter(([key, data]) => key.startsWith(path + "/") && Number(data[field]) > value).map(([key]) => snapshot(key)) }) }),
    orderBy: () => ({ limit: (count: number) => ({ get: async () => ({ docs: [...mocks.store.keys()].filter(key => key.startsWith(path + "/")).slice(0, count).map(snapshot) }) }) }),
  };
}
async function issue(id = "current") {
  const cookie = await createAppSessionCookieValue({ uid, email, sessionId: id, maxAgeSeconds: 3600 });
  await recordAppSession({ uid, email, sessionId: id, expiresAtMs: cookie.expiresAt * 1000, req: request("/") });
  return cookie;
}

beforeEach(() => {
  vi.resetAllMocks(); mocks.store.clear(); vi.useFakeTimers(); vi.setSystemTime(nowMs);
  vi.stubEnv("APP_SESSION_SECRET", "local-test-secret-never-production");
  mocks.collection.mockImplementation(collection);
  mocks.transaction.mockImplementation(async (run) => run({ get: (r: { path: string }) => { mocks.read(r.path); return Promise.resolve(snapshot(r.path)); }, update: (r: { path: string }, data: Record<string, unknown>) => update(r.path, data) }));
  mocks.batch.mockImplementation(() => { const writes: (() => void)[] = []; return { update: (r: { path: string }, data: Record<string, unknown>) => writes.push(() => update(r.path, data)), commit: async () => writes.forEach(write => write()) }; });
  mocks.verifyIdToken.mockResolvedValue(decoded()); mocks.getUser.mockResolvedValue(baseUser);
  mocks.createCustomToken.mockResolvedValue("new-test-token"); mocks.revokeRefreshTokens.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("server session revocation", () => {
  it("accepts a registered active session", async () => {
    const cookie = await issue(); expect((await verifyActiveAppSession(cookie.value)).ok).toBe(true);
    expect((await middleware(request("/pomucky", cookie.value))).headers.get("x-middleware-next")).toBe("1");
  });
  it("rejects missing, forged and expired cookies before reading the database", async () => {
    const cookie = await createAppSessionCookieValue({ uid, email, nowMs: nowMs - 120_000, maxAgeSeconds: 60 });
    for (const value of [undefined, "fake.signature", cookie.value]) expect((await verifyActiveAppSession(value)).ok).toBe(false);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each(["missing", "revoked", "wrong-owner", "wrong-email", "wrong-expiry"])("rejects %s registry records", async (kind) => {
    const cookie = await issue(); const path = sessionPath("current"); const data = mocks.store.get(path)!;
    if (kind === "missing") mocks.store.delete(path);
    if (kind === "revoked") data.revokedAtMs = nowMs;
    if (kind === "wrong-owner") data.uid = "someone-else";
    if (kind === "wrong-email") data.email = "someone@example.invalid";
    if (kind === "wrong-expiry") data.expiresAtMs = nowMs + 60000;
    const response = await middleware(request("/pomucky", cookie.value));
    expect(response.status).toBe(307); expect(response.headers.get("location")).toContain("/login");
  });
  it.each(["disabled", "firebase-revoked", "deleted"])("rejects %s Firebase accounts", async (kind) => {
    const cookie = await issue();
    if (kind === "deleted") mocks.getUser.mockRejectedValue({ code: "auth/user-not-found" });
    else mocks.getUser.mockResolvedValue({ ...baseUser, disabled: kind === "disabled", tokensValidAfterTime: new Date(kind === "firebase-revoked" ? nowMs + 1000 : 0).toISOString() });
    expect((await verifyActiveAppSession(cookie.value)).ok).toBe(false);
  });
  it("revokes the cookie on logout and leaves another device active", async () => {
    const current = await issue(); const other = await issue("other");
    const response = await logout(request("/api/auth/session", current.value));
    expect(response.status).toBe(200); expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await middleware(request("/pomucky", current.value))).status).toBe(307);
    expect((await verifyActiveAppSession(other.value)).ok).toBe(true);
  });
  it("fails closed on database failure without discarding the cookie", async () => {
    const current = await issue(); mocks.read.mockImplementation(() => { throw new Error("offline"); });
    const response = await middleware(request("/pomucky", current.value));
    expect(response.status).toBe(503); expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("does not report successful logout when revocation cannot be saved", async () => {
    const current = await issue(); mocks.write.mockImplementation(() => { throw new Error("offline"); });
    const response = await logout(request("/api/auth/session", current.value));
    expect(response.status).toBe(503); expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("never issues a cookie if its registry record cannot be saved", async () => {
    mocks.write.mockImplementation(() => { throw new Error("offline"); });
    const response = await login(request("/api/auth/session", undefined, {}));
    expect(response.status).toBe(500); expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("revokes all other sessions, including those outside the displayed 100 and batch of 450", async () => {
    await issue();
    for (let i = 0; i < 510; i++) mocks.store.set(sessionPath(`other-${i}`), { uid, email, expiresAtMs: nowMs + 3600000, revokedAtMs: null });
    expect(await revokeOtherAppSessions({ email, keepSessionId: "current", reason: "test" })).toBe(510);
    expect([...mocks.store].filter(([key, data]) => key !== sessionPath("current") && data.revokedAtMs != null)).toHaveLength(510);
    expect(mocks.store.get(sessionPath("current"))?.revokedAtMs).toBeNull();
  });
});

describe("cadastral map frame policy", () => {
  it.each(["0", "1"])("allows Google Maps only on cadastral pages with strict enforcement %s", async (strict) => {
    vi.stubEnv("CSP_STRICT_ENFORCE", strict);
    const cookie = await issue();
    const defaultSources = ["'self'", "https://*.firebaseapp.com", "https://*.web.app"];
    for (const path of ["/cuzk", "/cuzk/", "/cuzk?address=Kadan", "/", "/pomucky", "/intranet", "/cuzk-other", "/api/cuzk-search"]) {
      const response = await middleware(request(path, cookie.value));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      const policies = [response.headers.get("Content-Security-Policy")!];
      if (strict === "0") policies.push(response.headers.get("Content-Security-Policy-Report-Only")!);
      const isCadastralPage = ["/cuzk", "/cuzk/", "/cuzk?address=Kadan"].includes(path);
      for (const policy of policies) {
        const frameSources = policy.split("; ").find(directive => directive.startsWith("frame-src "))!.split(" ").slice(1);
        expect(frameSources).toEqual(isCadastralPage
          ? [...defaultSources, "https://www.google.com/maps", "https://www.google.com/maps/"]
          : defaultSources);
        expect(policy).toContain("frame-ancestors 'none'");
        expect(policy).toContain("object-src 'none'");
      }
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    }
  });

  it("still requires authentication to view cadastral results", async () => {
    const response = await middleware(request("/cuzk", undefined, undefined, false));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://bohemka.app/login?next=%2Fcuzk");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
});

describe("fresh reauthentication for signing out other devices", () => {
  it("cannot turn a bearer token without a matching cookie into a new session", async () => {
    for (const action of ["prepareRevokeOthers", "revokeOthers"]) {
      expect((await mutateSessions(request("/api/auth/sessions", undefined, { action }))).status).toBe(401);
    }
    expect((await listSessions(request("/api/auth/sessions"))).status).toBe(401);
    expect(mocks.store.size).toBe(0); expect(mocks.createCustomToken).not.toHaveBeenCalled();
  });
  it.each(["missing", "old", "same-second", "expired", "wrong-challenge", "custom-provider", "missing-mfa"])("rejects %s proof without revoking or minting tokens", async (kind) => {
    const current = await issue();
    const prepared = await mutateSessions(request("/api/auth/sessions", current.value, { action: "prepareRevokeOthers" }));
    const { challengeId } = await prepared.json();
    vi.setSystemTime(nowMs + 2000);
    const claims = decoded(Math.floor((nowMs + 2000) / 1000));
    if (kind === "old") claims.auth_time -= 3600;
    if (kind === "same-second") claims.auth_time = Math.floor(nowMs / 1000);
    if (kind === "expired") vi.setSystemTime(nowMs + 301000);
    if (kind === "custom-provider") claims.firebase.sign_in_provider = "custom";
    if (kind === "missing-mfa") mocks.getUser.mockResolvedValue({ ...baseUser, multiFactor: { enrolledFactors: [{ factorId: "totp" }] } });
    mocks.verifyIdToken.mockResolvedValue(claims);
    const response = await mutateSessions(request("/api/auth/sessions", current.value, { action: "revokeOthers", challengeId: kind === "missing" ? undefined : kind === "wrong-challenge" ? "wrong" : challengeId }));
    expect(response.status).toBe(403); expect(mocks.createCustomToken).not.toHaveBeenCalled(); expect(mocks.revokeRefreshTokens).not.toHaveBeenCalled();
  });
  it.each([false, true])("completes reauthenticated revocation, rotates the current cookie and prevents replay (MFA %s)", async (mfa) => {
    const current = await issue(); const other = await issue("other");
    const prepare = await mutateSessions(request("/api/auth/sessions", current.value, { action: "prepareRevokeOthers" }));
    const { challengeId } = await prepare.json(); vi.setSystemTime(nowMs + 2000);
    mocks.verifyIdToken.mockResolvedValue(decoded(Math.floor((nowMs + 2000) / 1000), mfa ? "totp" : undefined));
    if (mfa) mocks.getUser.mockResolvedValue({ ...baseUser, multiFactor: { enrolledFactors: [{ factorId: "totp" }] } });
    const body = { action: "revokeOthers", challengeId };
    const response = await mutateSessions(request("/api/auth/sessions", current.value, body));
    expect(response.status).toBe(200); expect((await response.json()).customToken).toBe("new-test-token");
    expect(mocks.createCustomToken).toHaveBeenCalledTimes(1);
    const replacement = response.cookies.get(APP_SESSION_COOKIE_NAME)!.value;
    expect((await verifyActiveAppSession(replacement)).ok).toBe(true);
    expect((await verifyActiveAppSession(current.value)).ok).toBe(false);
    expect((await verifyActiveAppSession(other.value)).ok).toBe(false);
    expect((await mutateSessions(request("/api/auth/sessions", current.value, body))).status).toBe(401);
    expect((await mutateSessions(request("/api/auth/sessions", replacement, body))).status).toBe(403);
    expect(mocks.createCustomToken).toHaveBeenCalledTimes(1);
  });
});
