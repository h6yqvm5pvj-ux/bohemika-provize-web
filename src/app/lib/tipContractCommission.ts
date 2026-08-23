import type { CommissionResultItemDTO, Product } from "../types/domain";
import { isLifeProduct } from "./productCatalog";

const roundToCents = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

export const normalizeTipContractTitle = (
  title: string | undefined | null
): string =>
  (title ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizeCommissionCodeKey = (code: unknown): string => {
  if (typeof code !== "string") return "";
  return code.trim().toUpperCase().replace(/\s+/g, "");
};

const isTipContractA101Item = (item: CommissionResultItemDTO): boolean => {
  const code = normalizeCommissionCodeKey(item.code);
  if (code === "A101" || code === "A102") return true;
  return normalizeTipContractTitle(item.title).includes("provize a101");
};

const hasExplicitA101Item = (items: CommissionResultItemDTO[]): boolean =>
  items.some(isTipContractA101Item);

export const isTipContractImmediateBaseTitle = (
  title: string | undefined | null
): boolean => {
  const normalized = normalizeTipContractTitle(title);
  return (
    normalized.includes("okamzita provize") ||
    normalized.includes("ziskatelska provize") ||
    normalized.includes("provize a101") ||
    normalized.includes("provize b0301") ||
    normalized.includes("50% z b3601") ||
    normalized.includes("50% z b36")
  );
};

export const isTipContractImmediateAnnualTitle = (
  title: string | undefined | null
): boolean => {
  const normalized = normalizeTipContractTitle(title);
  if (!normalized.includes("za rok")) return false;
  if (normalized.includes("nasledna")) return false;
  return true;
};

export const sumTipContractImmediateFirstYear = (
  items: CommissionResultItemDTO[]
): number => {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const annualImmediate = items.reduce((sum, item) => {
    if (!isTipContractImmediateAnnualTitle(item.title)) return sum;
    return sum + (item.amount ?? 0);
  }, 0);
  if (annualImmediate > 0) return roundToCents(annualImmediate);

  const immediate = items.reduce((sum, item) => {
    if (!isTipContractImmediateBaseTitle(item.title)) return sum;
    return sum + (item.amount ?? 0);
  }, 0);
  return roundToCents(immediate);
};

export const sumTipContractA101FirstYear = (
  items: CommissionResultItemDTO[]
): number => {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const explicitA101 = items.reduce((sum, item) => {
    if (!isTipContractA101Item(item)) return sum;
    return sum + (item.amount ?? 0);
  }, 0);
  if (explicitA101 > 0) return roundToCents(explicitA101);

  return sumTipContractImmediateFirstYear(items);
};

export const tipContractGrossBaseForProduct = (
  product: Product | null | undefined,
  items: CommissionResultItemDTO[]
): number => {
  if (isLifeProduct(product)) return sumTipContractA101FirstYear(items);
  return sumTipContractImmediateFirstYear(items);
};

export const applyTipContractAdjustmentToCommissionItems = ({
  product,
  items,
  tipsterPercent,
}: {
  product: Product | null | undefined;
  items: CommissionResultItemDTO[];
  tipsterPercent: number;
}): {
  items: CommissionResultItemDTO[];
  grossBase: number;
  tipsterAmount: number;
  netBase: number;
} => {
  const ratio = 1 - tipsterPercent / 100;
  const adjustOnlyExplicitA101 = isLifeProduct(product) && hasExplicitA101Item(items);
  const adjustedItems = items.map((item) => {
    const shouldAdjust = adjustOnlyExplicitA101
      ? isTipContractA101Item(item)
      : isTipContractImmediateBaseTitle(item.title) ||
        isTipContractImmediateAnnualTitle(item.title);
    if (!shouldAdjust) return item;
    return {
      ...item,
      amount: roundToCents((item.amount ?? 0) * ratio),
    };
  });

  const grossBase = roundToCents(tipContractGrossBaseForProduct(product, items));
  const tipsterAmount = roundToCents(grossBase * (tipsterPercent / 100));
  const netBase = roundToCents(grossBase - tipsterAmount);

  return {
    items: adjustedItems,
    grossBase,
    tipsterAmount,
    netBase,
  };
};

export const applyTipContractAdjustmentToCommissionResult = ({
  product,
  items,
  total,
  tipsterPercent,
}: {
  product: Product | null | undefined;
  items: CommissionResultItemDTO[];
  total: number;
  tipsterPercent: unknown;
}): { items: CommissionResultItemDTO[]; total: number } => {
  const percent = Number(tipsterPercent);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    return { items, total };
  }

  const adjusted = applyTipContractAdjustmentToCommissionItems({
    product,
    items,
    tipsterPercent: percent,
  });
  return {
    items: adjusted.items,
    total: roundToCents(Math.max(0, total - adjusted.tipsterAmount)),
  };
};
