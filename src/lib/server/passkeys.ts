import { Buffer } from "node:buffer";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type CredentialDeviceType,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import { FieldValue } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";

const PASSKEY_CREDENTIALS_COLLECTION = "passkeyCredentials";
const PASSKEY_CHALLENGES_COLLECTION = "_passkeyChallenges";
const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const PASSKEY_RECENT_AUTH_MAX_AGE_MS = 10 * 60 * 1000;
const RP_NAME = "Bohemka.App";
const PRIMARY_PRODUCTION_WEBAUTHN_ORIGIN = "https://bohemka.app";

type ChallengeType = "registration" | "authentication";

type PasskeyChallengeDoc = {
  challenge: string;
  type: ChallengeType;
  uid?: string;
  email?: string;
  origin: string;
  rpID: string;
  createdAtMs: number;
  expiresAtMs: number;
};

type PasskeyCredentialDoc = {
  credentialId: string;
  publicKey: string;
  counter: number;
  uid: string;
  email: string;
  userHandle: string;
  name: string;
  transports: AuthenticatorTransportFuture[];
  credentialDeviceType: CredentialDeviceType;
  credentialBackedUp: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  lastUsedAtMs?: number;
  disabled?: boolean;
};

export type PasskeyCredentialSummary = {
  credentialId: string;
  name: string;
  createdAtMs: number;
  lastUsedAtMs: number | null;
  transports: AuthenticatorTransportFuture[];
  credentialDeviceType: CredentialDeviceType;
  credentialBackedUp: boolean;
};

export type FirebasePasskeyAuthContext = {
  uid: string;
  email: string;
  authTimeMs: number;
};

type RequestWebAuthnContext = {
  origin: string;
  rpID: string;
};

export class PasskeyError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PasskeyError";
    this.status = status;
  }
}

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const buffer = Buffer.from(value, "base64url");
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  return new Uint8Array(arrayBuffer);
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.origin;
  } catch {
    return null;
  }
}

function firstHeaderValue(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

function requestFallbackOrigin(req: NextRequest): string {
  const url = new URL(req.url);
  const host =
    firstHeaderValue(req.headers.get("x-forwarded-host")) ||
    firstHeaderValue(req.headers.get("host")) ||
    url.host;
  const proto =
    firstHeaderValue(req.headers.get("x-forwarded-proto")) ||
    url.protocol.replace(/:$/, "") ||
    "https";
  return `${proto}://${host}`;
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function configuredOrigins(fallbackOrigin: string): Set<string> {
  const origins = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value) return;
    for (const part of value.split(",")) {
      const normalized = normalizeOrigin(part);
      if (normalized) origins.add(normalized);
    }
  };

  if (!isProductionRuntime()) {
    const fallback = normalizeOrigin(fallbackOrigin);
    if (fallback) origins.add(fallback);
  } else {
    // The primary application origin is a safe default. Extra domains and
    // deployment previews must still be explicitly configured below.
    add(PRIMARY_PRODUCTION_WEBAUTHN_ORIGIN);
  }
  add(process.env.NEXT_PUBLIC_APP_URL);
  add(process.env.WEBAUTHN_ORIGIN);
  add(process.env.WEBAUTHN_ALLOWED_ORIGINS);
  return origins;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

function getRequestWebAuthnContext(req: NextRequest): RequestWebAuthnContext {
  const fallbackOrigin = requestFallbackOrigin(req);
  const originHeader = req.headers.get("origin");
  const origin = normalizeOrigin(originHeader || fallbackOrigin);
  if (!origin) {
    throw new PasskeyError("Neplatný origin požadavku.", 400);
  }

  const allowedOrigins = configuredOrigins(fallbackOrigin);
  if (allowedOrigins.size === 0) {
    throw new PasskeyError("Server nemá nastavený povolený WebAuthn origin.", 500);
  }
  if (!allowedOrigins.has(origin)) {
    throw new PasskeyError("Origin není povolený pro passkey přihlášení.", 403);
  }

  const originUrl = new URL(origin);
  if (originUrl.protocol !== "https:" && !isLocalHostname(originUrl.hostname)) {
    throw new PasskeyError("Passkeys vyžadují HTTPS.", 400);
  }

  const configuredRpID = process.env.WEBAUTHN_RP_ID?.trim().toLowerCase();
  const rpID = configuredRpID || originUrl.hostname.toLowerCase();

  if (
    configuredRpID &&
    originUrl.hostname.toLowerCase() !== rpID &&
    !originUrl.hostname.toLowerCase().endsWith(`.${rpID}`)
  ) {
    throw new PasskeyError("Doména neodpovídá WebAuthn RP ID.", 400);
  }

  return { origin, rpID };
}

function assertAdminReady() {
  if (!adminAuth || !adminDb) {
    throw new PasskeyError("Server není správně nakonfigurován (Firebase Admin).", 500);
  }
  return { auth: adminAuth, db: adminDb };
}

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
}

export async function requireFirebasePasskeyAuth(
  req: NextRequest,
  options: { requireRecent?: boolean } = {}
): Promise<FirebasePasskeyAuthContext> {
  const { auth } = assertAdminReady();
  const token = getBearerToken(req);
  if (!token) {
    throw new PasskeyError("Missing bearer token", 401);
  }

  let decoded: Awaited<ReturnType<typeof auth.verifyIdToken>>;
  try {
    decoded = await auth.verifyIdToken(token, true);
  } catch (error) {
    const code = (error as { code?: string })?.code || "auth/invalid-token";
    throw new PasskeyError(`Neplatný nebo expirovaný token (${code}).`, 401);
  }

  const uid = String(decoded.uid ?? "").trim();
  const email = normalizeEmail(decoded.email);
  if (!uid || !email) {
    throw new PasskeyError("V tokenu chybí uživatel nebo e-mail.", 401);
  }

  const user = await auth.getUser(uid).catch(() => null);
  if (!user || user.disabled || normalizeEmail(user.email) !== email) {
    throw new PasskeyError("Uživatel není aktivní.", 403);
  }

  const authTimeSeconds =
    typeof decoded.auth_time === "number" && Number.isFinite(decoded.auth_time)
      ? decoded.auth_time
      : 0;
  const authTimeMs = authTimeSeconds > 0 ? authTimeSeconds * 1000 : 0;
  if (options.requireRecent) {
    const authAgeMs = authTimeMs > 0 ? Date.now() - authTimeMs : Infinity;
    if (authAgeMs > PASSKEY_RECENT_AUTH_MAX_AGE_MS) {
      throw new PasskeyError(
        "Pro přidání passkey se znovu přihlas a potvrď 2FA.",
        403
      );
    }
  }

  return { uid, email, authTimeMs };
}

function credentialDocToWebAuthnCredential(
  doc: PasskeyCredentialDoc
): WebAuthnCredential {
  return {
    id: doc.credentialId,
    publicKey: fromBase64Url(doc.publicKey),
    counter: typeof doc.counter === "number" ? doc.counter : 0,
    transports: Array.isArray(doc.transports) ? doc.transports : [],
  };
}

function sanitizeCredentialName(value: unknown): string {
  if (typeof value !== "string") return "Moje zařízení";
  const trimmed = value.trim();
  if (!trimmed) return "Moje zařízení";
  return trimmed.slice(0, 80);
}

function readClientChallenge(clientDataJSON: string): string {
  try {
    const clientData = JSON.parse(
      Buffer.from(clientDataJSON, "base64url").toString("utf8")
    ) as { challenge?: string };
    if (typeof clientData.challenge === "string" && clientData.challenge) {
      return clientData.challenge;
    }
  } catch {
    // handled below
  }
  throw new PasskeyError("V odpovědi chybí ověřovací výzva.", 400);
}

async function saveChallenge(data: PasskeyChallengeDoc) {
  const { db } = assertAdminReady();
  await db.collection(PASSKEY_CHALLENGES_COLLECTION).doc(data.challenge).set({
    ...data,
    expiresAt: new Date(data.expiresAtMs),
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function consumeChallenge(
  challenge: string,
  type: ChallengeType
): Promise<PasskeyChallengeDoc> {
  const { db } = assertAdminReady();
  const ref = db.collection(PASSKEY_CHALLENGES_COLLECTION).doc(challenge);
  const data = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new PasskeyError("Ověřovací výzva vypršela. Zkus to znovu.", 400);
    }

    const value = snap.data() as Partial<PasskeyChallengeDoc>;
    tx.delete(ref);
    return value;
  });

  if (
    data.challenge !== challenge ||
    data.type !== type ||
    typeof data.origin !== "string" ||
    typeof data.rpID !== "string" ||
    typeof data.expiresAtMs !== "number"
  ) {
    throw new PasskeyError("Ověřovací výzva není platná.", 400);
  }

  if (data.expiresAtMs <= Date.now()) {
    throw new PasskeyError("Ověřovací výzva vypršela. Zkus to znovu.", 400);
  }

  return data as PasskeyChallengeDoc;
}

async function loadCredentialById(
  credentialId: string
): Promise<PasskeyCredentialDoc | null> {
  const { db } = assertAdminReady();
  const snap = await db.collection(PASSKEY_CREDENTIALS_COLLECTION).doc(credentialId).get();
  if (!snap.exists) return null;
  const data = snap.data() as PasskeyCredentialDoc;
  if (data.disabled) return null;
  if (!data.uid || !data.email || !data.publicKey) return null;
  return data;
}

async function loadCredentialsForUser(uid: string): Promise<PasskeyCredentialDoc[]> {
  const { db } = assertAdminReady();
  const snap = await db
    .collection(PASSKEY_CREDENTIALS_COLLECTION)
    .where("uid", "==", uid)
    .get();
  return snap.docs
    .map((doc) => doc.data() as PasskeyCredentialDoc)
    .filter((doc) => !doc.disabled && Boolean(doc.credentialId));
}

export async function createRegistrationOptions(
  req: NextRequest,
  user: FirebasePasskeyAuthContext
) {
  const webAuthn = getRequestWebAuthnContext(req);
  const existingCredentials = await loadCredentialsForUser(user.uid);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: webAuthn.rpID,
    userID: Buffer.from(user.uid, "utf8"),
    userName: user.email,
    userDisplayName: user.email,
    timeout: 60_000,
    attestationType: "none",
    excludeCredentials: existingCredentials.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports,
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
    preferredAuthenticatorType: "localDevice",
  });

  await saveChallenge({
    challenge: options.challenge,
    type: "registration",
    uid: user.uid,
    email: user.email,
    origin: webAuthn.origin,
    rpID: webAuthn.rpID,
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + PASSKEY_CHALLENGE_TTL_MS,
  });

  return options;
}

export async function verifyRegistration(
  user: FirebasePasskeyAuthContext,
  response: RegistrationResponseJSON,
  name: unknown
): Promise<PasskeyCredentialSummary> {
  const challengeValue = response?.response?.clientDataJSON;
  if (!challengeValue) {
    throw new PasskeyError("Chybí odpověď passkey registrace.", 400);
  }

  const storedChallenge = await consumeChallenge(
    readClientChallenge(response.response.clientDataJSON),
    "registration"
  );
  if (storedChallenge.uid !== user.uid || storedChallenge.email !== user.email) {
    throw new PasskeyError("Ověřovací výzva nepatří aktuálnímu uživateli.", 403);
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: storedChallenge.origin,
    expectedRPID: storedChallenge.rpID,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new PasskeyError("Passkey se nepodařilo ověřit.", 400);
  }

  const { db } = assertAdminReady();
  const credential = verification.registrationInfo.credential;
  const credentialId = credential.id;
  const nowMs = Date.now();
  const doc: PasskeyCredentialDoc = {
    credentialId,
    publicKey: toBase64Url(credential.publicKey),
    counter: credential.counter,
    uid: user.uid,
    email: user.email,
    userHandle: Buffer.from(user.uid, "utf8").toString("base64url"),
    name: sanitizeCredentialName(name),
    transports: response.response.transports ?? credential.transports ?? [],
    credentialDeviceType: verification.registrationInfo.credentialDeviceType,
    credentialBackedUp: verification.registrationInfo.credentialBackedUp,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };

  const credentialRef = db.collection(PASSKEY_CREDENTIALS_COLLECTION).doc(credentialId);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(credentialRef);
    if (existing.exists) {
      throw new PasskeyError("Tento passkey už je pro účet uložený.", 409);
    }

    tx.create(credentialRef, {
      ...doc,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return summarizeCredential(doc);
}

function summarizeCredential(doc: PasskeyCredentialDoc): PasskeyCredentialSummary {
  return {
    credentialId: doc.credentialId,
    name: doc.name || "Moje zařízení",
    createdAtMs: typeof doc.createdAtMs === "number" ? doc.createdAtMs : 0,
    lastUsedAtMs: typeof doc.lastUsedAtMs === "number" ? doc.lastUsedAtMs : null,
    transports: Array.isArray(doc.transports) ? doc.transports : [],
    credentialDeviceType: doc.credentialDeviceType || "singleDevice",
    credentialBackedUp: Boolean(doc.credentialBackedUp),
  };
}

export async function listCredentials(
  user: FirebasePasskeyAuthContext
): Promise<PasskeyCredentialSummary[]> {
  const credentials = await loadCredentialsForUser(user.uid);
  return credentials
    .map(summarizeCredential)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function deleteCredential(
  user: FirebasePasskeyAuthContext,
  credentialId: unknown
): Promise<void> {
  if (typeof credentialId !== "string" || !credentialId.trim()) {
    throw new PasskeyError("Chybí ID passkey.", 400);
  }

  const { db } = assertAdminReady();
  const ref = db.collection(PASSKEY_CREDENTIALS_COLLECTION).doc(credentialId.trim());
  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data() as PasskeyCredentialDoc;
  if (data.uid !== user.uid) {
    throw new PasskeyError("Tento passkey nepatří aktuálnímu uživateli.", 403);
  }

  await ref.update({
    disabled: true,
    updatedAtMs: Date.now(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function createAuthenticationOptions(req: NextRequest) {
  const webAuthn = getRequestWebAuthnContext(req);
  const options = await generateAuthenticationOptions({
    rpID: webAuthn.rpID,
    timeout: 60_000,
    userVerification: "required",
  });

  await saveChallenge({
    challenge: options.challenge,
    type: "authentication",
    origin: webAuthn.origin,
    rpID: webAuthn.rpID,
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + PASSKEY_CHALLENGE_TTL_MS,
  });

  return options;
}

export async function verifyAuthentication(
  response: AuthenticationResponseJSON
): Promise<{ customToken: string; uid: string; email: string }> {
  const { auth, db } = assertAdminReady();
  const credential = await loadCredentialById(response.id);
  if (!credential) {
    throw new PasskeyError("Passkey není pro tento účet registrovaný.", 401);
  }

  const storedChallenge = await consumeChallenge(
    readClientChallenge(response.response.clientDataJSON),
    "authentication"
  );
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: storedChallenge.origin,
    expectedRPID: storedChallenge.rpID,
    credential: credentialDocToWebAuthnCredential(credential),
    requireUserVerification: true,
  });

  if (!verification.verified) {
    throw new PasskeyError("Passkey přihlášení se nepodařilo ověřit.", 401);
  }

  const authUser = await auth.getUser(credential.uid).catch(() => null);
  if (!authUser || authUser.disabled || normalizeEmail(authUser.email) !== credential.email) {
    throw new PasskeyError("Uživatel není aktivní.", 403);
  }

  const nowMs = Date.now();
  await db.collection(PASSKEY_CREDENTIALS_COLLECTION).doc(credential.credentialId).update({
    counter: verification.authenticationInfo.newCounter,
    credentialDeviceType: verification.authenticationInfo.credentialDeviceType,
    credentialBackedUp: verification.authenticationInfo.credentialBackedUp,
    lastUsedAtMs: nowMs,
    updatedAtMs: nowMs,
    lastUsedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const customToken = await auth.createCustomToken(credential.uid);

  return { customToken, uid: credential.uid, email: credential.email };
}
