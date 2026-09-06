import type { AnniversaryReview } from "@/app/lib/anniversaryReviews";

export type RadarActivityStage = "new" | "active" | "completed";
export type RadarActivityFilter = RadarActivityStage | "all";

export const RADAR_STAGE_LABELS: Record<RadarActivityStage, string> = {
  new: "Nezpracované", active: "Rozpracované", completed: "Dokončené",
};

// History spans several anniversaries. Only the current anniversary's saved
// contact, review or note belongs in the active queue.
export function hasAnniversaryActivity(
  review: AnniversaryReview | undefined,
  occurrenceKey: string,
): boolean {
  return review?.occurrenceKey === occurrenceKey && Boolean(
    review.processingStatus === "in_progress" || review.processingStatus === "completed" ||
    review.contactOutcome || review.handled || review.note?.trim(),
  );
}

export function anniversaryStage(review: AnniversaryReview | undefined, occurrenceKey: string): RadarActivityStage {
  if (review?.occurrenceKey === occurrenceKey && review.processingStatus === "completed") return "completed";
  return hasAnniversaryActivity(review, occurrenceKey) ? "active" : "new";
}
