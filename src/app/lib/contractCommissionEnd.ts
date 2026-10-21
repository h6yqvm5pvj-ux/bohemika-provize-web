import { TZDate } from "@date-fns/tz";
import { calendarDate, withDateCalendar, type CalendarDateFactory } from "./calendarDates";
import { estimatePayoutDate } from "./commissionPayoutDate";
import { toDate } from "./formatters";
import { domexSubsequentPayoutYears } from "./productFormulas/domex";

type CommissionEndInput = {
  productKey?: string | null;
  contractSignedDate?: unknown;
  policyStartDate?: unknown;
  acquisitionType?: unknown;
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

export function isContractCommissionEnded(contract: CommissionEndInput | null | undefined, now = new Date()): boolean {
  const end = contractCommissionEndDate(contract);
  return end !== null && now.getTime() >= end.getTime();
}
