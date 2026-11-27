import { pragueMeetingStart } from "@/app/lib/anniversaryReviews";
import { anniversaryRadarTarget } from "@/app/lib/anniversaryRadarLink";

// iCalendar content lines can contain at most 75 UTF-8 octets including
// the continuation space. Split only between Unicode code points.
function foldCalendarLine(line: string): string {
  let output = "";
  let length = 0;
  const encoder = new TextEncoder();
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (length + bytes > 75) { output += "\r\n "; length = 1; }
    output += char;
    length += bytes;
  }
  return output;
}

export async function meetingCalendar(item: { ownerEmail: string; entryId: string; occurrenceKey: string; clientName: string }, meetingAt: string) {
  const start = pragueMeetingStart(meetingAt);
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(item.occurrenceKey)) throw new Error("Neplatný termín schůzky.");
  const stamp = (date: Date) => new Date(date.getTime()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const name = item.clientName.replace(/\p{Cc}/gu, " ").replace(/[\\;,]/g, "\\$&");
  const id = await anniversaryRadarTarget(item.ownerEmail, item.entryId);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Bohemika//Radar vyroci//CS", "BEGIN:VEVENT",
    `UID:${id}-${item.occurrenceKey}@radar.bohemika`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`, "CLASS:PRIVATE", `SUMMARY:Schůzka k výročí – ${name}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].map(foldCalendarLine).join("\r\n");
}
