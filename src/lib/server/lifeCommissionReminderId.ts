import { createHash } from "node:crypto";
import { lifeCommissionReminderMessageMonth } from "@/app/lib/lifeCommissionReminder";

export function lifeCommissionReminderId(uid: string, month: string): string {
  const accountKey = createHash("sha256").update(uid).digest("hex").slice(0, 24);
  return `life-commission-reminder-${month}-${accountKey}`;
}

export function isLifeCommissionReminderIdForAccount(id: string, uid: string): boolean {
  const month = lifeCommissionReminderMessageMonth(id);
  return Boolean(month && uid && lifeCommissionReminderId(uid, month) === id);
}
