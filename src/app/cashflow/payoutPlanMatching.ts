import type { CashflowItem, EntryDoc } from "./types";
import { toDate } from "@/app/lib/formatters";
import { describeKooperativaCPayout, isKooperativaCPayout } from "@/app/lib/kooperativaCPayoutMeaning";
export { isKooperativaCPayout } from "@/app/lib/kooperativaCPayoutMeaning";

/** A confirmed association, kept separately from the original statement row. */
export type CashflowPayoutMatch = {
  payoutKey: string;
  payoutSignature: string;
  plannedCode: string;
  plannedMonthKey: string;
  plannedPeriodStart: string;
  plannedFrequency: EntryDoc["frequencyRaw"];
  writtenBy: string;
  writtenAtMs: number;
  actorEmail: string;
};

type Payout = NonNullable<EntryDoc["commissionPayouts"]>[number];
export const normalizedPayoutEmail = (value: string | null | undefined) =>
  String(value ?? "").trim().toLowerCase();
export const payoutPlanMonth = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
export const payoutPlanTargetKey = (item: Pick<CashflowItem, "commissionCode" | "date" | "commissionPeriodStart">) =>
  `${item.commissionCode}|${payoutPlanMonth(item.date)}|${item.commissionPeriodStart ?? ""}`;
export const savedPayoutPlanTargetKey = (match: CashflowPayoutMatch) =>
  `${match.plannedCode}|${match.plannedMonthKey}|${match.plannedPeriodStart}`;

// Import timestamps and recalculated expectations are deliberately excluded.
// A changed source amount/period/recipient must require a new confirmation.
export function payoutSourceSignature(payout: Payout): string {
  return JSON.stringify([
    payout.key, String(payout.code ?? "").trim().toUpperCase(), payout.amount,
    payout.payoutMonthKey, payout.statementId, payout.statementNumber,
    payout.statementPeriod, payout.statementDate, payout.detail,
    normalizedPayoutEmail(payout.writtenBy),
  ]);
}

export function payoutMatchBlockReason(entry: EntryDoc, payout: Payout, viewerEmail: string): string | null {
  if (!isKooperativaCPayout(entry.productKey, payout.code)) return "Tato položka není C výplata Kooperativy Auto.";
  const recipient = normalizedPayoutEmail(viewerEmail);
  if (!recipient || normalizedPayoutEmail(payout.writtenBy) !== recipient) return "Výplata patří jinému příjemci nebo nemá doloženého příjemce.";
  if (!toDate(entry.policyStartDate) || !entry.frequencyRaw) return "Nejprve doplň počátek pojištění a frekvenci placení smlouvy. Bez nich nelze určit období plánu.";
  if (!payout.key || !/^\d{4}-(0?[1-9]|1[0-2])$/.test(payout.payoutMonthKey ?? "")) return "Výplatě chybí jednoznačný klíč nebo měsíc.";
  if (!Number.isFinite(payout.amount) || Number(payout.amount) <= 0 || !["paid", "difference"].includes(payout.status ?? "")) return "Storno ani srážku nelze přiřadit k očekávané výplatě.";
  const sameCode = (entry.commissionPayouts ?? []).filter(other =>
    normalizedPayoutEmail(other.writtenBy) === recipient &&
    String(other.code ?? "").trim().toUpperCase() === String(payout.code).trim().toUpperCase()
  );
  if (sameCode.some(other => other.status === "storno" || Number(other.amount) < 0)) return "Ke stejnému C kódu je evidována oprava nebo storno. Zůstávají samostatně ve výpisech.";
  if (sameCode.length !== 1) return "Stejný C kód obsahuje více záznamů. Nejprve je potřeba ověřit jejich význam.";
  if ((entry.commissionPayouts ?? []).filter(other => other.key === payout.key && normalizedPayoutEmail(other.writtenBy) === recipient).length !== 1) return "Klíč výplaty není jednoznačný.";
  return null;
}

export function isAvailablePayoutPlanTarget(item: CashflowItem): boolean {
  return item.productKey === "kooperativaAuto" && /^B1\d{2,}$/.test(item.commissionCode ?? "") &&
    item.payoutStatus !== "paid" && !item.isStatementOnly &&
    Number.isFinite(item.amount) && item.amount > 0 && Boolean(item.commissionPeriodStart);
}

/** No C→B aliases, date proximity, amount similarity or counter-based guesses. */
export function applyConfirmedPayoutMatches(entry: EntryDoc, items: CashflowItem[], viewerEmail?: string | null): CashflowItem[] {
  if (entry.productKey !== "kooperativaAuto") return items;
  const recipient = normalizedPayoutEmail(viewerEmail);
  const matches = (entry.cashflowPayoutMatches ?? []).filter(match => normalizedPayoutEmail(match.writtenBy) === recipient);
  const replacements = new Map<CashflowItem, CashflowItem>();
  const removed = new Set<CashflowItem>();
  for (const match of matches) {
    if ((entry.frequencyRaw ?? null) !== match.plannedFrequency) continue;
    if (matches.filter(other => other.payoutKey === match.payoutKey).length !== 1 ||
      matches.filter(other => savedPayoutPlanTargetKey(other) === savedPayoutPlanTargetKey(match)).length !== 1) continue;
    const payout = (entry.commissionPayouts ?? []).find(p => p.key === match.payoutKey && normalizedPayoutEmail(p.writtenBy) === recipient);
    if (!payout || payoutMatchBlockReason(entry, payout, recipient) || payoutSourceSignature(payout) !== match.payoutSignature) continue;
    const actuals = items.filter(item => item.isStatementOnly && item.commissionPayoutKey === match.payoutKey);
    const plans = items.filter(item => isAvailablePayoutPlanTarget(item) && payoutPlanTargetKey(item) === savedPayoutPlanTargetKey(match));
    if (actuals.length !== 1 || plans.length !== 1) continue;
    const actual = actuals[0];
    const plan = plans[0];
    removed.add(plan);
    replacements.set(actual, {
      ...actual,
      // Keep the actual C code, amount, payout date and statement provenance.
      isStatementOnly: false,
      payoutPlanStatus: "matched",
      matchedPlannedCode: plan.commissionCode,
      commissionPeriodStart: plan.commissionPeriodStart,
      predictedAmount: plan.amount,
      originalDate: plan.date,
      commissionLabel: `Následná provize · ${actual.commissionCode}`,
    });
  }
  return items.filter(item => !removed.has(item)).map(item => {
    const replacement = replacements.get(item);
    if (replacement) return replacement;
    if (!isKooperativaCPayout(item.productKey, item.commissionCode) || !item.isStatementOnly) return item;
    const payout = (entry.commissionPayouts ?? []).find(source => source.key === item.commissionPayoutKey && normalizedPayoutEmail(source.writtenBy) === recipient);
    const meaning = payout ? describeKooperativaCPayout({ product: entry.productKey, policyStartDate: entry.policyStartDate, payout, payouts: entry.commissionPayouts ?? [] }) : null;
    return {
      ...item, payoutPlanStatus: item.amount < 0 ? "correction" : "unmatched",
      ...(meaning ? { commissionLabel: `${meaning.label} · ${item.commissionCode}` } : {}),
    };
  });
}

export type PayoutPlanPreview = {
  revision: string;
  payouts: {
    key: string;
    code: string;
    amount: number;
    month: string;
    statementPeriod: string;
    blockReason: string | null;
    targetKey: string | null;
    savedTargetKey: string | null;
    meaning: ReturnType<typeof describeKooperativaCPayout>;
    planNotice: string | null;
  }[];
  targets: { key: string; code: string; month: string; periodStart: string; amount: number; assignedPayoutKey: string | null }[];
  missingPayoutMatches: { payoutKey: string; plannedCode: string; plannedMonthKey: string }[];
};
