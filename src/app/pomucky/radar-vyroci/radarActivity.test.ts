import { describe, expect, it } from "vitest";
import type { AnniversaryReview } from "@/app/lib/anniversaryReviews";
import { anniversaryStage, hasAnniversaryActivity } from "./radarActivity";

const occurrence = "2026-09-09";
const review = (changes: Partial<AnniversaryReview> = {}): AnniversaryReview => ({
  ownerEmail: "advisor@example.test", entryId: "contract", occurrenceKey: occurrence, ...changes,
});

describe("Radar activity queues", () => {
  it("keeps untouched contracts and empty notes in the new queue", () => {
    expect(hasAnniversaryActivity(undefined, occurrence)).toBe(false);
    expect(hasAnniversaryActivity(review({ note: "  " }), occurrence)).toBe(false);
  });

  it.each(["reached", "no_answer", "meeting", "ignore"] as const)("counts %s as activity", contactOutcome => {
    expect(hasAnniversaryActivity(review({ contactOutcome }), occurrence)).toBe(true);
    expect(anniversaryStage(review({ contactOutcome, handled: true }), occurrence)).toBe("active");
  });

  it("counts a saved note or legacy review even without a contact outcome", () => {
    expect(hasAnniversaryActivity(review({ note: "Volat po 17 h" }), occurrence)).toBe(true);
    expect(hasAnniversaryActivity(review({ handled: true }), occurrence)).toBe(true);
  });

  it("does not hide a new anniversary because of last year's contact history", () => {
    expect(hasAnniversaryActivity(review({ occurrenceKey: "2025-09-09", contactOutcome: "meeting", note: "Schůzka", handled: true, historyCount: 6 }), occurrence)).toBe(false);
    expect(hasAnniversaryActivity(review({ historyCount: 6 }), occurrence)).toBe(false);
  });

  it("requires explicit completion, even for a legacy reviewed case", () => {
    expect(anniversaryStage(review({ handled: true }), occurrence)).toBe("active");
    expect(anniversaryStage(review({ processingStatus: "completed" }), occurrence)).toBe("completed");
    expect(hasAnniversaryActivity(review({ processingStatus: "completed" }), occurrence)).toBe(true);
  });

  it("keeps a reopened case in progress even if it has no note or contact", () => {
    expect(anniversaryStage(review({ processingStatus: "in_progress" }), occurrence)).toBe("active");
  });

  it("does not carry last year's completion into the next anniversary", () => {
    expect(anniversaryStage(review({ occurrenceKey: "2025-09-09", processingStatus: "completed", completedAtMs: 1 }), occurrence)).toBe("new");
  });
});
