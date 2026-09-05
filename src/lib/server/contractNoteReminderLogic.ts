const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const finiteInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;

const simpleStableHash = (value: string): string => {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
};

export type ContractNoteReminderCandidate = {
  ownerEmail: string;
  recipientEmail: string;
  entryId: string;
  noteId: string;
  text: string;
  contractNumber: string;
  clientName: string;
  productKey: string;
  reminderAtMs: number;
};

export const resolveContractNoteReminderCandidate = ({
  noteId,
  data,
  nowMs,
}: {
  noteId: string;
  data: Record<string, unknown>;
  nowMs: number;
}): ContractNoteReminderCandidate | null => {
  if (data.reminderEnabled !== true) return null;

  const reminderAtMs = finiteInteger(data.reminderAtMs);
  if (!reminderAtMs || reminderAtMs > nowMs) return null;

  const lastSentForAtMs = finiteInteger(data.reminderLastSentForAtMs);
  if (lastSentForAtMs === reminderAtMs) return null;

  const ownerEmail = normalizeText(data.ownerEmail).toLowerCase();
  const recipientEmail = normalizeText(
    data.reminderRecipientEmail ?? data.createdByEmail ?? data.ownerEmail
  ).toLowerCase();
  const entryId = normalizeText(data.entryId);
  const normalizedNoteId = normalizeText(noteId);
  const text = normalizeText(data.text);
  if (
    !EMAIL_RE.test(ownerEmail) ||
    !EMAIL_RE.test(recipientEmail) ||
    !entryId ||
    !normalizedNoteId ||
    !text
  ) {
    return null;
  }

  return {
    ownerEmail,
    recipientEmail,
    entryId,
    noteId: normalizedNoteId,
    text,
    contractNumber: normalizeText(data.contractNumber),
    clientName: normalizeText(data.clientName),
    productKey: normalizeText(data.productKey),
    reminderAtMs,
  };
};

export const contractNoteReminderDeepLink = (
  reminder: Pick<ContractNoteReminderCandidate, "ownerEmail" | "entryId" | "noteId">
): string => {
  const slug = encodeURIComponent(`${reminder.ownerEmail}___${reminder.entryId}`);
  return `/smlouvy/${slug}?source=contract-note-reminder&noteId=${encodeURIComponent(
    reminder.noteId
  )}`;
};

export const contractNoteReminderMailboxId = (
  reminder: Pick<
    ContractNoteReminderCandidate,
    "recipientEmail" | "entryId" | "noteId" | "reminderAtMs"
  >
): string =>
  `contract-note-${simpleStableHash(
    `${reminder.recipientEmail}|${reminder.entryId}|${reminder.noteId}|${reminder.reminderAtMs}`
  )}`;

export const contractNoteReminderTitle = (
  reminder: Pick<ContractNoteReminderCandidate, "contractNumber">
): string =>
  reminder.contractNumber
    ? `Připomínka ke smlouvě ${reminder.contractNumber}`
    : "Připomínka ke smlouvě";
