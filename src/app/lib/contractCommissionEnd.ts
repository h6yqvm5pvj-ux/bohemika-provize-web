import { TZDate } from "@date-fns/tz";
import { calendarDate, withDateCalendar, type CalendarDateFactory } from "./calendarDates";
import { estimatePayoutDate } from "./commissionPayoutDate";
import { toDate } from "./formatters";
import { domexSubsequentPayoutYears } from "./productFormulas/domex";
import { autoFrequencyCommissionPeriods, type PaymentFrequencyChange } from "./autoPaymentFrequency";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import { activePayoutRecordsAfterFullStornos, COMMISSION_PAYOUT_AMOUNT_TOLERANCE, isStornoPayoutRecord, validPayoutAmount } from "./commissionReceipts";
import { baseCommissionCodeForPayoutComparison } from "./commissionPayoutRules";

type CommissionEndInput = {
  productKey?: string | null;
  contractSignedDate?: unknown;
  policyStartDate?: unknown;
  acquisitionType?: unknown;
  transferEffectiveDate?: string | null;
  entryType?: string | null;
  userEmail?: string | null;
  adviserEmail?: string | null;
  frequencyRaw?: string | null;
  paymentFrequencyChanges?: PaymentFrequencyChange[] | null;
  commissionPayouts?: {
    code?: string | null; amount?: number | null; expectedAmount?: number | null; status?: string | null;
    differenceReason?: string | null; writtenBy?: string | null;
  }[] | null;
};

const prague: CalendarDateFactory = {
  from: value => typeof value === "string"
    ? new TZDate(value, "Europe/Prague")
    : new TZDate(value instanceof Date ? value.getTime() : value, "Europe/Prague"),
  local: (year, month, day, hours, minutes, seconds, milliseconds) =>
    new TZDate(year, month, day, hours, minutes, seconds, milliseconds, "Europe/Prague"),
};

/** End of the historical DOMEX window, matching the cashflow's exclusive cutoff.
 * The first year is followed by four years of subsequent commission.
 * Receipt of a statement or a delayed payment does not extend entitlement.
 */
export function contractCommissionEndDate(contract: CommissionEndInput | null | undefined): Date | null {
  if (contract?.productKey !== "domex") return null;
  const calendar = withDateCalendar(new Date(), prague);
  const signed = toDate(contract.contractSignedDate, { calendar });
  const start = toDate(contract.policyStartDate, { calendar });
  if (!signed || !start || !Number.isFinite(signed.getTime()) || !Number.isFinite(start.getTime())) return null;
  const signedDay = `${signed.getFullYear()}-${String(signed.getMonth() + 1).padStart(2, "0")}-${String(signed.getDate()).padStart(2, "0")}`;
  const years = domexSubsequentPayoutYears(signedDay);
  if (years === null) return null;

  const year = start.getFullYear() + 1 + years;
  // Inherited contracts clamp a leap-day anniversary, as the cashflow does.
  const lastDay = calendarDate(start, year, start.getMonth() + 1, 0).getDate();
  const day = contract.acquisitionType === "inherited" ? Math.min(start.getDate(), lastDay) : start.getDate();
  return estimatePayoutDate(calendarDate(start, year, start.getMonth(), day));
}

export function isContractCommissionEnded(contract: CommissionEndInput | null | undefined, now = new Date(), fallbackOwner?: string | null): boolean {
  const end = contractCommissionEndDate(contract);
  if (!end || !contract) return false;
  if (now.getTime() >= end.getTime()) return true;
  if (contract.entryType === "endorsement" || !contract.frequencyRaw || !contract.commissionPayouts?.length) return false;

  const owner = (contract.userEmail || contract.adviserEmail || fallbackOwner)?.trim().toLowerCase();
  if (!owner) return false;
  const transfer = contract.acquisitionType === "inherited" ? contract.transferEffectiveDate : null;
  if (contract.acquisitionType === "inherited" && !transfer) return false;

  const calendar = withDateCalendar(now, prague);
  const today = endorsementCommissionDay(now);
  const until = endorsementCommissionDay(end);
  if (!today || !until) return false;
  let schedule: ReturnType<typeof autoFrequencyCommissionPeriods>;
  try {
    schedule = autoFrequencyCommissionPeriods({
      ...contract, productKey: "domex", policyStartDate: toDate(contract.policyStartDate, { calendar }),
      contractSignedDate: toDate(contract.contractSignedDate, { calendar }),
    }, until).filter(row => row.code.startsWith("B") && (!transfer || row.period >= transfer));
  } catch {
    // Older entries with inconsistent amendment history can still use the tariff end date.
    return false;
  }
  const last = schedule.at(-1);
  if (!last || last.period > today) return false;

  const receipts = contract.commissionPayouts.filter(payout => payout.writtenBy?.trim().toLowerCase() === owner);
  return schedule.every(({ code }) => {
    const records = activePayoutRecordsAfterFullStornos(receipts.filter(record =>
      baseCommissionCodeForPayoutComparison(record.code) === code), "domex");
    return records.length > 0 && records.every(record => {
      const amount = validPayoutAmount(record.amount);
      const expected = validPayoutAmount(record.expectedAmount);
      if (amount <= 0 || isStornoPayoutRecord(record)) return false;
      return record.status === "paid" || (!record.status && expected > 0 && amount >= expected - COMMISSION_PAYOUT_AMOUNT_TOLERANCE);
    });
  });
}
