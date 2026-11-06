import { baseCommissionCodeForPayoutComparison } from "@/app/lib/commissionPayoutRules";
import { commissionPeriodAfterMonths } from "@/app/lib/commissionPeriodForCode";
import { installmentCommissionScheduleFromCode } from "@/app/lib/productFormulas/autoCommission";
import { ANNUAL_PREMIUM_TOLERANCE, isKooperativaCStatementRow, parseLocalDate, resolveStatementPremiumBasePeriod } from "./statementParsing";
import type { MatchedSystemContract, OtherProductContractPreview, PremiumStatementHistoryEntry } from "./statementTypes";

const money = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
};
const rounded = (value: number) => Math.round(value * 100) / 100;

/** C installment numbers identify a policy year, independently of when a payout arrives. */
export function statementKooperativaPremiumChange(
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null
) {
  const rows = contract.rows.filter(row => isKooperativaCStatementRow(row) && row.commission > 0 && row.base > 0);
  if (!rows.length || !systemContract || systemContract.productKey !== "kooperativaAuto") return null;
  const frequency = systemContract.frequencyRaw;
  const policyStart = parseLocalDate(systemContract.policyStartDate) ?? parseLocalDate(contract.validFrom);
  if (!["annual", "semiannual", "quarterly", "monthly"].includes(frequency ?? "") || !policyStart) {
    return { status: "unavailable" as const, warning: "Pro ověření změny pojistného z C provizí chybí frekvence placení nebo počátek pojištění." };
  }
  const currentPayment = money(systemContract.effectiveInputAmount) ?? money(systemContract.inputAmount) ?? money(systemContract.calculationInputAmount);
  if (currentPayment == null) return { status: "unavailable" as const, warning: "Pro porovnání C provizí chybí původní pojistné smlouvy." };
  const dated = rows.flatMap(row => {
    const code = baseCommissionCodeForPayoutComparison(row.type, "kooperativaAuto");
    const schedule = installmentCommissionScheduleFromCode(code, frequency);
    if (!schedule || schedule.phase !== "subsequent" || schedule.anniversaryNumber == null) return [];
    const anniversary = commissionPeriodAfterMonths(policyStart, schedule.anniversaryNumber * 12);
    if (!anniversary) return [];
    const period = resolveStatementPremiumBasePeriod({ product: row.product, statementBase: row.base,
      systemPaymentBase: currentPayment, systemFrequency: frequency, fallbackPeriod: "payment" });
    const annual = rounded(row.base * (period === "payment" ? schedule.paymentsPerYear : 1));
    return [{ row, schedule, anniversary, annual, period, year: schedule.anniversaryNumber }];
  }).sort((a, b) => b.schedule.paymentIndex - a.schedule.paymentIndex || a.row.id.localeCompare(b.row.id));
  const latest = dated[0];
  if (!latest) return { status: "unavailable" as const, warning: "Pojistný rok C provize se nepodařilo jednoznačně určit." };
  const year = latest.year;
  const currentYear = dated.filter(item => item.year === year);
  const anniversaryRow = currentYear.find(item => item.schedule.isAnniversaryPayment);
  const selected = anniversaryRow ?? latest;
  const conflicts = currentYear.some(item => Math.abs(item.annual - selected.annual) > ANNUAL_PREMIUM_TOLERANCE);
  const count = selected.schedule.paymentsPerYear;
  const annualFromHistory = (entry: PremiumStatementHistoryEntry, previous = false) => {
    const annual = money(previous ? entry.previousAnnualPremium : entry.newAnnualPremium);
    const payment = money(previous ? entry.previousPremium : entry.newPremium);
    if (annual != null) return entry.basePremiumPeriod == null && count > 1 && payment != null &&
      Math.abs(annual - payment) <= ANNUAL_PREMIUM_TOLERANCE ? rounded(annual * count) : annual;
    return payment == null ? null : rounded(payment * (entry.basePremiumPeriod === "annual" ? 1 : count));
  };
  const history = (systemContract.premiumStatementHistory ?? []).flatMap(entry => {
    if (entry.premiumKind !== "auto_initial" && entry.premiumKind !== "auto_change") return [];
    const date = parseLocalDate(entry.anniversaryDate);
    return date ? [{ entry, at: date.getTime(), annual: annualFromHistory(entry) }] : [];
  });
  const anniversaryDate = parseLocalDate(selected.anniversary)!;
  const sameYearHistory = history.find(item => item.at === anniversaryDate.getTime() && item.annual != null &&
    Math.abs(item.annual - selected.annual) <= ANNUAL_PREMIUM_TOLERANCE);
  const previousYear = dated.find(item => item.year < year);
  const previousYearRows = previousYear && dated.filter(item => item.year === previousYear.year);
  const previousYearAnnual = previousYearRows && previousYearRows.every(item =>
    Math.abs(item.annual - previousYear.annual) <= ANNUAL_PREMIUM_TOLERANCE) ? previousYear.annual : null;
  const priorHistory = history.filter(item => item.at < anniversaryDate.getTime() && item.annual != null)
    .sort((a, b) => b.at - a.at)[0];
  const previousAnnualPremium = previousYearAnnual ?? (sameYearHistory && annualFromHistory(sameYearHistory.entry, true)) ??
    priorHistory?.annual ?? rounded(currentPayment * count);
  const annualDifference = rounded(selected.annual - previousAnnualPremium);
  const confirmedAnniversary = !conflicts && Boolean(anniversaryRow || sameYearHistory);
  const warning = conflicts
    ? "Základny C provizí v jednom pojistném roce se liší. Ověř případnou změnu nebo opravu výpisu."
    : !confirmedAnniversary && Math.abs(annualDifference) > ANNUAL_PREMIUM_TOLERANCE
      ? "Odlišná základna je u splátky uvnitř pojistného roku. Ověř výroční výplatu; samotná splátka nepotvrzuje nové výroční pojistné."
      : null;
  return { status: "resolved" as const, warning, base: selected.row.base, period: selected.period,
    previousAnnualPremium, annualPremium: selected.annual, paymentPremium: rounded(selected.annual / count),
    paymentsPerYear: count, anniversaryDate, anniversaryNumber: year, confirmedAnniversary };
}
