import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import { installmentPaymentsPerYear } from "./productFormulas/autoCommission";
import type { CommissionResultItemDTO } from "../types/domain";
import { isSubsequentCommissionItem } from "./inheritedContracts";

export type DomexNeuronPremiumHistoryRecord = {
  premiumKind?: unknown;
  changeReason?: unknown;
  anniversaryDate?: unknown;
  validFrom?: unknown;
  newPremium?: unknown;
  newAnnualPremium?: unknown;
  writtenAtMs?: unknown;
  statementChronologyMs?: unknown;
};

/** Shared policy facts, with no statement identity, recipient or payout data. */
export type DomexNeuronPremiumHistoryChange = {
  effectiveDate: string;
  paymentPremium: number;
};

export type DomexNeuronPremiumHistoryContract = {
  productKey?: string | null;
  frequencyRaw?: string | null;
  inputAmount?: number | null;
  calculationInputAmount?: number | null;
  effectiveInputAmount?: number | null;
  premiumStatementHistory?: readonly DomexNeuronPremiumHistoryRecord[] | null;
  premiumIndexationHistory?: readonly DomexNeuronPremiumHistoryChange[] | null;
};

const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const money = (value: number) => Math.round(value * 100) / 100;

/** Only observed, server-confirmed changes affect the schedule. The current
 * indexation option never reverses an increase already effective in the past. */
export function createDomexNeuronPremiumTimeline(contract: DomexNeuronPremiumHistoryContract) {
  const originalPremium = [contract.inputAmount, contract.calculationInputAmount, contract.effectiveInputAmount]
    .find(positive) ?? null;
  const knownFrequency = ["annual", "semiannual", "quarterly", "monthly"].includes(contract.frequencyRaw ?? "");
  const count = installmentPaymentsPerYear(contract.frequencyRaw);
  const sourceRows: DomexNeuronPremiumHistoryRecord[] = Array.isArray(contract.premiumIndexationHistory)
    ? contract.premiumIndexationHistory.map(change => ({
      premiumKind: "auto_change", changeReason: "indexation",
      anniversaryDate: change?.effectiveDate, newPremium: change?.paymentPremium,
    })) : Array.isArray(contract.premiumStatementHistory) ? contract.premiumStatementHistory : [];
  const rows = contract.productKey === "domexneuron" && knownFrequency ? sourceRows : [];
  const changes = rows.flatMap((row, index) => {
    if (!row || row.premiumKind !== "auto_change" || row.changeReason !== "indexation") return [];
    // Statement validFrom may repeat the original policy start. The computed
    // anniversary is the authoritative effective date whenever present.
    const effectiveDate = endorsementCommissionDay(row.anniversaryDate ?? row.validFrom);
    if (!effectiveDate) return [];
    const paymentPremium = positive(row.newPremium) ? money(row.newPremium)
      : positive(row.newAnnualPremium) ? money(row.newAnnualPremium / count) : null;
    if (!positive(paymentPremium)) return [];
    const chronology = positive(row.statementChronologyMs) ? row.statementChronologyMs
      : positive(row.writtenAtMs) ? row.writtenAtMs : 0;
    return [{ effectiveDate, paymentPremium, chronology, index }];
  }).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.chronology - b.chronology || a.index - b.index);

  const premiumAtDate = (date: unknown): number | null => {
    const day = endorsementCommissionDay(date);
    let premium = originalPremium;
    if (!day) return premium;
    for (const change of changes) {
      if (change.effectiveDate > day) break;
      premium = change.paymentPremium;
    }
    return premium;
  };
  return {
    originalPremium,
    changes: changes.map(({ effectiveDate, paymentPremium }) => ({ effectiveDate, paymentPremium })),
    premiumAtDate,
    ratioAtDate(date: unknown): number {
      const premium = premiumAtDate(date);
      return positive(originalPremium) && positive(premium) ? premium / originalPremium : 1;
    },
  };
}

export const domexNeuronPremiumAtDate = (contract: DomexNeuronPremiumHistoryContract, date: unknown): number | null =>
  createDomexNeuronPremiumTimeline(contract).premiumAtDate(date);

export const domexNeuronPremiumRatioAtDate = (contract: DomexNeuronPremiumHistoryContract, date: unknown): number =>
  createDomexNeuronPremiumTimeline(contract).ratioAtDate(date);

/** A dated display of servicing commissions keeps the stored acquisition
 * commission and its total intact, including manager difference items. */
export function scaleDomexNeuronSubsequentItems(
  contract: DomexNeuronPremiumHistoryContract,
  items: readonly CommissionResultItemDTO[],
  date: unknown,
): CommissionResultItemDTO[] {
  const ratio = domexNeuronPremiumRatioAtDate(contract, date);
  return items.map(item => {
    if (contract.productKey !== "domexneuron" || ratio === 1 || /^TOTAL$/i.test(item.code?.trim() ?? "") ||
      (!/^B/i.test(item.code?.trim() ?? "") && !isSubsequentCommissionItem(item))) return { ...item };
    const amount = money(item.amount * ratio);
    return Number.isFinite(amount) ? { ...item, amount } : { ...item };
  });
}
