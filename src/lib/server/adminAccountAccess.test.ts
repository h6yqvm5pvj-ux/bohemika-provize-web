import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { AccountAccessConflict, changeAdminAccountAccess, getAdminAccountAccess, resetAccountMfa } from "./adminAccountAccess";
import { isPersistentAccountBlock } from "./tokenRevocation";

const enrolled = { uid: "target", disabled: false, emailVerified: true, multiFactor: { enrolledFactors: [{ factorId: "totp", uid: "enrolled-factor" }] } };
const revocation = { validAfterSeconds: 123, generation: "00000000-0000-0000-0000-000000000001", pendingOperations: {} };
let user: typeof enrolled, data: Record<string, any> | undefined;
const raw = { getUser: vi.fn(), revokeRefreshTokens: vi.fn(), updateUser: vi.fn() };
const ref = {};
const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
  get: async () => ({ data: () => structuredClone(data) }),
  set: (_ref: unknown, next: Record<string, unknown>) => { data = structuredClone(next); },
}));
const db = { collection: () => ({ doc: () => ref }), runTransaction: transaction } as unknown as Firestore;
const change = (active: boolean) => changeAdminAccountAccess({ auth: raw as unknown as Auth, db, uid: "target", actorUid: "admin", active });

beforeEach(() => {
  vi.clearAllMocks();
  user = structuredClone(enrolled);
  data = undefined;
  raw.getUser.mockImplementation(async () => structuredClone(user));
  raw.revokeRefreshTokens.mockImplementation(async () => {
    expect(isPersistentAccountBlock(data)).toBe(true);
    data = { ...data, revocation: structuredClone(revocation) };
  });
  raw.updateUser.mockImplementation(async (_uid, patch) => {
    expect(isPersistentAccountBlock(data)).toBe(true);
    user = { ...user, ...patch };
    return structuredClone(user);
  });
});

describe("admin account status includes all access barriers", () => {
  it("reports full access only for an enabled, verified TOTP account without a persistent block", () => {
    expect(getAdminAccountAccess(user, undefined).state).toBe("active");
    expect(getAdminAccountAccess(user, { revocation }).state).toBe("active");
    expect(getAdminAccountAccess(user, { reason: "admin-block" }).state).toBe("blocked");
    expect(getAdminAccountAccess({ ...user, disabled: true }, undefined).state).toBe("blocked");
  });
  it("reports setup access while waiting for TOTP and activation after enrollment", () => {
    expect(getAdminAccountAccess({ ...user, multiFactor: { enrolledFactors: [] } }, { reason: "missing-totp" })).toEqual({ state: "setup", reason: "mfa-enrollment" });
    expect(getAdminAccountAccess(user, { reason: "missing-totp" })).toEqual({ state: "setup", reason: "activation-required" });
    expect(getAdminAccountAccess({ ...user, emailVerified: false }, undefined)).toEqual({ state: "setup", reason: "email-verification" });
  });
});

describe("administrator activation and blocking", () => {
  it("blocks direct database access before changing Auth and revokes existing sign-ins", async () => {
    expect((await change(false)).state).toBe("blocked");
    expect(user.disabled).toBe(true);
    expect(data).toMatchObject({ reason: "admin-block", blockedByUid: "admin", revocation });
    expect(raw.revokeRefreshTokens).toHaveBeenCalledWith("target");
    expect(raw.updateUser).toHaveBeenCalledWith("target", { disabled: true });
  });
  it("activates an enrolled account while preserving the revocation barrier", async () => {
    user.disabled = true;
    data = { reason: "missing-totp", source: "old-block", revocation };
    expect((await change(true)).state).toBe("active");
    expect(user.disabled).toBe(false);
    expect(data).toEqual({ revocation });
  });
  it.each(["missing-totp", "unverified-email"])("permits only setup for %s without modifying verification or factors", async kind => {
    user.disabled = true;
    if (kind === "missing-totp") user.multiFactor = { enrolledFactors: [] };
    else user.emailVerified = false;
    const before = structuredClone(user);
    expect((await change(true)).state).toBe("setup");
    expect(user).toEqual({ ...before, disabled: false });
    expect(data).toMatchObject({ reason: "missing-totp", revocation });
    expect(raw.updateUser).toHaveBeenCalledExactlyOnceWith("target", { disabled: false });
  });
  it.each(["revoke", "update"])("keeps access blocked after a failed %s call", async step => {
    (step === "revoke" ? raw.revokeRefreshTokens : raw.updateUser).mockRejectedValueOnce(new Error("unavailable"));
    await expect(change(true)).rejects.toThrow();
    expect(isPersistentAccountBlock(data)).toBe(true);
  });
  it("does not overwrite a concurrent administrator's block", async () => {
    raw.getUser.mockImplementation(async () => {
      data = { ...data, reason: "another-admin-block" };
      return structuredClone(user);
    });
    await expect(change(true)).rejects.toBeInstanceOf(AccountAccessConflict);
    expect(data?.reason).toBe("another-admin-block");
  });
  it("keeps another revocation's pending marker when activating", async () => {
    raw.getUser.mockImplementation(async () => {
      data!.revocation.pendingOperations[revocation.generation] = true;
      return structuredClone(user);
    });
    expect((await change(true)).reason).toBe("pending-revocation");
    expect(data?.revocation.pendingOperations).toEqual({ [revocation.generation]: true });
  });
  it("refuses to change an account whose revocation is still running", async () => {
    data = { revocation: { ...revocation, pendingOperations: { [revocation.generation]: true } } };
    await expect(change(true)).rejects.toBeInstanceOf(AccountAccessConflict);
    expect(raw.revokeRefreshTokens).not.toHaveBeenCalled();
    expect(raw.updateUser).not.toHaveBeenCalled();
  });
});


describe("activation requires fresh email approval for pending enrollment", () => {
  it.each([null, "other-factor"])("rejects an unapproved or replaced factor (%s)", async approvedUid => {
    data = { reason: "missing-totp", mfaEmailConfirmationRequired: true, mfaEmailConfirmedFactorUid: approvedUid };
    await expect(change(true)).rejects.toBeInstanceOf(AccountAccessConflict);
    expect(data).toMatchObject({ reason: "missing-totp", mfaEmailConfirmationRequired: true, revocation });
  });
  it("activates only the exact factor approved after fresh inbox confirmation", async () => {
    data = { reason: "missing-totp", mfaEmailConfirmationRequired: true, mfaEmailConfirmedFactorUid: "enrolled-factor" };
    expect((await change(true)).state).toBe("active");
    expect(data).toEqual({ revocation });
  });
  it("retains the requirement during setup preparation and blocking", async () => {
    user.multiFactor.enrolledFactors = [];
    data = { reason: "missing-totp", mfaEmailConfirmationRequired: true, mfaEmailConfirmedFactorUid: null, mfaEmailChallengeId: "challenge" };
    await change(true);
    expect(data).toMatchObject({ reason: "missing-totp", mfaEmailConfirmationRequired: true, mfaEmailChallengeId: "challenge" });
    await change(false);
    expect(data).toMatchObject({ reason: "admin-block", mfaEmailConfirmationRequired: true, mfaEmailChallengeId: "challenge" });
  });
});

describe("MFA reset requires setup without disabling password sign-in", () => {
  const reset = () => resetAccountMfa({ auth: raw as unknown as Auth, db, uid: "target", actorUid: "admin" });
  it("removes the factor and old approvals but keeps the account enabled", async () => {
    data = { reason: "missing-totp", mfaRecoveryApproval: {}, mfaEmailConfirmedFactorUid: "old", revocation };
    expect(await reset()).toEqual({ state: "setup", reason: "mfa-enrollment" });
    expect(user.disabled).toBe(false);
    expect(raw.updateUser).toHaveBeenCalledExactlyOnceWith("target", { multiFactor: { enrolledFactors: null } });
    expect(data).toMatchObject({ reason: "missing-totp", mfaEmailConfirmationRequired: true, mfaEmailConfirmedFactorUid: null, revocation });
    expect(data).not.toHaveProperty("mfaRecoveryApproval");
  });
  it("preserves an independent admin block and disabled flag", async () => {
    user.disabled = true; data = { reason: "admin-block", source: "admin-account-access", revocation };
    expect((await reset()).state).toBe("blocked");
    expect(user.disabled).toBe(true); expect(data?.reason).toBe("admin-block");
  });
});
