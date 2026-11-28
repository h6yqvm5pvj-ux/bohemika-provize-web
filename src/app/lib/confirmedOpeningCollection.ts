import type { AdjustedCommissionPayout, CommissionCodeReceipt } from "./commissionPayoutCodeAdjustment";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";

type CollectionRow = {
  statementId: string;
  payoutKey: string;
  amountCents: number;
  premiumCents: number;
  dueDate: string;
};

export type ConfirmedOpeningCollectionRule = {
  kind: "cpp-auto-separate-opening-collection";
  writtenBy: string;
  confirmedAtMs: number;
  opening: CollectionRow;
  regular: CollectionRow;
};

export type ConfirmedCollection = { kind: "opening" | "regular"; dueDate: string; premium: number };
const validCents = (cents: number) => Number.isSafeInteger(cents) && cents > 0;
const validRow = (row: CollectionRow | undefined) => row && typeof row.dueDate === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(row.dueDate) && endorsementCommissionDay(row.dueDate) === row.dueDate &&
  typeof row.statementId === "string" && !!row.statementId && typeof row.payoutKey === "string" && !!row.payoutKey &&
  validCents(row.amountCents) && validCents(row.premiumCents);

/** One extra collection at inception, followed by the first full semiannual collection. */
export function confirmedOpeningCollectionProjection(rule: ConfirmedOpeningCollectionRule, evidence: readonly CommissionCodeReceipt[]) {
  return <T extends CommissionCodeReceipt>(receipt: T): T & AdjustedCommissionPayout => {
    if (receipt.confirmedCollection || receipt.statementCode || receipt.status === "storno" ||
        receipt.writtenBy?.trim().toLowerCase() !== rule.writtenBy ||
        !validRow(rule.opening) || !validRow(rule.regular) || rule.opening.dueDate >= rule.regular.dueDate ||
        rule.opening.payoutKey === rule.regular.payoutKey) return receipt;
    const kind = receipt.code === "A101" ? "opening" : receipt.code === "B101" ? "regular" : null;
    if (!kind) return receipt;
    const row = rule[kind];
    if (receipt.statementId !== row.statementId) return receipt;
    // Premium history lacks the row key. Only resolve it from unambiguous, already scoped evidence.
    const candidates = receipt.key || receipt.amount != null ? [receipt] : evidence.filter(candidate =>
      candidate.statementId === row.statementId && (candidate.statementCode ?? candidate.code) === receipt.code &&
      candidate.writtenBy?.trim().toLowerCase() === rule.writtenBy && candidate.status !== "storno");
    const [source] = candidates;
    if (candidates.length !== 1 || source.key !== row.payoutKey ||
        Math.round((source.amount ?? 0) * 100) !== row.amountCents) return receipt;
    const base = source.sourceBaseAmount ?? source.statementBaseAmount;
    if (base != null && Math.round(base * 100) !== row.premiumCents) return receipt;
    const confirmedCollection = { kind, dueDate: row.dueDate, premium: row.premiumCents / 100 } satisfies ConfirmedCollection;
    const day = new Date(row.dueDate).toLocaleDateString("cs-CZ", { timeZone: "UTC" });
    const amount = confirmedCollection.premium.toLocaleString("cs-CZ");
    return { ...receipt, confirmedCollection, code: "A101", statementCode: receipt.code,
      commissionCodeCorrectionNote: kind === "opening" ? `A101 k jednorázovému pojistnému ${amount} Kč ze dne ${day}.`
        : `B101 z výpisu k první pravidelné splátce ${amount} Kč ze dne ${day}.` };
  };
}
