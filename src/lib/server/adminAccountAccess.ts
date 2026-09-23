import { randomUUID } from "node:crypto";
import type { Auth, UserRecord } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { AdminAccountAccess } from "@/lib/adminAccountAccess";
import { hasTotpFactor } from "@/lib/accountSecurity";
import { isPersistentAccountBlock, revocationFromAccountData } from "./tokenRevocation";

export function getAdminAccountAccess(user: Pick<UserRecord, "disabled" | "emailVerified"> & Parameters<typeof hasTotpFactor>[0], block: FirebaseFirestore.DocumentData | undefined): AdminAccountAccess {
  if (user.disabled) return { state: "blocked", reason: "disabled" };
  const revocation = revocationFromAccountData(block);
  if (revocation && Object.keys(revocation.pendingOperations).length > 0) return { state: "blocked", reason: "pending-revocation" };
  const persistent = isPersistentAccountBlock(block);
  if (persistent && block?.reason !== "missing-totp") return { state: "blocked", reason: "persistent-block" };
  if (!user.emailVerified) return { state: "setup", reason: "email-verification" };
  if (!hasTotpFactor(user)) return { state: "setup", reason: "mfa-enrollment" };
  if (persistent) return { state: "setup", reason: "activation-required" };
  return { state: "active", reason: null };
}

export class AccountAccessConflict extends Error {
  readonly status = 409;
}

const persistentFields = (data: FirebaseFirestore.DocumentData) =>
  JSON.stringify(Object.keys(data).filter(key => key !== "revocation").sort().map(key => [key, data[key]]));

function emailConfirmationComplete(user: UserRecord, block: FirebaseFirestore.DocumentData) {
  return block.mfaEmailConfirmationRequired !== true ||
    (typeof block.mfaEmailConfirmedFactorUid === "string" &&
      user.multiFactor?.enrolledFactors.some(f => f.factorId === "totp" && f.uid === block.mfaEmailConfirmedFactorUid) === true);
}

export async function resetAccountMfa({ auth, db, uid, actorUid }: {
  auth: Auth; db: Firestore; uid: string; actorUid: string;
}): Promise<AdminAccountAccess> {
  const ref = db.collection("accountBlocks").doc(uid);
  await db.runTransaction(async tx => {
    const before = (await tx.get(ref)).data();
    const independentlyBlocked = isPersistentAccountBlock(before) && before?.reason !== "missing-totp";
    const next: FirebaseFirestore.DocumentData = { ...before, ...(independentlyBlocked ? {} : { reason: "missing-totp", source: "mfa-setup", resetByUid: actorUid }),
      mfaEmailConfirmationRequired: true, mfaEmailChallengeId: null, mfaEmailConfirmedFactorUid: null };
    delete next.mfaRecoveryApproval;
    tx.set(ref, next);
  });
  // Removing the factor revokes old sessions but does not disable password
  // sign-in. An independent administrator block remains in force.
  await auth.updateUser(uid, { multiFactor: { enrolledFactors: null } });
  await auth.revokeRefreshTokens(uid);
  const user = await auth.getUser(uid);
  const block = await db.runTransaction(async tx => (await tx.get(ref)).data());
  return getAdminAccountAccess(user, block);
}

// The supplied Auth must use withFirestoreTokenRevocation, like adminAuth.
export async function changeAdminAccountAccess({ auth, db, uid, actorUid, active }: {
  auth: Auth; db: Firestore; uid: string; actorUid: string; active: boolean;
}): Promise<AdminAccountAccess> {
  const ref = db.collection("accountBlocks").doc(uid);
  const operationId = randomUUID();
  const barrier = await db.runTransaction(async tx => {
    const before = (await tx.get(ref)).data();
    const revocation = revocationFromAccountData(before);
    if (revocation && Object.keys(revocation.pendingOperations).length > 0) {
      throw new AccountAccessConflict("Právě probíhá jiná změna zabezpečení. Obnov přehled a zkus to znovu.");
    }
    // Deny direct database access before touching Firebase Authentication.
    const next = { ...before, reason: "admin-access-change", accessChangeId: operationId, blockedAtMs: Date.now(), blockedByUid: actorUid };
    tx.set(ref, next);
    return next;
  });
  await auth.revokeRefreshTokens(uid);
  await auth.updateUser(uid, { disabled: !active });
  const user = await auth.getUser(uid);
  if (user.disabled === active) throw new AccountAccessConflict("Stav účtu se mezitím změnil. Obnov přehled a zkus to znovu.");
  if (active && hasTotpFactor(user) && !emailConfirmationComplete(user, barrier)) {
    // Restore the setup block, retaining the email requirement and revocation.
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current && persistentFields(current) === persistentFields(barrier)) tx.set(ref, { ...current, reason: "missing-totp" });
    });
    throw new AccountAccessConflict("Nastavení 2FA nebylo potvrzené kódem z e-mailu. Dokonči nastavení 2FA po potvrzení e-mailu.");
  }
  const finalBlock = await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || persistentFields(current) !== persistentFields(barrier)) {
      throw new AccountAccessConflict("Stav účtu se mezitím změnil. Obnov přehled; souběžná blokace zůstala zachována.");
    }
    const revocation = revocationFromAccountData(current);
    if (!revocation) throw new Error("Chybí potvrzení zneplatnění relací.");
    const ready = active && !user.disabled && user.emailVerified && hasTotpFactor(user);
    const next = ready ? { revocation } : {
      ...(current.mfaEmailConfirmationRequired === true ? {
        mfaEmailConfirmationRequired: true, mfaEmailChallengeId: current.mfaEmailChallengeId ?? null,
        mfaEmailConfirmedFactorUid: current.mfaEmailConfirmedFactorUid ?? null,
      } : {}),
      revocation,
      reason: active ? "missing-totp" : "admin-block",
      blockedAtMs: Date.now(), blockedByUid: actorUid,
      source: "admin-account-access",
    };
    // Retain the revocation cutoff and every concurrent operation's marker.
    tx.set(ref, next);
    return next;
  });
  return getAdminAccountAccess(user, finalBlock);
}
