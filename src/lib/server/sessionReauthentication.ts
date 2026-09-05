import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { VerifiedAppSession } from "@/lib/appSession";
import { adminAuth, adminDb } from "./firebaseAdmin";

const REAUTH_MAX_AGE_SECONDS = 5 * 60;

export class SessionReauthenticationError extends Error {}

function sessionRef(session: VerifiedAppSession) {
  if (!adminDb || !session.sessionId) throw new Error("Úložiště relací není dostupné.");
  return adminDb.collection("usersPrivate").doc(session.email).collection("appSessions").doc(session.sessionId);
}

export async function prepareSessionReauthentication(session: VerifiedAppSession) {
  const now = Date.now();
  // Firebase auth_time has second precision. A token that predates this challenge
  // must never qualify, even if it was issued within the same second.
  const minAuthTime = Math.floor(now / 1000) + 1;
  const challengeId = randomUUID();
  await sessionRef(session).update({
    reauthChallenge: { id: challengeId, minAuthTime, expiresAtMs: now + REAUTH_MAX_AGE_SECONDS * 1000 },
  });
  return { challengeId, waitMs: minAuthTime * 1000 - now + 150 };
}

export async function consumeSessionReauthentication(
  session: VerifiedAppSession,
  decoded: DecodedIdToken,
  challengeId: unknown,
) {
  const now = Date.now();
  const authTime = decoded.auth_time;
  if (typeof challengeId !== "string" || !challengeId ||
    !Number.isInteger(authTime) || authTime <= 0 || authTime > Math.floor(now / 1000) + 5 ||
    now / 1000 - authTime > REAUTH_MAX_AGE_SECONDS ||
    decoded.firebase?.sign_in_provider !== "password") {
    throw new SessionReauthenticationError("Pro odhlášení ostatních zařízení znovu ověř heslo a případně 2FA.");
  }
  if (!adminAuth || !adminDb) throw new Error("Ověření přihlášení není dostupné.");
  const user = await adminAuth.getUser(session.uid);
  const factors = user.multiFactor?.enrolledFactors ?? [];
  if (user.disabled || user.email?.trim().toLowerCase() !== session.email ||
    (factors.length > 0 && !factors.some((factor) => factor.factorId === decoded.firebase?.sign_in_second_factor))) {
    throw new SessionReauthenticationError("Pro odhlášení ostatních zařízení potvrď i druhý faktor.");
  }

  const ref = sessionRef(session);
  await adminDb.runTransaction(async (tx) => {
    const record = await tx.get(ref);
    const data = record.data();
    const challenge = data?.reauthChallenge;
    if (!record.exists || data?.uid !== session.uid || data?.email !== session.email ||
      data?.revokedAtMs != null || data?.expiresAtMs <= now ||
      challenge?.id !== challengeId || !Number.isFinite(challenge?.expiresAtMs) ||
      challenge.expiresAtMs <= now || !Number.isInteger(challenge?.minAuthTime) || authTime < challenge.minAuthTime) {
      throw new SessionReauthenticationError("Potvrzení vypršelo nebo už bylo použito. Ověř přihlášení znovu.");
    }
    tx.update(ref, { reauthChallenge: FieldValue.delete() });
  });
}
