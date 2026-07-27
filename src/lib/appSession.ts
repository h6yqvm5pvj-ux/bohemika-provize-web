export const APP_SESSION_COOKIE_NAME = "bohemika_app_session";

const DEFAULT_SESSION_MAX_AGE_SECONDS = 2 * 60 * 60;
const MAX_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;
const SESSION_VERSION = 1;

type AppSessionPayload = {
  v: typeof SESSION_VERSION;
  uid: string;
  email: string;
  sid?: string;
  iat: number;
  exp: number;
};

export type VerifiedAppSession = {
  uid: string;
  email: string;
  sessionId: string | null;
  issuedAt: number;
  expiresAt: number;
};

export type AppSessionVerificationResult =
  | { ok: true; session: VerifiedAppSession }
  | {
      ok: false;
      reason:
        | "missing"
        | "malformed"
        | "invalid-signature"
        | "expired"
        | "not-configured";
    };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function getAppSessionMaxAgeSeconds(): number {
  const raw = Number(process.env.APP_SESSION_MAX_AGE_SECONDS ?? "");
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_SESSION_MAX_AGE_SECONDS;
  return Math.min(Math.round(raw), MAX_SESSION_MAX_AGE_SECONDS);
}

export function resolveAppSessionSecret(): string {
  return (
    process.env.APP_SESSION_SECRET?.trim() ||
    process.env.AUTH_SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.FIREBASE_ADMIN_PRIVATE_KEY?.trim() ||
    ""
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function textToBase64Url(value: string): string {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlToText(value: string): string | null {
  const bytes = base64UrlToBytes(value);
  if (!bytes) return null;
  try {
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

function toCryptoBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function importHmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toCryptoBuffer(encoder.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

async function signPayload(payloadBase64: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    toCryptoBuffer(encoder.encode(payloadBase64))
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifySignature(
  payloadBase64: string,
  signatureBase64: string,
  secret: string
): Promise<boolean> {
  const signature = base64UrlToBytes(signatureBase64);
  if (!signature) return false;
  const key = await importHmacKey(secret, ["verify"]);
  return crypto.subtle.verify(
    "HMAC",
    key,
    toCryptoBuffer(signature),
    toCryptoBuffer(encoder.encode(payloadBase64))
  );
}

function isValidSessionPayload(value: unknown): value is AppSessionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Partial<AppSessionPayload>;
  return (
    payload.v === SESSION_VERSION &&
    typeof payload.uid === "string" &&
    payload.uid.trim().length > 0 &&
    typeof payload.email === "string" &&
    payload.email.includes("@") &&
    typeof payload.iat === "number" &&
    Number.isFinite(payload.iat) &&
    typeof payload.exp === "number" &&
    Number.isFinite(payload.exp) &&
    payload.exp > payload.iat
  );
}

export async function createAppSessionCookieValue({
  uid,
  email,
  nowMs = Date.now(),
  maxAgeSeconds = getAppSessionMaxAgeSeconds(),
  sessionId,
}: {
  uid: string;
  email: string;
  nowMs?: number;
  maxAgeSeconds?: number;
  sessionId?: string;
}): Promise<{
  value: string;
  sessionId: string;
  expiresAt: number;
  maxAgeSeconds: number;
}> {
  const secret = resolveAppSessionSecret();
  if (!secret) {
    throw new Error("APP_SESSION_SECRET není nastavený.");
  }

  const issuedAt = Math.floor(nowMs / 1000);
  const safeMaxAgeSeconds = Math.max(
    60,
    Math.min(Math.round(maxAgeSeconds), MAX_SESSION_MAX_AGE_SECONDS)
  );
  const expiresAt = issuedAt + safeMaxAgeSeconds;
  const resolvedSessionId =
    sessionId?.trim() ||
    (typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${issuedAt}-${Math.random().toString(36).slice(2, 14)}`);
  const payload: AppSessionPayload = {
    v: SESSION_VERSION,
    uid: uid.trim(),
    email: email.trim().toLowerCase(),
    sid: resolvedSessionId,
    iat: issuedAt,
    exp: expiresAt,
  };
  const payloadBase64 = textToBase64Url(JSON.stringify(payload));
  const signatureBase64 = await signPayload(payloadBase64, secret);

  return {
    value: `${payloadBase64}.${signatureBase64}`,
    sessionId: resolvedSessionId,
    expiresAt,
    maxAgeSeconds: safeMaxAgeSeconds,
  };
}

export async function verifyAppSessionCookieValue(
  value: string | null | undefined,
  { nowMs = Date.now() }: { nowMs?: number } = {}
): Promise<AppSessionVerificationResult> {
  if (!value) return { ok: false, reason: "missing" };
  const secret = resolveAppSessionSecret();
  if (!secret) return { ok: false, reason: "not-configured" };

  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }

  const [payloadBase64, signatureBase64] = parts;
  const signatureValid = await verifySignature(payloadBase64, signatureBase64, secret);
  if (!signatureValid) return { ok: false, reason: "invalid-signature" };

  const payloadText = base64UrlToText(payloadBase64);
  if (!payloadText) return { ok: false, reason: "malformed" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadText);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!isValidSessionPayload(parsed)) {
    return { ok: false, reason: "malformed" };
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  if (parsed.exp <= nowSeconds) return { ok: false, reason: "expired" };

  return {
    ok: true,
    session: {
      uid: parsed.uid.trim(),
      email: parsed.email.trim().toLowerCase(),
      sessionId:
        typeof parsed.sid === "string" && parsed.sid.trim().length > 0
          ? parsed.sid.trim()
          : null,
      issuedAt: parsed.iat,
      expiresAt: parsed.exp,
    },
  };
}
