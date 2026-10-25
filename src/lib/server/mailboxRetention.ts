import { FieldPath, Timestamp, type Query } from "firebase-admin/firestore";
import { SYSTEM_MAILBOX_RETENTION_DAYS } from "@/app/lib/mailboxRetention";
import { adminDb } from "./firebaseAdmin";

const RETENTION_MS = SYSTEM_MAILBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 250;
const MAX_PAGES = 40;
const MAX_RUN_MS = 45_000;
// Explicitly opt in notification types. Chats, tips and future message types
// must never acquire a destructive retention policy by default.
const NOTIFICATION_TYPES = [
  "generic", "new_contract", "contract_increase", "weekly_team_report",
  "contract_note_reminder", "client_note_reminder", "subscription_expiry",
  "contact_directory_update", "intranet_post", "intranet_comment", "admin_broadcast",
  "online_card_meeting_request", "online_card_review_pending", "team_message",
  "production_plan_share", "production_export_share",
];
const notificationTypes = new Set(NOTIFICATION_TYPES);
const RETENTION_TIME_FIELDS = [
  "createdAtMs", "createdAt",
  "snoozedUntilMs", "snoozedUntil", "snoozeReminderSentAtMs", "snoozeReminderSentAt",
  "snoozeReminderSkippedAtMs", "snoozeReminderSkippedAt",
];
// Legacy tips were identified by their subject before tipsterTip metadata.
// Read that field for classification only; never open message bodies.
const RETENTION_FIELDS = ["type", "title", "metadata", "encryptedContent", ...RETENTION_TIME_FIELDS];

const millis = (value: unknown): number | null => {
  const ms = value instanceof Date ? value.getTime() : value instanceof Timestamp ? value.toMillis() : value;
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : null;
};

export function isExpiredSystemMailboxEntry(path: string, data: Record<string, unknown>, nowMs: number): boolean {
  if (!/^usersPrivate\/[^/]+\/mailbox\/[^/]+$/.test(path) ||
    typeof data.type !== "string" || !notificationTypes.has(data.type) || data.encryptedContent != null) return false;
  const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : {};
  if (metadata.tipsterTip === true || metadata.groupConversation === true || metadata.conversationId) return false;
  if (typeof data.title === "string" && /^nový tip\s*-/i.test(data.title.trim())) return false;
  const createdAt = millis(data.createdAtMs) ?? millis(data.createdAt);
  if (createdAt == null) return false;
  // Use the later timestamp if legacy fields disagree. Postponing a reminder
  // starts a fresh retention window; cleanup cannot cancel a future reminder.
  const referenceMs = Math.max(createdAt, ...RETENTION_TIME_FIELDS
    .map(field => millis(data[field]) ?? 0));
  return referenceMs <= nowMs - RETENTION_MS;
}

export async function cleanupExpiredSystemMailbox({ dryRun = false }: { dryRun?: boolean } = {}) {
  if (!adminDb) throw new Error("Mailbox database unavailable.");
  const db = adminDb;
  const nowMs = Date.now();
  const cutoffMs = nowMs - RETENTION_MS;
  const deadline = nowMs + MAX_RUN_MS;
  const stats = { ok: true, dryRun, retentionDays: SYSTEM_MAILBOX_RETENTION_DAYS, checked: 0, eligible: 0, deleted: 0, pages: 0, hasMore: false };
  const stateRef = db.collection("maintenanceState").doc("mailboxRetention");
  const saved = dryRun ? null : (await stateRef.get()).data();
  const fields = ["createdAtMs", "createdAt"] as const;
  const seen = new Set<string>();
  const firstField = saved?.field === "createdAt" ? 1 : 0;

  // Both representations exist in legacy mailboxes. Projection avoids opening
  // bodies; the second pass also handles records without createdAtMs.
  for (let fieldIndex = firstField; fieldIndex < fields.length; fieldIndex++) {
    const field = fields[fieldIndex];
    let cursor = field === saved?.field && typeof saved.cursorPath === "string" &&
      saved.cursorPath.split("/").length % 2 === 0 && saved.cursorPath.split("/").at(-2) === "mailbox" &&
      millis(saved.cursorValue) != null
      ? { path: saved.cursorPath, value: saved.cursorValue } : null;
    while (true) {
      if (stats.pages >= MAX_PAGES || Date.now() >= deadline) {
        stats.hasMore = true;
        if (!dryRun) await stateRef.set({ field, cursorPath: cursor?.path ?? null, cursorValue: cursor?.value ?? null, updatedAtMs: Date.now() });
        return stats;
      }
      let query: Query = db.collectionGroup("mailbox")
        .where("type", "in", NOTIFICATION_TYPES)
        .where(field, "<=", field === "createdAtMs" ? cutoffMs : Timestamp.fromMillis(cutoffMs))
        .orderBy(field, "asc").orderBy(FieldPath.documentId(), "asc").select(...RETENTION_FIELDS).limit(PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor.value, db.doc(cursor.path));
      const page = await query.get();
      stats.pages += 1;
      stats.checked += page.size;
      const candidates = page.docs.filter(doc => !seen.has(doc.ref.path) &&
        isExpiredSystemMailboxEntry(doc.ref.path, doc.data(), nowMs));
      candidates.forEach(doc => seen.add(doc.ref.path));
      stats.eligible += candidates.length;
      if (!dryRun && candidates.length) {
        stats.deleted += await db.runTransaction(async transaction => {
          const current = await transaction.getAll(...candidates.map(doc => doc.ref), { fieldMask: RETENTION_FIELDS });
          let deleted = 0;
          for (const doc of current) {
            if (!doc.exists || !isExpiredSystemMailboxEntry(doc.ref.path, doc.data()!, nowMs)) continue;
            transaction.delete(doc.ref);
            deleted += 1;
          }
          return deleted;
        });
      }
      if (page.size < PAGE_SIZE) break;
      const last = page.docs[page.docs.length - 1];
      cursor = { path: last.ref.path, value: last.data()[field] };
    }
  }
  if (!dryRun) await stateRef.set({ field: "createdAtMs", cursorPath: null, cursorValue: null, updatedAtMs: Date.now() });
  return stats;
}
