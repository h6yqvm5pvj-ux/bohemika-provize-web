import { createHash, randomUUID } from "node:crypto";
import type { DecodedIdToken, UserRecord } from "firebase-admin/auth";
import { adminAuth, adminDb } from "./firebaseAdmin";
import { getAdminAccountAccess, requireMfaEnrollmentApproval } from "./adminAccountAccess";
import { isAuthenticationRevoked, isPersistentAccountBlock, revocationFromAccountData, withRevokedAuthentication } from "./tokenRevocation";

const LIFETIME_MS = 5 * 60_000;
export class MfaRemovalError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}
const expired = () => new MfaRemovalError("mfa-removal/expired", "Potvrzení vypršelo nebo už bylo použito. Začni odebrání 2FA znovu.", 409);

function identity(token: DecodedIdToken, user: UserRecord) {
  if (!token.uid || token.uid !== user.uid || !token.email || !token.email_verified || user.disabled ||
      !user.emailVerified || user.email?.trim().toLowerCase() !== token.email.trim().toLowerCase() ||
      !user.providerData.some(provider => provider.providerId === "password")) {
    throw new MfaRemovalError("mfa-removal/unauthorized", "Přihlas se znovu a ověř zabezpečení účtu.", 401);
  }
  const factors = user.multiFactor?.enrolledFactors ?? [];
  const factor = factors.find(factor => factor.factorId === "totp");
  if (!factor) {
    throw new MfaRemovalError("mfa-removal/unsupported-factors", "Pro změnu tohoto nastavení 2FA kontaktuj administrátora.", 409);
  }
  return { email: user.email!.trim().toLowerCase(), factorUid: factor.uid,
    factorVersion: JSON.stringify(factors.map(factor => [factor.uid, factor.factorId]).sort()) };
}

function refs(uid: string) {
  if (!adminAuth || !adminDb) throw new MfaRemovalError("mfa-removal/unavailable", "Odebrání 2FA teď není dostupné.", 503);
  return {
    challenge: adminDb.collection("authMfaRemovals").doc(createHash("sha256").update(uid).digest("hex")),
    block: adminDb.collection("accountBlocks").doc(uid),
  };
}

export async function prepareMfaRemoval(token: DecodedIdToken, user: UserRecord) {
  const account = identity(token, user);
  const { challenge } = refs(token.uid);
  const now = Date.now(), minAuthTime = Math.floor(now / 1000) + 1, id = randomUUID();
  await challenge.set({ id, uid: token.uid, ...account, minAuthTime, expiresAtMs: now + LIFETIME_MS, state: "prepared" });
  return { challengeId: id, waitMs: minAuthTime * 1000 - now + 150 };
}

export async function completeMfaRemoval(token: DecodedIdToken, user: UserRecord, id: string, bearer: string) {
  const account = identity(token, user);
  const { challenge, block } = refs(token.uid);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new MfaRemovalError("mfa-removal/unavailable", "Odebrání 2FA teď není dostupné.", 503);
  const now = Date.now();
  const firebase = token.firebase as typeof token.firebase & { second_factor_identifier?: string };
  await adminDb!.runTransaction(async tx => {
    const record = (await tx.get(challenge)).data();
    const data = (await tx.get(block)).data();
    if (!record || record.state !== "prepared" || record.id !== id || record.uid !== token.uid ||
        record.email !== account.email || record.factorUid !== account.factorUid || record.factorVersion !== account.factorVersion ||
        !Number.isFinite(record.expiresAtMs) || record.expiresAtMs <= now ||
        !Number.isSafeInteger(record.minAuthTime) || !Number.isSafeInteger(token.auth_time) ||
        token.auth_time < record.minAuthTime || token.auth_time > now / 1000 + 5 || now / 1000 - token.auth_time > LIFETIME_MS / 1000 ||
        firebase?.sign_in_provider !== "password" || firebase.sign_in_second_factor !== "totp" ||
        firebase.second_factor_identifier !== account.factorUid || isPersistentAccountBlock(data) ||
        isAuthenticationRevoked(revocationFromAccountData(data), token.auth_time)) throw expired();
    // Consume the proof once before installing the gate and changing Firebase.
    tx.update(challenge, { state: "used" });
  });
  try {
    const lastTotp = !user.multiFactor!.enrolledFactors.some(factor => factor.factorId === "totp" && factor.uid !== account.factorUid);
    const requireApproval = () => requireMfaEnrollmentApproval({ db: adminDb!, uid: token.uid, actorUid: token.uid });
    if (lastTotp) await requireApproval();
    await withRevokedAuthentication(adminDb!, token.uid, async () => {
      // Same targeted withdrawal as Firebase's client SDK: preserve all other
      // TOTP/phone factors. Never retain or forward the provider's new tokens.
      const response = await fetch(`https://identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:withdraw?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: bearer, mfaEnrollmentId: account.factorUid }),
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
      });
      await response.body?.cancel();
      if (!response.ok) throw expired();
      const current = await adminAuth!.getUser(token.uid);
      const factors = current.multiFactor?.enrolledFactors ?? [];
      if (factors.some(factor => factor.uid === account.factorUid)) throw expired();
      // Close access before lifting the pending revocation barrier even if a
      // concurrent factor change removed the expected remaining TOTP.
      if (!lastTotp && !factors.some(factor => factor.factorId === "totp")) await requireApproval();
      await adminAuth!.revokeRefreshTokens(token.uid);
    });
    const current = await adminAuth!.getUser(token.uid);
    if (getAdminAccountAccess(current, (await block.get()).data()).state === "blocked") throw expired();
  } catch {
    // An uncertain provider result must never clear the setup/admin block.
    throw new MfaRemovalError("mfa-removal/outcome-unknown", "Výsledek odebrání 2FA se nepodařilo ověřit. Přihlas se znovu; pokud nastavení nelze dokončit, kontaktuj administrátora.", 503);
  }
  return { removed: true as const };
}
