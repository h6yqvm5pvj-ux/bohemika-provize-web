import { isSentMailboxItem, isTipsterTipMailboxItem, normalizeEmail } from "./postaHelpers";
import type { MailboxItem } from "./postaTypes";

export const MAILBOX_SUPPORT_RECIPIENT = {
  email: "jakub.rauscher@bohemika.eu",
  name: "Podpora",
} as const;

export const isMailboxSupportEmail = (value: unknown): boolean =>
  normalizeEmail(value) === MAILBOX_SUPPORT_RECIPIENT.email;

export const isMailboxSupportConversation = (item: MailboxItem): boolean =>
  item.type === "direct_message" && item.metadata?.groupConversation !== true &&
  !isTipsterTipMailboxItem(item) && isMailboxSupportEmail(
    isSentMailboxItem(item) ? item.metadata?.recipientEmail : item.metadata?.senderEmail
  );
