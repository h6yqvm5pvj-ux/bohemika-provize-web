import { openPrivateValue, sealPrivateValue, isPrivateValue } from "./privateEncryption";
import { decryptMailboxJson, encryptMailboxJson } from "./mailboxEncryption";
import { privateRecordFields, privateRecordContext } from "./privateRecords";
import { planBusinessDataMigration } from "./businessDataEncryption";

/** Pure, idempotent plan. The executor must re-read inside a transaction and
 * replace the whole document: merge:true would retain legacy map fields. */
export function planPrivateDataMigration(path: string, source: Record<string, unknown>): Record<string, unknown> | null {
  const data = { ...source };
  let changed = false;
  if (/^anniversaryReviews\/[^/]+$/.test(path) && !data.privateReviewPath) { data.privateReviewPath = path; changed = true; }
  const seal = (field: string) => {
    if (!Object.hasOwn(data, field)) return;
    const context = privateRecordContext(path, data, field);
    if (isPrivateValue(data[field])) { openPrivateValue(data[field], context); return; }
    const encrypted = sealPrivateValue(data[field], context);
    // Authenticate and compare before scheduling a destructive replacement.
    if (JSON.stringify(openPrivateValue(encrypted, context)) !== JSON.stringify(data[field])) throw new Error("Encryption verification failed");
    data[field] = encrypted;
    changed = true;
  };
  let match: RegExpMatchArray | null;
  if ((match = path.match(/^clientCardsPrivate\/([^/]+)\/cards\/[^/]+$/))) {
    if (data.ownerUid !== match[1]) throw new Error("Client card owner mismatch");
    seal("card");
  } else if ((match = path.match(/^clientCardsPrivate\/([^/]+)\/cards\/[^/]+\/clientNotes\/[^/]+$/))) {
    if (data.ownerUid !== match[1]) throw new Error("Client note owner mismatch");
    seal("text");
  } else if (/^clientNoteReminders\/[^/]+$/.test(path)) {
    seal("clientName");
  } else if (/^documentDraftKeys\/[^/]+$/.test(path)) {
    if (typeof data.ownerUid !== "string" || data.version !== 1) throw new Error("Invalid draft key owner");
    seal("key");
  } else if (/^usersPrivate\/[^/]+\/tipsterTips\/[^/]+$/.test(path)) {
    for (const field of ["title", "messageText", "fields"]) seal(field);
  } else if (/^usersPrivate\/[^/]+\/mailbox\/[^/]+$/.test(path) &&
    (data.type === "direct_message" || data.type === "client_note_reminder")) {
    const metadata = data.metadata && typeof data.metadata === "object" ? { ...data.metadata as Record<string, unknown> } : {};
    const context = `message:${metadata.messageId || path.split("/").at(-1)}`;
    if (data.encryptedContent != null) decryptMailboxJson(data.encryptedContent, context);
    else {
      const content = { subject: data.title ?? "Zpráva", messageText: metadata.messageText ?? data.body ?? "" };
      data.encryptedContent = encryptMailboxJson(content, context);
      if (JSON.stringify(decryptMailboxJson(data.encryptedContent, context)) !== JSON.stringify(content)) throw new Error("Message verification failed");
      changed = true;
    }
    if (data.title !== "Šifrovaná zpráva" || data.body !== "Nová šifrovaná zpráva." || Object.hasOwn(metadata, "messageText")) changed = true;
    data.title = "Šifrovaná zpráva";
    data.body = "Nová šifrovaná zpráva.";
    delete metadata.messageText;
    metadata.encryptedContentVersion = 1;
    data.metadata = metadata;
  }
  for (const field of privateRecordFields(path, data)) seal(field);
  const business = planBusinessDataMigration(path, data);
  return business ?? (changed ? data : null);
}
