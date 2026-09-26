import { createHash } from "node:crypto";
import { getApps } from "firebase-admin/app";
import type { LoginActivity, LoginActivityResponse } from "@/lib/loginActivity";
import { adminDb } from "./firebaseAdmin";
import { LOGIN_ACTIVITY_SETTINGS } from "./loginActivity";
import { auditDevice, auditEmail, maskAuditIp } from "./loginActivityMetadata";

const AUTH_METHODS = new Set(["SignInWithPassword", "SignInWithCustomToken", "SignInWithIdp", "SignInWithEmailLink", "SignInWithPhoneNumber", "FinalizeMfaSignIn"]);
type Json = Record<string, any>; // Provider payload is untrusted; only the allowlist below reaches the DTO.
export function serializeFirebaseLogin(entry: Json): LoginActivity | null {
  const payload = entry.protoPayload || entry.jsonPayload || {};
  const method = typeof payload.methodName === "string" ? payload.methodName.split(".").at(-1) : "";
  if (!AUTH_METHODS.has(method)) return null;
  const occurredAtMs = Date.parse(entry.timestamp);
  if (!Number.isFinite(occurredAtMs)) return null;
  const request = payload.request || {}, metadata = payload.requestMetadata || {};
  const status = payload.status;
  const code = typeof status?.code === "number" ? status.code : undefined;
  // A successful first factor is NOT proof of completed MFA / application access.
  const outcome = code !== undefined && code !== 0 ? "denied" : code === 0 ? "provider_accepted" : "provider_unknown";
  return { id: createHash("sha256").update(`${entry.insertId || ""}:${entry.timestamp}:${method}`).digest("hex"), occurredAtMs,
    email: auditEmail(request.email), identityVerified: false, outcome,
    stage: method === "SignInWithPassword" ? "password" : method === "FinalizeMfaSignIn" ? "mfa" : "provider",
    source: "firebase", country: "", city: "", ipLabel: maskAuditIp(typeof metadata.callerIp === "string" ? metadata.callerIp : ""),
    device: auditDevice(metadata.callerSuppliedUserAgent), reason: method, locationObservedAtMs: occurredAtMs, environment: "production" };
}

export async function readFirebaseLoginActivity(days: number, rawCursor: string | null): Promise<LoginActivityResponse> {
  const app = getApps()[0], project = process.env.FIREBASE_ADMIN_PROJECT_ID || app?.options.projectId;
  if (!adminDb || !app?.options.credential || !project || !/^[a-z][a-z0-9-]+$/.test(project)) throw new Error("Provider audit unavailable");
  const now = Date.now(), retentionDays = 30;
  let from = now - Math.min(days, retentionDays) * 86400000, pageToken: string | undefined;
  if (rawCursor) {
    try {
      if (rawCursor.length > 12000) throw new Error();
      const cursor = JSON.parse(Buffer.from(rawCursor, "base64url").toString());
      if (typeof cursor.token !== "string" || cursor.token.length > 8000 || !Number.isSafeInteger(cursor.from) || cursor.from < now - 31 * 86400000 || cursor.from > now) throw new Error();
      pageToken = cursor.token; from = cursor.from;
    } catch { throw new Error("INVALID_ACTIVITY_CURSOR"); }
  }
  const settings = await adminDb.doc(LOGIN_ACTIVITY_SETTINGS).get();
  const startedAt = settings.data()?.providerStartedAtMs;
  if (!Number.isSafeInteger(startedAt)) throw new Error("Provider audit not configured");
  from = Math.max(from, startedAt);
  const access = await app.options.credential.getAccessToken();
  // This identity is granted viewAccessor ONLY on the dedicated authentication
  // view. Never query project-wide logs or return raw provider payloads.
  const view = `projects/${project}/locations/global/buckets/_Default/views/bohemika_auth_activity`;
  const response = await fetch("https://logging.googleapis.com/v2/entries:list", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${access.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ resourceNames: [view], filter: `timestamp >= "${new Date(from).toISOString()}" AND (protoPayload.methodName=~"(SignInWith|FinalizeMfaSignIn)" OR jsonPayload.methodName=~"(SignInWith|FinalizeMfaSignIn)")`,
      orderBy: "timestamp desc", pageSize: 200, ...(pageToken ? { pageToken } : {}) }),
  });
  if (!response.ok) throw new Error("Provider audit unavailable");
  const data = await response.json();
  return { ok: true, events: (Array.isArray(data.entries) ? data.entries : []).map(serializeFirebaseLogin).filter((e: LoginActivity | null): e is LoginActivity => !!e),
    nextCursor: typeof data.nextPageToken === "string" ? Buffer.from(JSON.stringify({ token: data.nextPageToken, from })).toString("base64url") : null,
    fromMs: from, checkedAtMs: now, retentionDays, trackingStartedAtMs: startedAt };
}
