import type { OnlineCardAnalyticsEvent } from "@/lib/onlineCardAnalytics";

const pendingVisits = new Map<string, Promise<boolean>>();
const recordedVisits = new Set<string>();

export async function trackOnlineCardEvent(slug: string, event: OnlineCardAnalyticsEvent): Promise<boolean> {
  if (!slug || typeof window === "undefined") return false;

  try {
    const response = await fetch("/api/online-card/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, event }),
      keepalive: true,
    });
    return response.status === 204;
  } catch {
    // Tracking must never interrupt a call, download or other public card action.
    return false;
  }
}

export function trackOnlineCardVisit(slug: string, event: "visit" | "travel_visit" = "visit"): Promise<boolean> {
  if (!slug || typeof window === "undefined") return Promise.resolve(false);
  const visitKey = `online-card:${event}:${slug}`;
  try {
    if (window.sessionStorage.getItem(visitKey)) return Promise.resolve(true);
  } catch {
    // In-memory deduplication also works when the browser blocks session storage.
  }
  if (recordedVisits.has(visitKey)) return Promise.resolve(true);
  const pending = pendingVisits.get(visitKey);
  if (pending) return pending;

  const request = trackOnlineCardEvent(slug, event).then((recorded) => {
    if (recorded) {
      recordedVisits.add(visitKey);
      try {
        window.sessionStorage.setItem(visitKey, "1");
      } catch {
        // The successful visit is still remembered for this page session.
      }
    }
    return recorded;
  }).finally(() => {
    pendingVisits.delete(visitKey);
  });
  pendingVisits.set(visitKey, request);
  return request;
}
