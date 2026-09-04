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
  metadata?: Record<string, unknown> | null;
};

export type MailboxResponse = {
  ok: boolean;
  unreadCount?: number;
  items?: MailboxItem[];
  error?: string;
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
  error?: string;
};

export type MailFilterMode = "all" | "unread" | "snoozed" | "archived" | "sent" | "system";

export type MailboxAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};
