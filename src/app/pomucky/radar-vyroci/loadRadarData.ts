import type { User } from "firebase/auth";
import { loadAnniversaryPortfolio } from "@/app/lib/anniversaryPortfolio";
import type { AnniversaryReview } from "@/app/lib/anniversaryReviews";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";

type ReviewsResponse = {
  ok: boolean;
  error?: string;
  reviews?: AnniversaryReview[];
};

/** Return a complete portfolio and reviews together, or fail the entire load. */
export async function loadRadarData(user: User, signal: AbortSignal) {
  signal.throwIfAborted();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const [portfolio, reviews] = await Promise.all([
      loadAnniversaryPortfolio(user, controller.signal),
      fetchAuthedJsonOrThrow<ReviewsResponse>(user, "/api/contracts/anniversary-review", {
        signal: controller.signal,
      }).then(data => {
        if (!data?.ok || !Array.isArray(data.reviews)) {
          throw new Error(data?.error || "Nepodařilo se načíst stav výročí smluv.");
        }
        return data.reviews;
      }),
    ]);
    signal.throwIfAborted();
    return { ...portfolio, reviews };
  } finally {
    // Cancel the other branch on failure without marking the page's own signal
    // aborted: the page must still show the real error and allow a retry.
    controller.abort();
    signal.removeEventListener("abort", onAbort);
  }
}
