import type { CollectionReference, DocumentData, Firestore } from "firebase-admin/firestore";

const stateFields = ["archivedAtMs", "archivedAt", "snoozedUntilMs", "snoozedUntil"];
export const newMailboxVisibility = { inboxArchived: false, inboxSnoozeMs: 0 } as const;

function numericTime(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

export async function mailboxUnreadCount(
  db: Firestore, mailbox: CollectionReference, toMillis: (value: unknown) => number | null, now = Date.now(),
) {
  const unread = mailbox.where("read", "==", false);
  const visible = unread.where("inboxArchived", "==", false).where("inboxSnoozeMs", "<=", now);
  const indexed = unread.orderBy("inboxArchived").orderBy("inboxSnoozeMs");
  const state = (row: DocumentData) => ({
    inboxArchived: Boolean(numericTime(row.archivedAtMs) ?? toMillis(row.archivedAt)),
    inboxSnoozeMs: numericTime(row.snoozedUntilMs) ?? toMillis(row.snoozedUntil) ?? 0,
  });

  // Read all aggregates at the same snapshot so a concurrent delivery/read cannot mask a legacy row.
  const total = await unread.count().get();
  if (!total.data().count) return 0;
  try {
    const count = await db.runTransaction(async tx => {
      const covered = await tx.get(indexed.count());
      return covered.data().count === total.data().count ? (await tx.get(visible.count())).data().count : null;
    }, { readOnly: true, readTime: total.readTime });
    if (count !== null) return count;
  } catch (error) {
    // Keep the original exact calculation available while a composite index is being built.
    if ((error as { code?: number }).code !== 9) throw error;
  }

  const snapshot = await unread.select(...stateFields, "inboxArchived", "inboxSnoozeMs").get();
  let count = 0;
  const batch = db.batch();
  let repairs = 0;
  for (const doc of snapshot.docs) {
    const row = doc.data();
    const visibility = state(row);
    if (!visibility.inboxArchived && visibility.inboxSnoozeMs <= now) count++;
    if (repairs < 200 && (row.inboxArchived !== visibility.inboxArchived || row.inboxSnoozeMs !== visibility.inboxSnoozeMs)) {
      batch.update(doc.ref, visibility, { lastUpdateTime: doc.updateTime });
      repairs++;
    }
  }
  if (repairs) {
    try {
      await batch.commit();
    } catch (error) {
      // Concurrent read/archive/delete wins. A later poll can finish this bounded repair.
      if (![5, 9, 10].includes((error as { code: number }).code)) throw error;
    }
  }
  return count;
}
