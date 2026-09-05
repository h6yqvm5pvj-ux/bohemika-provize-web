import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import { writeMailboxEntryOnce } from "@/lib/server/mailbox";
import {
  collectPushTokens,
  isPermanentInvalidPushTokenCode,
  removeInvalidPushTokens,
} from "@/lib/server/pushTokens";
import {
  type ContractNoteReminderCandidate,
  contractNoteReminderDeepLink,
  contractNoteReminderMailboxId,
  contractNoteReminderTitle,
  resolveContractNoteReminderCandidate,
} from "@/lib/server/contractNoteReminderLogic";

const QUERY_LIMIT = 100;
const CLAIM_TTL_MS = 10 * 60 * 1000;
const MAX_TOKENS_PER_USER = 30;
const MAX_TOKENS_PER_MULTICAST = 500;
const DEFAULT_PUBLIC_APP_ORIGIN = "https://bohemka.app";

type ClaimedReminder = ContractNoteReminderCandidate & {
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  claimId: string;
};

type PushResult = {
  successCount: number;
  failureCount: number;
  tokenCount: number;
  invalidTokens: string[];
};

export type ContractNoteReminderRunResult = {
  ok: true;
  checked: number;
  claimed: number;
  mailboxWritten: number;
  skippedDuplicate: number;
  skippedPushDisabled: number;
  skippedNoToken: number;
  pushSuccessCount: number;
  pushFailureCount: number;
  cleanedInvalidTokens: number;
  failed: number;
  messagingAvailable: boolean;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

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

const resolvePublicAppOrigin = (req: NextRequest): string =>
  normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
  normalizeOrigin(process.env.PUBLIC_APP_URL) ??
  normalizeOrigin(process.env.APP_URL) ??
  normalizeOrigin(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null
  ) ??
  normalizeOrigin(`${req.nextUrl.protocol}//${req.nextUrl.host}`) ??
  DEFAULT_PUBLIC_APP_ORIGIN;

const toMillis = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object") {
    const timestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof timestamp.toDate === "function") return timestamp.toDate().getTime();
    if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
  }
  return null;
};

const pushEnabled = (profile: Record<string, unknown>): boolean => {
  const settings = isPlainObject(profile.notificationSettings)
    ? profile.notificationSettings
    : null;
  const channels = settings && isPlainObject(settings.channels) ? settings.channels : null;
  return typeof channels?.push === "boolean" ? channels.push : true;
};

const loadMergedProfile = async (email: string): Promise<Record<string, unknown>> => {
  if (!adminDb) return {};
  const [publicSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").doc(email).get(),
    adminDb.collection("usersPrivate").doc(email).get(),
  ]);
  return {
    ...((publicSnap.data() as Record<string, unknown> | undefined) ?? {}),
    ...((privateSnap.data() as Record<string, unknown> | undefined) ?? {}),
  };
};

const claimReminder = async (
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
  nowMs: number
): Promise<ClaimedReminder | null> => {
  if (!adminDb) return null;
  const claimId = randomUUID();
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const data = (snapshot.data() ?? {}) as Record<string, unknown>;
    const reminder = resolveContractNoteReminderCandidate({
      noteId: snapshot.id,
      data,
      nowMs,
    });
    if (!reminder) return null;

    const contractRef = ref.parent.parent;
    const expectedContractPath = `users/${reminder.ownerEmail}/entries/${reminder.entryId}`;
    if (!contractRef || contractRef.path !== expectedContractPath) {
      transaction.set(
        ref,
        {
          reminderEnabled: false,
          reminderAtMs: null,
          reminderLastError: "Připomínka není navázaná na platnou smlouvu.",
        },
        { merge: true }
      );
      return null;
    }
    const contractSnapshot = await transaction.get(contractRef);
    if (!contractSnapshot.exists) {
      transaction.set(
        ref,
        {
          reminderEnabled: false,
          reminderAtMs: null,
          reminderLastError: "Smlouva již neexistuje.",
        },
        { merge: true }
      );
      return null;
    }

    const processingAtMs = toMillis(data.reminderProcessingAtMs);
    if (processingAtMs && processingAtMs > nowMs - CLAIM_TTL_MS) return null;

    transaction.set(
      ref,
      {
        reminderProcessingAtMs: nowMs,
        reminderProcessingAt: FieldValue.serverTimestamp(),
        reminderClaimId: claimId,
      },
      { merge: true }
    );
    return { ...reminder, ref, claimId };
  });
};

const markReminderDone = async (
  reminder: ClaimedReminder,
  nowMs: number
): Promise<void> => {
  if (!adminDb) return;
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reminder.ref);
    if (!snapshot.exists) return;
    const data = (snapshot.data() ?? {}) as Record<string, unknown>;
    if (
      data.reminderClaimId !== reminder.claimId ||
      toMillis(data.reminderAtMs) !== reminder.reminderAtMs
    ) {
      return;
    }
    transaction.set(
      reminder.ref,
      {
        reminderEnabled: false,
        reminderAtMs: null,
        reminderLastSentForAtMs: reminder.reminderAtMs,
        reminderSentAtMs: nowMs,
        reminderSentAt: FieldValue.serverTimestamp(),
        reminderProcessingAtMs: FieldValue.delete(),
        reminderProcessingAt: FieldValue.delete(),
        reminderClaimId: FieldValue.delete(),
        reminderLastError: FieldValue.delete(),
      },
      { merge: true }
    );
  });
};

const markReminderFailed = async (
  reminder: ClaimedReminder,
  error: unknown
): Promise<void> => {
  const message =
    error instanceof Error && error.message
      ? error.message.slice(0, 240)
      : "Připomínku ke smlouvě se nepodařilo zpracovat.";
  try {
    await reminder.ref.set(
      {
        reminderProcessingAtMs: FieldValue.delete(),
        reminderProcessingAt: FieldValue.delete(),
        reminderClaimId: FieldValue.delete(),
        reminderLastError: message,
        reminderFailedAtMs: Date.now(),
        reminderFailedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (markError) {
    console.error("Contract note reminder failure could not be stored:", markError);
  }
};

const sendPush = async ({
  reminder,
  profile,
  origin,
}: {
  reminder: ClaimedReminder;
  profile: Record<string, unknown>;
  origin: string;
}): Promise<PushResult> => {
  const tokens = collectPushTokens(profile).slice(0, MAX_TOKENS_PER_USER);
  if (!adminMessaging || tokens.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      tokenCount: tokens.length,
      invalidTokens: [],
    };
  }

  const title = contractNoteReminderTitle(reminder);
  const deepLink = contractNoteReminderDeepLink(reminder);
  const body = reminder.text.length > 180
    ? `${reminder.text.slice(0, 179).trimEnd()}…`
    : reminder.text;
  let successCount = 0;
  let failureCount = 0;
  const invalidTokens: string[] = [];

  for (let index = 0; index < tokens.length; index += MAX_TOKENS_PER_MULTICAST) {
    const chunk = tokens.slice(index, index + MAX_TOKENS_PER_MULTICAST);
    try {
      const result = await adminMessaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: {
          type: "contract_note_reminder",
          ownerEmail: reminder.ownerEmail,
          entryId: reminder.entryId,
          noteId: reminder.noteId,
          contractNumber: reminder.contractNumber,
          deepLink,
        },
        webpush: {
          fcmOptions: { link: `${origin}${deepLink}` },
          notification: {
            icon: "/pwa/icon-192.png",
            badge: "/pwa/icon-192.png",
            tag: `bohemika-contract-note-${reminder.entryId}-${reminder.noteId}`,
            requireInteraction: false,
          },
        },
      });
      successCount += result.successCount;
      failureCount += result.failureCount;
      result.responses.forEach((response, responseIndex) => {
        if (response.success) return;
        if (!isPermanentInvalidPushTokenCode(response.error?.code)) return;
        const token = chunk[responseIndex];
        if (token) invalidTokens.push(token);
      });
    } catch (error) {
      failureCount += chunk.length;
      console.error(`Contract note reminder push failed (${reminder.recipientEmail}):`, error);
    }
  }

  return { successCount, failureCount, tokenCount: tokens.length, invalidTokens };
};

export async function runContractNoteReminders(
  req: NextRequest,
  now = new Date()
): Promise<ContractNoteReminderRunResult> {
  if (!adminDb) {
    throw new Error("Server není správně nakonfigurován (Firebase Admin / Firestore).");
  }

  const nowMs = now.getTime();
  const snapshot = await adminDb
    .collectionGroup("contractNotes")
    .where("reminderAtMs", "<=", nowMs)
    .limit(QUERY_LIMIT)
    .get();
  const result: ContractNoteReminderRunResult = {
    ok: true,
    checked: snapshot.size,
    claimed: 0,
    mailboxWritten: 0,
    skippedDuplicate: 0,
    skippedPushDisabled: 0,
    skippedNoToken: 0,
    pushSuccessCount: 0,
    pushFailureCount: 0,
    cleanedInvalidTokens: 0,
    failed: 0,
    messagingAvailable: Boolean(adminMessaging),
  };
  const origin = resolvePublicAppOrigin(req);

  for (const docSnapshot of snapshot.docs) {
    const reminder = await claimReminder(docSnapshot.ref, nowMs);
    if (!reminder) continue;
    result.claimed += 1;

    try {
      const deepLink = contractNoteReminderDeepLink(reminder);
      const mailbox = await writeMailboxEntryOnce({
          recipientEmail: reminder.recipientEmail,
        entryId: contractNoteReminderMailboxId(reminder),
        type: "contract_note_reminder",
        title: contractNoteReminderTitle(reminder),
        body: reminder.text,
        deepLink,
        metadata: {
          ownerEmail: reminder.ownerEmail,
          recipientEmail: reminder.recipientEmail,
          entryId: reminder.entryId,
          noteId: reminder.noteId,
          contractNumber: reminder.contractNumber,
          clientName: reminder.clientName,
          productKey: reminder.productKey,
          reminderAtMs: reminder.reminderAtMs,
        },
        createdAtMs: nowMs,
      });
      if (!mailbox.written) {
        result.skippedDuplicate += 1;
        await markReminderDone(reminder, nowMs);
        continue;
      }
      result.mailboxWritten += 1;

      const profile = await loadMergedProfile(reminder.recipientEmail);
      if (!adminMessaging || !pushEnabled(profile)) {
        result.skippedPushDisabled += 1;
        await markReminderDone(reminder, nowMs);
        continue;
      }

      const push = await sendPush({ reminder, profile, origin });
      result.pushSuccessCount += push.successCount;
      result.pushFailureCount += push.failureCount;
      if (push.tokenCount === 0) result.skippedNoToken += 1;
      if (push.invalidTokens.length > 0) {
        result.cleanedInvalidTokens += await removeInvalidPushTokens(
          reminder.recipientEmail,
          push.invalidTokens
        );
      }
      await markReminderDone(reminder, nowMs);
    } catch (error) {
      result.failed += 1;
      console.error("Contract note reminder failed:", error);
      await markReminderFailed(reminder, error);
    }
  }

  return result;
}
