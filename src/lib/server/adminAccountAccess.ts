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
  if (persistent) return { state: "blocked", reason: "activation-required" };
  return { state: "active", reason: null };
}

export class AccountAccessConflict extends Error {
  readonly status = 409;
}

const persistentFields = (data: FirebaseFirestore.DocumentData) =>
  JSON.stringify(Object.keys(data).filter(key => key !== "revocation").sort().map(key => [key, data[key]]));

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
  const finalBlock = await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || persistentFields(current) !== persistentFields(barrier)) {
      throw new AccountAccessConflict("Stav účtu se mezitím změnil. Obnov přehled; souběžná blokace zůstala zachována.");
    }
    const revocation = revocationFromAccountData(current);
    if (!revocation) throw new Error("Chybí potvrzení zneplatnění relací.");
    const ready = active && !user.disabled && user.emailVerified && hasTotpFactor(user);
    const next = ready ? { revocation } : {
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
