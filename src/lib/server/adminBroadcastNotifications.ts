import { FieldValue } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import { collectPushTokens, normalizeToken } from "@/lib/server/pushTokens";

export const BROADCAST_MESSAGE_MAX_LEN = 220;
export const BROADCAST_EMOJI_MAX_LEN = 12;
export const BROADCAST_TITLE_MAX_LEN = 80;

const BROADCAST_MAX_USERS_SCAN = 12_000;
const BROADCAST_MAX_TOKENS_PER_USER = 8;
const BROADCAST_MAX_TOKENS_PER_MULTICAST = 500;
const BROADCAST_MAX_SCHEDULE_DAYS = 90;
const SCHEDULED_BROADCASTS_COLLECTION = "adminScheduledBroadcasts";
const BROADCAST_LOG_COLLECTION = "adminBroadcasts";
const DEFAULT_PUBLIC_APP_ORIGIN = "https://bohemka.app";

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

const ALLOWED_TARGET_PATH_RE =
  /^\/($|(admin\/zadosti|cashflow|cuzk|intranet|jakubrauscher|kalkulacka|login|muj-tym|nastaveni|pomucky|posta|smlouvy|tipy|vizitka)(\/|$))/;
const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

export type BroadcastTargetMode = "all" | "single" | "group";
export type BroadcastRecipientGroup = "advisors" | "managers" | "specialists";

export type AdminBroadcastPayload = {
  emoji: string;
  title: string;
  message: string;
  targetPath: string;
  targetMode: BroadcastTargetMode;
  recipientEmail: string | null;
  recipientGroup: BroadcastRecipientGroup | null;
  scheduledAtIso: string | null;
  scheduledAtMs: number | null;
};

export type AdminBroadcastSendResult = {
  ok: boolean;
  error?: string;
  statusCode?: number;
  broadcastId?: string;
  scheduledBroadcastId?: string;
  scannedUsers: number;
  matchedUsers: number;
  recipients: number;
  uniqueTokens: number;
  sent: number;
  failed: number;
  skippedPushDisabled: number;
  skippedNoToken: number;
  cleanedTokens: number;
};

type PushRecipient = {
  email: string;
  tokens: string[];
};

type PushRecipientLoadResult = {
  recipients: PushRecipient[];
  scannedUsers: number;
  matchedUsers: number;
  skippedPushDisabled: number;
  skippedNoToken: number;
};

type AdminBroadcastActor = {
  adminEmail: string;
  adminUid: string;
};

type ScheduledBroadcastDoc = AdminBroadcastActor & {
  emoji: string;
  title: string;
  message: string;
  targetPath: string;
  targetMode: BroadcastTargetMode;
  recipientEmail: string | null;
  recipientGroup: BroadcastRecipientGroup | null;
  scheduledAtIso: string;
  scheduledAtMs: number;
  createdAtIso: string;
};

export const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const clampText = (value: unknown, maxLen: number): string => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLen);
};

const normalizeEmoji = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/\s+/g, "");
  return Array.from(trimmed).slice(0, BROADCAST_EMOJI_MAX_LEN).join("");
};

function normalizeOriginUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname) return null;
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveAdminBroadcastOrigin(req: NextRequest): string {
  const fromEnv =
    normalizeOriginUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeOriginUrl(process.env.PUBLIC_APP_URL) ??
    normalizeOriginUrl(process.env.APP_URL) ??
    normalizeOriginUrl(process.env.NEXTAUTH_URL);
  if (fromEnv) return fromEnv;

  const fromVercelProdDomain = normalizeOriginUrl(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null
  );
  if (fromVercelProdDomain) return fromVercelProdDomain;

  const fromRequest = normalizeOriginUrl(`${req.nextUrl.protocol}//${req.nextUrl.host}`);
  if (fromRequest) return fromRequest;

  return DEFAULT_PUBLIC_APP_ORIGIN;
}

function normalizeTargetPath(value: unknown, req: NextRequest): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw || raw.length > 260) return "";

  let parsed: URL;
  try {
    parsed = new URL(raw, `${req.nextUrl.protocol}//${req.nextUrl.host}`);
  } catch {
    return "";
  }

  const rawLooksAbsolute = /^https?:\/\//i.test(raw);
  if (rawLooksAbsolute && parsed.host !== req.nextUrl.host && parsed.hostname !== "bohemka.app") {
    return "";
  }
  if (parsed.pathname.startsWith("/api/") || parsed.pathname.startsWith("/_next/")) {
    return "";
  }
  if (!ALLOWED_TARGET_PATH_RE.test(parsed.pathname)) return "";

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function isAllowedStoredTargetPath(value: string): boolean {
  try {
    const parsed = new URL(value, DEFAULT_PUBLIC_APP_ORIGIN);
    if (parsed.origin !== DEFAULT_PUBLIC_APP_ORIGIN) return false;
    if (parsed.pathname.startsWith("/api/") || parsed.pathname.startsWith("/_next/")) {
      return false;
    }
    return ALLOWED_TARGET_PATH_RE.test(parsed.pathname);
  } catch {
    return false;
  }
}

function normalizeBroadcastGroup(value: unknown): BroadcastRecipientGroup | null {
  if (value === "advisors" || value === "managers" || value === "specialists") {
    return value;
  }
  return null;
}

function normalizeScheduledAt(value: unknown): { iso: string; ms: number } | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return undefined;

  const date = new Date(value);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return undefined;

  const now = Date.now();
  const maxMs = now + BROADCAST_MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000;
  if (ms <= now + 30_000 || ms > maxMs) return undefined;

  return {
    iso: date.toISOString(),
    ms,
  };
}

export function parseAdminBroadcastPayload(
  raw: unknown,
  req: NextRequest
): AdminBroadcastPayload | null {
  if (!isPlainObject(raw)) return null;

  const emoji = normalizeEmoji(raw.emoji);
  const titleRaw = clampText(raw.title, BROADCAST_TITLE_MAX_LEN);
  const message = clampText(raw.message, BROADCAST_MESSAGE_MAX_LEN);
  const targetPath = normalizeTargetPath(raw.targetPath, req);
  const targetMode: BroadcastTargetMode =
    raw.targetMode === "single" ? "single" : raw.targetMode === "group" ? "group" : "all";
  const recipientEmail = normalizeEmail(raw.recipientEmail);
  const recipientGroup = normalizeBroadcastGroup(raw.recipientGroup);
  const title = titleRaw || message.slice(0, BROADCAST_TITLE_MAX_LEN);
  const scheduled = normalizeScheduledAt(raw.scheduledAt ?? raw.scheduledAtIso);

  if (!title) return null;
  if (!message) return null;
  if (!targetPath) return null;
  if (scheduled === undefined) return null;
  if (targetMode === "single" && (!recipientEmail || !EMAIL_RE.test(recipientEmail))) {
    return null;
  }
  if (targetMode === "group" && !recipientGroup) return null;

  return {
    emoji,
    title,
    message,
    targetPath,
    targetMode,
    recipientEmail: targetMode === "single" ? recipientEmail : null,
    recipientGroup: targetMode === "group" ? recipientGroup : null,
    scheduledAtIso: scheduled?.iso ?? null,
    scheduledAtMs: scheduled?.ms ?? null,
  };
}

function readError(payload: unknown): string | null {
  if (!isPlainObject(payload)) return null;
  const candidate = payload.error ?? payload.message ?? payload.detail;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function isPushChannelEnabled(profile: Record<string, unknown>): boolean {
  const settings = isPlainObject(profile.notificationSettings)
    ? profile.notificationSettings
    : null;
  const channels = settings && isPlainObject(settings.channels) ? settings.channels : null;
  const pushRaw = channels?.push;
  return typeof pushRaw === "boolean" ? pushRaw : true;
}

function todayIsoDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizePosition(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function resolveCurrentPosition(profile: Record<string, unknown>): string {
  const direct = normalizePosition(profile.position);
  if (direct) return direct;

  const timeline = Array.isArray(profile.positionTimeline) ? profile.positionTimeline : [];
  const today = todayIsoDay();
  const candidates = timeline
    .map((row) => (isPlainObject(row) ? row : null))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => {
      const position = normalizePosition(row.position);
      const validFrom = typeof row.validFrom === "string" ? row.validFrom : "";
      const validTo = typeof row.validTo === "string" ? row.validTo : "";
      if (!position || !isIsoDay(validFrom)) return null;
      return {
        position,
        validFrom,
        validTo: isIsoDay(validTo) ? validTo : null,
      };
    })
    .filter((row): row is { position: string; validFrom: string; validTo: string | null } =>
      Boolean(row)
    )
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));

  return (
    candidates.find(
      (row) => row.validFrom <= today && (!row.validTo || row.validTo >= today)
    )?.position ??
    candidates[0]?.position ??
    ""
  );
}

function isAdvisorPosition(position: string): boolean {
  return /^poradce\d*$/.test(position.replace(/[\s_-]+/g, ""));
}

function isManagerPosition(position: string): boolean {
  return /^(manazer|manažer|manager)\d*$/.test(position.replace(/[\s_-]+/g, ""));
}

function matchesRecipientGroup(
  profile: Record<string, unknown>,
  group: BroadcastRecipientGroup
): boolean {
  const accountType = normalizePosition(profile.accountType);
  const position = resolveCurrentPosition(profile);

  if (group === "advisors") {
    return accountType === "advisor" && isAdvisorPosition(position);
  }
  if (group === "managers") {
    return accountType === "advisor" && isManagerPosition(position);
  }
  return profile.specialist === true && accountType !== "tipster";
}

function buildRecipientFromProfile(
  email: string,
  profile: Record<string, unknown>
): {
  recipient: PushRecipient | null;
  skippedPushDisabled: number;
  skippedNoToken: number;
} {
  if (!isPushChannelEnabled(profile)) {
    return {
      recipient: null,
      skippedPushDisabled: 1,
      skippedNoToken: 0,
    };
  }

  const tokens = collectPushTokens(profile).slice(0, BROADCAST_MAX_TOKENS_PER_USER);
  if (tokens.length === 0) {
    return {
      recipient: null,
      skippedPushDisabled: 0,
      skippedNoToken: 1,
    };
  }

  return {
    recipient: { email, tokens },
    skippedPushDisabled: 0,
    skippedNoToken: 0,
  };
}

async function loadMergedUserProfiles(): Promise<
  Array<{ email: string; profile: Record<string, unknown> }>
> {
  if (!adminDb) return [];

  const [publicSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").limit(BROADCAST_MAX_USERS_SCAN).get(),
    adminDb.collection("usersPrivate").limit(BROADCAST_MAX_USERS_SCAN).get(),
  ]);

  const publicByEmail = new Map<string, Record<string, unknown>>();
  publicSnap.docs.forEach((docSnap) => {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const email = normalizeEmail(data.email) || normalizeEmail(docSnap.id);
    if (!email) return;
    publicByEmail.set(email, data);
  });

  const privateByEmail = new Map<string, Record<string, unknown>>();
  privateSnap.docs.forEach((docSnap) => {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const email = normalizeEmail(data.email) || normalizeEmail(docSnap.id);
    if (!email) return;
    privateByEmail.set(email, data);
  });

  const emails = new Set<string>([...publicByEmail.keys(), ...privateByEmail.keys()]);
  return [...emails].map((email) => ({
    email,
    profile: {
      ...(publicByEmail.get(email) ?? {}),
      ...(privateByEmail.get(email) ?? {}),
      email,
    },
  }));
}

async function loadSingleBroadcastRecipient(email: string): Promise<PushRecipientLoadResult> {
  if (!adminDb) {
    return {
      recipients: [],
      scannedUsers: 0,
      matchedUsers: 0,
      skippedPushDisabled: 0,
      skippedNoToken: 0,
    };
  }

  const [publicSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").doc(email).get(),
    adminDb.collection("usersPrivate").doc(email).get(),
  ]);
  const publicProfile = (publicSnap.data() as Record<string, unknown> | undefined) ?? {};
  const privateProfile = (privateSnap.data() as Record<string, unknown> | undefined) ?? {};
  const merged = { ...publicProfile, ...privateProfile, email };
  const result = buildRecipientFromProfile(email, merged);

  return {
    recipients: result.recipient ? [result.recipient] : [],
    scannedUsers: 1,
    matchedUsers: 1,
    skippedPushDisabled: result.skippedPushDisabled,
    skippedNoToken: result.skippedNoToken,
  };
}

async function loadFilteredBroadcastRecipients(
  group: BroadcastRecipientGroup | null
): Promise<PushRecipientLoadResult> {
  const profiles = await loadMergedUserProfiles();
  const recipients: PushRecipient[] = [];
  let matchedUsers = 0;
  let skippedPushDisabled = 0;
  let skippedNoToken = 0;

  profiles.forEach(({ email, profile }) => {
    if (group && !matchesRecipientGroup(profile, group)) return;
    matchedUsers += 1;

    const result = buildRecipientFromProfile(email, profile);
    skippedPushDisabled += result.skippedPushDisabled;
    skippedNoToken += result.skippedNoToken;
    if (result.recipient) recipients.push(result.recipient);
  });

  return {
    recipients,
    scannedUsers: profiles.length,
    matchedUsers,
    skippedPushDisabled,
    skippedNoToken,
  };
}

async function loadBroadcastRecipients(payload: AdminBroadcastPayload): Promise<PushRecipientLoadResult> {
  if (payload.targetMode === "single" && payload.recipientEmail) {
    return loadSingleBroadcastRecipient(payload.recipientEmail);
  }
  if (payload.targetMode === "group") {
    return loadFilteredBroadcastRecipients(payload.recipientGroup);
  }
  return loadFilteredBroadcastRecipients(null);
}

async function removeInvalidTokens(email: string, invalidTokens: string[]) {
  if (!adminDb) return;
  const uniqueTokens = [
    ...new Set(invalidTokens.map((token) => normalizeToken(token)).filter(Boolean)),
  ];
  if (uniqueTokens.length === 0) return;

  const privateRef = adminDb.collection("usersPrivate").doc(email);
  const publicRef = adminDb.collection("users").doc(email);
  const [privateSnap, publicSnap] = await Promise.all([privateRef.get(), publicRef.get()]);

  if (privateSnap.exists) {
    const data = (privateSnap.data() as Record<string, unknown> | undefined) ?? {};
    const privatePatch: Record<string, unknown> = {
      fcmTokens: FieldValue.arrayRemove(...uniqueTokens),
      pushTokens: FieldValue.arrayRemove(...uniqueTokens),
      notificationTokens: FieldValue.arrayRemove(...uniqueTokens),
      pushTokenUpdatedAt: FieldValue.serverTimestamp(),
    };

    const byDeviceKeys = ["fcmTokensByDevice", "pushTokensByDevice", "pushTokenMetaByDevice"] as const;
    byDeviceKeys.forEach((key) => {
      const raw = data[key];
      if (!isPlainObject(raw)) return;
      const filtered = Object.fromEntries(
        Object.entries(raw).filter(([mapKey, mapValue]) => {
          if (key === "pushTokenMetaByDevice") {
            const meta = isPlainObject(mapValue) ? mapValue : null;
            const tokenCandidate = normalizeToken(meta?.token);
            if (tokenCandidate && uniqueTokens.includes(tokenCandidate)) return false;
            const fcmMap = isPlainObject(data.fcmTokensByDevice) ? data.fcmTokensByDevice : null;
            const tokenFromFcmMap = normalizeToken(fcmMap?.[mapKey]);
            return !tokenFromFcmMap || !uniqueTokens.includes(tokenFromFcmMap);
          }
          const tokenCandidate = normalizeToken(mapValue);
          return !tokenCandidate || !uniqueTokens.includes(tokenCandidate);
        })
      );
      privatePatch[key] = filtered;
    });

    if (uniqueTokens.includes(normalizeToken(data.fcmToken))) {
      privatePatch.fcmToken = FieldValue.delete();
    }
    if (uniqueTokens.includes(normalizeToken(data.pushToken))) {
      privatePatch.pushToken = FieldValue.delete();
    }
    if (uniqueTokens.includes(normalizeToken(data.notificationToken))) {
      privatePatch.notificationToken = FieldValue.delete();
    }

    await privateRef.set(privatePatch, { merge: true });
  }

  if (publicSnap.exists) {
    const data = (publicSnap.data() as Record<string, unknown> | undefined) ?? {};
    const publicPatch: Record<string, unknown> = {
      pushTokenUpdatedAt: FieldValue.serverTimestamp(),
    };
    if (uniqueTokens.includes(normalizeToken(data.fcmToken))) {
      publicPatch.fcmToken = FieldValue.delete();
    }
    await publicRef.set(publicPatch, { merge: true });
  }
}

function buildNoRecipientsMessage(payload: AdminBroadcastPayload): string {
  if (payload.targetMode === "single") {
    return "Vybraný uživatel nemá aktivní push token nebo má push vypnutý.";
  }
  if (payload.targetMode === "group") {
    return "Vybraná skupina nemá žádného uživatele s aktivním push tokenem.";
  }
  return "Nenašel jsem žádného uživatele s aktivním push tokenem.";
}

function buildBaseRecord({
  payload,
  actor,
  origin,
  createdAtIso,
  status,
  stats,
  scheduledAtIso,
  scheduledAtMs,
  error,
}: {
  payload: AdminBroadcastPayload;
  actor: AdminBroadcastActor;
  origin: string;
  createdAtIso: string;
  status: "scheduled" | "sent" | "failed";
  stats?: Record<string, unknown>;
  scheduledAtIso?: string | null;
  scheduledAtMs?: number | null;
  error?: string | null;
}) {
  const targetUrl = `${origin}${payload.targetPath}`;
  const record: Record<string, unknown> = {
    type: "admin_broadcast",
    status,
    targetMode: payload.targetMode,
    recipientEmail: payload.recipientEmail,
    recipientGroup: payload.recipientGroup,
    emoji: payload.emoji,
    title: payload.title,
    message: payload.message,
    targetPath: payload.targetPath,
    targetUrl,
    scheduledAtIso: scheduledAtIso ?? payload.scheduledAtIso,
    scheduledAtMs: scheduledAtMs ?? payload.scheduledAtMs,
    createdByEmail: actor.adminEmail,
    createdByUid: actor.adminUid,
    updatedAt: FieldValue.serverTimestamp(),
    createdAtIso,
  };

  if (error) record.error = error;
  if (stats) record.stats = stats;

  return record;
}

async function writeBroadcastLog(
  record: Record<string, unknown>,
  broadcastId?: string | null
): Promise<string> {
  if (!adminDb) throw new Error("Firestore není dostupný.");

  if (broadcastId) {
    await adminDb
      .collection(BROADCAST_LOG_COLLECTION)
      .doc(broadcastId)
      .set(record, { merge: true });
    return broadcastId;
  }

  const logRef = await adminDb.collection(BROADCAST_LOG_COLLECTION).add({
    ...record,
    createdAt: FieldValue.serverTimestamp(),
  });
  return logRef.id;
}

export async function scheduleAdminBroadcast(
  payload: AdminBroadcastPayload,
  actor: AdminBroadcastActor,
  req: NextRequest
): Promise<{ broadcastId: string; scheduledBroadcastId: string; scheduledAtIso: string }> {
  if (!adminDb) {
    throw new Error("Server není správně nakonfigurován (Firebase Firestore).");
  }
  if (!payload.scheduledAtIso || !payload.scheduledAtMs) {
    throw new Error("Chybí čas naplánování.");
  }

  const origin = resolveAdminBroadcastOrigin(req);
  const createdAtIso = new Date().toISOString();
  const ref = adminDb.collection(SCHEDULED_BROADCASTS_COLLECTION).doc();
  const queueRecord: ScheduledBroadcastDoc & { status: "scheduled"; createdAt: unknown; updatedAt: unknown } = {
    adminEmail: actor.adminEmail,
    adminUid: actor.adminUid,
    emoji: payload.emoji,
    title: payload.title,
    message: payload.message,
    targetPath: payload.targetPath,
    targetMode: payload.targetMode,
    recipientEmail: payload.recipientEmail,
    recipientGroup: payload.recipientGroup,
    scheduledAtIso: payload.scheduledAtIso,
    scheduledAtMs: payload.scheduledAtMs,
    createdAtIso,
    status: "scheduled",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const logRecord = {
    ...buildBaseRecord({
      payload,
      actor,
      origin,
      createdAtIso,
      status: "scheduled",
      scheduledAtIso: payload.scheduledAtIso,
      scheduledAtMs: payload.scheduledAtMs,
    }),
    scheduledBroadcastId: ref.id,
    createdAt: FieldValue.serverTimestamp(),
  };

  const batch = adminDb.batch();
  batch.set(ref, queueRecord);
  batch.set(adminDb.collection(BROADCAST_LOG_COLLECTION).doc(ref.id), logRecord, {
    merge: true,
  });
  await batch.commit();

  return {
    broadcastId: ref.id,
    scheduledBroadcastId: ref.id,
    scheduledAtIso: payload.scheduledAtIso,
  };
}

export async function sendAdminBroadcastNow(
  payload: AdminBroadcastPayload,
  actor: AdminBroadcastActor,
  req: NextRequest,
  options: {
    broadcastId?: string | null;
    scheduledBroadcastId?: string | null;
    createdAtIso?: string | null;
  } = {}
): Promise<AdminBroadcastSendResult> {
  if (!adminDb || !adminMessaging) {
    throw new Error("Server není správně nakonfigurován (Firebase Messaging).");
  }

  const origin = resolveAdminBroadcastOrigin(req);
  const targetUrl = `${origin}${payload.targetPath}`;
  const createdAtIso = options.createdAtIso ?? new Date().toISOString();
  const {
    recipients,
    scannedUsers,
    matchedUsers,
    skippedPushDisabled,
    skippedNoToken,
  } = await loadBroadcastRecipients(payload);

  const baseStats = {
    scannedUsers,
    matchedUsers,
    pushRecipients: recipients.length,
    uniqueTokens: 0,
    sent: 0,
    failed: 0,
    skippedPushDisabled,
    skippedNoToken,
    cleanedTokens: 0,
  };

  if (recipients.length === 0) {
    const error = buildNoRecipientsMessage(payload);
    const broadcastId = await writeBroadcastLog(
      {
        ...buildBaseRecord({
          payload,
          actor,
          origin,
          createdAtIso,
          status: "failed",
          stats: baseStats,
          error,
        }),
        scheduledBroadcastId: options.scheduledBroadcastId ?? null,
        processedAt: FieldValue.serverTimestamp(),
        processedAtIso: new Date().toISOString(),
      },
      options.broadcastId
    );

    return {
      ok: false,
      error,
      statusCode: 409,
      broadcastId,
      scheduledBroadcastId: options.scheduledBroadcastId ?? undefined,
      scannedUsers,
      matchedUsers,
      recipients: 0,
      uniqueTokens: 0,
      sent: 0,
      failed: 0,
      skippedPushDisabled,
      skippedNoToken,
      cleanedTokens: 0,
    };
  }

  const tokenToEmails = new Map<string, Set<string>>();
  recipients.forEach((recipient) => {
    recipient.tokens.forEach((token) => {
      const existing = tokenToEmails.get(token) ?? new Set<string>();
      existing.add(recipient.email);
      tokenToEmails.set(token, existing);
    });
  });

  const tokens = [...tokenToEmails.keys()];
  const deliveredAtIso = new Date().toISOString();
  const title = `${payload.emoji ? `${payload.emoji} ` : ""}${payload.title}`.slice(
    0,
    BROADCAST_TITLE_MAX_LEN
  );
  let sent = 0;
  let failed = 0;
  let firstErrorMessage: string | null = null;
  const invalidTokenByEmail = new Map<string, string[]>();

  for (let i = 0; i < tokens.length; i += BROADCAST_MAX_TOKENS_PER_MULTICAST) {
    const chunk = tokens.slice(i, i + BROADCAST_MAX_TOKENS_PER_MULTICAST);
    const multicast = await adminMessaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title,
        body: payload.message,
      },
      data: {
        type: "admin_broadcast",
        emoji: payload.emoji,
        title: payload.title,
        message: payload.message,
        createdAt: deliveredAtIso,
        deepLink: payload.targetPath,
      },
      webpush: {
        fcmOptions: {
          link: targetUrl,
        },
        notification: {
          title,
          body: payload.message,
          icon: "/pwa/icon-192.png",
          badge: "/pwa/icon-192.png",
          tag: `bohemika-admin-broadcast-${Date.now()}`,
          requireInteraction: false,
        },
      },
    });

    sent += multicast.successCount;
    failed += multicast.failureCount;

    multicast.responses.forEach((row, index) => {
      if (row.success) return;
      if (!firstErrorMessage) {
        firstErrorMessage = readError(row.error);
      }
      const code = row.error?.code ?? "";
      if (!INVALID_TOKEN_CODES.has(code)) return;
      const token = chunk[index];
      if (!token) return;
      const emails = tokenToEmails.get(token) ?? new Set<string>();
      emails.forEach((email) => {
        const arr = invalidTokenByEmail.get(email) ?? [];
        arr.push(token);
        invalidTokenByEmail.set(email, arr);
      });
    });
  }

  await Promise.all(
    [...invalidTokenByEmail.entries()].map(([email, invalidTokens]) =>
      removeInvalidTokens(email, invalidTokens)
    )
  );

  const cleanedTokens = [...invalidTokenByEmail.values()].reduce(
    (sum, arr) => sum + arr.length,
    0
  );
  const stats = {
    scannedUsers,
    matchedUsers,
    pushRecipients: recipients.length,
    uniqueTokens: tokens.length,
    sent,
    failed,
    skippedPushDisabled,
    skippedNoToken,
    cleanedTokens,
  };
  const ok = sent > 0;
  const error = ok
    ? null
    : firstErrorMessage || "Žádný token nepřijal hromadnou notifikaci.";
  const broadcastId = await writeBroadcastLog(
    {
      ...buildBaseRecord({
        payload,
        actor,
        origin,
        createdAtIso,
        status: ok ? "sent" : "failed",
        stats,
        error,
      }),
      scheduledBroadcastId: options.scheduledBroadcastId ?? null,
      processedAt: FieldValue.serverTimestamp(),
      processedAtIso: deliveredAtIso,
    },
    options.broadcastId
  );

  return {
    ok,
    error: error ?? undefined,
    statusCode: ok ? 200 : 502,
    broadcastId,
    scheduledBroadcastId: options.scheduledBroadcastId ?? undefined,
    scannedUsers,
    matchedUsers,
    recipients: recipients.length,
    uniqueTokens: tokens.length,
    sent,
    failed,
    skippedPushDisabled,
    skippedNoToken,
    cleanedTokens,
  };
}

function parseScheduledBroadcastDoc(value: unknown): ScheduledBroadcastDoc | null {
  if (!isPlainObject(value)) return null;
  const adminEmail = normalizeEmail(value.adminEmail);
  const adminUid = typeof value.adminUid === "string" ? value.adminUid.trim() : "";
  const targetMode: BroadcastTargetMode =
    value.targetMode === "single"
      ? "single"
      : value.targetMode === "group"
        ? "group"
        : "all";
  const recipientEmail = normalizeEmail(value.recipientEmail);
  const recipientGroup = normalizeBroadcastGroup(value.recipientGroup);
  const scheduledAtIso = typeof value.scheduledAtIso === "string" ? value.scheduledAtIso : "";
  const scheduledAtMs = typeof value.scheduledAtMs === "number" ? value.scheduledAtMs : NaN;
  const createdAtIso = typeof value.createdAtIso === "string" ? value.createdAtIso : "";

  const payload = {
    emoji: normalizeEmoji(value.emoji),
    title: clampText(value.title, BROADCAST_TITLE_MAX_LEN),
    message: clampText(value.message, BROADCAST_MESSAGE_MAX_LEN),
    targetPath: typeof value.targetPath === "string" ? value.targetPath : "",
    targetMode,
    recipientEmail: targetMode === "single" ? recipientEmail : null,
    recipientGroup: targetMode === "group" ? recipientGroup : null,
    scheduledAtIso,
    scheduledAtMs,
  };

  if (!adminEmail || !adminUid || !payload.title || !payload.message) return null;
  if (
    !payload.targetPath.startsWith("/") ||
    payload.targetPath.startsWith("//") ||
    !isAllowedStoredTargetPath(payload.targetPath)
  ) {
    return null;
  }
  if (targetMode === "single" && (!recipientEmail || !EMAIL_RE.test(recipientEmail))) {
    return null;
  }
  if (targetMode === "group" && !recipientGroup) return null;
  if (!scheduledAtIso || !Number.isFinite(scheduledAtMs)) return null;

  return {
    adminEmail,
    adminUid,
    emoji: payload.emoji,
    title: payload.title,
    message: payload.message,
    targetPath: payload.targetPath,
    targetMode,
    recipientEmail: payload.recipientEmail,
    recipientGroup: payload.recipientGroup,
    scheduledAtIso,
    scheduledAtMs,
    createdAtIso: createdAtIso || scheduledAtIso,
  };
}

async function markScheduledBroadcastFailed(
  id: string,
  doc: ScheduledBroadcastDoc | null,
  req: NextRequest,
  error: string
) {
  if (!adminDb) return;
  const origin = resolveAdminBroadcastOrigin(req);
  const nowIso = new Date().toISOString();
  const actor = doc
    ? { adminEmail: doc.adminEmail, adminUid: doc.adminUid }
    : { adminEmail: "", adminUid: "" };
  const payload: AdminBroadcastPayload = doc
    ? {
        emoji: doc.emoji,
        title: doc.title,
        message: doc.message,
        targetPath: doc.targetPath,
        targetMode: doc.targetMode,
        recipientEmail: doc.recipientEmail,
        recipientGroup: doc.recipientGroup,
        scheduledAtIso: doc.scheduledAtIso,
        scheduledAtMs: doc.scheduledAtMs,
      }
    : {
        emoji: "",
        title: "Neplatná naplánovaná notifikace",
        message: error,
        targetPath: "/nastaveni",
        targetMode: "all",
        recipientEmail: null,
        recipientGroup: null,
        scheduledAtIso: null,
        scheduledAtMs: null,
      };

  await adminDb.collection(BROADCAST_LOG_COLLECTION).doc(id).set(
    {
      ...buildBaseRecord({
        payload,
        actor,
        origin,
        createdAtIso: doc?.createdAtIso ?? nowIso,
        status: "failed",
        stats: {
          scannedUsers: 0,
          matchedUsers: 0,
          pushRecipients: 0,
          uniqueTokens: 0,
          sent: 0,
          failed: 0,
          skippedPushDisabled: 0,
          skippedNoToken: 0,
          cleanedTokens: 0,
        },
        error,
      }),
      scheduledBroadcastId: id,
      processedAt: FieldValue.serverTimestamp(),
      processedAtIso: nowIso,
    },
    { merge: true }
  );
}

async function claimScheduledBroadcast(id: string): Promise<boolean> {
  if (!adminDb) return false;
  const ref = adminDb.collection(SCHEDULED_BROADCASTS_COLLECTION).doc(id);
  return adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() as Record<string, unknown> | undefined;
    if (data?.status !== "scheduled") return false;
    transaction.set(
      ref,
      {
        status: "processing",
        processingStartedAt: FieldValue.serverTimestamp(),
        processingStartedAtIso: new Date().toISOString(),
      },
      { merge: true }
    );
    return true;
  });
}

export async function runDueScheduledAdminBroadcasts(
  req: NextRequest,
  limit = 20
): Promise<{
  ok: true;
  checked: number;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  if (!adminDb || !adminMessaging) {
    throw new Error("Server není správně nakonfigurován (Firebase Messaging).");
  }

  const dueSnap = await adminDb
    .collection(SCHEDULED_BROADCASTS_COLLECTION)
    .where("scheduledAtMs", "<=", Date.now())
    .limit(limit)
    .get();

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const docSnap of dueSnap.docs) {
    const id = docSnap.id;
    const raw = docSnap.data() as Record<string, unknown>;
    if (raw.status !== "scheduled") {
      skipped += 1;
      continue;
    }

    const claimed = await claimScheduledBroadcast(id);
    if (!claimed) {
      skipped += 1;
      continue;
    }

    const doc = parseScheduledBroadcastDoc(raw);
    if (!doc) {
      await markScheduledBroadcastFailed(id, null, req, "Naplánovaná notifikace má neplatný payload.");
      await adminDb.collection(SCHEDULED_BROADCASTS_COLLECTION).doc(id).delete();
      processed += 1;
      failed += 1;
      continue;
    }

    const payload: AdminBroadcastPayload = {
      emoji: doc.emoji,
      title: doc.title,
      message: doc.message,
      targetPath: doc.targetPath,
      targetMode: doc.targetMode,
      recipientEmail: doc.recipientEmail,
      recipientGroup: doc.recipientGroup,
      scheduledAtIso: doc.scheduledAtIso,
      scheduledAtMs: doc.scheduledAtMs,
    };

    try {
      const result = await sendAdminBroadcastNow(
        payload,
        { adminEmail: doc.adminEmail, adminUid: doc.adminUid },
        req,
        {
          broadcastId: id,
          scheduledBroadcastId: id,
          createdAtIso: doc.createdAtIso,
        }
      );
      processed += 1;
      if (result.ok) sent += 1;
      else failed += 1;
    } catch (error) {
      await markScheduledBroadcastFailed(
        id,
        doc,
        req,
        error instanceof Error
          ? error.message
          : "Naplánovanou notifikaci se nepodařilo odeslat."
      );
      processed += 1;
      failed += 1;
    } finally {
      await adminDb.collection(SCHEDULED_BROADCASTS_COLLECTION).doc(id).delete();
    }
  }

  return {
    ok: true,
    checked: dueSnap.size,
    processed,
    sent,
    failed,
    skipped,
  };
}
