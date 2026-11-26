import { calendarDate } from "@/app/lib/calendarDates";
import { dedupeCashflowCommissionStatements, statementMonthKey, CASHFLOW_FORECAST_YEARS } from "./helpers";
import type { CashflowCommissionStatementSummary, CashflowItem, ProductFilter, ScopeFilter } from "./types";

export const OFFICE_CONTRIBUTION_CZK = 10_000;
const title = "Příspěvek na kancelář";

function canonicalStatementMonth(statement: CashflowCommissionStatementSummary): string | null {
  const match = statementMonthKey(statement)?.match(/^(\d{4})-(\d{1,2})$/);
  if (!match || Number(match[1]) < 1900 || Number(match[1]) > 2199 || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  return `${Number(match[1])}-${Number(match[2])}`;
}

export function officeContributionForecast(email: string, asOf: Date): CashflowItem[] {
  return Array.from({ length: CASHFLOW_FORECAST_YEARS * 12 + 1 }, (_, offset) => {
    const date = calendarDate(asOf, asOf.getFullYear(), asOf.getMonth() + offset, 1);
    return {
      id: `office-contribution-forecast-${date.getFullYear()}-${date.getMonth() + 1}`,
      date, amount: OFFICE_CONTRIBUTION_CZK, productKey: "unknown", source: "own",
      ownerEmail: email, entryId: null, contractNumber: null, clientName: null,
      commissionLabel: title, isExtraPayout: true, isOfficeContribution: true,
      payoutStatus: "predicted", predictedAmount: OFFICE_CONTRIBUTION_CZK,
      note: "Odhad měsíčního příspěvku podle nastavení. Výplata závisí na splnění podmínek.",
    };
  });
}

/** Statement payouts already include this money. Replace forecasts, never add to the paid total twice. */
export function applyOfficeContributionStatements(
  items: CashflowItem[],
  statements: CashflowCommissionStatementSummary[],
  options: { scopeFilter: ScopeFilter; productFilter: ProductFilter; tipsterMode: boolean },
  asOf: Date,
): CashflowItem[] {
  if (options.tipsterMode || options.scopeFilter === "team" || options.productFilter !== "all") return items;
  const unique = dedupeCashflowCommissionStatements(statements);
  const settledMonths = new Set(unique.map(canonicalStatementMonth).filter(Boolean));
  const actual: CashflowItem[] = [];
  for (const statement of unique) {
    const key = canonicalStatementMonth(statement);
    const amount = statement.officeContributionTotal;
    if (!key || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) continue;
    const [year, month] = key.split("-").map(Number);
    actual.push({
      id: `office-contribution-statement-${statement.id}`, date: calendarDate(asOf, year, month - 1, 1),
      amount, productKey: "unknown", source: "own", ownerEmail: null, entryId: null,
      contractNumber: null, clientName: null, commissionLabel: title,
      isExtraPayout: true, isOfficeContribution: true, isStatementOnly: true,
      payoutStatus: "paid", predictedAmount: 0,
      commissionStatementNumber: statement.statementNumber, commissionStatementPeriod: statement.period,
      note: "Mimořádná provize za produkci 200 bodů / příspěvek na kancelář z provizního výpisu.",
    });
  }
  if (actual.length === 0 && !items.some(item => item.isOfficeContribution)) return items;
  return [...items.filter(item => !item.isOfficeContribution || (
    item.payoutStatus !== "paid" && !settledMonths.has(`${item.date.getFullYear()}-${item.date.getMonth() + 1}`)
  )), ...actual].sort((a, b) => a.date.getTime() - b.date.getTime());
}
