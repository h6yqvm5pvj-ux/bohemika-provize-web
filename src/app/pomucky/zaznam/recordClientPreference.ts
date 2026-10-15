import { readMeetingRecord, type MeetingRecordContext } from "@/app/lib/meetingRecordPrivacy";
import type { ClientGender } from "./recordClientTexts";

export function readRecordClientGender(owner: MeetingRecordContext): ClientGender {
  for (const kind of ["clientPreferences", "lifeDraft", "carResults"] as const) {
    const saved = readMeetingRecord<{ clientGender?: unknown }>(kind, owner);
    if (saved?.clientGender === "male" || saved?.clientGender === "female") return saved.clientGender;
  }
  return "male";
}
