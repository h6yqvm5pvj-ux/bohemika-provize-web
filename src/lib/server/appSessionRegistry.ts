import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { FieldValue } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

import { getRequestIp } from "@/lib/server/rateLimit";
import { adminDb } from "@/lib/server/firebaseAdmin";

const MAX_USER_AGENT_LEN = 240;
const MAX_LOCATION_PART_LEN = 80;
const MAX_SESSIONS_TO_SCAN = 100;

export type AppSessionSummary = {
  id: string;
  current: boolean;
  status: "active" | "expired" | "revoked";
  deviceLabel: string;
  browserLabel: string;
  osLabel: string;
  userAgent: string;
  locationLabel: string;
  ipLabel: string;
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

const sanitizeLocationPart = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\+/g, " ").trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed).replace(/\s+/g, " ").slice(0, MAX_LOCATION_PART_LEN);
  } catch {
    return trimmed.replace(/\s+/g, " ").slice(0, MAX_LOCATION_PART_LEN);
  }
};

function resolveLocation(req: NextRequest): {
  city: string;
  region: string;
  country: string;
  locationLabel: string;
} {
  const city = sanitizeLocationPart(req.headers.get("x-vercel-ip-city"));
  const region = sanitizeLocationPart(req.headers.get("x-vercel-ip-country-region"));
  const country = sanitizeLocationPart(req.headers.get("x-vercel-ip-country"));
  const locationParts = [city, region, country].filter(Boolean);
  return {
    city,
    region,
    country,
    locationLabel: locationParts.length > 0 ? locationParts.join(", ") : "",
  };
}

function readFirstHeaderIp(value: string | null): string {
  if (!value) return "";
  const first = value.split(",")[0]?.trim() ?? "";
  const normalized = first.replace(/^\[/, "").replace(/\]$/, "");
  return isIP(normalized) ? normalized : "";
}

function resolveSessionDisplayIp(req: NextRequest): string {
  return (
    readFirstHeaderIp(req.headers.get("cf-connecting-ip")) ||
    readFirstHeaderIp(req.headers.get("true-client-ip")) ||
    readFirstHeaderIp(req.headers.get("x-real-ip")) ||
    readFirstHeaderIp(req.headers.get("x-forwarded-for")) ||
    ""
  );
}

function maskIpAddress(ip: string): string {
  if (!ip) return "";
  if (isIP(ip) === 4) {
    const parts = ip.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.xxx` : "";
  }
  if (isIP(ip) === 6) {
    const parts = ip.split(":").filter(Boolean);
    return parts.length > 0 ? `${parts.slice(0, 3).join(":")}:...` : "";
  }
  return "";
}

function resolveSessionRequestMetadata(req: NextRequest): {
  userAgent: string;
  ipHash: string;
  ipLabel: string;
  city: string;
  region: string;
  country: string;
  locationLabel: string;
} {
  const requestIp = getRequestIp(req);
  const displayIp = resolveSessionDisplayIp(req) || (isIP(requestIp) ? requestIp : "");
  return {
    userAgent: sanitizeUserAgent(req.headers.get("user-agent")),
    ipHash: hashIp(displayIp),
    ipLabel: maskIpAddress(displayIp),
    ...resolveLocation(req),
  };
}

function compactSessionRequestMetadata(
  metadata: ReturnType<typeof resolveSessionRequestMetadata>
): Partial<ReturnType<typeof resolveSessionRequestMetadata>> {
  const update: Partial<ReturnType<typeof resolveSessionRequestMetadata>> = {};
  if (metadata.userAgent) update.userAgent = metadata.userAgent;
  if (metadata.ipHash) update.ipHash = metadata.ipHash;
  if (metadata.ipLabel) update.ipLabel = metadata.ipLabel;
  if (metadata.city) update.city = metadata.city;
  if (metadata.region) update.region = metadata.region;
  if (metadata.country) update.country = metadata.country;
  if (metadata.locationLabel) update.locationLabel = metadata.locationLabel;
  return update;
}

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
  if (!adminDb || !normalized || normalized.includes("/")) return null;
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
  if (!collection || !sessionId || sessionId.includes("/")) {
    throw new Error("Úložiště relací není dostupné.");
  }

  const nowMs = Date.now();
  const metadata = resolveSessionRequestMetadata(req);
  await collection.doc(sessionId).create(
    {
      uid,
      email: normalizeEmail(email),
      sessionId,
      ...metadata,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: nowMs,
      lastSeenAt: FieldValue.serverTimestamp(),
      lastSeenAtMs: nowMs,
      expiresAtMs,
      revokedAtMs: null,
      revokedReason: null,
    }
  );
}

export async function touchAppSession({
  email,
  sessionId,
  req,
}: {
  email: string;
  sessionId: string | null;
  req?: NextRequest;
}): Promise<void> {
  const collection = appSessionsCollection(email);
  if (!collection || !sessionId) return;
  const metadata = req ? compactSessionRequestMetadata(resolveSessionRequestMetadata(req)) : {};
  await collection.doc(sessionId).update(
    {
      ...metadata,
      lastSeenAt: FieldValue.serverTimestamp(),
      lastSeenAtMs: Date.now(),
    }
  );
}

export async function listAppSessions({
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
      const locationLabel = sanitizeLocationPart(data.locationLabel);
      const ipLabel = sanitizeLocationPart(data.ipLabel);
      const status: AppSessionSummary["status"] =
        revokedAtMs !== null ? "revoked" : expiresAtMs > nowMs ? "active" : "expired";
      const labels = buildDeviceLabel(userAgent);
      return {
        id: docSnap.id,
        current: Boolean(currentSessionId && docSnap.id === currentSessionId),
        status,
        ...labels,
        userAgent,
        locationLabel,
        ipLabel,
        createdAtMs,
        lastSeenAtMs,
        expiresAtMs,
        revokedAtMs,
      };
    })
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      if (a.status !== b.status) {
        if (a.status === "active") return -1;
        if (b.status === "active") return 1;
      }
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
  if (!collection || !keepSessionId) throw new Error("Úložiště relací není dostupné.");

  const nowMs = Date.now();
  const snap = await collection
    .where("expiresAtMs", ">", nowMs)
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

  for (let offset = 0; offset < targets.length; offset += 450) {
    const batch = collection.firestore.batch();
    targets.slice(offset, offset + 450).forEach((docSnap) => {
      batch.update(docSnap.ref, {
        revokedAt: FieldValue.serverTimestamp(),
        revokedAtMs: nowMs,
        revokedReason: reason,
      });
    });
    await batch.commit();
  }
  return targets.length;
}

export async function revokeAppSession({ email, uid, sessionId }: {
  email: string;
  uid: string;
  sessionId: string | null;
}): Promise<void> {
  if (!sessionId || sessionId.includes("/")) return;
  const collection = appSessionsCollection(email);
  if (!collection) throw new Error("Úložiště relací není dostupné.");
  const ref = collection.doc(sessionId);
  await collection.firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.uid !== uid || snap.data()?.revokedAtMs != null) return;
    tx.update(ref, {
      revokedAt: FieldValue.serverTimestamp(),
      revokedAtMs: Date.now(),
      revokedReason: "user_logout",
    });
  });
}
