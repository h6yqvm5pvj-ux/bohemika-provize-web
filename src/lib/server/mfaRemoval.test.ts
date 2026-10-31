import type { Auth, DecodedIdToken, UserRecord } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Data = Record<string, unknown>;
const state = vi.hoisted(() => {
  const records = new Map<string, Data>(), deleted = Symbol("delete");
  const controls = { failBlockWrite: false };
  const ref = (path: string) => ({ path,
    set: async (data: Data) => { records.set(path, structuredClone(data)); },
    get: async () => ({ data: () => records.get(path) }),
  });
  let tail = Promise.resolve();
  const db = { collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) => {
      const next = tail.then(async () => {
        const pending = new Map([...records].map(([key, data]) => [key, structuredClone(data)]));
        const result = await fn({
          get: async (r: { path: string }) => ({ data: () => pending.get(r.path) }),
          set: (r: { path: string }, data: Data) => {
            if (controls.failBlockWrite && r.path.startsWith("accountBlocks/")) throw new Error("storage unavailable");
            pending.set(r.path, { ...data });
          },
          update: (r: { path: string }, data: Data) => {
            const next = { ...pending.get(r.path), ...data };
            for (const key in next) if (next[key] === deleted) delete next[key];
            pending.set(r.path, next);
          },
          delete: (r: { path: string }) => pending.delete(r.path),
        });
        records.clear(); pending.forEach((data, key) => records.set(key, data)); return result;
      });
      tail = next.then(() => undefined, () => undefined); return next;
    },
  };
  return { records, db, controls, deleted, user: {} as UserRecord, decoded: {} as DecodedIdToken,
    raw: { getUser: vi.fn(), updateUser: vi.fn(), revokeRefreshTokens: vi.fn(), verifyIdToken: vi.fn(), createCustomToken: vi.fn() },
    send: vi.fn(), fetch: vi.fn() };
});
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { delete: () => state.deleted } }));
vi.mock("./firebaseAdmin", async () => {
  const { withFirestoreTokenRevocation, isPersistentAccountBlock } = await import("./tokenRevocation");
  const { withAccountSecurityPolicy } = await import("./accountSecurityPolicy");
  return { adminDb: state.db, adminAuth: withAccountSecurityPolicy(
    withFirestoreTokenRevocation(state.raw as unknown as Auth, state.db as unknown as Firestore),
    async uid => isPersistentAccountBlock(state.records.get(`accountBlocks/${uid}`)),
  ) };
});
vi.mock("./firebaseAuthEmail", () => ({ requireAuthEmailConfig: vi.fn() }));
vi.mock("./mfaEnrollmentEmail", () => ({ sendMfaEnrollmentCode: state.send }));
vi.mock("@/lib/appSession", () => ({ resolveAppSessionSecret: () => "synthetic-test-secret" }));
import { adminAuth } from "./firebaseAdmin";
import { completeMfaRemoval, prepareMfaRemoval } from "./mfaRemoval";
import { finishMfaEnrollment, requestMfaEnrollment, verifyMfaEnrollmentEmail } from "./mfaEnrollment";
import { getMfaEnrollmentUser } from "./emailSetupSecurity";
const uid = "synthetic", email = "synthetic@example.test", factorUid = "existing-totp";
const block = () => state.records.get(`accountBlocks/${uid}`);
const challenge = () => [...state.records].find(([key]) => key.startsWith("authMfaRemovals/"))![1];
const token = (authTime = Math.floor(Date.now() / 1000)) => ({ uid, email, email_verified: true, auth_time: authTime,
  firebase: { sign_in_provider: "password", sign_in_second_factor: "totp", second_factor_identifier: factorUid } }) as unknown as DecodedIdToken;
const prepare = () => prepareMfaRemoval(token(), state.user);
const proof = () => token(challenge().minAuthTime as number);

beforeEach(() => {
  vi.resetAllMocks(); state.records.clear(); state.controls.failBlockWrite = false;
  state.user = { uid, email, disabled: false, emailVerified: true, providerData: [{ providerId: "password" }],
    multiFactor: { enrolledFactors: [{ uid: factorUid, factorId: "totp" }] } } as UserRecord;
  state.decoded = token();
  state.raw.getUser.mockImplementation(async () => structuredClone(state.user));
  state.raw.verifyIdToken.mockImplementation(async () => structuredClone(state.decoded));
  state.raw.createCustomToken.mockResolvedValue("synthetic-sign-in-token");
  state.raw.revokeRefreshTokens.mockResolvedValue(undefined);
  state.fetch.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.includes(":withdraw")) {
      const factors = state.user.multiFactor!.enrolledFactors;
      if (factors.filter(factor => factor.factorId === "totp").length === 1) {
        expect(block()).toMatchObject({ reason: "missing-totp", mfaEmailConfirmationRequired: true,
          mfaEmailChallengeId: null, mfaEmailConfirmedFactorUid: null, revocation: expect.any(Object) });
      }
      const revocation = block()!.revocation as { pendingOperations: Record<string, boolean> };
      expect(Object.keys(revocation.pendingOperations)).not.toHaveLength(0);
      expect(JSON.parse(init.body as string)).toEqual({ idToken: "synthetic-bearer", mfaEnrollmentId: factorUid });
      state.user = { ...state.user, multiFactor: { enrolledFactors: factors.filter(factor => factor.uid !== factorUid) } } as UserRecord;
      return Response.json({ idToken: "discarded-provider-token", refreshToken: "discarded-provider-refresh" });
    }
    if (url.includes(":start")) return Response.json({ totpSessionInfo: { sharedSecretKey: "JBSWY3DPEHPK3PXP", sessionInfo: "synthetic-session", hashingAlgorithm: "SHA1", verificationCodeLength: 6, periodSec: 30 } });
    state.user = { ...state.user, multiFactor: { enrolledFactors: [{ factorId: "totp", uid: "replacement" }] } } as UserRecord;
    return Response.json({});
  });
  vi.stubGlobal("fetch", state.fetch); vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "synthetic-key");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("self-service last TOTP removal", () => {
  it("prepares a UID/email/factor-bound challenge without changing account access", async () => {
    const c = await prepare();
    expect(challenge()).toMatchObject({ id: c.challengeId, uid, email, factorUid, state: "prepared" });
    expect(challenge().minAuthTime).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(c.waitMs).toBeGreaterThan(0); expect(block()).toBeUndefined();
    expect(state.raw.updateUser).not.toHaveBeenCalled();
  });
  it.each(["same-second", "password-only", "custom", "wrong-factor", "expired", "different-uid", "changed-email", "changed-factor", "admin-block", "revoked", "invalid-auth-time", "future-auth-time", "wrong-challenge"])("rejects %s before provider mutation", async kind => {
    const c = await prepare(); let fresh = proof(), user = state.user; let id: string = c.challengeId;
    if (kind === "same-second") fresh = token((challenge().minAuthTime as number) - 1);
    if (kind === "password-only") fresh.firebase = { ...fresh.firebase, sign_in_second_factor: undefined };
    if (kind === "custom") fresh.firebase = { ...fresh.firebase, sign_in_provider: "custom" };
    if (kind === "wrong-factor") fresh.firebase = { ...fresh.firebase, second_factor_identifier: "another-factor" } as DecodedIdToken["firebase"];
    if (kind === "expired") challenge().expiresAtMs = Date.now() - 1;
    if (kind === "different-uid") fresh = { ...fresh, uid: "another-user" };
    if (kind === "changed-email") user = { ...user, email: "another@example.test" } as UserRecord;
    if (kind === "changed-factor") user = { ...user, multiFactor: { enrolledFactors: [{ uid: "new-factor", factorId: "totp" }] } } as UserRecord;
    if (kind === "admin-block") state.records.set(`accountBlocks/${uid}`, { reason: "admin-block" });
    if (kind === "revoked") state.records.set(`accountBlocks/${uid}`, { revocation: { validAfterSeconds: fresh.auth_time + 1, generation: c.challengeId, pendingOperations: {} } });
    if (kind === "invalid-auth-time") fresh.auth_time = NaN;
    if (kind === "future-auth-time") fresh.auth_time += 10;
    if (kind === "wrong-challenge") id = "another-challenge";
    await expect(completeMfaRemoval(fresh, user, id, "synthetic-bearer")).rejects.toBeInstanceOf(Error);
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.raw.revokeRefreshTokens).not.toHaveBeenCalled();
  });
  it.each(["disabled", "unverified", "no-factor"])("rejects %s accounts", async kind => {
    if (kind === "disabled") state.user = { ...state.user, disabled: true } as UserRecord;
    if (kind === "unverified") state.user = { ...state.user, emailVerified: false } as UserRecord;
    if (kind === "no-factor") state.user = { ...state.user, multiFactor: { enrolledFactors: [] } } as unknown as UserRecord;
    await expect(prepare()).rejects.toBeInstanceOf(Error); expect(state.records.size).toBe(0);
  });
  it("blocks before removing TOTP, revokes old proof and prevents replay/concurrent removal", async () => {
    const c = await prepare(), fresh = proof();
    const outcomes = await Promise.allSettled([1, 2].map(() => completeMfaRemoval(fresh, state.user, c.challengeId, "synthetic-bearer")));
    expect(outcomes.filter(r => r.status === "fulfilled")).toEqual([{ status: "fulfilled", value: { removed: true } }]);
    expect(state.fetch).toHaveBeenCalledOnce(); expect(state.raw.revokeRefreshTokens).toHaveBeenCalledOnce();
    expect(block()).toMatchObject({ reason: "missing-totp", mfaEmailConfirmationRequired: true });
    expect(challenge().state).toBe("used");
    await expect(completeMfaRemoval(fresh, state.user, c.challengeId, "synthetic-bearer")).rejects.toThrow();
  });
  it("invalidates a superseded removal challenge", async () => {
    const old = await prepare(); await prepare();
    await expect(completeMfaRemoval(proof(), state.user, old.challengeId, "synthetic-bearer")).rejects.toThrow();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("keeps direct provider reenrollment blocked for business APIs and custom sign-in", async () => {
    const c = await prepare(); await completeMfaRemoval(proof(), state.user, c.challengeId, "synthetic-bearer");
    state.user = { ...state.user, multiFactor: { enrolledFactors: [{ factorId: "totp", uid: "attacker-factor" }] } } as UserRecord;
    state.decoded = token(); state.decoded.firebase = { ...state.decoded.firebase, second_factor_identifier: "attacker-factor" } as DecodedIdToken["firebase"];
    await expect(adminAuth!.verifyIdToken("synthetic-provider-token")).rejects.toMatchObject({ code: "auth/account-blocked" });
    await expect(adminAuth!.createCustomToken(uid)).rejects.toMatchObject({ code: "auth/account-blocked" });
    await expect(getMfaEnrollmentUser(state.raw as unknown as Auth, state.db as unknown as Firestore, "synthetic-provider-token")).rejects.toThrow();
    expect(state.raw.createCustomToken).not.toHaveBeenCalled();
    expect(block()?.mfaEmailConfirmedFactorUid).toBeNull();
  });
  it("restores access only after the legitimate fresh inbox and new TOTP workflow", async () => {
    const c = await prepare(); await completeMfaRemoval(proof(), state.user, c.challengeId, "synthetic-bearer");
    state.fetch.mockClear();
    state.decoded = token(); state.decoded.firebase = { sign_in_provider: "password", identities: {} };
    const context = await getMfaEnrollmentUser(state.raw as unknown as Auth, state.db as unknown as Firestore, "synthetic-token");
    const enrollment = await requestMfaEnrollment(context);
    await expect(finishMfaEnrollment(context, "synthetic-token", enrollment.challengeId, "123456")).rejects.toThrow();
    expect(state.fetch).not.toHaveBeenCalled();
    await verifyMfaEnrollmentEmail(context, "synthetic-token", enrollment.challengeId, state.send.mock.calls[0][1] as string);
    await expect(finishMfaEnrollment(context, "synthetic-token", enrollment.challengeId, "123456")).resolves.toMatchObject({ enrolled: true });
    expect(block()).toEqual({ revocation: expect.any(Object) });
    state.decoded = token(); state.decoded.firebase = { ...state.decoded.firebase, second_factor_identifier: "replacement" } as DecodedIdToken["firebase"];
    await expect(adminAuth!.verifyIdToken("synthetic-token")).resolves.toMatchObject({ uid });
  });
  it("does not remove the factor when the persistent block cannot be written", async () => {
    const c = await prepare(); state.controls.failBlockWrite = true;
    await expect(completeMfaRemoval(proof(), state.user, c.challengeId, "synthetic-bearer")).rejects.toMatchObject({ code: "mfa-removal/outcome-unknown" });
    expect(state.fetch).not.toHaveBeenCalled(); expect(block()).toBeUndefined();
    expect(state.user.multiFactor!.enrolledFactors).toHaveLength(1);
  });
  it("retains the gate and hides raw provider errors after an uncertain removal", async () => {
    const c = await prepare(); state.fetch.mockRejectedValue(new Error("private-provider-response"));
    const error = await completeMfaRemoval(proof(), state.user, c.challengeId, "synthetic-bearer").catch(error => error);
    expect(error.code).toBe("mfa-removal/outcome-unknown"); expect(error.message).not.toContain("private-provider-response");
    expect(block()).toMatchObject({ reason: "missing-totp", mfaEmailConfirmationRequired: true });
  });
  it("does not accept a successful provider response while the selected factor remains", async () => {
    const c = await prepare(); state.fetch.mockResolvedValue(Response.json({}));
    await expect(completeMfaRemoval(proof(), state.user, c.challengeId, "synthetic-bearer")).rejects.toMatchObject({ code: "mfa-removal/outcome-unknown" });
    expect(block()).toMatchObject({ reason: "missing-totp", mfaEmailConfirmationRequired: true });
  });
  it("preserves a concurrent independent administrator block", async () => {
    const c = await prepare();
    state.fetch.mockImplementation(async () => {
      state.records.set(`accountBlocks/${uid}`, { ...block(), reason: "admin-block" });
      state.user = { ...state.user, multiFactor: { enrolledFactors: [] } } as unknown as UserRecord;
      return Response.json({});
    });
    await expect(completeMfaRemoval(proof(), state.user, c.challengeId, "synthetic-bearer")).rejects.toMatchObject({ code: "mfa-removal/outcome-unknown" });
    expect(block()?.reason).toBe("admin-block"); expect(state.raw.createCustomToken).not.toHaveBeenCalled();
  });
  it.each(["totp", "phone"])("removes only the selected TOTP and preserves another %s factor", async factorId => {
    const other = { factorId, uid: "other-factor", phoneNumber: "+420000000000" };
    state.user = { ...state.user, multiFactor: { enrolledFactors: [...state.user.multiFactor!.enrolledFactors, other] } } as UserRecord;
    const c = await prepare();
    await expect(completeMfaRemoval(proof(), state.user, c.challengeId, "synthetic-bearer")).resolves.toEqual({ removed: true });
    expect(state.user.multiFactor!.enrolledFactors).toEqual([other]);
    if (factorId === "totp") expect(block()).toEqual({ revocation: expect.any(Object) });
    else expect(block()).toMatchObject({ reason: "missing-totp", mfaEmailConfirmationRequired: true });
    expect(state.raw.updateUser).not.toHaveBeenCalled();
  });
  it("requires new confirmation if another factor changes after preparation", async () => {
    const c = await prepare();
    state.user = { ...state.user, multiFactor: { enrolledFactors: [...state.user.multiFactor!.enrolledFactors, { factorId: "totp", uid: "added-factor" }] } } as UserRecord;
    await expect(completeMfaRemoval(proof(), state.user, c.challengeId, "synthetic-bearer")).rejects.toThrow();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("keeps a setup gate when a concurrent change removes the expected remaining TOTP", async () => {
    state.user = { ...state.user, multiFactor: { enrolledFactors: [...state.user.multiFactor!.enrolledFactors, { factorId: "totp", uid: "other-factor" }] } } as UserRecord;
    const c = await prepare();
    state.fetch.mockImplementation(async () => {
      state.user = { ...state.user, multiFactor: { enrolledFactors: [] } } as unknown as UserRecord;
      return Response.json({});
    });
    await completeMfaRemoval(proof(), state.user, c.challengeId, "synthetic-bearer");
    expect(block()).toMatchObject({ reason: "missing-totp", mfaEmailConfirmationRequired: true });
  });
});
