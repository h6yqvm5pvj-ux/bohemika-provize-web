import type { ContractCommissionPayout } from "./contractDetailTypes";

const CORRECTION_AMOUNT_TOLERANCE = 1;

type IndexedPayout = {
  payout: ContractCommissionPayout;
  index: number;
  chronologyMs: number;
};

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

const isDifferencePayout = (payout: ContractCommissionPayout): boolean =>
  normalizeText(payout.status) === "difference" &&
  (finiteMoney(payout.amount) ?? 0) > 0 &&
  finiteMoney(payout.expectedAmount) != null;

const isCorrectionStorno = (payout: ContractCommissionPayout): boolean =>
  normalizeText(payout.status) === "storno" ||
  normalizeText(payout.differenceReason) === "storno" ||
  (finiteMoney(payout.amount) ?? 0) < 0;

const isCorrectPaidPayout = (
  payout: ContractCommissionPayout,
  expectedAmount: number
): boolean =>
  normalizeText(payout.status) === "paid" &&
  !normalizeText(payout.differenceReason) &&
  (finiteMoney(payout.amount) ?? 0) > 0 &&
  (amountsClose(finiteMoney(payout.amount), expectedAmount) ||
    amountsClose(finiteMoney(payout.expectedAmount), expectedAmount));

const isLaterPayout = (candidate: IndexedPayout, source: IndexedPayout): boolean =>
  candidate.chronologyMs > source.chronologyMs;

const isSameStatement = (
  left: ContractCommissionPayout,
  right: ContractCommissionPayout
): boolean => {
  const leftId = String(left.statementId ?? "").trim();
  const rightId = String(right.statementId ?? "").trim();
  return Boolean(leftId && rightId && leftId === rightId);
};

/**
 * Collapses a fully resolved payout correction for presentation purposes.
 *
 * The original mismatched payment and its matching reversal are hidden only
 * when a later correct payment also exists. The stored payout audit trail is
 * left untouched and incomplete or ambiguous correction chains stay visible.
 */
export const simplifyCorrectedCommissionPayouts = (
  payouts: ContractCommissionPayout[]
): ContractCommissionPayout[] => {
  if (payouts.length < 3) return [...payouts];

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
  const hiddenIndexes = new Set<number>();
  const consumedStornoIndexes = new Set<number>();
  const consumedPaidIndexes = new Set<number>();

  for (const mismatch of indexed) {
    if (!isDifferencePayout(mismatch.payout)) continue;

    const expectedAmount = finiteMoney(mismatch.payout.expectedAmount);
    if (expectedAmount == null) continue;

    const laterPayouts = indexed.filter((candidate) =>
      isLaterPayout(candidate, mismatch)
    );
    const storno = laterPayouts.find(
      (candidate) =>
        !consumedStornoIndexes.has(candidate.index) &&
        payoutsBelongTogether(candidate.payout, mismatch.payout) &&
        isCorrectionStorno(candidate.payout) &&
        amountsClose(
          finiteMoney(candidate.payout.amount),
          finiteMoney(mismatch.payout.amount)
        )
    );
    if (!storno) continue;

    const correctPayment = laterPayouts.find(
      (candidate) =>
        !consumedPaidIndexes.has(candidate.index) &&
        payoutsBelongTogether(candidate.payout, mismatch.payout) &&
        isCorrectPaidPayout(candidate.payout, expectedAmount) &&
        (isSameStatement(candidate.payout, storno.payout) ||
          isLaterPayout(candidate, storno))
    );
    if (!correctPayment) continue;

    hiddenIndexes.add(mismatch.index);
    hiddenIndexes.add(storno.index);
    consumedStornoIndexes.add(storno.index);
    consumedPaidIndexes.add(correctPayment.index);
  }

  return payouts.filter((_, index) => !hiddenIndexes.has(index));
};
