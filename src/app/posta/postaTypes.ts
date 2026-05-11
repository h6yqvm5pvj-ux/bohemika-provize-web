export type MailboxItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  deepLink: string;
  read: boolean;
  createdAtMs: number | null;
  readAtMs: number | null;
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
  error?: string;
};

export type MailFilterMode = "all" | "unread" | "sent";

export type MailboxAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};
