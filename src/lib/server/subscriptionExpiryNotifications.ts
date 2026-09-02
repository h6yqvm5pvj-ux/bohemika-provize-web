import { type NextRequest } from "next/server";

import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import { writeMailboxEntryOnce } from "@/lib/server/mailbox";
import { collectPushTokens } from "@/lib/server/pushTokens";
import {
  addDaysIso,
  evaluateSubscriptionFromProfile,
  getTodayIsoInPrague,
} from "@/lib/subscriptionAccess";

export const SUBSCRIPTION_EXPIRY_REMINDER_DAYS = 7;
export const SUBSCRIPTION_EXPIRY_NOTIFICATION_TITLE =
  "⏳ Tvé předplatné za 7 dní vyprší!";
export const SUBSCRIPTION_EXPIRY_NOTIFICATION_BODY =
  "Kliknutím otevři sekci Předplatné.";
export const SUBSCRIPTION_EXPIRY_DEEP_LINK =
  "/nastaveni?tab=subscription&source=subscription-expiry";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TOKENS_PER_USER = 30;
const MAX_TOKENS_PER_MULTICAST = 500;
const DEFAULT_PUBLIC_APP_ORIGIN = "https://bohemka.app";

type CandidateProfile = {
  email: string;
  privateData: Record<string, unknown>;
};

export type SubscriptionExpiryNotificationResult = {
  ok: true;
  today: string;
  targetPaidUntil: string;
  candidates: number;
  eligible: number;
  mailboxWritten: number;
  skippedDuplicate: number;
  skippedTypeDisabled: number;
  skippedPushDisabled: number;
  skippedNoToken: number;
  pushSuccessCount: number;
  pushFailureCount: number;
  messagingAvailable: boolean;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeOrigin = (value: string | null | undefined): string | null => {
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
};

const resolvePublicAppOrigin = (req: NextRequest): string => {
  const fromEnv =
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeOrigin(process.env.PUBLIC_APP_URL) ??
    normalizeOrigin(process.env.APP_URL);
  if (fromEnv) return fromEnv;

  const fromProductionDomain = normalizeOrigin(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null
  );
  if (fromProductionDomain) return fromProductionDomain;

  return (
    normalizeOrigin(`${req.nextUrl.protocol}//${req.nextUrl.host}`) ??
    DEFAULT_PUBLIC_APP_ORIGIN
  );
};

export const subscriptionExpiryTargetDate = (now: Date = new Date()): string =>
  addDaysIso(getTodayIsoInPrague(now), SUBSCRIPTION_EXPIRY_REMINDER_DAYS);

export const isSubscriptionExpiryTypeEnabled = (
  profile: Record<string, unknown>
): boolean => {
  const settings = isPlainObject(profile.notificationSettings)
    ? profile.notificationSettings
    : null;
  const types = settings && isPlainObject(settings.types) ? settings.types : null;
  const unpaid = types?.unpaid;
  return typeof unpaid === "boolean" ? unpaid : true;
};

export const isSubscriptionExpiryPushEnabled = (
  profile: Record<string, unknown>
): boolean => {
  if (!isSubscriptionExpiryTypeEnabled(profile)) return false;
  const settings = isPlainObject(profile.notificationSettings)
    ? profile.notificationSettings
    : null;
  const channels = settings && isPlainObject(settings.channels) ? settings.channels : null;
  const push = channels?.push;
  return typeof push === "boolean" ? push : true;
};

export const isSubscriptionExpiryCandidate = ({
  profile,
  targetPaidUntil,
  now,
}: {
  profile: Record<string, unknown>;
  targetPaidUntil: string;
  now: Date;
}): boolean => {
  const subscription = evaluateSubscriptionFromProfile(profile, now);
  return (
    subscription.state === "active" &&
    subscription.plan !== "unlimited" &&
    subscription.paidUntil === targetPaidUntil
  );
};

const subscriptionExpiryMailboxId = (paidUntil: string): string =>
  `subscription-expiry-${paidUntil}`;

async function loadCandidateProfiles(targetPaidUntil: string): Promise<CandidateProfile[]> {
  if (!adminDb) return [];

  const [standardSnap, legacySnap] = await Promise.all([
    adminDb
      .collection("usersPrivate")
      .where("subscriptionPaidUntil", "==", targetPaidUntil)
      .get(),
    adminDb
      .collection("usersPrivate")
      .where("subscriptionpaiduntil", "==", targetPaidUntil)
      .get(),
  ]);

  const byEmail = new Map<string, CandidateProfile>();
  [...standardSnap.docs, ...legacySnap.docs].forEach((docSnap) => {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const email = normalizeEmail(data.email) || normalizeEmail(docSnap.id);
    if (!email || !EMAIL_RE.test(email)) return;
    const existing = byEmail.get(email);
    byEmail.set(email, {
      email,
      privateData: { ...(existing?.privateData ?? {}), ...data },
    });
  });

  return [...byEmail.values()];
}

async function loadMergedProfile(candidate: CandidateProfile): Promise<Record<string, unknown>> {
  if (!adminDb) return candidate.privateData;

  const [publicSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").doc(candidate.email).get(),
    adminDb.collection("usersPrivate").doc(candidate.email).get(),
  ]);
  const publicData =
    (publicSnap.data() as Record<string, unknown> | undefined) ?? {};
  const privateData =
    (privateSnap.data() as Record<string, unknown> | undefined) ?? {};

  return {
    ...publicData,
    ...candidate.privateData,
    ...privateData,
  };
}

async function sendSubscriptionExpiryPush({
  email,
  profile,
  paidUntil,
  origin,
}: {
  email: string;
  profile: Record<string, unknown>;
  paidUntil: string;
  origin: string;
}): Promise<{ successCount: number; failureCount: number; tokenCount: number }> {
  if (!adminMessaging) {
    return { successCount: 0, failureCount: 0, tokenCount: 0 };
  }

  const tokens = collectPushTokens(profile).slice(0, MAX_TOKENS_PER_USER);
  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0, tokenCount: 0 };
  }

  let successCount = 0;
  let failureCount = 0;
  for (let index = 0; index < tokens.length; index += MAX_TOKENS_PER_MULTICAST) {
    const chunk = tokens.slice(index, index + MAX_TOKENS_PER_MULTICAST);
    try {
      const result = await adminMessaging.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: SUBSCRIPTION_EXPIRY_NOTIFICATION_TITLE,
          body: SUBSCRIPTION_EXPIRY_NOTIFICATION_BODY,
        },
        data: {
          type: "subscription_expiry",
          deepLink: SUBSCRIPTION_EXPIRY_DEEP_LINK,
          paidUntil,
          daysRemaining: String(SUBSCRIPTION_EXPIRY_REMINDER_DAYS),
        },
        webpush: {
          fcmOptions: {
            link: `${origin}${SUBSCRIPTION_EXPIRY_DEEP_LINK}`,
          },
          notification: {
            icon: "/pwa/icon-192.png",
            badge: "/pwa/icon-192.png",
            tag: `bohemika-subscription-expiry-${paidUntil}`,
            requireInteraction: false,
          },
        },
      });
      successCount += result.successCount;
      failureCount += result.failureCount;
    } catch (error) {
      failureCount += chunk.length;
      console.error(`Subscription expiry push failed (${email}):`, error);
    }
  }

  return { successCount, failureCount, tokenCount: tokens.length };
}

export async function runSubscriptionExpiryNotifications(
  req: NextRequest,
  now: Date = new Date()
): Promise<SubscriptionExpiryNotificationResult> {
  if (!adminDb) {
    throw new Error("Server není správně nakonfigurován (Firebase Admin / Firestore).");
  }

  const today = getTodayIsoInPrague(now);
  const targetPaidUntil = subscriptionExpiryTargetDate(now);
  const candidates = await loadCandidateProfiles(targetPaidUntil);
  const origin = resolvePublicAppOrigin(req);

  const stats: SubscriptionExpiryNotificationResult = {
    ok: true,
    today,
    targetPaidUntil,
    candidates: candidates.length,
    eligible: 0,
    mailboxWritten: 0,
    skippedDuplicate: 0,
    skippedTypeDisabled: 0,
    skippedPushDisabled: 0,
    skippedNoToken: 0,
    pushSuccessCount: 0,
    pushFailureCount: 0,
    messagingAvailable: Boolean(adminMessaging),
  };

  for (const candidate of candidates) {
    const profile = await loadMergedProfile(candidate);
    if (!isSubscriptionExpiryCandidate({ profile, targetPaidUntil, now })) continue;
    stats.eligible += 1;

    if (!isSubscriptionExpiryTypeEnabled(profile)) {
      stats.skippedTypeDisabled += 1;
      continue;
    }

    const mailbox = await writeMailboxEntryOnce({
      recipientEmail: candidate.email,
      entryId: subscriptionExpiryMailboxId(targetPaidUntil),
      type: "subscription_expiry",
      title: SUBSCRIPTION_EXPIRY_NOTIFICATION_TITLE,
      body: SUBSCRIPTION_EXPIRY_NOTIFICATION_BODY,
      deepLink: SUBSCRIPTION_EXPIRY_DEEP_LINK,
      metadata: {
        paidUntil: targetPaidUntil,
        daysRemaining: SUBSCRIPTION_EXPIRY_REMINDER_DAYS,
      },
      createdAtMs: now.getTime(),
    });
    if (!mailbox.written) {
      stats.skippedDuplicate += 1;
      continue;
    }
    stats.mailboxWritten += 1;

    if (!adminMessaging || !isSubscriptionExpiryPushEnabled(profile)) {
      stats.skippedPushDisabled += 1;
      continue;
    }

    const push = await sendSubscriptionExpiryPush({
      email: candidate.email,
      profile,
      paidUntil: targetPaidUntil,
      origin,
    });
    stats.pushSuccessCount += push.successCount;
    stats.pushFailureCount += push.failureCount;
    if (push.tokenCount === 0) stats.skippedNoToken += 1;
  }

  return stats;
}
