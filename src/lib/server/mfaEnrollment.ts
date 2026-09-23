import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { resolveAppSessionSecret } from "@/lib/appSession";
import { adminAuth, adminDb, getMfaEnrollmentContext } from "./firebaseAdmin";
import { requireAuthEmailConfig } from "./firebaseAuthEmail";
import { sendMfaEnrollmentCode } from "./mfaEnrollmentEmail";
import { isAuthenticationRevoked, isPersistentAccountBlock, revocationFromAccountData } from "./tokenRevocation";

const LIFETIME_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
type Context = Awaited<ReturnType<typeof getMfaEnrollmentContext>>;
export class MfaEnrollmentError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400, readonly retryAfterSeconds?: number) { super(message); }
}
const expired = () => new MfaEnrollmentError("mfa/expired", "Potvrzení vypršelo nebo už bylo použito. Vyžádej si nový kód do e-mailu.", 409);
const unavailable = () => new MfaEnrollmentError("mfa/unavailable", "Nastavení 2FA teď není dostupné. Zkus to prosím znovu.", 503);
function secretKey(purpose: string) {
  const secret = resolveAppSessionSecret();
  if (!secret) throw unavailable();
  return createHmac("sha256", secret).update(`mfa-enrollment-v1:${purpose}`).digest();
}
function digest(id: string, uid: string, code: string) {
  return createHmac("sha256", secretKey("email-code")).update(JSON.stringify([id, uid, code])).digest("hex");
}
function encrypt(session: string, id: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", secretKey("session"), iv);
  cipher.setAAD(Buffer.from(id));
  return Buffer.concat([iv, cipher.update(session, "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64");
}
function decrypt(value: string, id: string) {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 29) throw unavailable();
  const decipher = createDecipheriv("aes-256-gcm", secretKey("session"), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString("utf8");
}
function refs(context: Context) {
  if (!adminDb || !adminAuth) throw unavailable();
  return {
    challenge: adminDb.collection("authMfaEnrollments").doc(createHash("sha256").update(context.uid).digest("hex")),
    block: adminDb.collection("accountBlocks").doc(context.uid),
  };
}
function assertRecord(record: FirebaseFirestore.DocumentData | undefined, context: Context, id: string, acknowledgeFinalization = false) {
  if (!record || record.id !== id || record.uid !== context.uid || record.email !== context.email ||
      record.authTime !== context.authTime || !Number.isFinite(record.expiresAtMs) ||
      (!acknowledgeFinalization && record.expiresAtMs <= Date.now())) throw expired();
  return record;
}
function assertBlock(data: FirebaseFirestore.DocumentData | undefined, context: Context, id?: string) {
  if (isAuthenticationRevoked(revocationFromAccountData(data), context.authTime) ||
      (isPersistentAccountBlock(data) && data?.reason !== "missing-totp") ||
      (id && data?.mfaEmailChallengeId !== id)) throw expired();
}
async function provider(action: "start" | "finalize", body: Record<string, unknown>) {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key) throw unavailable();
  let response: Response;
  try {
    response = await fetch(`https://identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:${action}?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json();
    if (!response.ok) {
      if (String(payload?.error?.message).split(/[ :]/, 1)[0] === "INVALID_VERIFICATION_CODE") {
        throw new MfaEnrollmentError("mfa/wrong-totp", "Kód z Authenticatoru není správný. Zadej aktuální kód.");
      }
      throw unavailable();
    }
    return payload;
  } catch (error) {
    if (error instanceof MfaEnrollmentError) throw error;
    // Provider errors can contain credentials; never forward or log them.
    throw unavailable();
  }
}

export async function requestMfaEnrollment(context: Context) {
  requireAuthEmailConfig();
  const { challenge, block } = refs(context);
  const id = randomUUID(), code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeDigest = digest(id, context.uid, code), now = Date.now();
  await adminDb!.runTransaction(async tx => {
    const data = (await tx.get(block)).data();
    const previous = (await tx.get(challenge)).data();
    assertBlock(data, context);
    if (previous?.state === "finalizing" && previous.finalizationStartedAtMs > now - 60_000) throw expired();
    if (previous && previous.requestedAtMs > now - 60_000) {
      throw new MfaEnrollmentError("mfa/resend-wait", "Před dalším odesláním kódu chvíli počkej.", 429,
        Math.max(1, Math.ceil((previous.requestedAtMs + 60_000 - now) / 1000)));
    }
    // This existing deny document also protects direct Firestore access and
    // prevents activation of this pending setup via Firebase's public enrollment API.
    tx.set(block, { ...data, reason: "missing-totp", mfaEmailConfirmationRequired: true, mfaEmailChallengeId: id,
      mfaEmailConfirmedFactorUid: null });
    tx.set(challenge, { id, uid: context.uid, email: context.email, authTime: context.authTime,
      codeDigest, state: "sending", requestedAtMs: now, expiresAtMs: now + LIFETIME_MS, attempts: 0 });
  });
  try {
    await sendMfaEnrollmentCode(context.email, code, id);
    await adminDb!.runTransaction(async tx => {
      const record = assertRecord((await tx.get(challenge)).data(), context, id);
      if (record.state !== "sending") throw expired();
      tx.update(challenge, { state: "sent" });
    });
  } catch {
    await adminDb!.runTransaction(async tx => {
      if ((await tx.get(challenge)).data()?.id === id) tx.update(challenge, { state: "used", codeDigest: FieldValue.delete() });
    });
    throw new MfaEnrollmentError("mfa/email-failed", "Potvrzovací e-mail se nepodařilo odeslat. Vyžádej si nový kód.", 503);
  }
  return { challengeId: id, expiresAtMs: now + LIFETIME_MS };
}

export async function verifyMfaEnrollmentEmail(context: Context, token: string, id: string, code: string) {
  const { challenge, block } = refs(context);
  const outcome = await adminDb!.runTransaction(async tx => {
    const record = assertRecord((await tx.get(challenge)).data(), context, id);
    assertBlock((await tx.get(block)).data(), context, id);
    if (record.state !== "sent" || !Number.isInteger(record.attempts) || record.attempts >= MAX_ATTEMPTS) throw expired();
    const expected = Buffer.from(String(record.codeDigest), "hex"), actual = Buffer.from(digest(id, context.uid, code), "hex");
    if (!/^\d{6}$/.test(code) || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      const attempts = record.attempts + 1;
      tx.update(challenge, { attempts, ...(attempts >= MAX_ATTEMPTS ? { state: "used", codeDigest: FieldValue.delete() } : {}) });
      return attempts >= MAX_ATTEMPTS ? "exhausted" : "wrong-code";
    }
    tx.update(challenge, { state: "starting", codeDigest: FieldValue.delete() });
    return "accepted";
  });
  if (outcome !== "accepted") {
    if (outcome === "exhausted") throw expired();
    throw new MfaEnrollmentError("mfa/wrong-email-code", "Kód není správný. Použij kód z posledního potvrzovacího e-mailu.");
  }
  const response = await provider("start", { idToken: token, totpEnrollmentInfo: {} });
  const session = response?.totpSessionInfo;
  if (!session || typeof session.sharedSecretKey !== "string" || !/^[A-Z2-7]+$/.test(session.sharedSecretKey) ||
      typeof session.sessionInfo !== "string" || session.hashingAlgorithm !== "SHA1" || session.verificationCodeLength !== 6 || session.periodSec !== 30) throw unavailable();
  const encryptedSession = encrypt(session.sessionInfo, id);
  await adminDb!.runTransaction(async tx => {
    const record = assertRecord((await tx.get(challenge)).data(), context, id);
    assertBlock((await tx.get(block)).data(), context, id);
    if (record.state !== "starting") throw expired();
    tx.update(challenge, { state: "qr", encryptedSession, emailConfirmedAtMs: Date.now(), totpAttempts: 0,
      expiresAtMs: Math.min(record.expiresAtMs, Date.parse(session.finalizeEnrollmentTime) || record.expiresAtMs) });
  });
  return { challengeId: id, secretKey: session.sharedSecretKey as string };
}

export async function finishMfaEnrollment(context: Context, token: string, id: string, code: string) {
  if (!/^\d{6}$/.test(code)) throw new MfaEnrollmentError("mfa/wrong-totp", "Zadej všech šest číslic z Authenticatoru.");
  const { challenge, block } = refs(context);
  const encryptedSession = await adminDb!.runTransaction(async tx => {
    const record = assertRecord((await tx.get(challenge)).data(), context, id);
    assertBlock((await tx.get(block)).data(), context, id);
    if (record.state !== "qr" || typeof record.encryptedSession !== "string" || !Number.isInteger(record.totpAttempts) || record.totpAttempts >= MAX_ATTEMPTS) throw expired();
    tx.update(challenge, { state: "finalizing", finalizationStartedAtMs: Date.now(), totpAttempts: record.totpAttempts + 1 });
    return record.encryptedSession as string;
  });
  try {
    await provider("finalize", { idToken: token, displayName: "Autentizační aplikace", totpVerificationInfo: { sessionInfo: decrypt(encryptedSession, id), verificationCode: code } });
  } catch (error) {
    await adminDb!.runTransaction(async tx => {
      const record = (await tx.get(challenge)).data();
      if (record?.id !== id || record.state !== "finalizing") return;
      const retry = error instanceof MfaEnrollmentError && error.code === "mfa/wrong-totp" && record.totpAttempts < MAX_ATTEMPTS;
      tx.update(challenge, { state: retry ? "qr" : "used", ...(!retry ? { encryptedSession: FieldValue.delete() } : {}) });
    });
    if (error instanceof MfaEnrollmentError && error.code === "mfa/wrong-totp") throw error;
    throw new MfaEnrollmentError("mfa/outcome-unknown", "Výsledek nastavení se nepodařilo potvrdit. Vrať se na přihlášení; pokud už účet vyžaduje Authenticator, kontaktuj administrátora.", 503);
  }
  const user = await adminAuth!.getUser(context.uid);
  const factors = user.multiFactor?.enrolledFactors ?? [];
  if (user.disabled || user.email !== context.email || !user.emailVerified || factors.length !== 1 || factors[0].factorId !== "totp") throw unavailable();
  await adminDb!.runTransaction(async tx => {
    // The code was valid before the provider call. A deadline crossed during
    // that call must not discard acknowledgement of a successful enrollment.
    const record = assertRecord((await tx.get(challenge)).data(), context, id, true);
    const data = (await tx.get(block)).data();
    assertBlock(data, context, id);
    if (record.state !== "finalizing") throw expired();
    tx.update(challenge, { state: "used", encryptedSession: FieldValue.delete(), factorUid: factors[0].uid });
    // Keep the administrator's block. Activation must match this exact factor.
    tx.update(block, { mfaEmailConfirmedFactorUid: factors[0].uid });
  });
  return { enrolled: true as const };
}
