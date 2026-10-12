import { TZDateMini } from "@date-fns/tz/date/mini";
import { tzOffset } from "@date-fns/tz/tzOffset";
import { calendarDate, withDateCalendar, type CalendarDateFactory } from "@/app/lib/calendarDates";
import { CASHFLOW_SHADOW_MAX_AGE_MS } from "@/app/cashflow/shadowProtocol";

/** Native Date chooses the earlier instant when a local time occurs twice.
 * TZDateMini can choose the later one on a UTC host. An earlier candidate is
 * accepted only if all calendar fields are identical. Instants loaded from
 * timestamps/offset strings are never disambiguated or changed.
 */
function preferEarlierFold(date: CashflowCalendarDate): CashflowCalendarDate {
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return date;
  const delta = Math.round((tzOffset(date.timeZone!, new Date(ms - 86_400_000)) - tzOffset(date.timeZone!, date)) * 60_000);
  if (!(delta > 0)) return date;
  const earlier = new TZDateMini(ms - delta, date.timeZone);
  if (["getFullYear", "getMonth", "getDate", "getHours", "getMinutes", "getSeconds", "getMilliseconds"]
    .every(method => {
      const getter = method as "getFullYear";
      return earlier[getter]() === date[getter]();
    })) date.setTime(earlier.getTime());
  return date;
}

class CashflowCalendarDate extends TZDateMini {}
// Local setters have native compatible disambiguation; UTC setters/setTime
// retain absolute instants, including an actually paid second fold occurrence.
for (const method of ["setFullYear", "setMonth", "setDate", "setHours", "setMinutes", "setSeconds", "setMilliseconds"] as const) {
  const setter = TZDateMini.prototype[method] as (...args: number[]) => number;
  Object.defineProperty(CashflowCalendarDate.prototype, method, {
    value(this: CashflowCalendarDate, ...args: number[]) {
      setter.apply(this, args);
      return preferEarlierFold(this).getTime();
    }, configurable: true, writable: true,
  });
}

/** Validated IANA zone; no environment writes, global Date replacement or account cache. */
export function cashflowCalendarDate(asOfMs: number, timeZone: string): Date | null {
  try {
    const canonicalZone = new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions().timeZone;
    if (/^[+-]/.test(canonicalZone) || !Number.isFinite(new Date(asOfMs).getTime())) return null;
    if (canonicalZone === Intl.DateTimeFormat().resolvedOptions().timeZone) return new Date(asOfMs);
    const factory: CalendarDateFactory = {
      from(value) {
        if (typeof value === "string") {
          const text = value.trim();
          // Date-only ISO strings have UTC semantics in native Date. Preserve them.
          // ISO date-times without an offset have local calendar semantics.
          const local = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
          if (local) {
            if (!Number.isFinite(new Date(`${text}Z`).getTime())) return new TZDateMini(NaN, canonicalZone);
            return preferEarlierFold(new CashflowCalendarDate(Number(local[1]), Number(local[2]) - 1, Number(local[3]),
              Number(local[4]), Number(local[5]), Number(local[6] ?? 0), Number((local[7] ?? "0").padEnd(3, "0")), canonicalZone));
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(text) && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
            // A host-dependent legacy parser cannot prove browser equivalence.
            throw new Error("Unsupported cashflow date format");
          }
        }
        return typeof value === "string" ? new CashflowCalendarDate(value, canonicalZone)
          : new CashflowCalendarDate(value instanceof Date ? value.getTime() : value, canonicalZone);
      },
      local: (year, month, day, hours, minutes, seconds, milliseconds) =>
        preferEarlierFold(new CashflowCalendarDate(year, month, day, hours, minutes, seconds, milliseconds, canonicalZone)),
    };
    return withDateCalendar(new Date(asOfMs), factory);
  } catch { return null; }
}

/** Freshness is evaluated in the same calendar as the computation, including midnight. */
export function isCashflowCalendarCurrent(asOf: Date, nowMs = Date.now()): boolean {
  if (!Number.isFinite(asOf.getTime()) || !Number.isFinite(nowMs) ||
    Math.abs(nowMs - asOf.getTime()) > CASHFLOW_SHADOW_MAX_AGE_MS) return false;
  const now = calendarDate(asOf, nowMs);
  return asOf.getFullYear() === now.getFullYear() && asOf.getMonth() === now.getMonth() && asOf.getDate() === now.getDate();
}
