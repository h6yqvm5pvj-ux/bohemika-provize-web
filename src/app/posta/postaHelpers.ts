import type { MailboxAttachment, MailboxItem } from "./postaTypes";

export const formatDateTime = (ms: number | null): string => {
  if (!ms || !Number.isFinite(ms)) return "Neznámý čas";
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return "Neznámý čas";
  }
};

export const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((part) =>
      part.length > 0
        ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        : part
    )
    .join(" ");
};

export const parseMailboxAttachments = (item: MailboxItem): MailboxAttachment[] => {
  const raw = item.metadata && Array.isArray(item.metadata.attachments) ? item.metadata.attachments : [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const url = typeof row.url === "string" ? row.url.trim() : "";
      if (!name || !url) return null;
      const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `${name}-${url}`;
      const contentType =
        typeof row.contentType === "string" && row.contentType.trim()
          ? row.contentType.trim()
          : "application/octet-stream";
      const sizeBytes =
        typeof row.sizeBytes === "number" && Number.isFinite(row.sizeBytes) ? Math.max(0, row.sizeBytes) : 0;
      return { id, name, url, contentType, sizeBytes } satisfies MailboxAttachment;
    })
    .filter((entry): entry is MailboxAttachment => entry !== null);
};

export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const isSentMailboxItem = (item: MailboxItem): boolean =>
  Boolean(item.metadata && item.metadata.mailboxDirection === "sent");

export const isTipsterTipMailboxItem = (item: MailboxItem): boolean => {
  if (item.metadata && item.metadata.tipsterTip === true) return true;
  if (/^nový tip\s*-/i.test(item.title.trim())) return true;
  return item.body.toLowerCase().includes("nový tip z tipařského formuláře");
};

export const tipsterTipCategoryText = (item: MailboxItem): string => {
  const metadata = item.metadata ?? {};
  const metadataLabel =
    typeof metadata.tipProductLabel === "string" ? metadata.tipProductLabel.trim() : "";
  if (metadataLabel) return metadataLabel;

  const titleLabel = item.title.replace(/^nový tip\s*-\s*/i, "").trim();
  return titleLabel || "Tip";
};

export const tipsterTipListTitle = (item: MailboxItem): string =>
  `Nový TIP - ${tipsterTipCategoryText(item)}`;

export const tipsterTipSenderText = (item: MailboxItem): string => {
  const metadata = item.metadata ?? {};
  const senderName =
    typeof metadata.senderName === "string" && metadata.senderName.trim()
      ? metadata.senderName.trim()
      : "";
  const senderEmail =
    typeof metadata.senderEmail === "string" && metadata.senderEmail.trim()
      ? metadata.senderEmail.trim()
      : "";
  const sender = senderName || (senderEmail ? nameFromEmail(senderEmail) : "Tipař");
  return `Tip posílá: ${sender}`;
};

export const tipsterTipDetailId = (item: MailboxItem): string => {
  const metadata = item.metadata ?? {};
  const storedTipId =
    typeof metadata.tipId === "string" && metadata.tipId.trim()
      ? metadata.tipId.trim()
      : "";
  if (isSentMailboxItem(item)) return storedTipId;
  return item.id;
};

export const sentRecipientText = (item: MailboxItem): string => {
  const recipientName =
    item.metadata && typeof item.metadata.recipientName === "string"
      ? item.metadata.recipientName.trim()
      : "";
  const recipientEmail =
    item.metadata && typeof item.metadata.recipientEmail === "string"
      ? item.metadata.recipientEmail.trim()
      : "";
  if (recipientName && recipientEmail) return `Příjemce: ${recipientName} (${recipientEmail})`;
  if (recipientName) return `Příjemce: ${recipientName}`;
  if (recipientEmail) return `Příjemce: ${recipientEmail}`;
  return "";
};

export const toReplySubject = (value: string): string => {
  const subject = value.trim();
  if (!subject) return "Re: zpráva";
  return /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
};
