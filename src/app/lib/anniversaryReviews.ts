import { TZDate } from "@date-fns/tz";

/** Stored meeting times are Czech civil times without a UTC offset. */
export function pragueMeetingStart(value: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!parts) return null;
  const [year, month, day, hour, minute] = parts.slice(1).map(Number);
  const start = new TZDate(year, month - 1, day, hour, minute, "Europe/Prague");
  return start.toISOString().slice(0, 16) === value ? new Date(start.getTime()) : null;
}

export type ContactOutcome = "reached" | "no_answer" | "meeting" | "ignore";
export const CONTACT_OUTCOMES = new Set<ContactOutcome>(["reached", "no_answer", "meeting", "ignore"]);

export type AnniversaryReview = {
  ownerEmail: string;
  entryId: string;
  occurrenceKey: string;
  contactOutcome?: ContactOutcome | null;
  note?: string | null;
  meetingAt?: string | null;
  callbackOn?: string | null;
  handled?: boolean;
  processingStatus?: "in_progress" | "completed" | null;
  completedAtMs?: number | null;
  completedBy?: string | null;
  reviewedBy?: string | null;
  historyCount?: number;
};

export type AnniversaryHistoryEvent = {
  id: string;
  sequence: number;
  kind: "contact" | "note" | "reviewed" | "reopened" | "completed" | "legacy";
  occurrenceKey: string;
  contactOutcome: ContactOutcome | null;
  note: string | null;
  meetingAt: string | null;
  callbackOn?: string | null;
  actorEmail: string | null;
  createdAtMs: number | null;
};

export type AnniversaryHistoryResponse = {
  ok: boolean;
  error?: string;
  history: AnniversaryHistoryEvent[];
  hasMore: boolean;
  nextCursor: number | null;
};

export type AnniversaryReviewMutationResponse = {
  ok: boolean;
  error?: string;
  review: AnniversaryReview;
};
