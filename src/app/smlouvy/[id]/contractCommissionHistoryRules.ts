import type { ContractCommissionPayout } from "./contractDetailTypes";

const CORRECTION_AMOUNT_TOLERANCE = 0.001;

const normalizeText = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const finiteMoney = (value: unknown): number | null => {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
};

const amountsClose = (
  left: number | null,
  right: number | null
): boolean =>
  left != null &&
  right != null &&
  Math.abs(Math.abs(left) - Math.abs(right)) <= CORRECTION_AMOUNT_TOLERANCE;

const parseCzechDateMs = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = Date.UTC(year, month - 1, day);
  return Number.isFinite(date) ? date : null;
};

const parseStatementPeriodStartMs = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const match = value.match(/(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/);
  return parseCzechDateMs(match?.[1]);
};

const payoutChronologyMs = (
  payout: ContractCommissionPayout,
  index: number
): number =>
  (typeof payout.statementChronologyMs === "number" &&
  Number.isFinite(payout.statementChronologyMs)
    ? payout.statementChronologyMs
    : parseStatementPeriodStartMs(payout.statementPeriod) ??
      parseCzechDateMs(payout.statementDate) ??
      (typeof payout.writtenAtMs === "number" && Number.isFinite(payout.writtenAtMs)
        ? payout.writtenAtMs
        : 0)) + index / 1_000;

const normalizeCommissionCode = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const commissionCodeAliases = (value: unknown): string[] => {
  const code = normalizeCommissionCode(value);
  if (!code || code === "TOTAL") return [];

  const range = code.match(/^([AB])(\d{3})-\1(\d{3})$/);
  if (range) {
    const prefix = range[1] ?? "";
    const start = Number(range[2]);
    const end = Number(range[3]);
    if (
      prefix &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      end >= start &&
      end - start <= 24
    ) {
      return [
        code,
        ...Array.from({ length: end - start + 1 }, (_, offset) =>
          `${prefix}${String(start + offset).padStart(3, "0")}`
        ),
      ];
    }
  }

  const closingRole = code.match(/^(?:APZ|AP|AZ)(\d+)$/);
  if (closingRole) return [code, `A${closingRole[1]}`];
  if (code === "B301") return ["B0301", "B301"];
  if (code === "B36" || code === "B036" || code === "B3601") {
    return ["B36", "B036", "B3601"];
  }
  if (code === "B48" || code === "B048" || code === "B4801") {
    return ["B48", "B048", "B4801"];
  }
  return [code];
};

const payoutCodesOverlap = (
  left: ContractCommissionPayout,
  right: ContractCommissionPayout
): boolean => {
  const leftCodes = new Set(commissionCodeAliases(left.code));
  return (
    leftCodes.size > 0 &&
    commissionCodeAliases(right.code).some((code) => leftCodes.has(code))
  );
};

const payoutsBelongTogether = (
  left: ContractCommissionPayout,
  right: ContractCommissionPayout
): boolean =>
  payoutCodesOverlap(left, right) &&
  normalizeText(left.writtenBy) === normalizeText(right.writtenBy);

const isCorrectionStorno = (payout: ContractCommissionPayout): boolean =>
  normalizeText(payout.status) === "storno" ||
  normalizeText(payout.differenceReason) === "storno" ||
  (finiteMoney(payout.amount) ?? 0) < 0;

const isPositivePayout = (payout: ContractCommissionPayout): boolean =>
  !isCorrectionStorno(payout) && (finiteMoney(payout.amount) ?? 0) > 0;

export type SettledCommissionCorrection = {
  payment: ContractCommissionPayout;
  reversal: ContractCommissionPayout;
};

export type CommissionPayoutHistoryPartition = {
  activePayouts: ContractCommissionPayout[];
  settledCorrections: SettledCommissionCorrection[];
};

/**
 * Separates exact payout/reversal pairs from the currently effective history.
 *
 * Only a later reversal with the same code, writer and absolute amount is
 * paired. Partial and ambiguous reversals remain active and visible. Stored
 * payout data is never modified; this only prepares a clearer presentation.
 */
export const partitionSettledCommissionPayouts = (
  payouts: ContractCommissionPayout[]
): CommissionPayoutHistoryPartition => {
  if (payouts.length < 2) {
    return { activePayouts: [...payouts], settledCorrections: [] };
  }

  const indexed = payouts
    .map((payout, index) => ({
      payout,
      index,
      chronologyMs: payoutChronologyMs(payout, index),
    }))
    .sort(
      (left, right) =>
        left.chronologyMs - right.chronologyMs || left.index - right.index
    );
  const settledIndexes = new Set<number>();
  const settledCorrections: SettledCommissionCorrection[] = [];

  for (const reversal of indexed) {
    if (!isCorrectionStorno(reversal.payout)) continue;

    const payment = [...indexed]
      .reverse()
      .find(
        (candidate) =>
          candidate.chronologyMs < reversal.chronologyMs &&
          !settledIndexes.has(candidate.index) &&
          isPositivePayout(candidate.payout) &&
          payoutsBelongTogether(candidate.payout, reversal.payout) &&
          amountsClose(
            finiteMoney(candidate.payout.amount),
            finiteMoney(reversal.payout.amount)
          )
      );
    if (!payment) continue;

    settledIndexes.add(payment.index);
    settledIndexes.add(reversal.index);
    settledCorrections.push({
      payment: payment.payout,
      reversal: reversal.payout,
    });
  }

  return {
    activePayouts: payouts.filter((_, index) => !settledIndexes.has(index)),
    settledCorrections,
  };
};

export const simplifyCorrectedCommissionPayouts = (
  payouts: ContractCommissionPayout[]
): ContractCommissionPayout[] =>
  partitionSettledCommissionPayouts(payouts).activePayouts;
