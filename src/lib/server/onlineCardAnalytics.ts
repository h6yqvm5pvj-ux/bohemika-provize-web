import { FieldValue } from "firebase-admin/firestore";

import type { OnlineCardAnalyticsEvent } from "@/lib/onlineCardAnalytics";
import { adminDb } from "@/lib/server/firebaseAdmin";

function pragueDayKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function recordOnlineCardAnalyticsEvent({
  ownerEmail,
  slug,
  event,
}: {
  ownerEmail: string;
  slug: string;
  event: OnlineCardAnalyticsEvent;
}): Promise<void> {
  if (!adminDb || !ownerEmail || !slug) return;

  const day = pragueDayKey();
  const dayRef = adminDb
    .collection("onlineCardAnalytics")
    .doc(ownerEmail)
    .collection("days")
    .doc(day);

  await dayRef.set(
    {
      day,
      ownerEmail,
      slug,
      updatedAt: FieldValue.serverTimestamp(),
      [`events.${event}`]: FieldValue.increment(1),
    },
    { merge: true }
  );
}
