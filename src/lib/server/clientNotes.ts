import { createHash } from "node:crypto";
import { CLIENT_NOTE_KINDS, isClientNoteId, type ClientNote } from "@/app/_klienti/clientNotes";
import { isClientCardSlug } from "@/app/_klienti/clientIdentity";

export const CLIENT_NOTE_REMINDERS_COLLECTION = "clientNoteReminders";
export const clientNoteQueueId = (notePath: string) => createHash("sha256").update(notePath).digest("hex");

export function clientNoteDto(id: string, data: Record<string, unknown>, uid: string): ClientNote {
  if (data.ownerUid !== uid || !isClientNoteId(id) || typeof data.text !== "string" ||
      typeof data.kind !== "string" || !Object.hasOwn(CLIENT_NOTE_KINDS, data.kind) ||
      !Number.isSafeInteger(data.revision) || Number(data.revision) < 1 ||
      !Number.isFinite(data.createdAtMs) || !Number.isFinite(data.updatedAtMs)) {
    throw new Error("Invalid stored client note");
  }
  return {
    id, kind: data.kind as ClientNote["kind"], text: data.text,
    authorEmail: typeof data.authorEmail === "string" ? data.authorEmail : "",
    createdAtMs: Number(data.createdAtMs), updatedAtMs: Number(data.updatedAtMs), revision: Number(data.revision),
    reminderEnabled: data.reminderEnabled === true,
    reminderAtMs: typeof data.reminderAtMs === "number" ? data.reminderAtMs : null,
    reminderSentAtMs: typeof data.reminderSentAtMs === "number" ? data.reminderSentAtMs : null,
  };
}

export type ClientNoteQueue = {
  ownerUid: string;
  recipientEmail: string;
  slug: string;
  noteId: string;
  clientName: string;
  reminderAtMs: number;
  revision: number;
};

export function parseClientNoteQueue(data: Record<string, unknown>): ClientNoteQueue | null {
  if (typeof data.ownerUid !== "string" || !data.ownerUid || /[/]/.test(data.ownerUid) ||
      typeof data.recipientEmail !== "string" || !/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(data.recipientEmail) ||
      typeof data.slug !== "string" || !isClientCardSlug(data.slug) || !isClientNoteId(data.noteId) ||
      typeof data.clientName !== "string" || !data.clientName.trim() ||
      !Number.isSafeInteger(data.reminderAtMs) || Number(data.reminderAtMs) <= 0 ||
      !Number.isSafeInteger(data.revision) || Number(data.revision) < 1) return null;
  return data as ClientNoteQueue;
}

export const clientNotePath = (queue: Pick<ClientNoteQueue, "ownerUid" | "slug" | "noteId">) =>
  `clientCardsPrivate/${queue.ownerUid}/cards/${queue.slug}/clientNotes/${queue.noteId}`;
