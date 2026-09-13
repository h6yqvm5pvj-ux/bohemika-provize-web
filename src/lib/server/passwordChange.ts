import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { DecodedIdToken, UserRecord } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { resolveAppSessionSecret } from "@/lib/appSession";
import { getPasswordPolicyFailure } from "@/app/nastaveni/passwordPolicy";
import { adminAuth, adminDb } from "./firebaseAdmin";
import { requireAuthEmailConfig, sendAuthEmailMessage } from "./firebaseAuthEmail";
import { queuePasswordChanged, renderPasswordChangeCode } from "./passwordChangeEmail";

const LIFETIME_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
export class PasswordChangeError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}
const expired = () => new PasswordChangeError("change/expired", "Potvrzení vypršelo nebo už bylo použito. Začni změnu hesla znovu.", 409);
const factors = (user: UserRecord) => user.multiFactor?.enrolledFactors ?? [];
const factorVersion = (user: UserRecord) => JSON.stringify(factors(user).map(f => [f.uid, f.factorId]).sort());
function refFor(uid: string) {
  if (!adminDb || !adminAuth) throw new PasswordChangeError("change/unavailable", "Ověření změny hesla teď není dostupné.", 503);
  return adminDb.collection("authPasswordChanges").doc(createHash("sha256").update(uid).digest("hex"));
}
function codeDigest(id: string, uid: string, code: string) {
  const secret = resolveAppSessionSecret();
  if (!secret) throw new PasswordChangeError("change/unavailable", "Ověření změny hesla teď není dostupné.", 503);
  return createHmac("sha256", secret).update(JSON.stringify(["password-change-v1", id, uid, code])).digest("hex");
}
function accountEmail(user: UserRecord) {
  if (user.disabled || !user.email || !user.providerData.some(p => p.providerId === "password")) {
    throw new PasswordChangeError("change/account", "Tento účet nelze ověřit heslem.", 403);
  }
  return user.email.trim().toLowerCase();
}
function assertFreshProof(token: DecodedIdToken, user: UserRecord, record: FirebaseFirestore.DocumentData, id: string) {
  const now = Date.now();
  if (record.id !== id || record.uid !== token.uid || record.email !== accountEmail(user) ||
      record.factorVersion !== factorVersion(user) || !Number.isFinite(record.expiresAtMs) || record.expiresAtMs <= now ||
      !Number.isInteger(record.minAuthTime) || typeof token.auth_time !== "number" || !Number.isInteger(token.auth_time) ||
      token.auth_time < record.minAuthTime || token.auth_time > now / 1000 + 5 || now / 1000 - token.auth_time > LIFETIME_MS / 1000 ||
      token.firebase?.sign_in_provider !== "password") {
    throw expired();
  }
  if (record.method === "totp") {
    const firebase = token.firebase as typeof token.firebase & { second_factor_identifier?: string };
    if (firebase?.sign_in_second_factor !== "totp" ||
        !factors(user).some(f => f.factorId === "totp" && f.uid === firebase.second_factor_identifier)) {
      throw new PasswordChangeError("change/mfa-required", "Potvrď změnu aktuálním kódem z Authenticatoru.", 403);
    }
  } else if (record.method !== "email" || factors(user).length > 0) {
    throw expired();
  }
}

export async function preparePasswordChange(token: DecodedIdToken, user: UserRecord) {
  requireAuthEmailConfig(); // Notifications are a required part of the flow.
  const email = accountEmail(user);
  if (factors(user).length && !factors(user).some(f => f.factorId === "totp")) {
    throw new PasswordChangeError("change/unsupported-factor", "Účet používá jiný druh 2FA. Obrať se na správce aplikace.", 409);
  }
  codeDigest("configuration-check", token.uid, "");
  const now = Date.now(), minAuthTime = Math.floor(now / 1000) + 1;
  const id = randomUUID(), method = factors(user).length ? "totp" : "email";
  await refFor(token.uid).set({ id, uid: token.uid, email, method, factorVersion: factorVersion(user),
    minAuthTime, expiresAtMs: now + LIFETIME_MS, state: "prepared", attempts: 0 });
  return { challengeId: id, method, waitMs: minAuthTime * 1000 - now + 150 };
}

export async function authorizePasswordChange(token: DecodedIdToken, user: UserRecord, id: string) {
  const ref = refFor(token.uid), code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const digest = codeDigest(id, token.uid, code);
  const outcome = await adminDb!.runTransaction(async tx => {
    const record = (await tx.get(ref)).data();
    if (!record) throw expired();
    assertFreshProof(token, user, record, id);
    if (record.state === "ready") return { method: record.method as "email" | "totp", send: false };
    if (record.state !== "prepared") throw expired();
    const email = record.method === "email";
    tx.update(ref, { state: email ? "sending" : "ready", ...(email ? { codeDigest: digest, expiresAtMs: Date.now() + LIFETIME_MS } : {}) });
    return { method: record.method as "email" | "totp", send: email };
  });
  if (outcome.send) {
    try {
      await sendAuthEmailMessage(accountEmail(user), renderPasswordChangeCode(code), `password-change-code-${id}`);
      await adminDb!.runTransaction(async tx => {
        const record = (await tx.get(ref)).data();
        if (record?.id !== id || record.state !== "sending") throw expired();
        tx.update(ref, { state: "ready" });
      });
    } catch {
      // A failed/uncertain delivery cannot leave an accepted confirmation in this flow.
      await adminDb!.runTransaction(async tx => {
        if ((await tx.get(ref)).data()?.id === id) tx.delete(ref);
      });
      throw new PasswordChangeError("change/email-failed", "Potvrzovací e-mail se nepodařilo odeslat. Začni změnu znovu.", 503);
    }
  }
  return { method: outcome.method };
}

export async function completePasswordChange(
  token: DecodedIdToken, user: UserRecord, id: string, password: string, code: string,
) {
  const email = accountEmail(user);
  if (password.length > 128) throw new PasswordChangeError("change/password-policy", "Nové heslo může mít nejvýše 128 znaků.");
  const failure = getPasswordPolicyFailure({ password, confirmPassword: password, userEmail: email, userFullName: user.displayName ?? "" });
  if (failure) throw new PasswordChangeError("change/password-policy", failure);
  requireAuthEmailConfig();
  const ref = refFor(token.uid);
  const accepted = await adminDb!.runTransaction(async tx => {
    const record = (await tx.get(ref)).data();
    if (!record || record.state !== "ready") throw expired();
    assertFreshProof(token, user, record, id);
    if (record.method === "email") {
      if (!Number.isInteger(record.attempts) || record.attempts >= MAX_ATTEMPTS) throw expired();
      const actual = Buffer.from(codeDigest(id, token.uid, code), "hex");
      const expected = Buffer.from(typeof record.codeDigest === "string" ? record.codeDigest : "", "hex");
      if (!/^\d{6}$/.test(code) || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        const attempts = record.attempts + 1;
        tx.update(ref, { attempts, ...(attempts >= MAX_ATTEMPTS ? { state: "used", codeDigest: FieldValue.delete() } : {}) });
        return attempts >= MAX_ATTEMPTS ? "exhausted" : "wrong-code";
      }
    }
    // Commit consumption BEFORE the external mutation. Concurrent requests cannot reuse it.
    tx.update(ref, { state: "used", codeDigest: FieldValue.delete() });
    return "accepted";
  });
  if (accepted !== "accepted") {
    if (accepted === "exhausted") throw expired();
    throw new PasswordChangeError("change/wrong-code", "Kód není správný. Zkontroluj poslední potvrzovací e-mail.");
  }
  try {
    // Firebase invalidates previous refresh tokens when the password changes.
    await adminAuth!.updateUser(token.uid, { password });
  } catch {
    // Never log the SDK error: it may include the submitted password/request.
    throw new PasswordChangeError("change/outcome-unknown", "Výsledek změny se nepodařilo ověřit. Zkus se přihlásit novým heslem; pokud nefunguje, použij Zapomenuté heslo.", 503);
  }
  // A delivery/storage failure must never be reported as a failed password change.
  try {
    const notice = await queuePasswordChanged(email);
    return { changed: true as const, notificationSent: notice.sent, pendingNoticeId: notice.sent ? undefined : notice.jobId };
  } catch {
    return { changed: true as const, notificationSent: false, pendingNoticeId: undefined };
  }
}
