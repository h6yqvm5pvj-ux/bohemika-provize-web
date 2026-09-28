import { decryptMailboxJson } from "./mailboxEncryption";
import { openPrivateValue, sealPrivateValue, privateEncryptionRequired } from "./privateEncryption";

const fields = ["title", "messageText", "fields"] as const;
export function sealTip(data: Record<string, unknown>, path: string) {
  const result = { ...data };
  for (const field of fields) if (Object.hasOwn(data, field)) result[field] = sealPrivateValue(data[field], `${path}:${field}`);
  return result;
}
export function openTip(data: Record<string, unknown>, path: string) {
  const result = { ...data };
  for (const field of fields) if (Object.hasOwn(data, field)) result[field] = openPrivateValue(data[field], `${path}:${field}`);
  return result;
}

/** Use only after the caller has authorized this mailbox document. */
export function openTipMailbox(data: Record<string, unknown>, id: string): Record<string, unknown> {
  if (data.encryptedContent == null) {
    if (privateEncryptionRequired()) throw new Error("Unencrypted tips are no longer accepted");
    return data;
  }
  const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : {};
  const payload = decryptMailboxJson<{ subject: string; messageText: string }>(data.encryptedContent, `message:${metadata.messageId || id}`);
  return { ...data, title: payload.subject, body: payload.messageText, metadata: { ...metadata, messageText: payload.messageText } };
}
