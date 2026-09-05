export type MailboxItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  deepLink: string;
  read: boolean;
  createdAtMs: number | null;
  readAtMs: number | null;
  snoozedUntilMs?: number | null;
  snoozedAtMs?: number | null;
  archivedAtMs?: number | null;
  pinnedAtMs?: number | null;
  replyReminderAtMs?: number | null;
  replyReminderSetAtMs?: number | null;
  metadata?: Record<string, unknown> | null;
  clientDeliveryStatus?: "sending" | "sent" | "delivered" | "failed";
  clientDeliveryError?: string;
  clientAttachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    sizeBytes: number;
  }>;
};

export type MailboxResponse = {
  ok: boolean;
  unreadCount?: number;
  items?: MailboxItem[];
  hasMore?: boolean;
  nextCursor?: MailboxPageCursor | null;
  error?: string;
};

export type MailboxPageCursor = {
  createdAtMs: number;
  id: string;
};

export type MailboxPatchResponse = {
  ok: boolean;
  updated?: number;
  unreadCount?: number;
  error?: string;
};

export type MailboxDeleteResponse = {
  ok: boolean;
  deleted?: number;
  unreadCount?: number;
  error?: string;
};

export type MailboxSharedPreviewResponse = {
  ok?: boolean;
  html?: string;
  error?: string;
};

export type RecipientOption = {
  email: string;
  name: string;
};

export type UserSearchResponse = {
  ok?: boolean;
  users?: Array<{
    email?: string | null;
    name?: string | null;
    managerEmail?: string | null;
  }>;
  error?: string;
};

export type MailboxComposeResponse = {
  ok?: boolean;
  recipientName?: string;
  recipientEmail?: string;
  attachments?: number;
  attachmentItems?: MailboxAttachment[];
  messageId?: string;
  recipientMailboxId?: string;
  senderMailboxId?: string;
  tipId?: string | null;
  conversationId?: string | null;
  deliveredAtMs?: number;
  recipientEmails?: string[];
  groupName?: string | null;
  error?: string;
};

export type MailboxActivityResponse = {
  ok?: boolean;
  conversationId?: string;
  email?: string;
  lastActiveAtMs?: number | null;
  typing?: boolean;
  serverNowMs?: number;
  error?: string;
};

export type MailboxConversationParticipant = {
  email: string;
  name: string;
};

export type MailboxConversationResponse = {
  ok?: boolean;
  conversationId?: string;
  groupName?: string;
  ownerEmail?: string;
  participants?: MailboxConversationParticipant[];
  participantEmails?: string[];
  muted?: boolean;
  active?: boolean;
  canManage?: boolean;
  error?: string;
};

export type MailFilterMode = "all" | "unread" | "snoozed" | "archived" | "system";

export type MailboxAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};

export type MailboxReaction = {
  emoji: string;
  userEmails: string[];
};

export type MailboxMessageMutationResponse = {
  ok?: boolean;
  reactions?: MailboxReaction[];
  text?: string;
  editedAtMs?: number;
  deleted?: number;
  pinnedAtMs?: number | null;
  replyReminderAtMs?: number | null;
  replyReminderSetAtMs?: number | null;
  error?: string;
};
