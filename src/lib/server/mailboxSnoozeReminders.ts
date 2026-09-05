import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { type NextRequest } from "next/server";

import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import { collectPushTokens } from "@/lib/server/pushTokens";

const MAILBOX_REMINDER_QUERY_LIMIT = 80;
const MAILBOX_REMINDER_CLAIM_TTL_MS = 10 * 60 * 1000;
const MAILBOX_REMINDER_MAX_TOKENS_PER_USER = 8;
const MAILBOX_REMINDER_MAX_TOKENS_PER_MULTICAST = 500;
const MAILBOX_REMINDER_FALLBACK_USER_LIMIT = 500;
const MAILBOX_REMINDER_FALLBACK_PER_USER_LIMIT = 12;

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
};

type ClaimedMailboxReminder = {
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  messageId: string;
  recipientEmail: string;
  type: string;
  title: string;
  body: string;
  deepLink: string;
  snoozedUntilMs: number;
  kind: "snooze" | "reply";
  conversationId: string;
};

type ReminderPushResult = {
  successCount: number;
  failureCount: number;
};

type DueReminderRefs = {
  refs: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[];
  checked: number;
  fallbackScan: boolean;
  scannedUsers: number;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const clampText = (value: string, maxLen: number): string =>
  value.length > maxLen ? `${value.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…` : value;

const toMillis = (value: unknown): number | null => {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object") {
    const ts = value as FirestoreTimestamp;
    if (typeof ts.toDate === "function") {
      const ms = ts.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    if (
      typeof ts.seconds === "number" &&
      Number.isFinite(ts.seconds) &&
      typeof ts.nanoseconds === "number" &&
      Number.isFinite(ts.nanoseconds)
    ) {
      return ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1_000_000);
    }
  }
  return null;
};

const resolvePublicAppOrigin = (req: NextRequest): string => {
  const explicit = normalizeText(process.env.NEXT_PUBLIC_APP_URL).replace(/\/+$/, "");
  if (explicit) return explicit;

  const productionDomain = normalizeText(process.env.VERCEL_PROJECT_PRODUCTION_URL).replace(
    /^https?:\/\//i,
    ""
  );
  if (productionDomain) return `https://${productionDomain.replace(/\/+$/, "")}`;

  const vercelUrl = normalizeText(process.env.VERCEL_URL).replace(/^https?:\/\//i, "");
  if (vercelUrl) return `https://${vercelUrl.replace(/\/+$/, "")}`;

  return `${req.nextUrl.protocol}//${req.nextUrl.host}`;
};

const appendSourceParam = (path: string): string => {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}source=snooze-reminder`;
};

const buildMailboxReminderDeepLink = (messageId: string, value: unknown): string => {
  const raw = normalizeText(value);
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && raw !== "/posta") {
    return appendSourceParam(raw);
  }
  return `/posta?messageId=${encodeURIComponent(messageId)}&source=snooze-reminder`;
};

const recipientEmailFromMailboxRef = (
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>
): string => normalizeEmail(ref.parent.parent?.id);

const parseReminderDoc = (
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
  data: Record<string, unknown>,
  nowMs: number
): ClaimedMailboxReminder | null => {
  const recipientEmail = recipientEmailFromMailboxRef(ref);
  if (!recipientEmail) return null;

  const metadata = isPlainObject(data.metadata) ? data.metadata : null;
  if (normalizeText(metadata?.mailboxDirection) === "sent") return null;

  const snoozedUntilMs =
    (typeof data.snoozedUntilMs === "number" && Number.isFinite(data.snoozedUntilMs)
      ? Math.round(data.snoozedUntilMs)
      : null) ?? toMillis(data.snoozedUntil);
  if (!snoozedUntilMs || snoozedUntilMs > nowMs) return null;

  const sentAtMs =
    toMillis(data.snoozeReminderSentAtMs) ?? toMillis(data.snoozeReminderSentAt);
  const skippedAtMs =
    toMillis(data.snoozeReminderSkippedAtMs) ?? toMillis(data.snoozeReminderSkippedAt);
  if ((sentAtMs && sentAtMs >= snoozedUntilMs) || (skippedAtMs && skippedAtMs >= snoozedUntilMs)) {
    return null;
  }

  const title = clampText(normalizeText(data.title) || "Připomínka z pošty", 90);
  const body = clampText(normalizeText(data.body) || "Máš odloženou zprávu v poště.", 160);
  const messageId = ref.id;

  return {
    ref,
    messageId,
    recipientEmail,
    type: normalizeText(data.type) || "generic",
    title,
    body,
    deepLink: buildMailboxReminderDeepLink(messageId, data.deepLink),
    snoozedUntilMs,
    kind: "snooze",
    conversationId: "",
  };
};

const parseReplyReminderDoc = (
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
  data: Record<string, unknown>,
  nowMs: number
): ClaimedMailboxReminder | null => {
  const recipientEmail = recipientEmailFromMailboxRef(ref);
  if (!recipientEmail) return null;
  const metadata = isPlainObject(data.metadata) ? data.metadata : null;
  if (normalizeText(metadata?.mailboxDirection) !== "sent") return null;
  const replyReminderAtMs =
    (typeof data.replyReminderAtMs === "number" && Number.isFinite(data.replyReminderAtMs)
      ? Math.round(data.replyReminderAtMs)
      : null) ?? toMillis(data.replyReminderAt);
  if (!replyReminderAtMs || replyReminderAtMs > nowMs) return null;
  const sentAtMs =
    toMillis(data.replyReminderSentAtMs) ?? toMillis(data.replyReminderSentAt);
  const skippedAtMs =
    toMillis(data.replyReminderSkippedAtMs) ?? toMillis(data.replyReminderSkippedAt);
  if (
    (sentAtMs && sentAtMs >= replyReminderAtMs) ||
    (skippedAtMs && skippedAtMs >= replyReminderAtMs)
  ) return null;
  const counterpartName = normalizeText(metadata?.groupName) ||
    normalizeText(metadata?.recipientName) ||
    "adresáta";
  return {
    ref,
    messageId: ref.id,
    recipientEmail,
    type: normalizeText(data.type) || "direct_message",
    title: clampText(`Bez odpovědi: ${counterpartName}`, 90),
    body: clampText(
      normalizeText(data.body) || "Na tuto zprávu zatím nikdo neodpověděl.",
      160
    ),
    deepLink: `/posta?messageId=${encodeURIComponent(ref.id)}&source=reply-reminder`,
    snoozedUntilMs: replyReminderAtMs,
    kind: "reply",
    conversationId: normalizeText(metadata?.conversationId),
  };
};

async function clearPendingReplyReminder(
  reminder: ClaimedMailboxReminder
): Promise<void> {
  if (!adminDb || reminder.kind !== "reply" || !reminder.conversationId) return;
  const conversationRef = adminDb
    .collection("usersPrivate")
    .doc(reminder.recipientEmail)
    .collection("mailboxConversations")
    .doc(reminder.conversationId);
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(conversationRef);
    const data = (snapshot.data() ?? {}) as Record<string, unknown>;
    if (normalizeText(data.pendingReplyReminderMessageId) !== reminder.messageId) return;
    transaction.set(
      conversationRef,
      {
        pendingReplyReminderMessageId: FieldValue.delete(),
        pendingReplyReminderAtMs: FieldValue.delete(),
      },
      { merge: true }
    );
  });
}

async function claimReminder(
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
  nowMs: number
): Promise<ClaimedMailboxReminder | null> {
  if (!adminDb) return null;
  const claimId = randomUUID();
  return adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return null;

    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const claimed =
      parseReplyReminderDoc(ref, data, nowMs) ?? parseReminderDoc(ref, data, nowMs);
    if (!claimed) return null;

    const processingAtMs = claimed.kind === "reply"
      ? toMillis(data.replyReminderProcessingAtMs) ?? toMillis(data.replyReminderProcessingAt)
      : toMillis(data.snoozeReminderProcessingAtMs) ?? toMillis(data.snoozeReminderProcessingAt);
    if (processingAtMs && processingAtMs > nowMs - MAILBOX_REMINDER_CLAIM_TTL_MS) {
      return null;
    }

    transaction.set(
      ref,
      claimed.kind === "reply"
        ? {
            replyReminderProcessingAtMs: nowMs,
            replyReminderProcessingAt: FieldValue.serverTimestamp(),
            replyReminderClaimId: claimId,
          }
        : {
            snoozeReminderProcessingAtMs: nowMs,
            snoozeReminderProcessingAt: FieldValue.serverTimestamp(),
            snoozeReminderClaimId: claimId,
          },
      { merge: true }
    );

    return claimed;
  });
}

const isMailboxPushEnabled = (profile: Record<string, unknown>): boolean => {
  const settingsRaw = isPlainObject(profile.notificationSettings)
    ? profile.notificationSettings
    : null;
  if (!settingsRaw) return true;
  const channelsRaw = isPlainObject(settingsRaw.channels) ? settingsRaw.channels : null;
  const pushRaw = channelsRaw?.push;
  return typeof pushRaw === "boolean" ? pushRaw : true;
};

async function loadReminderPushTokens(
  recipientEmail: string
): Promise<{ enabled: boolean; tokens: string[] }> {
  if (!adminDb) return { enabled: false, tokens: [] };

  const [publicSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").doc(recipientEmail).get(),
    adminDb.collection("usersPrivate").doc(recipientEmail).get(),
  ]);

  const mergedProfile = {
    ...((publicSnap.data() as Record<string, unknown> | undefined) ?? {}),
    ...((privateSnap.data() as Record<string, unknown> | undefined) ?? {}),
  };

  if (!isMailboxPushEnabled(mergedProfile)) return { enabled: false, tokens: [] };

  return {
    enabled: true,
    tokens: collectPushTokens(mergedProfile).slice(0, MAILBOX_REMINDER_MAX_TOKENS_PER_USER),
  };
}

async function sendReminderPush(
  reminder: ClaimedMailboxReminder,
  req: NextRequest
): Promise<ReminderPushResult> {
  if (!adminMessaging) {
    throw new Error("Firebase Messaging není nakonfigurován.");
  }

  const { enabled, tokens } = await loadReminderPushTokens(reminder.recipientEmail);
  if (!enabled) return { successCount: 0, failureCount: 0 };
  if (tokens.length === 0) return { successCount: 0, failureCount: 0 };

  const baseUrl = resolvePublicAppOrigin(req);
  const title = `Připomenutí: ${reminder.title}`;
  const body = reminder.body;
  const createdAtIso = new Date().toISOString();
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < tokens.length; i += MAILBOX_REMINDER_MAX_TOKENS_PER_MULTICAST) {
    const chunk = tokens.slice(i, i + MAILBOX_REMINDER_MAX_TOKENS_PER_MULTICAST);
    if (chunk.length === 0) continue;

    const result = await adminMessaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title,
        body,
      },
      data: {
        type: reminder.kind === "reply" ? "mailbox_reply_reminder" : "mailbox_snooze_reminder",
        messageType: reminder.type,
        messageId: reminder.messageId,
        deepLink: reminder.deepLink,
        snoozedUntilMs: String(reminder.snoozedUntilMs),
        createdAt: createdAtIso,
      },
      webpush: {
        fcmOptions: {
          link: `${baseUrl}${reminder.deepLink}`,
        },
        notification: {
          icon: "/pwa/icon-192.png",
          badge: "/pwa/icon-192.png",
          tag: `bohemika-mailbox-${reminder.kind}-${reminder.messageId}`,
          requireInteraction: false,
        },
      },
    });

    successCount += result.successCount;
    failureCount += result.failureCount;
  }

  return { successCount, failureCount };
}

async function markReminderDone(
  reminder: ClaimedMailboxReminder,
  status: "sent" | "skipped",
  result: ReminderPushResult
): Promise<void> {
  const nowMs = Date.now();
  if (reminder.kind === "reply") {
    await reminder.ref.update({
      replyReminderAtMs: FieldValue.delete(),
      replyReminderAt: FieldValue.delete(),
      replyReminderSetAtMs: FieldValue.delete(),
      replyReminderSetAt: FieldValue.delete(),
      replyReminderProcessingAtMs: FieldValue.delete(),
      replyReminderProcessingAt: FieldValue.delete(),
      replyReminderClaimId: FieldValue.delete(),
      replyReminderLastError: FieldValue.delete(),
      replyReminderLastStatus: status,
      replyReminderLastSuccessCount: result.successCount,
      replyReminderLastFailureCount: result.failureCount,
      replyReminderAttemptCount: FieldValue.increment(1),
      ...(status === "sent"
        ? {
            replyReminderSentAtMs: nowMs,
            replyReminderSentAt: FieldValue.serverTimestamp(),
          }
        : {
            replyReminderSkippedAtMs: nowMs,
            replyReminderSkippedAt: FieldValue.serverTimestamp(),
          }),
    });
    await clearPendingReplyReminder(reminder);
    return;
  }
  await reminder.ref.update({
    snoozedUntilMs: FieldValue.delete(),
    snoozedUntil: FieldValue.delete(),
    snoozedAtMs: FieldValue.delete(),
    snoozedAt: FieldValue.delete(),
    snoozeReminderProcessingAtMs: FieldValue.delete(),
    snoozeReminderProcessingAt: FieldValue.delete(),
    snoozeReminderClaimId: FieldValue.delete(),
    snoozeReminderLastError: FieldValue.delete(),
    snoozeReminderLastStatus: status,
    snoozeReminderLastSuccessCount: result.successCount,
    snoozeReminderLastFailureCount: result.failureCount,
    snoozeReminderAttemptCount: FieldValue.increment(1),
    ...(status === "sent"
      ? {
          snoozeReminderSentAtMs: nowMs,
          snoozeReminderSentAt: FieldValue.serverTimestamp(),
          snoozeReminderSkippedAtMs: FieldValue.delete(),
          snoozeReminderSkippedAt: FieldValue.delete(),
        }
      : {
          snoozeReminderSkippedAtMs: nowMs,
          snoozeReminderSkippedAt: FieldValue.serverTimestamp(),
        }),
  });
}

async function markReminderFailed(
  reminder: ClaimedMailboxReminder,
  error: unknown
): Promise<void> {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Připomínací push se nepodařilo odeslat.";
  if (reminder.kind === "reply") {
    await reminder.ref.update({
      replyReminderProcessingAtMs: FieldValue.delete(),
      replyReminderProcessingAt: FieldValue.delete(),
      replyReminderClaimId: FieldValue.delete(),
      replyReminderLastStatus: "failed",
      replyReminderLastError: clampText(message, 240),
      replyReminderAttemptCount: FieldValue.increment(1),
      replyReminderFailedAtMs: Date.now(),
      replyReminderFailedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  await reminder.ref.update({
    snoozeReminderProcessingAtMs: FieldValue.delete(),
    snoozeReminderProcessingAt: FieldValue.delete(),
    snoozeReminderClaimId: FieldValue.delete(),
    snoozeReminderLastStatus: "failed",
    snoozeReminderLastError: clampText(message, 240),
    snoozeReminderAttemptCount: FieldValue.increment(1),
    snoozeReminderFailedAtMs: Date.now(),
    snoozeReminderFailedAt: FieldValue.serverTimestamp(),
  });
}

async function loadDueReminderRefs(nowMs: number): Promise<DueReminderRefs> {
  if (!adminDb) {
    return { refs: [], checked: 0, fallbackScan: false, scannedUsers: 0 };
  }

  try {
    const [snoozedSnap, replySnap] = await Promise.all([
      adminDb
        .collectionGroup("mailbox")
        .where("snoozedUntilMs", "<=", nowMs)
        .limit(MAILBOX_REMINDER_QUERY_LIMIT)
        .get(),
      adminDb
        .collectionGroup("mailbox")
        .where("replyReminderAtMs", "<=", nowMs)
        .limit(MAILBOX_REMINDER_QUERY_LIMIT)
        .get(),
    ]);
    const refs = new Map<string, FirebaseFirestore.DocumentReference>();
    [...snoozedSnap.docs, ...replySnap.docs].forEach((docSnap) =>
      refs.set(docSnap.ref.path, docSnap.ref)
    );
    return {
      refs: [...refs.values()].slice(0, MAILBOX_REMINDER_QUERY_LIMIT),
      checked: snoozedSnap.size + replySnap.size,
      fallbackScan: false,
      scannedUsers: 0,
    };
  } catch (error) {
    console.warn(
      "Mailbox snooze reminders collectionGroup query failed, falling back to per-user scan:",
      error
    );
  }

  const usersSnap = await adminDb
    .collection("usersPrivate")
    .limit(MAILBOX_REMINDER_FALLBACK_USER_LIMIT)
    .get();

  const refs: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[] = [];
  let checked = 0;
  for (const userSnap of usersSnap.docs) {
    if (refs.length >= MAILBOX_REMINDER_QUERY_LIMIT) break;

    const remaining = MAILBOX_REMINDER_QUERY_LIMIT - refs.length;
    const perUserLimit = Math.min(remaining, MAILBOX_REMINDER_FALLBACK_PER_USER_LIMIT);
    const [snoozedSnap, replySnap] = await Promise.all([
      userSnap.ref
        .collection("mailbox")
        .where("snoozedUntilMs", "<=", nowMs)
        .limit(perUserLimit)
        .get(),
      userSnap.ref
        .collection("mailbox")
        .where("replyReminderAtMs", "<=", nowMs)
        .limit(perUserLimit)
        .get(),
    ]);
    checked += snoozedSnap.size + replySnap.size;
    [...snoozedSnap.docs, ...replySnap.docs].forEach((docSnap) => {
      if (
        refs.length < MAILBOX_REMINDER_QUERY_LIMIT &&
        !refs.some((ref) => ref.path === docSnap.ref.path)
      ) refs.push(docSnap.ref);
    });
  }

  return {
    refs,
    checked,
    fallbackScan: true,
    scannedUsers: usersSnap.size,
  };
}

export async function runDueMailboxSnoozeReminders(
  req: NextRequest
): Promise<{
  ok: true;
  checked: number;
  fallbackScan: boolean;
  scannedUsers: number;
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  pushSuccessCount: number;
  pushFailureCount: number;
}> {
  if (!adminDb || !adminMessaging) {
    throw new Error("Server není správně nakonfigurován (Firebase Messaging).");
  }

  const nowMs = Date.now();
  const due = await loadDueReminderRefs(nowMs);

  let claimed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let pushSuccessCount = 0;
  let pushFailureCount = 0;

  for (const ref of due.refs) {
    const reminder = await claimReminder(ref, nowMs);
    if (!reminder) {
      skipped += 1;
      continue;
    }

    claimed += 1;

    try {
      const result = await sendReminderPush(reminder, req);
      pushSuccessCount += result.successCount;
      pushFailureCount += result.failureCount;
      if (result.successCount > 0) {
        await markReminderDone(reminder, "sent", result);
        sent += 1;
      } else {
        await markReminderDone(reminder, "skipped", result);
        skipped += 1;
      }
    } catch (error) {
      await markReminderFailed(reminder, error);
      failed += 1;
    }
  }

  return {
    ok: true,
    checked: due.checked,
    fallbackScan: due.fallbackScan,
    scannedUsers: due.scannedUsers,
    claimed,
    sent,
    skipped,
    failed,
    pushSuccessCount,
    pushFailureCount,
  };
}
