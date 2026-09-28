import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { hallPeriodRanges } from "./hallOfFame";

const FIELDS = ["userEmail", "productKey", "inputAmount", "frequencyRaw", "contractSignedDate", "createdAt", "acquisitionType"];
const localTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

// Resolve wall-clock midnight without relying on the server's timezone or a
// fixed UTC offset. The offset changes within the selectable twelve months.
function pragueMidnight(day: string): Date {
  const wall = Date.parse(`${day}T00:00:00Z`);
  let instant = wall;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(localTime.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const represented = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    if (represented === wall) break;
    instant += wall - represented;
  }
  return new Date(instant);
}

export function hallEntryReadWindow(now: Date) {
  const { startDate, endDate } = hallPeriodRanges(now).year;
  const tomorrow = new Date(`${endDate}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return { from: pragueMidnight(startDate), to: pragueMidnight(tomorrow.toISOString().slice(0, 10)) };
}

/** Read only the selectable interval for Timestamp/numeric dates. Legacy text,
 * arrays and serialized timestamps require a separate compatibility read:
 * Firestore cursors order strings and these types after native timestamps.
 * Keep the existing final date/owner filters at the call site. */
export async function readHallEntryDocuments(db: Firestore, ownerEmails: string[], now: Date): Promise<QueryDocumentSnapshot[]> {
  if (!ownerEmails.length) return [];
  if (ownerEmails.length > 10) throw new Error("Příliš mnoho poradců v jedné dávce síně slávy.");
  const { from, to } = hallEntryReadWindow(now);
  // Admin SDK Timestamp.toDate() rounds sub-millisecond precision. Include the
  // millisecond just before the lower boundary and let the existing date filter
  // decide, so a timestamp rounded up to midnight keeps its previous ranking.
  const timestampFrom = new Date(from.getTime() - 1);
  const base = db.collectionGroup("entries").where("userEmail", "in", ownerEmails).select(...FIELDS);
  const queries = ["contractSignedDate", "createdAt"].flatMap(field => [
    base.where(field, ">=", timestampFrom).where(field, "<", to),
    base.where(field, ">=", from.getTime()).where(field, "<", to.getTime()),
    // A cursor (not a string inequality) deliberately includes map/array dates.
    base.orderBy(field).startAt(""),
  ]);
  // At most two concurrent queries per owner batch, alongside the existing bounded batches.
  // A failed subquery rejects the whole result; never publish a partial ranking.
  const docs = new Map<string, QueryDocumentSnapshot>();
  let next = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (next < queries.length) {
      const snapshot = await queries[next++].get();
      for (const doc of snapshot.docs) docs.set(doc.ref.path, doc);
    }
  }));
  // Preserve the former collection-group document order, including old duplicate
  // owner/id pairs stored at different paths; the aggregate keeps the first one.
  return [...docs.values()].sort((a, b) => Buffer.compare(Buffer.from(a.ref.path), Buffer.from(b.ref.path)));
}
