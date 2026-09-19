import { formatMoney, parseLocalDate, parsePeriodEndDate, parsePeriodStartDate } from "./statementParsing";
import type { SavedCommissionStatement } from "./statementTypes";

const monthFormatter = new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric", timeZone: "UTC" });

/** The payout month differs from the period in which the commission was earned. */
function statementPayoutMonth(statement: SavedCommissionStatement): Date | null {
  const key = statement.payoutMonthKey?.trim().match(/^(\d{4})-(\d{1,2})$/);
  let month: Date | null = null;
  if (key && Number(key[2]) >= 1 && Number(key[2]) <= 12) {
    month = new Date(Date.UTC(Number(key[1]), Number(key[2]) - 1, 1));
  } else {
    const issued = parseLocalDate(statement.statementDate);
    const periodEnd = parsePeriodEndDate(statement.period) ?? parseLocalDate(statement.periodEndMs);
    if (issued) month = new Date(Date.UTC(issued.getFullYear(), issued.getMonth(), 1));
    else if (periodEnd) month = new Date(Date.UTC(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 1));
  }
  return month;
}

export function statementPayoutTitle(statement: SavedCommissionStatement): string {
  const month = statementPayoutMonth(statement);
  if (!month) return "Výplata bez data";
  const label = monthFormatter.format(month);
  return `Výplata ${label.charAt(0).toLocaleUpperCase("cs-CZ")}${label.slice(1)}`;
}

export function statementHistoryPeriod(statement: SavedCommissionStatement): string {
  const start = parsePeriodStartDate(statement.period) ?? parseLocalDate(statement.periodStartMs);
  const end = parsePeriodEndDate(statement.period) ?? parseLocalDate(statement.periodEndMs);
  if (!start || !end) return statement.period?.trim() ? `Za období ${statement.period.trim()}` : "Období neuvedeno";
  const dayMonth = (date: Date) => `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.`;
  const startYear = start.getFullYear() === end.getFullYear() ? "" : start.getFullYear();
  return `Za období ${dayMonth(start)}${startYear} – ${dayMonth(end)}${end.getFullYear()}`;
}

const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("cs-CZ").replace(/(\d)\.(?=\d{3}(?:\D|$))/g, "$1")
  .replace(/,/g, ".").replace(/\s+/g, " ").trim();

export function matchesStatementHistorySearch(statement: SavedCommissionStatement, query: string): boolean {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  if (!terms.length) return true;
  const title = statementPayoutTitle(statement);
  const date = statementPayoutMonth(statement);
  const month = date ? date.getUTCMonth() + 1 : null;
  const year = date?.getUTCFullYear();
  const paddedMonth = String(month).padStart(2, "0");
  const monthKeys = month && year ? `${year}-${paddedMonth} ${month}/${year} ${paddedMonth}/${year} ${month}.${year} ${paddedMonth}.${year}` : "";
  const amount = typeof statement.payoutTotal === "number" && Number.isFinite(statement.payoutTotal)
    ? `${statement.payoutTotal.toFixed(2)} ${formatMoney(statement.payoutTotal)} Kč` : "";
  const text = normalizeSearch(`${title} ${monthKeys} ${amount}`);
  return terms.every((term) => text.includes(term));
}
