import { calendarDate } from "./calendarDates";

export function estimatePayoutDate(
  policyStart: Date,
  agreementDate?: Date | null,
  cutoffDay = 25,
  payoutDay = 25
): Date {
  // Cutoff follows signing; subsequent periods use their own start day.
  const dayForCutoff = (agreementDate ?? policyStart).getDate();
  return calendarDate(policyStart, policyStart.getFullYear(), policyStart.getMonth() +
    (dayForCutoff > cutoffDay ? 2 : 1), payoutDay);
}
