import { createHash, randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { toDate } from "@/app/lib/formatters";
import { CONTACT_OUTCOMES, type AnniversaryHistoryEvent, type AnniversaryReview, type ContactOutcome } from "@/app/lib/anniversaryReviews";

export const REVIEWS_COLLECTION = "anniversaryReviews";
const HISTORIES_COLLECTION = "anniversaryReviewHistories";
const HISTORY_PAGE_SIZE = 20;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const outcome = (value: unknown): ContactOutcome | null => CONTACT_OUTCOMES.has(value as ContactOutcome) ? value as ContactOutcome : null;

export const reviewDocId = (ownerEmail: string, entryId: string) => `${ownerEmail}__${entryId}`;
export const safeId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200 && !value.includes("/") && !value.includes("..");

export function legacyHistory(data: Record<string, unknown>): AnniversaryHistoryEvent | null {
  if (!data.note && !data.contactOutcome && !data.reviewedAt) return null;
  return {
    id: "legacy", sequence: 1, kind: "legacy", occurrenceKey: text(data.occurrenceKey) ?? "",
    contactOutcome: outcome(data.contactOutcome), note: text(data.note), meetingAt: text(data.meetingAt),
    actorEmail: text(data.updatedBy) ?? text(data.reviewedBy),
    createdAtMs: toDate(data.updatedAt)?.getTime() ?? toDate(data.reviewedAt)?.getTime() ?? null,
  };
}

export function reviewDto(data: Record<string, unknown>): AnniversaryReview {
  return {
    ownerEmail: text(data.ownerEmail) ?? "", entryId: text(data.entryId) ?? "",
    occurrenceKey: text(data.occurrenceKey) ?? "", contactOutcome: outcome(data.contactOutcome),
    note: text(data.note), meetingAt: text(data.meetingAt), reviewedBy: text(data.reviewedBy),
    handled: Boolean(data.reviewedAt || outcome(data.contactOutcome)),
    // A legacy contact/review never implies that the case is complete.
    processingStatus: data.processingStatus === "completed" || data.processingStatus === "in_progress" ? data.processingStatus : null,
    completedAtMs: data.processingStatus === "completed" && typeof data.completedAtMs === "number" && Number.isFinite(data.completedAtMs) ? data.completedAtMs : null,
    completedBy: data.processingStatus === "completed" ? text(data.completedBy) : null,
    historyCount: typeof data.historyCount === "number" ? data.historyCount : legacyHistory(data) ? 1 : 0,
  };
}

export async function readReviewHistory(db: Firestore, ownerEmail: string, entryId: string, before: number | null) {
  const review = await db.collection(REVIEWS_COLLECTION).doc(reviewDocId(ownerEmail, entryId)).get();
  const data = review.data() ?? {};
  if (!safeId(data.historyId)) {
    const legacy = legacyHistory(data);
    return { history: legacy && (before === null || legacy.sequence < before) ? [legacy] : [], hasMore: false, nextCursor: null };
  }
  let query = db.collection(HISTORIES_COLLECTION).doc(data.historyId).collection("events").orderBy("sequence", "desc");
  if (before !== null) query = query.where("sequence", "<", before);
  const snap = await query.limit(HISTORY_PAGE_SIZE + 1).get();
  const history = snap.docs.slice(0, HISTORY_PAGE_SIZE).map(doc => {
    const event = doc.data();
    return {
      id: doc.id, sequence: event.sequence as number,
      kind: event.kind as AnniversaryHistoryEvent["kind"],
      occurrenceKey: text(event.occurrenceKey) ?? "", contactOutcome: outcome(event.contactOutcome),
      note: text(event.note), meetingAt: text(event.meetingAt), actorEmail: text(event.actorEmail),
      createdAtMs: typeof event.createdAtMs === "number" ? event.createdAtMs : null,
    } satisfies AnniversaryHistoryEvent;
  });
  const hasMore = snap.docs.length > HISTORY_PAGE_SIZE;
  return { history, hasMore, nextCursor: hasMore ? history.at(-1)!.sequence : null };
}

export class ReviewMutationError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export type ReviewMutation = {
  action: "save" | "mark" | "clearOutcome" | "unmark" | "complete" | "reopen";
  ownerEmail: string;
  entryId: string;
  occurrenceKey: string | null;
  contractNumber: string | null;
  note?: string | null;
  contactOutcome?: ContactOutcome;
  meetingAt?: string | null;
  requestId?: string;
};

export async function appendReviewHistory(db: Firestore, mutation: ReviewMutation, actorEmail: string) {
  const ref = db.collection(REVIEWS_COLLECTION).doc(reviewDocId(mutation.ownerEmail, mutation.entryId));
  const contractRef = db.collection("users").doc(mutation.ownerEmail).collection("entries").doc(mutation.entryId);
  const eventId = mutation.requestId ?? randomUUID();
  const newHistoryId = randomUUID();
  const fingerprint = createHash("sha256").update(JSON.stringify({ ...mutation, requestId: undefined, actorEmail })).digest("hex");

  return db.runTransaction(async tx => {
    const [snapshot, contract] = await Promise.all([tx.get(ref), tx.get(contractRef)]);
    if (!contract.exists) throw new ReviewMutationError("Smlouva nebyla nalezena. Obnov Radar.", 404);
    const current = snapshot.data() ?? {};
    // The stable pointer is copied with the review during an ownership transfer.
    const historyId = safeId(current.historyId) ? current.historyId : newHistoryId;
    const events = db.collection(HISTORIES_COLLECTION).doc(historyId).collection("events");
    const eventRef = events.doc(eventId);
    const duplicate = await tx.get(eventRef);
    if (duplicate.exists) {
      if (duplicate.data()?.fingerprint !== fingerprint) throw new ReviewMutationError("Tento zápis už byl uložen s jiným obsahem. Otevři nový kontakt.", 409);
      return reviewDto(current);
    }

    const occurrenceKey = mutation.occurrenceKey ?? text(current.occurrenceKey) ?? "";
    const sameOccurrence = current.occurrenceKey === occurrenceKey;
    const wasCompleted = sameOccurrence && current.processingStatus === "completed";
    if (mutation.action === "complete" && wasCompleted) return reviewDto(current);
    if (mutation.action === "reopen" && !wasCompleted) {
      throw new ReviewMutationError("Toto výročí není dokončené. Obnov Radar.", 409);
    }
    if (wasCompleted && (mutation.action === "mark" || mutation.contactOutcome || mutation.action === "clearOutcome" || mutation.action === "unmark")) {
      throw new ReviewMutationError("Případ je dokončený. Nejdřív ho vrať k řešení.", 409);
    }

    const legacy = !current.historyId ? legacyHistory(current) : null;
    let count = Number(current.historyCount) || 0;
    if (legacy) {
      tx.set(events.doc("legacy"), legacy);
      count = 1;
    }
    const next: Record<string, unknown> = {
      ownerEmail: mutation.ownerEmail, entryId: mutation.entryId,
      contractNumber: mutation.contractNumber ?? current.contractNumber ?? null,
      occurrenceKey, historyId, historyCount: count + 1,
      contactOutcome: sameOccurrence ? outcome(current.contactOutcome) : null,
      meetingAt: sameOccurrence ? text(current.meetingAt) : null,
      note: sameOccurrence ? text(current.note) : null,
      reviewedAt: sameOccurrence ? current.reviewedAt ?? null : null,
      reviewedBy: sameOccurrence ? text(current.reviewedBy) : null,
      processingStatus: sameOccurrence ? current.processingStatus ?? null : null,
      completedAtMs: wasCompleted ? current.completedAtMs ?? null : null,
      completedBy: wasCompleted ? text(current.completedBy) : null,
      updatedBy: actorEmail, updatedAt: FieldValue.serverTimestamp(),
    };
    const workflowAction = mutation.action === "complete" || mutation.action === "reopen";
    if (!workflowAction && mutation.note !== undefined) next.note = mutation.note;
    if (!workflowAction && mutation.meetingAt !== undefined) next.meetingAt = mutation.meetingAt;
    let kind: AnniversaryHistoryEvent["kind"] = "note";
    if (mutation.action === "complete") {
      next.processingStatus = "completed";
      next.completedAtMs = Date.now(); next.completedBy = actorEmail;
      kind = "completed";
    } else if (mutation.action === "reopen") {
      next.processingStatus = "in_progress";
      next.completedAtMs = null; next.completedBy = null;
      kind = "reopened";
    } else if (mutation.action === "clearOutcome" || mutation.action === "unmark") {
      next.contactOutcome = null; next.meetingAt = null; next.reviewedAt = null; next.reviewedBy = null;
      if (mutation.action === "unmark") next.note = null;
      next.processingStatus = text(next.note) ? "in_progress" : null;
      kind = "reopened";
    } else if (mutation.contactOutcome || mutation.action === "mark") {
      next.contactOutcome = mutation.contactOutcome ?? next.contactOutcome;
      if (mutation.contactOutcome !== "meeting") next.meetingAt = null;
      next.reviewedAt = FieldValue.serverTimestamp(); next.reviewedBy = actorEmail;
      next.processingStatus = "in_progress";
      kind = mutation.contactOutcome ? "contact" : "reviewed";
    } else if (!wasCompleted && text(next.note)) {
      next.processingStatus = "in_progress";
    }
    const event: AnniversaryHistoryEvent = {
      id: eventId, sequence: count + 1, kind, occurrenceKey,
      contactOutcome: kind === "contact" ? outcome(next.contactOutcome) : null,
      note: workflowAction ? null : text(next.note), meetingAt: kind === "contact" ? text(next.meetingAt) : null,
      actorEmail, createdAtMs: Date.now(),
    };
    tx.set(eventRef, { ...event, fingerprint });
    tx.set(ref, next, { merge: true });
    return reviewDto(next);
  });
}
