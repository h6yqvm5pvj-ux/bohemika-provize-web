import {
  CONTRACT_NOTE_MAX_LENGTH,
  normalizeContractNoteMutation,
} from "@/app/api/contracts/notes/contractNotes";

export const CLIENT_NOTE_MAX_LENGTH = CONTRACT_NOTE_MAX_LENGTH;
export const CLIENT_NOTE_KINDS = { note: "Poznámka", call: "Telefonát", meeting: "Schůzka" } as const;
export type ClientNoteKind = keyof typeof CLIENT_NOTE_KINDS;
export type ClientNote = {
  id: string;
  kind: ClientNoteKind;
  text: string;
  authorEmail: string;
  createdAtMs: number;
  updatedAtMs: number;
  revision: number;
  reminderEnabled: boolean;
  reminderAtMs: number | null;
  reminderSentAtMs: number | null;
};
export type ClientNotesResponse = {
  ok: true;
  notes: ClientNote[];
  nextCursor: string | null;
  focusedNote: ClientNote | null;
};

export const isClientNoteId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);

export function normalizeClientNote(value: Record<string, unknown>, nowMs = Date.now()) {
  if (typeof value.kind !== "string" || !Object.hasOwn(CLIENT_NOTE_KINDS, value.kind)) {
    return { ok: false as const, error: "Vyber typ zápisu." };
  }
  const result = normalizeContractNoteMutation(value, nowMs);
  if (!result.ok) return result;
  if (result.value.reminderEnabled && result.value.reminderAtMs! <= nowMs) {
    return { ok: false as const, error: "Vyber budoucí datum připomínky. Dnešní čas doručení už uplynul." };
  }
  return { ok: true as const, value: { ...result.value, kind: value.kind as ClientNoteKind } };
}

/** The existing reminder cron runs daily at 07:45 UTC. */
export function clientNoteReminderAt(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = new Date(`${date}T07:45:00.000Z`);
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date
    ? value.getTime() : null;
}

export const clientNoteReminderDate = (value: number | null): string =>
  value == null ? "" : new Date(value).toISOString().slice(0, 10);

export function clientNoteDefaultDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const clientNoteDeepLink = (slug: string, noteId: string): string =>
  `/klienti/${encodeURIComponent(slug)}?noteId=${encodeURIComponent(noteId)}#client-notes`;
