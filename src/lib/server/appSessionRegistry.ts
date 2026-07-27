import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

import { getRequestIp } from "@/lib/server/rateLimit";
import { adminDb } from "@/lib/server/firebaseAdmin";

const MAX_USER_AGENT_LEN = 240;
const MAX_SESSIONS_TO_SCAN = 100;

export type AppSessionSummary = {
  id: string;
  current: boolean;
  deviceLabel: string;
  browserLabel: string;
  osLabel: string;
  userAgent: string;
  createdAtMs: number;
  lastSeenAtMs: number;
  expiresAtMs: number;
  revokedAtMs: number | null;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const sanitizeUserAgent = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_USER_AGENT_LEN);
};

function hashIp(ip: string): string {
  if (!ip) return "";
  const salt =
    process.env.APP_SESSION_SECRET?.trim() ||
    process.env.AUTH_SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "bohemika-session";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

function resolveBrowserLabel(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (!ua) return "Neznámý prohlížeč";
  if (ua.includes("edg/")) return "Microsoft Edge";
  if (ua.includes("opr/") || ua.includes("opera")) return "Opera";
  if (ua.includes("firefox/")) return "Firefox";
  if (ua.includes("crios/")) return "Chrome iOS";
  if (ua.includes("chrome/")) return "Chrome";
  if (ua.includes("safari/")) return "Safari";
  return "Prohlížeč";
}

function resolveOsLabel(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (!ua) return "Neznámé zařízení";
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("android")) return "Android";
  if (ua.includes("mac os x") || ua.includes("macintosh")) return "macOS";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("linux")) return "Linux";
  return "Zařízení";
}

function buildDeviceLabel(userAgent: string): {
  deviceLabel: string;
  browserLabel: string;
  osLabel: string;
} {
  const browserLabel = resolveBrowserLabel(userAgent);
  const osLabel = resolveOsLabel(userAgent);
  return {
    browserLabel,
    osLabel,
    deviceLabel: `${browserLabel} na ${osLabel}`,
  };
}

function appSessionsCollection(email: string) {
  const normalized = normalizeEmail(email);
  if (!adminDb || !normalized) return null;
  return adminDb.collection("usersPrivate").doc(normalized).collection("appSessions");
}

export async function recordAppSession({
  email,
  uid,
  sessionId,
  expiresAtMs,
  req,
}: {
  email: string;
  uid: string;
  sessionId: string;
  expiresAtMs: number;
  req: NextRequest;
}): Promise<void> {
  const collection = appSessionsCollection(email);
  if (!collection || !sessionId) return;

  const nowMs = Date.now();
  const userAgent = sanitizeUserAgent(req.headers.get("user-agent"));
  const ipHash = hashIp(getRequestIp(req));
  await collection.doc(sessionId).set(
    {
      uid,
      email: normalizeEmail(email),
      sessionId,
      userAgent,
      ipHash,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: nowMs,
      lastSeenAt: FieldValue.serverTimestamp(),
      lastSeenAtMs: nowMs,
      expiresAtMs,
      revokedAtMs: null,
      revokedReason: null,
    },
    { merge: true }
  );
}

export async function touchAppSession({
  email,
  sessionId,
}: {
  email: string;
  sessionId: string | null;
}): Promise<void> {
  const collection = appSessionsCollection(email);
  if (!collection || !sessionId) return;
  await collection.doc(sessionId).set(
    {
      lastSeenAt: FieldValue.serverTimestamp(),
      lastSeenAtMs: Date.now(),
    },
    { merge: true }
  );
}

export async function listActiveAppSessions({
  email,
  currentSessionId,
}: {
  email: string;
  currentSessionId: string | null;
}): Promise<AppSessionSummary[]> {
  const collection = appSessionsCollection(email);
  if (!collection) return [];

  const nowMs = Date.now();
  const snap = await collection
    .orderBy("createdAtMs", "desc")
    .limit(MAX_SESSIONS_TO_SCAN)
    .get();

  return snap.docs
    .map((docSnap) => {
      const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
      const userAgent = sanitizeUserAgent(data.userAgent);
      const createdAtMs =
        typeof data.createdAtMs === "number" && Number.isFinite(data.createdAtMs)
          ? data.createdAtMs
          : 0;
      const lastSeenAtMs =
        typeof data.lastSeenAtMs === "number" && Number.isFinite(data.lastSeenAtMs)
          ? data.lastSeenAtMs
          : createdAtMs;
      const expiresAtMs =
        typeof data.expiresAtMs === "number" && Number.isFinite(data.expiresAtMs)
          ? data.expiresAtMs
          : 0;
      const revokedAtMs =
        typeof data.revokedAtMs === "number" && Number.isFinite(data.revokedAtMs)
          ? data.revokedAtMs
          : null;
      const labels = buildDeviceLabel(userAgent);
      return {
        id: docSnap.id,
        current: Boolean(currentSessionId && docSnap.id === currentSessionId),
        ...labels,
        userAgent,
        createdAtMs,
        lastSeenAtMs,
        expiresAtMs,
        revokedAtMs,
      };
    })
    .filter((session) => !session.revokedAtMs && session.expiresAtMs > nowMs)
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      return b.lastSeenAtMs - a.lastSeenAtMs;
    });
}

export async function revokeOtherAppSessions({
  email,
  keepSessionId,
  reason,
}: {
  email: string;
  keepSessionId: string;
  reason: string;
}): Promise<number> {
  const collection = appSessionsCollection(email);
  if (!collection || !keepSessionId) return 0;

  const nowMs = Date.now();
  const snap = await collection
    .orderBy("createdAtMs", "desc")
    .limit(MAX_SESSIONS_TO_SCAN)
    .get();

  const targets = snap.docs.filter((docSnap) => {
    if (docSnap.id === keepSessionId) return false;
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const revokedAtMs =
      typeof data.revokedAtMs === "number" && Number.isFinite(data.revokedAtMs)
        ? data.revokedAtMs
        : null;
    const expiresAtMs =
      typeof data.expiresAtMs === "number" && Number.isFinite(data.expiresAtMs)
        ? data.expiresAtMs
        : 0;
    return !revokedAtMs && expiresAtMs > nowMs;
  });

  if (targets.length === 0) return 0;

  const batch = collection.firestore.batch();
  targets.forEach((docSnap) => {
    batch.set(
      docSnap.ref,
      {
        revokedAt: FieldValue.serverTimestamp(),
        revokedAtMs: nowMs,
        revokedReason: reason,
      },
      { merge: true }
    );
  });
  await batch.commit();
  return targets.length;
}
