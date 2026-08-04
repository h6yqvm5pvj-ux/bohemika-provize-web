import type { Product } from "@/app/types/domain";

export type StoredAutoPremiumStatementRow = {
  premiumKind: "auto_initial" | "auto_change" | "life_increase";
  rowId: string;
  detailUrl: string | null;
  contractNumber: string;
  client: string | null;
  productCode: string;
  productKey: Product | null;
  commissionCode: string;
  basePremium: number;
  commission: number | null;
  signedAt: string | null;
  validFrom: string | null;
  source: "own" | "manager";
};

const normalizeText = (value: unknown, maxLength = 220): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const normalizeMoney = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
};

export const normalizePremiumHistoryContractNumber = (value: unknown): string | null => {
  const normalized = String(value ?? "").replace(/\D+/g, "").trim();
  return normalized.length >= 6 ? normalized : null;
};

export const normalizeStoredAutoPremiumRows = (
  value: unknown
): StoredAutoPremiumStatementRow[] | null => {
  if (!Array.isArray(value)) return null;

  const rows = value
    .map((raw): StoredAutoPremiumStatementRow | null => {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Record<string, unknown>;
      const contractNumber = normalizePremiumHistoryContractNumber(row.contractNumber);
      const rowId = normalizeText(row.rowId, 80);
      const productCode = normalizeText(row.productCode, 80);
      const commissionCode = normalizeText(row.commissionCode, 80);
      const basePremium = normalizeMoney(row.basePremium);
      if (!contractNumber || !rowId || !productCode || !commissionCode || basePremium == null) {
        return null;
      }

      const premiumKind =
        row.premiumKind === "auto_initial" ||
        row.premiumKind === "auto_change" ||
        row.premiumKind === "life_increase"
          ? row.premiumKind
          : "auto_change";
      const source = row.source === "manager" ? "manager" : "own";

      return {
        premiumKind,
        rowId,
        detailUrl: normalizeText(row.detailUrl, 1_000),
        contractNumber,
        client: normalizeText(row.client, 220),
        productCode,
        productKey: typeof row.productKey === "string" ? (row.productKey as Product) : null,
        commissionCode,
        basePremium,
        commission: normalizeMoney(row.commission),
        signedAt: normalizeText(row.signedAt, 32),
        validFrom: normalizeText(row.validFrom, 32),
        source,
      };
    })
    .filter((row): row is StoredAutoPremiumStatementRow => Boolean(row));

  return rows;
};

export const autoPremiumContractNumbersForRows = (
  rows: StoredAutoPremiumStatementRow[]
): string[] =>
  [
    ...new Set(
      rows
        .map((row) => normalizePremiumHistoryContractNumber(row.contractNumber))
        .filter((value): value is string => Boolean(value))
    ),
  ].sort((a, b) => a.localeCompare(b, "cs"));

export const filterAutoPremiumRowsForContract = (
  rows: StoredAutoPremiumStatementRow[],
  contractNumber: unknown
): StoredAutoPremiumStatementRow[] => {
  const normalizedContractNumber = normalizePremiumHistoryContractNumber(contractNumber);
  if (!normalizedContractNumber) return [];
  return rows.filter(
    (row) => normalizePremiumHistoryContractNumber(row.contractNumber) === normalizedContractNumber
  );
};
