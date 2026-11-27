import type { CommissionCodeReceipt } from "./commissionPayoutCodeAdjustment";

type SourcePayment = {
  statementId: string;
  payoutKey: string;
  amountCents: number;
  dueDate: string;
};

export type ConfirmedQuarterlyRule = {
  kind: "cpp-auto-quarterly-combined-start";
  writtenBy: string;
  confirmedAtMs: number;
  opening: SourcePayment & { secondCents: number; secondDueDate: string };
  following: SourcePayment[];
};

export type ConfirmedInstallmentSplit = { secondCents: number; secondDueDate: string };

const validCents = (value: number) => Number.isSafeInteger(value) && value > 0;
const validDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().startsWith(value);
const formatDay = (day: string) => new Date(day).toLocaleDateString("cs-CZ", { timeZone: "UTC" });

/** Look up only the original statement rows confirmed against the insurer's ledger. */
export function confirmedQuarterlyProjection(rule: ConfirmedQuarterlyRule, evidence: readonly CommissionCodeReceipt[]) {
  return <T extends CommissionCodeReceipt>(receipt: T) => {
    const code = receipt.code;
    if (!code || receipt.statementCode || receipt.confirmedInstallmentSplit || !receipt.statementId ||
      receipt.writtenBy?.trim().toLowerCase() !== rule.writtenBy || receipt.status === "storno") return receipt;
    const match = /^B(1\d{2})$/.exec(code);
    const index = match ? Number(match[1]) - 101 : -1;
    const source = code === "A101" ? rule.opening : index >= 0 && Array.isArray(rule.following) ? rule.following[index] : null;
    if (!source || !source.payoutKey || !validDay(source.dueDate) || !validCents(source.amountCents) ||
      source.statementId !== receipt.statementId) return receipt;
    const sameStatementRow = (row: CommissionCodeReceipt) => row.statementId === source.statementId &&
      row.writtenBy?.trim().toLowerCase() === rule.writtenBy && (row.statementCode ?? row.code) === code && row.status !== "storno";
    // A keyless premium-history row must point to exactly one receipt for this writer and code.
    const candidates = receipt.key || receipt.amount != null ? [receipt] : evidence.filter(sameStatementRow);
    if (candidates.length !== 1 || candidates[0].key !== source.payoutKey ||
      Math.round((candidates[0].amount ?? 0) * 100) !== source.amountCents) return receipt;
    if (code === "A101") {
      const { secondCents, secondDueDate } = rule.opening;
      if (!validCents(secondCents) || secondCents >= source.amountCents || !validDay(secondDueDate) || secondDueDate <= source.dueDate) return receipt;
      return { ...receipt, confirmedInstallmentSplit: { secondCents, secondDueDate },
        commissionCodeCorrectionNote: `Výplata A101 pokrývá splátky A101 a A102 se splatností ${formatDay(source.dueDate)} a ${formatDay(secondDueDate)}.` };
    }
    const corrected = index < 2 ? `A${103 + index}` : `B${99 + index}`;
    return { ...receipt, code: corrected, statementCode: code,
      commissionCodeCorrectionNote: `Kód výpisu ${code} → ${corrected}. Splatnost podle inkasa ${formatDay(source.dueDate)}.` };
  };
}

/** The receipt stays whole in statement history. Split only when settling individual installments. */
export function splitConfirmedOpeningReceipt<T extends CommissionCodeReceipt>(payouts: T[]): T[] {
  if (!payouts.some(row => row.confirmedInstallmentSplit)) return payouts;
  return payouts.flatMap(receipt => {
    const split = receipt.confirmedInstallmentSplit;
    const total = Math.round((receipt.amount ?? 0) * 100);
    if (!split || !receipt.key || receipt.code !== "A101" || receipt.status === "storno" ||
      !validCents(total) || !validCents(split.secondCents) || split.secondCents >= total) return [receipt];
    const part = (code: string, key: string, cents: number) => ({
      ...receipt, confirmedInstallmentSplit: undefined, code, key, amount: cents / 100, expectedAmount: cents / 100, statementCode: "A101",
      difference: 0, differenceReason: null, detail: null, status: "paid",
      installmentSourceCode: "A101", installmentCoverageNote: receipt.commissionCodeCorrectionNote,
    });
    return [part("A101", receipt.key, total - split.secondCents), part("A102", `${receipt.key}:covers:A102`, split.secondCents)];
  });
}
