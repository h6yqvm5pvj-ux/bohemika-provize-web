import { isSentMailboxItem, mailboxMessageDayKey, normalizeEmail } from "./postaHelpers";
import type { MailboxItem } from "./postaTypes";

/** Nearby messages from the same sender form a visual group, without merging their contents. */
export function canGroupMailboxMessages(previous: MailboxItem | null | undefined, current: MailboxItem | null | undefined): boolean {
  if (!previous || !current) return false;
  if (previous.type !== "direct_message" || current.type !== "direct_message") return false;
  if (previous.metadata?.groupCreatedEvent || current.metadata?.groupCreatedEvent) return false;
  if ([previous.clientDeliveryStatus, current.clientDeliveryStatus].some((status) => status === "failed" || status === "sending")) return false;
  const sender = normalizeEmail(previous.metadata?.senderEmail);
  if (!sender || sender !== normalizeEmail(current.metadata?.senderEmail)) return false;
  if (isSentMailboxItem(previous) !== isSentMailboxItem(current)) return false;
  const before = previous.createdAtMs;
  const after = current.createdAtMs;
  if (!before || !after || !Number.isFinite(before) || !Number.isFinite(after)) return false;
  return after >= before && after - before <= 5 * 60_000 && mailboxMessageDayKey(before) === mailboxMessageDayKey(after);
}
