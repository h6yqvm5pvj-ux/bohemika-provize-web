import { createHash } from "node:crypto";

const normalizeMailboxEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export function mailboxConversationId(firstEmail: unknown, secondEmail: unknown): string {
  const participants = [
    normalizeMailboxEmail(firstEmail),
    normalizeMailboxEmail(secondEmail),
  ].sort();

  if (!participants[0] || !participants[1] || participants[0] === participants[1]) {
    throw new Error("Konverzace vyžaduje dva různé účastníky.");
  }

  const digest = createHash("sha256")
    .update(`bohemika-mailbox-conversation:v1\n${participants[0]}\n${participants[1]}`)
    .digest("base64url")
    .slice(0, 32);

  return `dm_${digest}`;
}

export function mailboxConversationParticipantId(email: unknown): string {
  const normalized = normalizeMailboxEmail(email);
  if (!normalized) throw new Error("Chybí účastník konverzace.");
  return createHash("sha256").update(normalized).digest("base64url").slice(0, 32);
}
