import { createHash } from "node:crypto";
import { generateCashflow } from "@/app/cashflow/generator";
import type { CashflowItem, EntryDoc } from "@/app/cashflow/types";
import {
  isAvailablePayoutPlanTarget, isKooperativaCPayout, normalizedPayoutEmail,
  payoutMatchBlockReason, payoutPlanMonth, payoutPlanTargetKey, payoutSourceSignature,
  savedPayoutPlanTargetKey, type CashflowPayoutMatch, type PayoutPlanPreview,
} from "@/app/cashflow/payoutPlanMatching";
import { withInheritedCommissionItems } from "@/app/lib/inheritedContracts";
import { totalWithMultipliers } from "@/app/lib/commissionTotals";
import { stripTotalRows, CASHFLOW_FORECAST_YEARS } from "@/app/cashflow/helpers";
import { computeLegacyFrequencyOverrideTotal } from "@/app/lib/managerOverrideTotals";
import { describeKooperativaCPayout } from "@/app/lib/kooperativaCPayoutMeaning";

export class PayoutMatchingError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

/** Use only the recipient's schedule, including their own manager override. */
function recipientEntry(entry: EntryDoc, viewerEmail: string): EntryDoc {
  const email = normalizedPayoutEmail(viewerEmail);
  if (normalizedPayoutEmail(entry.userEmail) === email) return withInheritedCommissionItems({ ...entry, source: "own" });
  const override = entry.managerOverrides?.find(item => normalizedPayoutEmail(item.email) === email);
  const items = stripTotalRows(override?.items ?? []);
  const total = computeLegacyFrequencyOverrideTotal({
    productKey: entry.productKey ?? null, frequencyRaw: entry.frequencyRaw ?? null,
    items, fallbackTotal: totalWithMultipliers(items),
  });
  return {
    ...entry, originalEntryId: entry.id, id: `${entry.id}-override`, source: "manager",
    items: total > 0 ? items : [], total, position: override?.position ?? null,
  };
}

export function buildPayoutPlanPreview(entry: EntryDoc, viewerEmail: string, asOf = new Date()): PayoutPlanPreview {
  const email = normalizedPayoutEmail(viewerEmail);
  const scoped = recipientEntry(entry, email);
  const raw = generateCashflow([{ ...scoped, cashflowPayoutMatches: [] }], CASHFLOW_FORECAST_YEARS, email, asOf);
  const applied = generateCashflow([scoped], CASHFLOW_FORECAST_YEARS, email, asOf);
  const matches = (entry.cashflowPayoutMatches ?? []).filter(match => normalizedPayoutEmail(match.writtenBy) === email);
  const payouts = (entry.commissionPayouts ?? []).filter(payout =>
    normalizedPayoutEmail(payout.writtenBy) === email && isKooperativaCPayout(entry.productKey, payout.code)
  );
  const planned = raw.filter(isAvailablePayoutPlanTarget);
  const accepted = new Map<string, CashflowItem>(applied.filter(item => item.payoutPlanStatus === "matched" && item.commissionPayoutKey)
    .map(item => [item.commissionPayoutKey!, item]));
  const acceptedTargets = new Map(matches.filter(match => accepted.has(match.payoutKey)).map(match => [savedPayoutPlanTargetKey(match), match.payoutKey]));
  const preview: PayoutPlanPreview = {
    revision: "",
    payouts: payouts.map(payout => {
      const saved = matches.find(match => match.payoutKey === payout.key);
      const month = payout.payoutMonthKey?.match(/^(\d{4})-(0?[1-9]|1[0-2])$/);
      const monthEnd = month ? new Date(Number(month[1]), Number(month[2]), 0) : null;
      const availablePlans = planned.filter(item => !acceptedTargets.has(payoutPlanTargetKey(item)) || acceptedTargets.get(payoutPlanTargetKey(item)) === payout.key);
      const beforeAllPlans = Number(payout.amount) > 0 && monthEnd && availablePlans.length > 0 && availablePlans.every(item =>
        item.commissionPeriodStart! > `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`
      );
      return {
        key: payout.key ?? "", code: payout.code ?? "", amount: payout.amount ?? 0,
        month: payout.payoutMonthKey ?? "", statementPeriod: payout.statementPeriod ?? "",
        blockReason: payoutMatchBlockReason(entry, payout, email),
        targetKey: saved && accepted.has(saved.payoutKey) ? savedPayoutPlanTargetKey(saved) : null,
        savedTargetKey: saved ? savedPayoutPlanTargetKey(saved) : null,
        meaning: describeKooperativaCPayout({ product: entry.productKey, policyStartDate: entry.policyStartDate, payout, payouts: entry.commissionPayouts ?? [] }),
        planNotice: beforeAllPlans
          ? "Výplata je starší než všechna dostupná období plánu. Nejprve ověř návaznost; budoucí období nevybírej jen podle pořadí C kódu."
          : null,
      };
    }),
    targets: planned.map(item => ({
      key: payoutPlanTargetKey(item), code: item.commissionCode!, month: payoutPlanMonth(item.date),
      periodStart: item.commissionPeriodStart!, amount: item.amount,
      assignedPayoutKey: acceptedTargets.get(payoutPlanTargetKey(item)) ?? null,
    })),
    missingPayoutMatches: matches.filter(match => !payouts.some(p => p.key === match.payoutKey))
      .map(match => ({ payoutKey: match.payoutKey, plannedCode: match.plannedCode, plannedMonthKey: match.plannedMonthKey })),
  };
  preview.revision = createHash("sha256").update(JSON.stringify({
    preview, sources: payouts.map(payoutSourceSignature), matches,
  })).digest("hex");
  return preview;
}

export function updatePayoutPlanMatch(args: {
  entry: EntryDoc; viewerEmail: string; actorEmail: string; revision: string;
  payoutKey: string; targetKey: string | null; asOf?: Date;
}): CashflowPayoutMatch[] {
  const { entry, payoutKey, targetKey, actorEmail } = args;
  const viewerEmail = normalizedPayoutEmail(args.viewerEmail);
  const preview = buildPayoutPlanPreview(entry, viewerEmail, args.asOf);
  if (preview.revision !== args.revision) throw new PayoutMatchingError("Výplaty nebo plán se mezitím změnily. Obnov přehled a výběr zkontroluj.");
  const existing = entry.cashflowPayoutMatches ?? [];
  const remaining = existing.filter(match => !(normalizedPayoutEmail(match.writtenBy) === viewerEmail && match.payoutKey === payoutKey));
  if (targetKey === null) {
    if (remaining.length === existing.length) throw new PayoutMatchingError("Přiřazení už neexistuje.");
    return remaining;
  }
  const source = preview.payouts.find(p => p.key === payoutKey);
  if (!source || source.blockReason) throw new PayoutMatchingError(source?.blockReason ?? "Výplata není dostupná pro tohoto příjemce.");
  const candidates = preview.targets.filter(target => target.key === targetKey);
  const target = candidates[0];
  if (candidates.length !== 1 || !target) throw new PayoutMatchingError("Vybraná položka plánu není dostupná nebo již byla vyplacena.");
  if (remaining.some(match => normalizedPayoutEmail(match.writtenBy) === viewerEmail && savedPayoutPlanTargetKey(match) === targetKey)) {
    throw new PayoutMatchingError("K této položce plánu už je přiřazena jiná výplata. Nejprve zruš původní vazbu.");
  }
  const payout = entry.commissionPayouts!.find(p => p.key === payoutKey && normalizedPayoutEmail(p.writtenBy) === viewerEmail)!;
  return [...remaining, {
    payoutKey, payoutSignature: payoutSourceSignature(payout), plannedCode: target.code,
    plannedMonthKey: target.month, plannedPeriodStart: target.periodStart,
    plannedFrequency: entry.frequencyRaw ?? null,
    writtenBy: viewerEmail, writtenAtMs: (args.asOf ?? new Date()).getTime(), actorEmail,
  }];
}
