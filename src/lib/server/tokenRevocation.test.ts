import type { Auth, DecodedIdToken } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertTokenNotRevoked, isPersistentAccountBlock, readTokenRevocation, withFirestoreTokenRevocation, withRevokedAuthentication } from "./tokenRevocation";

const uid = "synthetic-user", now = 1_800_000_000_250, generation = "00000000-0000-0000-0000-000000000001";
const raw = { verifyIdToken: vi.fn(), revokeRefreshTokens: vi.fn(), updateUser: vi.fn(), setCustomUserClaims: vi.fn(), deleteUser: vi.fn(), createCustomToken: vi.fn(), getUser: vi.fn() };
let data: Record<string, unknown> | undefined;
let blockFields: Record<string, unknown>;
const snapshot = () => ({ exists: data !== undefined || Object.keys(blockFields).length > 0, data: () => data !== undefined ? { ...blockFields, revocation: structuredClone(data) } : Object.keys(blockFields).length ? { ...blockFields } : undefined });
const reference = { get: vi.fn(async () => snapshot()) };
const transaction = vi.fn();
const db = { collection: vi.fn(() => ({ doc: vi.fn(() => reference) })), runTransaction: transaction } as unknown as Firestore;
let auth: Auth;
const token = (time = now / 1000 | 0, custom = false, extra = {}) => ({ uid, auth_time: time, firebase: { sign_in_provider: custom ? "custom" : "password" }, ...extra }) as DecodedIdToken;
const state = (extra = {}) => ({ validAfterSeconds: 1_800_000_001, generation, pendingOperations: {}, ...extra });
const settle = async <T>(pending: Promise<T>) => { await vi.runAllTimersAsync(); return pending; };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); data = undefined; blockFields = {};
  reference.get.mockImplementation(async () => snapshot());
  transaction.mockImplementation(async run => run({ get: async () => snapshot(), set: (_ref: unknown, value: Record<string, unknown>) => { const { revocation, ...rest } = structuredClone(value); data = revocation as Record<string, unknown>; blockFields = rest; } }));
  raw.verifyIdToken.mockResolvedValue(token()); raw.createCustomToken.mockResolvedValue("signed-synthetic-custom-token");
  auth = withFirestoreTokenRevocation(raw as unknown as Auth, db);
});
afterEach(() => { vi.useRealTimers(); });

describe("revocation shared by Firebase, direct Firestore and server cookies", () => {
  it("preserves persistent blocks while revoking, including fields added during the Auth operation", async () => {
    blockFields = { reason: "missing-totp" };
    raw.revokeRefreshTokens.mockImplementation(async () => { blockFields.source = "second-operator"; });
    await settle(auth.revokeRefreshTokens(uid));
    expect(blockFields).toEqual({ reason: "missing-totp", source: "second-operator" });
    expect(isPersistentAccountBlock(snapshot().data())).toBe(true);
  });
  it.each([
    { record: undefined, blocked: false }, { record: {}, blocked: true },
    { record: { reason: "missing-totp" }, blocked: true },
    { record: { revocation: state() }, blocked: false },
    { record: { reason: "missing-totp", revocation: state() }, blocked: true },
  ])("distinguishes a revocation-only record from a persistent block %j", ({ record, blocked }) => {
    expect(isPersistentAccountBlock(record)).toBe(blocked);
  });
  it("blocks access before contacting Auth and rejects a token from the same second", async () => {
    raw.revokeRefreshTokens.mockImplementation(async () => {
      expect(Object.keys(data!.pendingOperations as object)).toHaveLength(1);
      await expect(assertTokenNotRevoked(db, token(1_800_000_099))).rejects.toMatchObject({ code: "auth/id-token-revoked" });
    });
    await settle(auth.revokeRefreshTokens(uid));
    expect(data!.pendingOperations).toEqual({});
    await expect(auth.verifyIdToken("synthetic", false)).rejects.toMatchObject({ code: "auth/id-token-revoked" });
    expect(raw.verifyIdToken).toHaveBeenCalledWith("synthetic", true);
    raw.verifyIdToken.mockResolvedValue(token(1_800_000_001));
    await expect(auth.verifyIdToken("fresh")).resolves.toMatchObject({ uid });
  });
  it("does not break pre-migration sessions until an account is revoked", async () => {
    await expect(auth.verifyIdToken("legacy")).resolves.toMatchObject({ uid });
    await auth.createCustomToken(uid, { app_totp_enrolled: true });
    expect(raw.createCustomToken).toHaveBeenCalledWith(uid, { app_totp_enrolled: true, app_auth_generation: "initial" });
  });
  it.each([undefined, "initial", "obsolete"])("rejects a late exchange of an old custom token (%s)", async old => {
    data = state();
    await expect(assertTokenNotRevoked(db, token(1_800_000_100, true, { app_auth_generation: old }))).rejects.toMatchObject({ code: "auth/id-token-revoked" });
  });
  it("accepts fresh custom proof and overrides caller-supplied generation", async () => {
    data = state();
    await settle(auth.createCustomToken(uid, { app_totp_enrolled: true, app_auth_generation: "forged" }));
    expect(raw.createCustomToken).toHaveBeenCalledWith(uid, { app_totp_enrolled: true, app_auth_generation: generation });
    await expect(assertTokenNotRevoked(db, token(1_800_000_001, true, { app_auth_generation: generation }))).resolves.toBeUndefined();
  });
  it("preserves another pending operation and the newest generation when operations finish out of order", async () => {
    const first = deferred(), second = deferred();
    const p1 = withRevokedAuthentication(db, uid, () => first.promise);
    await vi.runAllTimersAsync();
    vi.setSystemTime(now + 2000);
    const p2 = withRevokedAuthentication(db, uid, () => second.promise);
    await vi.runAllTimersAsync();
    const latestGeneration = data!.generation;
    expect(Object.keys(data!.pendingOperations as object)).toHaveLength(2);
    second.resolve(); await settle(p2);
    expect(Object.keys(data!.pendingOperations as object)).toHaveLength(1);
    await expect(auth.createCustomToken(uid)).rejects.toMatchObject({ code: "auth/revocation-unavailable" });
    await expect(assertTokenNotRevoked(db, token(1_900_000_000))).rejects.toMatchObject({ code: "auth/id-token-revoked" });
    vi.setSystemTime(now + 10_000); first.resolve(); await settle(p1);
    expect(data).toEqual({ generation: latestGeneration, validAfterSeconds: 1_800_000_011, pendingOperations: {} });
  });
  it("never contacts Auth if the initial registry write fails", async () => {
    transaction.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(auth.revokeRefreshTokens(uid)).rejects.toThrow("storage unavailable");
    expect(raw.revokeRefreshTokens).not.toHaveBeenCalled();
  });
  it("keeps access closed after a failed final registry commit", async () => {
    raw.revokeRefreshTokens.mockImplementation(async () => { transaction.mockRejectedValueOnce(new Error("commit failed")); });
    await expect(auth.revokeRefreshTokens(uid)).rejects.toThrow("commit failed");
    expect(Object.keys(data!.pendingOperations as object)).toHaveLength(1);
    await expect(assertTokenNotRevoked(db, token(1_900_000_000))).rejects.toMatchObject({ code: "auth/id-token-revoked" });
  });
  it("still revokes earlier proof when the Auth mutation fails with uncertain outcome", async () => {
    raw.revokeRefreshTokens.mockRejectedValueOnce(new Error("network uncertainty"));
    await expect(auth.revokeRefreshTokens(uid)).rejects.toThrow("network uncertainty");
    expect(data!.pendingOperations).toEqual({});
    await expect(assertTokenNotRevoked(db, token())).rejects.toMatchObject({ code: "auth/id-token-revoked" });
  });
  it.each([{}, state({ validAfterSeconds: -1 }), state({ pendingOperations: [] }), state({ generation: "" }), state({ pendingOperations: { [generation]: false } })])("fails closed on malformed state %j", async malformed => {
    data = malformed;
    await expect(auth.verifyIdToken("synthetic")).rejects.toMatchObject({ code: "auth/revocation-unavailable" });
    await expect(auth.createCustomToken(uid)).rejects.toMatchObject({ code: "auth/revocation-unavailable" });
  });
  it.each([{ password: "synthetic-new" }, { email: "changed@example.test" }, { multiFactor: { enrolledFactors: [] } }, { disabled: true }, { emailVerified: false }])("revokes security-sensitive updates %j", async properties => {
    await settle(auth.updateUser(uid, properties));
    expect(raw.updateUser).toHaveBeenCalledWith(uid, properties);
    expect(raw.revokeRefreshTokens).toHaveBeenCalledWith(uid);
    expect(data!.validAfterSeconds).toBe(1_800_000_001);
  });
  it("keeps display-name-only updates and SDK method binding intact", async () => {
    await auth.updateUser(uid, { displayName: "Updated" });
    raw.getUser.mockImplementation(function(this: unknown) { expect(this).toBe(raw); return {}; });
    await auth.getUser(uid);
    expect(raw.revokeRefreshTokens).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
  });
  it.each(["setCustomUserClaims", "deleteUser"] as const)("invalidates direct access on %s", async operation => {
    await settle(operation === "deleteUser" ? auth.deleteUser(uid) : auth.setCustomUserClaims(uid, { admin: false }));
    expect(raw[operation]).toHaveBeenCalled();
    await expect(assertTokenNotRevoked(db, token())).rejects.toMatchObject({ code: "auth/id-token-revoked" });
  });
  it("rejects invalid account paths and unreasonable clock boundaries", async () => {
    await expect(readTokenRevocation(db, "other/account")).rejects.toMatchObject({ code: "auth/revocation-unavailable" });
    data = state({ validAfterSeconds: 1_900_000_000 });
    await expect(auth.createCustomToken(uid)).rejects.toMatchObject({ code: "auth/revocation-unavailable" });
    expect(raw.createCustomToken).not.toHaveBeenCalled();
  });
});
