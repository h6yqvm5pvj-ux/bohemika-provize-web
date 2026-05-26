import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/server/firebaseAdmin";

const MAILBOX_MAX_RECIPIENTS = 500;
const TITLE_MAX_LEN = 120;
const BODY_MAX_LEN = 280;
const METADATA_STRING_MAX_LEN = 2000;

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const clampText = (value: unknown, maxLen: number, fallback: string): string => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen - 1)}…` : trimmed;
};

const normalizeDeepLink = (value: unknown): string => {
  if (typeof value !== "string") return "/nastaveni";
  const raw = value.trim();
  if (!raw) return "/nastaveni";
  if (raw.startsWith("/")) return raw;

  try {
    const parsed = new URL(raw);
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/nastaveni";
  } catch {
    return "/nastaveni";
  }
};

const sanitizeMetadata = (
  value: Record<string, unknown> | undefined
): Record<string, string | number | boolean | null> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const out: Record<string, string | number | boolean | null> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (!key) return;
    if (typeof raw === "string") {
      out[key] = raw.slice(0, METADATA_STRING_MAX_LEN);
      return;
    }
    if (typeof raw === "number") {
      if (Number.isFinite(raw)) out[key] = raw;
      return;
    }
    if (typeof raw === "boolean") {
      out[key] = raw;
      return;
    }
    if (raw == null) {
      out[key] = null;
    }
  });

  return Object.keys(out).length > 0 ? out : null;
};

const uniqueEmails = (values: string[]): string[] => {
  const out = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeEmail(value);
    if (!normalized) return;
    out.add(normalized);
  });
  return [...out].slice(0, MAILBOX_MAX_RECIPIENTS);
};

export type MailboxWriteInput = {
  recipientEmails: string[];
  type: string;
  title: string;
  body: string;
  deepLink?: string | null;
  metadata?: Record<string, unknown>;
  createdAtMs?: number;
  read?: boolean;
};

export async function writeMailboxEntries({
  recipientEmails,
  type,
  title,
  body,
  deepLink,
  metadata,
  createdAtMs,
  read,
}: MailboxWriteInput): Promise<{ written: number }> {
  if (!adminDb) return { written: 0 };
  const db = adminDb;

  const recipients = uniqueEmails(recipientEmails);
  if (recipients.length === 0) return { written: 0 };

  const cleanType = clampText(type, 60, "generic");
  const cleanTitle = clampText(title, TITLE_MAX_LEN, "Bohemka.App");
  const cleanBody = clampText(body, BODY_MAX_LEN, "Máš novou notifikaci.");
  const cleanDeepLink = normalizeDeepLink(deepLink ?? "/nastaveni");
  const cleanMetadata = sanitizeMetadata(metadata);
  const nowMs = Number.isFinite(createdAtMs) ? Number(createdAtMs) : Date.now();
  const initialRead = read === true;

  const batch = db.batch();

  recipients.forEach((email) => {
    const docRef = db
      .collection("usersPrivate")
      .doc(email)
      .collection("mailbox")
      .doc();

    batch.set(docRef, {
      recipientEmail: email,
      type: cleanType,
      title: cleanTitle,
      body: cleanBody,
      deepLink: cleanDeepLink,
      read: initialRead,
      readAtMs: initialRead ? nowMs : null,
      readAt: initialRead ? FieldValue.serverTimestamp() : null,
      createdAtMs: nowMs,
      createdAt: FieldValue.serverTimestamp(),
      ...(cleanMetadata ? { metadata: cleanMetadata } : {}),
    });
  });

  await batch.commit();
  return { written: recipients.length };
}
