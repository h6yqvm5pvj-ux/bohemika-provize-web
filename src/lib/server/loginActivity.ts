import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { LOGIN_ACTIVITY_RETENTION_DAYS, type LoginActivity, type LoginActivityResponse } from "@/lib/loginActivity";
import { adminDb } from "./firebaseAdmin";
import { auditEmail, auditText, loginRequestMetadata } from "./loginActivityMetadata";

export const LOGIN_ACTIVITY_COLLECTION = "_authActivity";
export const LOGIN_ACTIVITY_SETTINGS = "_securityMonitoring/loginActivity";
const PAGE_SIZE = 500;
type ActivityInput = Pick<LoginActivity, "outcome" | "stage" | "source"> & { email?: string | null; identityVerified?: boolean; reason?: string };
export function buildLoginActivity(req: Request, input: ActivityInput, now = Date.now()) {
  return { ...loginRequestMetadata(req), occurredAtMs: now, locationObservedAtMs: now,
    email: auditEmail(input.email), identityVerified: input.identityVerified === true,
    outcome: input.outcome, stage: input.stage, source: input.source, reason: auditText(input.reason, 80),
    expiresAt: new Date(now + LOGIN_ACTIVITY_RETENTION_DAYS * 86400000) };
}

// Login success is written atomically with the session by recordAppSession.
// Rejected requests stay rejected even if the audit store is temporarily down.
export async function recordLoginFailure(req: Request, input: Omit<ActivityInput, "outcome"> & { outcome?: "denied" | "reported_failure" }) {
  try {
    if (!adminDb) throw new Error("Unavailable audit store");
    const event = buildLoginActivity(req, { ...input, outcome: input.outcome || "denied" });
    // Collapse repeated identical rejected requests in a one-minute bucket.
    // The first event is preserved; this is an incident history, not a counter
    // of every packet. No raw IP, credential, cookie or session ID is stored.
    const key = createHash("sha256").update(JSON.stringify([event.email, event.ipLabel, event.country, event.device,
      event.stage, event.outcome, event.reason, Math.floor(event.occurredAtMs / 60000)])).digest("hex");
    await adminDb.collection(LOGIN_ACTIVITY_COLLECTION).doc(key).create(event);
  } catch (error) {
    if ((error as { code?: unknown })?.code !== 6 && (error as { code?: unknown })?.code !== "already-exists") {
      console.warn("AUTH_ACTIVITY_WRITE_FAILED");
    }
  }
}

export function serializeLoginActivity(id: string, data: Record<string, unknown>): LoginActivity | null {
  const outcomes = ["success", "denied", "reported_failure", "provider_accepted", "provider_unknown"];
  const stages = ["session", "password", "mfa", "passkey", "provider"];
  const sources = ["web", "client_report", "session_history", "firebase"];
  if (!Number.isSafeInteger(data.occurredAtMs) || !outcomes.includes(String(data.outcome)) || !stages.includes(String(data.stage)) || !sources.includes(String(data.source))) return null;
  return { id, occurredAtMs: data.occurredAtMs as number, email: auditEmail(data.email), identityVerified: data.identityVerified === true,
    outcome: data.outcome as LoginActivity["outcome"], stage: data.stage as LoginActivity["stage"], source: data.source as LoginActivity["source"],
    country: typeof data.country === "string" && /^[A-Z]{2}$/.test(data.country) && data.country !== "XX" ? data.country : "",
    city: auditText(data.city, 80), ipLabel: auditText(data.ipLabel, 80), device: auditText(data.device, 100), reason: auditText(data.reason, 80),
    locationObservedAtMs: Number.isSafeInteger(data.locationObservedAtMs) ? data.locationObservedAtMs as number : data.occurredAtMs as number,
    environment: ["production", "preview", "development", "historical"].includes(String(data.environment)) ? String(data.environment) : "historical" };
}

export function parseActivityCursor(raw: string | null, now = Date.now()) {
  if (!raw) return null;
  try {
    if (raw.length > 800) throw new Error();
    const c = JSON.parse(Buffer.from(raw, "base64url").toString());
    if (!Number.isSafeInteger(c.at) || !Number.isSafeInteger(c.from) || c.from < now - 91 * 86400000 || c.at < c.from || c.at > now ||
        typeof c.id !== "string" || !/^[\w-]{1,128}$/.test(c.id)) throw new Error();
    return { at: c.at as number, from: c.from as number, id: c.id as string };
  } catch { throw new Error("INVALID_ACTIVITY_CURSOR"); }
}

export async function readLoginActivity(days: number, rawCursor: string | null): Promise<LoginActivityResponse> {
  if (!adminDb) throw new Error("Audit unavailable");
  const now = Date.now(), cursor = parseActivityCursor(rawCursor, now);
  const from = cursor?.from ?? now - days * 86400000;
  let query = adminDb.collection(LOGIN_ACTIVITY_COLLECTION).where("occurredAtMs", ">=", from)
    .orderBy("occurredAtMs", "desc").orderBy(FieldPath.documentId(), "desc").limit(PAGE_SIZE + 1);
  if (cursor) query = query.startAfter(cursor.at, cursor.id);
  const [snapshot, settings] = await Promise.all([query.get(), adminDb.doc(LOGIN_ACTIVITY_SETTINGS).get()]);
  const docs = snapshot.docs.slice(0, PAGE_SIZE), last = docs.at(-1);
  return { ok: true, events: docs.map(d => serializeLoginActivity(d.id, d.data())).filter((v): v is LoginActivity => !!v),
    nextCursor: snapshot.size > PAGE_SIZE && last ? Buffer.from(JSON.stringify({ at: last.data().occurredAtMs, id: last.id, from })).toString("base64url") : null,
    fromMs: from, checkedAtMs: now, retentionDays: LOGIN_ACTIVITY_RETENTION_DAYS,
    trackingStartedAtMs: Number.isSafeInteger(settings.data()?.startedAtMs) ? settings.data()!.startedAtMs : null };
}
