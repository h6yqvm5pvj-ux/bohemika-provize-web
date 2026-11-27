import type { CommissionResultItemDTO } from "../types/domain";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import { calculateNeonDecreaseStornoBase, confirmedNeonRefreshAnnualBase, projectNeonImmediateDeduction } from "./productFormulas/neon";

type Estimate = { items?: CommissionResultItemDTO[] | null; total?: number | null };
type Entry = Parameters<typeof confirmedNeonRefreshAnnualBase>[0] & Estimate & {
  id: string; userEmail?: string | null; adviserEmail?: string | null; originalEntryId?: string | null; source?: string;
  contractNumber?: string | null; rootContractEntryId?: string | null; parentContractEntryId?: string | null;
  policyStartDate?: unknown; previousInputAmount?: number | null; newInputAmount?: number | null;
  effectiveInputAmount?: number | null; calculationInputAmount?: number | null; inputAmount?: number | null;
  result?: Estimate | null; managerOverrides?: Estimate[] | null;
};

const familyKey = (entry: Entry, root: string) =>
  JSON.stringify([(entry.adviserEmail || entry.userEmail)?.trim().toLowerCase(), entry.contractNumber?.trim(), entry.source ?? "own", root]);

/** Reprice only identifiable calculator estimates in an already authorized family. */
export function projectNeonRefreshDecreaseEstimates<T extends Entry>(entries: T[], timeline: T[] = entries): T[] {
  const roots = new Map<string, T>();
  // Cashflow can supply manager schedules separately from the underlying adviser timeline.
  for (const root of timeline === entries ? entries : timeline.concat(entries)) {
    if (root.userEmail && root.contractNumber && confirmedNeonRefreshAnnualBase(root) != null) {
      roots.set(familyKey(root, root.originalEntryId ?? root.id), root);
    }
  }
  if (!roots.size) return entries;
  return entries.map(entry => {
    if (entry.entryType !== "endorsement" || entry.productKey !== "neon" || !entry.rootContractEntryId ||
        entry.parentContractEntryId !== entry.rootContractEntryId || entry.previousInputAmount == null || entry.newInputAmount == null ||
        entry.newInputAmount >= entry.previousInputAmount || !entry.items?.length) return entry;
    const root = roots.get(familyKey(entry, entry.rootContractEntryId));
    if (!root || entry.previousInputAmount !== (root.effectiveInputAmount ?? root.inputAmount)) return entry;
    const dates = { originalStornoStartDateIso: endorsementCommissionDay(root.policyStartDate),
      endorsementPolicyStartDateIso: endorsementCommissionDay(entry.policyStartDate) };
    if (!dates.originalStornoStartDateIso || !dates.endorsementPolicyStartDateIso ||
        dates.originalStornoStartDateIso > dates.endorsementPolicyStartDateIso) return entry;
    const inputs = { ...dates, previousMonthlyPremium: entry.previousInputAmount, newMonthlyPremium: entry.newInputAmount };
    const corrected = calculateNeonDecreaseStornoBase({ ...inputs, confirmedRefreshAnnualBase: confirmedNeonRefreshAnnualBase(root) });
    if (!corrected?.coversRefreshBase || !corrected.remainingRatio) return entry;
    const legacy = calculateNeonDecreaseStornoBase(inputs);
    if (!legacy || (entry.calculationInputAmount ?? entry.inputAmount) !== legacy.calculationMonthlyPremium) return entry;

    // Intercommission items were calculated on the amendment base at the manager's then-applicable rate.
    const rescaleOverride = (estimate: Estimate) => {
      if (!estimate.items?.length || !estimate.items.every(item => Number.isFinite(item.amount) && item.amount < 0)) return estimate;
      const scaled = projectNeonImmediateDeduction(estimate.items, corrected.calculationMonthlyPremium / legacy.calculationMonthlyPremium);
      return scaled?.items.length === estimate.items.length ? { ...estimate, ...scaled } : estimate;
    };
    let plan: Estimate;
    if (entry.source === "manager") {
      plan = rescaleOverride(entry);
      if (plan === entry) return entry;
    } else {
      const source = root.result?.items ?? root.items ?? [];
      const previous = projectNeonImmediateDeduction(source, legacy.commissionRatio);
      if (!previous || previous.items.length !== entry.items.length || !entry.items.every((item, i) =>
        item.amount === previous.items[i].amount && (item.code || item.title) === (previous.items[i].code || previous.items[i].title))) return entry;
      const revised = projectNeonImmediateDeduction(source, corrected.commissionRatio);
      if (!revised || revised.items.length !== entry.items.length) return entry;
      plan = { items: entry.items.map((item, i) => ({ ...item, amount: revised.items[i].amount })), total: revised.total };
    }
    return { ...entry, items: plan.items, total: plan.total,
      ...(entry.result ? { result: { ...entry.result, items: plan.items, total: plan.total } } : {}),
      ...(entry.managerOverrides ? { managerOverrides: entry.managerOverrides.map(rescaleOverride) } : {}),
      inputAmount: corrected.calculationMonthlyPremium, calculationInputAmount: corrected.calculationMonthlyPremium };
  });
}
