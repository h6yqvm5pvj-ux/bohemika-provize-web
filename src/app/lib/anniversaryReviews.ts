export type ContactOutcome = "reached" | "no_answer" | "meeting" | "ignore";
export const CONTACT_OUTCOMES = new Set<ContactOutcome>(["reached", "no_answer", "meeting", "ignore"]);

export type AnniversaryReview = {
  ownerEmail: string;
  entryId: string;
  occurrenceKey: string;
  contactOutcome?: ContactOutcome | null;
  note?: string | null;
  meetingAt?: string | null;
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
