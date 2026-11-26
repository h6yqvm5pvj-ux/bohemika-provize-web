import { calculateCommission } from "./calculateCommission";
import { normalizeCommissionCoefficientSet } from "./productFormulas/coefficientSets";
import { toDate } from "./formatters";
import type { CommissionResultItemDTO, Position, Product } from "../types/domain";

type CommissionEntry = {
  payoutPositionOverride?: "poradce10" | null;
  productKey?: Product | null;
  position?: Position | string | null;
  originalPosition?: Position | null;
  commissionMode?: string | null;
  mode?: string | null;
  contractSignedDate?: unknown;
  commissionCoefficientSetOverride?: string | null;
  neonCoefficientSetOverride?: string | null;
  calculationInputAmount?: number | null;
  inputAmount?: number | null;
  frequencyRaw?: string | null;
  durationYears?: number | null;
  durationMonths?: number | null;
  maxCizinKomplexVariant?: "exclusiveStandard" | "premium" | null;
  items?: CommissionResultItemDTO[] | null;
};

export const PAYOUT_EXCEPTION_POSITION = "poradce10" as const;
export const PAYOUT_EXCEPTION_START_YEAR = 2026;

export function payoutExceptionStatementMonth(
  period: string | null | undefined,
  payoutMonth: string | null
): string | null {
  const dates = period?.match(/(\d{1,2})\.\s*12\.\s*2025\b/g);
  if (dates?.length === 2) {
    const [from, to] = dates.map(date => Number(date.split(".")[0]));
    if (from === 16 && to === 31) return "2026-01";
    if (to <= 15) return "2025-12";
  }
  return payoutMonth;
}

export function payoutPositionException(entry: CommissionEntry, payoutMonth: string | null) {
  const month = /^(\d{4})-(0?[1-9]|1[0-2])$/.exec(payoutMonth ?? "");
  const original = entry.originalPosition ?? entry.position;
  return entry.payoutPositionOverride === PAYOUT_EXCEPTION_POSITION && month && Number(month[1]) >= PAYOUT_EXCEPTION_START_YEAR &&
    typeof original === "string" && /^poradce[1-9]$/.test(original)
    ? PAYOUT_EXCEPTION_POSITION
    : null;
}

export function payoutPositionExceptionItems(
  entry: CommissionEntry,
  { keepUnmatched = true }: { keepUnmatched?: boolean } = {}
): CommissionResultItemDTO[] | null {
  const position = entry.originalPosition ?? entry.position;
  const amount = entry.calculationInputAmount ?? entry.inputAmount;
  if (!entry.productKey || !entry.items?.length || !position || !/^poradce[1-9]$/.test(position) ||
    typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;

  const signedDate = toDate(entry.contractSignedDate);
  const frequency = entry.frequencyRaw;
  const coefficientSet = entry.neonCoefficientSetOverride;
  const input = {
    productKey: entry.productKey,
    commissionMode: (entry.commissionMode ?? entry.mode) === "accelerated" ? "accelerated" : "standard",
    contractSignedDateIso: signedDate && Number.isFinite(signedDate.getTime()) ? signedDate.toISOString().slice(0, 10) : null,
    commissionCoefficientSetOverride: normalizeCommissionCoefficientSet(entry.commissionCoefficientSetOverride),
    neonCoefficientSetOverride: coefficientSet === "historical" || coefficientSet === "current" ? coefficientSet : null,
    inputAmount: amount,
    frequencyRaw: frequency === "monthly" || frequency === "quarterly" || frequency === "semiannual" ? frequency : "annual",
    durationYears: entry.durationYears ?? null,
    durationMonths: entry.durationMonths ?? null,
    maxCizinKomplexVariant: entry.maxCizinKomplexVariant ?? null,
  } satisfies Omit<Parameters<typeof calculateCommission>[0], "position">;
  const original = calculateCommission({ ...input, position: position as Position });
  const current = calculateCommission({ ...input, position: PAYOUT_EXCEPTION_POSITION });
  if (!original || !current) return null;

  const normalizeTitle = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
  const findItem = (items: CommissionResultItemDTO[], item: CommissionResultItemDTO) => {
    const byTitle = items.find(candidate => normalizeTitle(candidate.title) === normalizeTitle(item.title));
    if (byTitle) return byTitle;
    if (!item.code) return undefined;
    const byCode = items.filter(candidate => candidate.code === item.code);
    return byCode.length === 1 ? byCode[0] : undefined;
  };

  return entry.items.flatMap(item => {
    const before = findItem(original.items, item);
    const after = findItem(current.items, item);
    if (!before || !after || before.amount <= 0 || !Number.isFinite(item.amount)) return keepUnmatched ? [item] : [];
    // Keep confirmed premium bases and manual adjustments in the stored calculation.
    return [{ ...item, amount: Math.round(item.amount * (after.amount / before.amount) * 100) / 100 }];
  });
}
