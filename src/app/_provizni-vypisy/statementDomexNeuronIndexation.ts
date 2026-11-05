import { isDomexNeuronStatementProduct, resolveDomexNeuronIndexation, type DomexNeuronIndexationResult } from "@/app/lib/domexNeuronIndexation";
import { createDomexNeuronPremiumTimeline } from "@/app/lib/domexNeuronPremiumHistory";
import { commissionPeriodForCode } from "@/app/lib/commissionPeriodForCode";
import { domexNeuronSubsequentCoefficient } from "@/app/lib/productFormulas/domexNeuron";
import { installmentPaymentsPerYear } from "@/app/lib/productFormulas/autoCommission";
import type { CommissionResultItemDTO } from "@/app/types/domain";
import { normalizePositionValue } from "./statementSystemContracts";
import { formatMoney, normalizeCommissionTitle, normalizeStatementCommissionCode, parseLocalDate, parsePeriodEndDate, toDateInputValue } from "./statementParsing";
import { statementCommissionGroups } from "./statementCommissionComparisons";
import type { CommissionRow, MatchedSystemContract } from "./statementTypes";

type IndexationRow = Pick<CommissionRow, "type" | "base" | "commission" | "product"> & Partial<Pick<CommissionRow, "validFrom">>;
type Options = {
  rows: IndexationRow[];
  contract: MatchedSystemContract | null;
  statementPeriod?: string | null;
  source?: "own" | "manager";
  trustedItems?: CommissionResultItemDTO[];
  careerMismatch?: boolean;
};
type StatementIndexationResult = DomexNeuronIndexationResult & { historicalExpectedCommission?: number };
const money = (value: number) => Math.round(value * 100) / 100;

/** A stored per-payment B item is independent evidence of the agreed rate.
 * Never derive a coefficient from the amount currently being reviewed. */
function storedSubsequentCoefficient(contract: MatchedSystemContract, items: CommissionResultItemDTO[]): number | null {
  const payment = contract.inputAmount ?? contract.calculationInputAmount;
  if (typeof payment !== "number" || !Number.isFinite(payment) || payment <= 0) return null;
  const amounts = items.filter(item => {
    const code = normalizeStatementCommissionCode(item.code);
    const title = normalizeCommissionTitle(item.title);
    return /^B(?:C)?\d+(?:-B(?:C)?\d+)?$/.test(code) && !title.includes("za rok") &&
      typeof item.amount === "number" && Number.isFinite(item.amount) && item.amount > 0;
  }).map(item => item.amount);
  const unique = [...new Set(amounts)];
  return unique.length === 1 ? unique[0] / payment : null;
}

export function statementDomexNeuronIndexation({ rows, contract, statementPeriod, source = "own", trustedItems, careerMismatch = false }: Options): StatementIndexationResult {
  const row = rows[0];
  if (!row || !contract) return { applicable: false, status: "not_applicable" };
  const position = normalizePositionValue(contract.position);
  const coefficient = storedSubsequentCoefficient(contract, trustedItems ?? contract.items ?? []) ??
    (source === "own" && position ? domexNeuronSubsequentCoefficient(position) : null);
  const reference = parsePeriodEndDate(statementPeriod) ?? parseLocalDate(row.validFrom);
  const referenceDay = reference ? toDateInputValue(reference) : null;
  const period = commissionPeriodForCode(contract, row.type);
  const historyDay = period && referenceDay ? period < referenceDay ? period : referenceDay : null;
  const timeline = createDomexNeuronPremiumTimeline(contract);
  const knownChange = historyDay && timeline.changes.some(change => change.effectiveDate <= historyDay);
  const paymentPremium = knownChange ? timeline.premiumAtDate(historyDay) : null;
  const count = installmentPaymentsPerYear(contract.frequencyRaw);
  const historicalExpectedCommission = paymentPremium && coefficient && isDomexNeuronStatementProduct({ productCode: row.product })
    ? money(paymentPremium * coefficient) : undefined;
  const result = resolveDomexNeuronIndexation({
    contract: { ...contract, position },
    row: { productCode: row.product, commissionCode: row.type, basePremium: row.base, commission: row.commission, source },
    coefficient,
    previousAnnualPremium: paymentPremium ? money(paymentPremium * count) : undefined,
    referenceDate: referenceDay,
  });
  // One code is one payout. Duplicate rows and a career mismatch cannot prove
  // that an overpayment is caused by an anniversary premium increase.
  if (!result.applicable) return result;
  if (rows.length !== 1 || careerMismatch) return { applicable: true, status: "unproven", historicalExpectedCommission };
  if (result.status === "confirmed") return result;
  if (historicalExpectedCommission !== undefined && paymentPremium && isDomexNeuronStatementProduct({ productCode: row.product })) {
    // Later installments use already confirmed policy facts for their own
    // entitlement period. This validates a payout; it never creates history.
    const annualPremium = money(paymentPremium * count);
    const periodOfBase = Math.abs(row.base - annualPremium) <= 0.02 ? "annual"
      : Math.abs(row.base - paymentPremium) <= 0.02 ? "payment" : null;
    if (periodOfBase && Math.abs(row.commission - historicalExpectedCommission) <= 0.02) {
      return { applicable: true, status: "confirmed", expectedCommission: historicalExpectedCommission,
        paymentPremium, annualPremium, basePremiumPeriod: periodOfBase };
    }
  }
  return { ...result, historicalExpectedCommission };
}

export function domexNeuronStatementExpectation(options: Options & { expectedAmount: number }) {
  const indexation = statementDomexNeuronIndexation(options);
  const confirmed = indexation.status === "confirmed";
  return {
    amount: confirmed ? indexation.expectedCommission! : indexation.historicalExpectedCommission ?? options.expectedAmount,
    acceptHigherCommission: indexation.applicable ? false : undefined,
    detailLines: confirmed ? [
      `Valorizace pojistného: potvrzená výroční základna ${formatMoney(indexation.paymentPremium!)} Kč za platbu (${formatMoney(indexation.annualPremium!)} Kč ročně). Následná provize odpovídá uloženému koeficientu.`,
    ] : undefined,
    indexation,
  };
}

export function domexNeuronStatementBaseIsConfirmed(options: Omit<Options, "rows"> & { rows: CommissionRow[]; statementBase: number }): boolean {
  const sameBase = options.rows.filter(row => row.base === options.statementBase);
  return sameBase.length > 0 && statementCommissionGroups(sameBase).every(group =>
    statementDomexNeuronIndexation({ ...options, rows: group.rows }).status === "confirmed");
}
