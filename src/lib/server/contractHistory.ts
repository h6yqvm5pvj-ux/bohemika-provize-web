import { invalidateHallContractChange } from "./hallOfFameProjection";
import { writeClientContractLink } from "./clientContractIndex";
import { randomUUID } from "node:crypto";
import { FieldPath, type DocumentReference } from "firebase-admin/firestore";
import { contractHistoryChanges, legacyContractHistory, type ContractHistoryEvent } from "@/app/lib/contractHistory";
import { contractNoteLocationRef } from "./contractNoteLocation";

export const CONTRACT_HISTORIES_COLLECTION = "contractHistories";
type Writer = { set(ref: DocumentReference, data: Record<string, unknown>): unknown; delete(ref: DocumentReference): unknown };
type EventInput = Partial<Pick<ContractHistoryEvent, "title" | "kind" | "changes" | "atMs">> & { actorEmail: string | null };
const safeId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,100}$/.test(id);

/** Call inside the SAME transaction/batch as the contract mutation. A batch
 * caller must guard the source snapshot with lastUpdateTime (including deletes
 * on transfer), so concurrent edits cannot fork or overwrite the history. */
export function withContractHistory(writer: Writer, ref: DocumentReference, before: Record<string, unknown>, patch: Record<string, unknown>, input: EventInput): Record<string, unknown> {
  writeClientContractLink(writer, ref, before, patch, input.kind === "transfer");
  invalidateHallContractChange(writer, ref, before, patch);
  const changes = input.changes ?? contractHistoryChanges(before, patch);
  if (!changes.length && !input.kind) return patch;
  const hasHistory = safeId(before.contractHistoryId);
  const historyId = hasHistory ? before.contractHistoryId as string : randomUUID();
  const events = ref.firestore.collection(CONTRACT_HISTORIES_COLLECTION).doc(historyId).collection("events");
  if (!hasHistory && input.kind !== "created") {
    for (const event of legacyContractHistory(before)) {
      writer.set(events.doc(event.id), { ...event, sortAtMs: event.atMs ?? 0 });
    }
  }
  const event: ContractHistoryEvent = {
    id: randomUUID(), kind: input.kind ?? "updated", title: input.title ?? "Úprava smlouvy",
    actorEmail: input.actorEmail, atMs: input.atMs ?? Date.now(), changes,
  };
  writer.set(events.doc(event.id), { ...event, sortAtMs: event.atMs ?? 0 });
  let notesFields = {};
  if (input.kind === "transfer") {
    const notesPath = typeof before.contractNotesPath === "string" ? before.contractNotesPath : ref.path;
    notesFields = { contractNotesPath: notesPath };
    writer.set(contractNoteLocationRef(ref.firestore.doc(notesPath)), {
      ownerEmail: patch.userEmail, entryId: ref.id,
      contractPath: `users/${patch.userEmail}/entries/${ref.id}`,
    });
  }
  return { ...patch, ...notesFields, contractHistoryId: historyId, contractHistoryStartedAtMs: before.contractHistoryStartedAtMs ?? event.atMs };
}

export async function readContractHistory(ref: DocumentReference, contract: Record<string, unknown>, cursor: string | null) {
  if (!safeId(contract.contractHistoryId)) return { events: legacyContractHistory(contract).reverse(), nextCursor: null };
  const events = ref.firestore.collection(CONTRACT_HISTORIES_COLLECTION).doc(contract.contractHistoryId).collection("events");
  let query = events.orderBy("sortAtMs", "desc").orderBy(FieldPath.documentId(), "desc");
  if (cursor) {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2 || !Number.isSafeInteger(parsed[0]) || !safeId(parsed[1])) throw new Error("Neplatná stránka historie.");
    query = query.startAfter(parsed[0], parsed[1]);
  }
  const snap = await query.limit(26).get();
  const page = snap.docs.slice(0, 25);
  const last = page.at(-1);
  return {
    events: page.map(doc => {
      const { kind, title, actorEmail, atMs, changes } = doc.data();
      return { id: doc.id, kind, title, actorEmail, atMs, changes } as ContractHistoryEvent;
    }),
    nextCursor: snap.size > 25 && last ? Buffer.from(JSON.stringify([last.data().sortAtMs, last.id])).toString("base64url") : null,
  };
}
