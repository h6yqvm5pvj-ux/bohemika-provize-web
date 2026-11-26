import type { CommissionResultItemDTO } from "@/app/types/domain";

export type LifeStatementPremiumChange = {
  key: string;
  statementId: string;
  statementNumber: string | null;
  statementPeriod: string | null;
  statementDate: string | null;
  productCode: string;
  annualIncrease: number;
  previousMonthlyPremium: number;
  newMonthlyPremium: number;
  effectiveDate: string;
  writtenBy: string;
  confirmedAtMs: number;
};

export function currentConfirmedLifePremium(changes: LifeStatementPremiumChange[], asOf: string, notBefore = ""): LifeStatementPremiumChange | null {
  const eligible = changes.filter(change => change.effectiveDate <= asOf && change.effectiveDate >= notBefore)
    .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate));
  if (!eligible.length) return null;
  const latest = eligible.filter(change => change.effectiveDate === eligible[0].effectiveDate);
  return new Set(latest.map(change => change.newMonthlyPremium)).size === 1 ? latest[0] : null;
}

export function confirmedLifeStatementChange(changes: LifeStatementPremiumChange[] | null | undefined, source: {
  statementId?: string | null; statementNumber?: string | null; statementPeriod?: string | null; statementDate?: string | null;
  productCode: string; annualIncrease: number;
}): LifeStatementPremiumChange | null {
  const norm = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ");
  const matches = (changes ?? []).filter(change =>
    norm(change.productCode) === norm(source.productCode) && Math.abs(change.annualIncrease - source.annualIncrease) <= 0.01 &&
    ((source.statementId && change.statementId === source.statementId) || Boolean(source.statementNumber && (source.statementPeriod || source.statementDate)) &&
      norm(change.statementNumber) === norm(source.statementNumber) && norm(change.statementPeriod) === norm(source.statementPeriod) &&
      norm(change.statementDate) === norm(source.statementDate)));
  return matches.length === 1 ? matches[0] : null;
}

const normalizedCode = (value: unknown): string => String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");

export const isLifeIncreaseCode = (value: unknown): boolean =>
  /^(?:NV(?:PZ?|Z)?|NB)\d+$/.test(normalizedCode(value));

/** Equivalent legacy spellings identify one full deferred component, never its accelerated half. */
export const normalizeLifeCommissionItemCode = (value: unknown): string => {
  const code = normalizedCode(value);
  if (["B36", "B036", "B3601"].includes(code)) return "B3601";
  if (["B48", "B048", "B4801"].includes(code)) return "B4801";
  return code;
};

export const isNeonPremiumIncreaseComponent = (code: string): boolean =>
  ["A101", "B0301", "B3601", "B4801", "B3601_HALF", "B36_HALF", "B036_HALF"].includes(normalizeLifeCommissionItemCode(code)) ||
  /^B(?:10[1-4]|20[1-6])$/.test(code);

export const lifeIncreaseItemCode = (value: unknown): string | null => {
  const code = normalizedCode(value);
  if (code === "NB0301") return "B0301";
  if (["NB36", "NB036", "NB3601"].includes(code)) return "B3601";
  if (["NB48", "NB048", "NB4801"].includes(code)) return "B4801";
  if (/^NV(?:PZ?|Z)?\d+$/.test(code)) return "A101";
  return null;
};

export const lifeIncreaseCommissionLabel = (value: unknown): string | null => {
  if (!isLifeIncreaseCode(value)) return null;
  const code = lifeIncreaseItemCode(value);
  if (code === "B3601") return "Provize za navýšení po 3 letech";
  if (code === "B4801") return "Provize za navýšení po 4 letech";
  return "Provize za navýšení smlouvy";
};

type IncreaseContract = {
  entryType?: string | null;
  premiumDelta?: number | null;
  premiumIncreaseAmount?: number | null;
};

/** A payout for an increase can only be checked against that increase's endorsement. */
export function matchesLifePremiumIncrease(contract: IncreaseContract | null | undefined, annualBase: number): boolean {
  if (contract?.entryType !== "endorsement" || !Number.isFinite(annualBase) || annualBase <= 0) return false;
  const delta = contract.premiumDelta ?? contract.premiumIncreaseAmount;
  return typeof delta === "number" && Number.isFinite(delta) && delta > 0 && Math.abs(delta * 12 - annualBase) <= 1;
}

export function lifeIncreaseExpectedAmount(items: CommissionResultItemDTO[] | null | undefined, codes: string[]): number | null {
  const mappedCodes = codes.map(lifeIncreaseItemCode);
  if (!mappedCodes.length || mappedCodes.some(code => code == null)) return null;
  const expectedCodes = [...new Set(mappedCodes as string[])];
  let amount = 0;
  for (const code of expectedCodes) {
    const matches = (items ?? []).filter(item => {
      const storedCode = normalizeLifeCommissionItemCode(item.code);
      if (!storedCode && ["B3601", "B4801"].includes(code) && /50\s*%/.test(item.title ?? "")) return false;
      const aliases = code === "B3601" ? ["B3601", "B036", "B36"]
        : code === "B4801" ? ["B4801", "B048", "B48"] : [code];
      return storedCode ? storedCode === code : new RegExp(`\\b(?:${aliases.join("|")})\\b`, "i").test(item.title ?? "");
    });
    if (!matches.length || matches.some(item => typeof item.amount !== "number" || !Number.isFinite(item.amount))) return null;
    amount += matches.reduce((sum, item) => sum + item.amount, 0);
  }
  return Math.round(amount * 100) / 100;
}
