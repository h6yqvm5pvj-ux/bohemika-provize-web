import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { clientNoteDeepLink } from "@/app/_klienti/clientNotes";
import { adminAuth, adminDb, adminMessaging } from "./firebaseAdmin";
import { writeMailboxEntryOnce } from "./mailbox";
import { collectPushTokens, isPermanentInvalidPushTokenCode, removeInvalidPushTokens } from "./pushTokens";
import {
  CLIENT_NOTE_REMINDERS_COLLECTION, clientNoteDto, clientNotePath, clientNoteQueueId,
  parseClientNoteQueue, type ClientNoteQueue,
} from "./clientNotes";

type Ref = FirebaseFirestore.DocumentReference;
type ClaimedReminder = ClientNoteQueue & { ref: Ref; noteRef: Ref; text: string; claimId: string };
const CLAIM_TTL_MS = 10 * 60_000;

async function claim(ref: Ref, nowMs: number): Promise<ClaimedReminder | null> {
  const db = adminDb!;
  return db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return null;
    const data = snap.data()!;
    const queue = parseClientNoteQueue(data);
    if (!queue || ref.id !== clientNoteQueueId(clientNotePath(queue))) { transaction.delete(ref); return null; }
    if (queue.reminderAtMs > nowMs || Number(data.claimUntilMs) > nowMs) return null;
    const noteRef = db.doc(clientNotePath(queue));
    const noteSnap = await transaction.get(noteRef);
    const note = noteSnap.exists ? clientNoteDto(noteSnap.id, noteSnap.data()!, queue.ownerUid) : null;
    if (!note || !note.reminderEnabled || note.reminderAtMs !== queue.reminderAtMs || note.revision !== queue.revision) {
      transaction.delete(ref);
      return null;
    }
    const claimId = randomUUID();
    transaction.update(ref, { claimId, claimUntilMs: nowMs + CLAIM_TTL_MS });
    return { ...queue, ref, noteRef, text: note.text, claimId };
  });
}

async function stillCurrent(reminder: ClaimedReminder) {
  const snap = await reminder.ref.get();
  return snap.exists && snap.data()?.claimId === reminder.claimId && snap.data()?.revision === reminder.revision;
}

async function finish(reminder: ClaimedReminder, sentAtMs: number | null) {
  await adminDb!.runTransaction(async transaction => {
    const [queueSnap, noteSnap] = await Promise.all([transaction.get(reminder.ref), transaction.get(reminder.noteRef)]);
    if (queueSnap.data()?.claimId !== reminder.claimId || queueSnap.data()?.revision !== reminder.revision) return;
    if (noteSnap.exists && noteSnap.data()?.revision === reminder.revision) {
      transaction.update(reminder.noteRef, {
        reminderEnabled: false, reminderAtMs: null, reminderSentAtMs: sentAtMs,
        revision: reminder.revision + 1,
      });
    }
    transaction.delete(reminder.ref);
  });
}

async function release(reminder: ClaimedReminder) {
  // Never recreate a cancelled reminder or clear a newer revision's claim.
  await adminDb!.runTransaction(async transaction => {
    const snap = await transaction.get(reminder.ref);
    if (snap.data()?.claimId !== reminder.claimId || snap.data()?.revision !== reminder.revision) return;
    transaction.update(reminder.ref, { claimId: FieldValue.delete(), claimUntilMs: FieldValue.delete() });
  });
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function publicOrigin() {
  for (const value of [process.env.NEXT_PUBLIC_APP_URL, process.env.PUBLIC_APP_URL, process.env.APP_URL]) {
    if (!value) continue;
    try { const url = new URL(value); if (url.protocol === "https:") return url.origin; } catch { /* Try the next configured origin. */ }
  }
  return "https://bohemka.app";
}

export async function runClientNoteReminders(now = new Date()) {
  if (!adminDb || !adminAuth) throw new Error("Client note reminder services unavailable");
  const nowMs = now.getTime();
  // A regular collection query uses Firestore's automatic single-field index.
  // Saving/cancelling a note updates this small queue in the same transaction.
  const snapshot = await adminDb.collection(CLIENT_NOTE_REMINDERS_COLLECTION)
    .where("reminderAtMs", "<=", nowMs).limit(100).get();
  const result = {
    ok: true, checked: snapshot.size, claimed: 0, mailboxWritten: 0, skippedDuplicate: 0,
    skippedRecipient: 0, skippedPushDisabled: 0, skippedNoToken: 0,
    pushSuccessCount: 0, pushFailureCount: 0, cleanedInvalidTokens: 0, failed: 0,
  };
  for (const doc of snapshot.docs) {
    let reminder: ClaimedReminder | null = null;
    try {
      reminder = await claim(doc.ref, nowMs);
      if (!reminder) continue;
      result.claimed += 1;
      // UID-bound private notes must not be delivered to a reused email address.
      const account = await adminAuth.getUser(reminder.ownerUid).catch(error => {
        if (error?.code === "auth/user-not-found") return null;
        throw error;
      });
      if (!account || account.disabled || account.email?.trim().toLowerCase() !== reminder.recipientEmail) {
        result.skippedRecipient += 1;
        await finish(reminder, null);
        continue;
      }
      const [publicProfile, privateProfile] = await Promise.all([
        adminDb.collection("users").doc(reminder.recipientEmail).get(),
        adminDb.collection("usersPrivate").doc(reminder.recipientEmail).get(),
      ]);
      if (!await stillCurrent(reminder)) continue;
      const deepLink = clientNoteDeepLink(reminder.slug, reminder.noteId);
      const title = `Připomínka: ${reminder.clientName}`.slice(0, 120);
      const mailbox = await writeMailboxEntryOnce({
        recipientEmail: reminder.recipientEmail,
        entryId: `client-note-${reminder.ref.id}-${reminder.revision}`,
        type: "client_note_reminder", title, body: reminder.text, deepLink,
        metadata: { clientSlug: reminder.slug, noteId: reminder.noteId, reminderAtMs: reminder.reminderAtMs },
        createdAtMs: nowMs,
      });
      if (!mailbox.written) {
        result.skippedDuplicate += 1;
        await finish(reminder, nowMs);
        continue;
      }
      result.mailboxWritten += 1;
      const profile = { ...publicProfile.data(), ...privateProfile.data() };
      const channels = record(record(profile.notificationSettings).channels);
      const tokens = collectPushTokens(profile).slice(0, 30);
      if (!adminMessaging || channels.push === false) result.skippedPushDisabled += 1;
      else if (!tokens.length) result.skippedNoToken += 1;
      else {
        try {
          const push = await adminMessaging.sendEachForMulticast({
            tokens, notification: { title, body: reminder.text.length > 180 ? `${reminder.text.slice(0, 179)}…` : reminder.text },
            data: { type: "client_note_reminder", clientSlug: reminder.slug, noteId: reminder.noteId, deepLink },
            webpush: {
              fcmOptions: { link: `${publicOrigin()}${deepLink}` },
              notification: { icon: "/pwa/icon-192.png", badge: "/pwa/icon-192.png", tag: `bohemika-client-note-${reminder.ref.id}` },
            },
          });
          result.pushSuccessCount += push.successCount;
          result.pushFailureCount += push.failureCount;
          const invalid = tokens.filter((_, index) => isPermanentInvalidPushTokenCode(push.responses[index]?.error?.code));
          if (invalid.length) result.cleanedInvalidTokens += await removeInvalidPushTokens(reminder.recipientEmail, invalid);
        } catch { result.pushFailureCount += tokens.length; }
      }
      await finish(reminder, nowMs);
    } catch {
      result.failed += 1;
      if (reminder) await release(reminder).catch(() => undefined);
    }
  }
  return result;
}
