import {
  activePayoutRecordsAfterFullStornos, commissionStatementDay, COMMISSION_PAYOUT_AMOUNT_TOLERANCE,
  isStornoPayoutRecord, uniqueFamilyCommissionReceipts,
} from "@/app/lib/commissionReceipts";
import { baseCommissionCodeForPayoutComparison } from "@/app/lib/commissionPayoutRules";
import { endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import { calculateNeonDecreaseStornoBase, confirmedNeonRefreshAnnualBase } from "@/app/lib/productFormulas/neon";
import { projectNeonCareReceiptComparisons } from "@/app/lib/neonCareReceiptComparisons";
import { cleanResultTitle, normalizeEmail } from "./contractDetailHelpers";
import type { ContractCommissionPayout, ContractDoc } from "./contractDetailTypes";
import { neonCommissionFamily } from "./contractTimelineDetails";
import { payoutCents } from "./commissionPayoutComparison";

const REFRESH_DEDUCTION_TOLERANCE_CENTS = 100;

// When the reduction covers the confirmed Refresh base, the unearned share of
// the actual payment is additional evidence for matching, independent of the stored forecast.
function refreshDecreaseEvidence(root: ContractDoc, change: ContractDoc, effective: string) {
  const annualBase = confirmedNeonRefreshAnnualBase(root);
  const start = endorsementCommissionDay(root.policyStartDate);
  if (annualBase == null || change.parentContractEntryId !== root.id || !start || start >= effective ||
      change.newInputAmount == null || change.previousInputAmount == null ||
      change.previousInputAmount !== (root.effectiveInputAmount ?? root.inputAmount)) return null;
  const base = calculateNeonDecreaseStornoBase({
    originalStornoStartDateIso: start, endorsementPolicyStartDateIso: effective,
    confirmedRefreshAnnualBase: annualBase,
    previousMonthlyPremium: change.previousInputAmount, newMonthlyPremium: change.newInputAmount,
  });
  if (!base?.coversRefreshBase || !base.remainingRatio) return null;
  return { annualBase, remainingRatio: base.remainingRatio, start, effective, signed: endorsementCommissionDay(change.contractSignedDate) };
}

type Deduction = { row: ContractCommissionPayout; code: string; day: string; cents: number };
type Component = {
  entry: ContractDoc; code: string; effective: string; expectedCents: number; booked: boolean;
  refresh: ReturnType<typeof refreshDecreaseEvidence>;
};

function matchesRefreshDeduction(
  { row, code, day, cents }: Deduction, evidence: NonNullable<ReturnType<typeof refreshDecreaseEvidence>>,
  payments: ContractCommissionPayout[],
) {
  if (!row.key || !row.statementId || day < evidence.start) return false;
  if (day < evidence.effective) {
    // An August statement can book a change effective September 1 and be issued in September.
    const issued = commissionStatementDay({ statementDate: row.statementDate });
    const periodEnd = commissionStatementDay({ statementPeriod: row.statementPeriod });
    if (periodEnd !== day || !issued || issued < evidence.effective || !evidence.signed || evidence.signed > day ||
        !evidence.effective.endsWith("-01") || Date.parse(evidence.effective) - Date.parse(day) !== 86_400_000) return false;
  } else if (day.slice(0, 7) !== evidence.effective.slice(0, 7)) return false;

  const sameBase = (receipt: ContractCommissionPayout) => {
    const base = receipt.sourceBaseAmount ?? receipt.statementBaseAmount;
    return base == null || base === evidence.annualBase;
  };
  if (!sameBase(row)) return false;
  const originals = payments.filter(payment => {
    const paidOn = commissionStatementDay(payment);
    return payment.key && payment.statementId && paidOn && paidOn >= evidence.start && paidOn < evidence.effective &&
      baseCommissionCodeForPayoutComparison(payment.code, "neon") === code;
  });
  if (originals.length !== 1) return false;
  const [original] = originals;
  const paid = payoutCents(original);
  return -cents <= paid && sameBase(original) && (!row.career || !original.career || row.career === original.career) &&
    Math.abs(cents + Math.round(paid * evidence.remainingRatio)) <= REFRESH_DEDUCTION_TOLERANCE_CENTS;
}

function deductionTargets(deduction: Deduction, components: Component[], payments: ContractCommissionPayout[], rootStart: string | null) {
  const { row, day, code, cents } = deduction;
  const periodStart = commissionStatementDay({ statementDate: row.statementPeriod?.match(/^(\s*\d{1,2}\.\s*\d{1,2}\.\s*\d{4})\s*[-–]/)?.[1] });
  const issued = commissionStatementDay({ statementDate: row.statementDate });
  if (periodStart && (day < periodStart || (issued && issued < periodStart))) return [];

  let candidates = components.filter(component => component.code === code && (
    component.effective <= day || (component.refresh && matchesRefreshDeduction(deduction, component.refresh, payments))
  ));
  // Some statement rows give the original policy's start, others identify the amendment itself.
  const validFrom = commissionStatementDay({ statementDate: row.sourceValidFrom });
  if (validFrom && validFrom !== rootStart) candidates = candidates.filter(component => component.effective === validFrom);
  if (candidates.length <= 1) return candidates;

  // Prefer the change in this accounting period to older changes with the same code.
  const inPeriod = periodStart ? candidates.filter(component => component.effective >= periodStart && component.effective <= day) : [];
  if (inPeriod.length) candidates = inPeriod;
  if (candidates.length === 1) return candidates;
  const close = candidates.filter(component => Math.abs(component.expectedCents - cents) <= COMMISSION_PAYOUT_AMOUNT_TOLERANCE * 100);
  return close.length ? close : candidates;
}

/** Allocate statement rows for display without changing the booking history used by other calculations. */
export function neonCommissionDisplayFamily(
  contract: ContractDoc | null, timeline: ContractDoc[], ownerEmail: string | null, viewerEmail: string | null,
): ContractDoc[] {
  const family = projectNeonCareReceiptComparisons(uniqueFamilyCommissionReceipts(neonCommissionFamily(contract, timeline, ownerEmail)));
  const [root, ...amendments] = family;
  const rootRows = root?.commissionPayouts;
  const viewer = normalizeEmail(viewerEmail);
  if (!viewer || !rootRows?.length) return family;
  const cancelled = endorsementCommissionDay(root.stornoDate);
  if (root.status === "storno" && !cancelled) return family;

  const viewerRows = rootRows.filter(row => normalizeEmail(row.writtenBy) === viewer);
  const active = activePayoutRecordsAfterFullStornos(viewerRows, "neon");
  const deductions = active.flatMap(row => {
    const cents = payoutCents(row);
    if (!(row.statementId || row.statementNumber) || cents >= 0 || row.detail?.startsWith("Součást opravného výpisu")) return [];
    const code = baseCommissionCodeForPayoutComparison(row.code, "neon");
    const day = commissionStatementDay(row);
    return day && (!cancelled || day < cancelled) && (code === "A101" || code === "B0301")
      ? [{ row, code, day, cents }] : [];
  });
  if (!deductions.length) return family;
  const payments = active.filter(row => payoutCents(row) > 0 && !row.detail?.startsWith("Součást opravného výpisu"));

  const components: Component[] = amendments.flatMap(entry => {
    const delta = entry.premiumDelta ?? (entry.newInputAmount != null && entry.previousInputAmount != null
      ? entry.newInputAmount - entry.previousInputAmount : null);
    if (entry.changeType && entry.changeType !== "decrease") return [];
    const decrease = delta == null ? entry.changeType === "decrease" : Number.isFinite(delta) && delta < 0;
    const effective = endorsementCommissionDay(entry.policyStartDate);
    if (!decrease || !effective) return [];
    const refresh = !cancelled || effective < cancelled ? refreshDecreaseEvidence(root, entry, effective) : null;
    const items = viewer === normalizeEmail(root.userEmail) ? entry.items
      : entry.managerOverrides?.find(override => normalizeEmail(override.email) === viewer)?.items;
    return (items ?? []).flatMap(item => {
      if (!Number.isFinite(item.amount) || item.amount >= 0) return [];
      const code = baseCommissionCodeForPayoutComparison(
        item.code || cleanResultTitle(item.title).match(/^Provize (A101|B0301)$/i)?.[1], "neon",
      );
      if (code !== "A101" && code !== "B0301") return [];
      const booked = (entry.commissionPayouts ?? []).some(row => normalizeEmail(row.writtenBy) === viewer &&
        isStornoPayoutRecord(row) && baseCommissionCodeForPayoutComparison(row.code, "neon") === code);
      return [{ entry, code, effective, refresh, expectedCents: Math.round(item.amount * 100), booked }];
    });
  });

  const rootStart = endorsementCommissionDay(root.policyStartDate);
  const candidateCounts = new Map<Component, number>();
  const matches = deductions.flatMap(deduction => {
    const targets = deductionTargets(deduction, components, payments, rootStart);
    for (const target of targets) candidateCounts.set(target, (candidateCounts.get(target) ?? 0) + 1);
    return targets.length === 1 && !targets[0].booked ? [{ target: targets[0], row: deduction.row }] : [];
  });
  const assigned = new Set<ContractCommissionPayout>();
  const additions = new Map<ContractDoc, ContractCommissionPayout[]>();
  for (const { target, row } of matches) {
    if (candidateCounts.get(target) !== 1) continue;
    const entry = target.entry;
    assigned.add(row);
    const rows = additions.get(entry) ?? [];
    rows.push(row);
    additions.set(entry, rows);
  }
  if (!assigned.size) return family;
  return family.map(entry => {
    if (entry === root) return { ...entry, commissionPayouts: rootRows.filter(row => !assigned.has(row)) };
    const rows = additions.get(entry);
    return rows ? { ...entry, commissionPayouts: [...(entry.commissionPayouts ?? []), ...rows] } : entry;
  });
}
