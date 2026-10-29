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

export const isLifeIncreaseCode = (value: unknown): boolean =>
  /^(?:NV(?:PZ?|Z)?|NB)\d+$/.test(String(value ?? "").trim().toUpperCase());

export const lifeIncreaseItemCode = (value: unknown): string | null => {
  const code = String(value ?? "").trim().toUpperCase();
  if (/^NB\d+$/.test(code)) return "B0301";
  if (/^NV(?:PZ?|Z)?\d+$/.test(code)) return "A101";
  return null;
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
  const expectedCodes = [...new Set(codes.map(lifeIncreaseItemCode).filter((code): code is string => Boolean(code)))];
  if (!expectedCodes.length) return null;
  let amount = 0;
  for (const code of expectedCodes) {
    const matches = (items ?? []).filter(item => {
      const storedCode = String(item.code ?? "").trim().toUpperCase();
      return storedCode ? storedCode === code : new RegExp(`\\b${code}\\b`, "i").test(item.title ?? "");
    });
    if (!matches.length || matches.some(item => typeof item.amount !== "number" || !Number.isFinite(item.amount))) return null;
    amount += matches.reduce((sum, item) => sum + item.amount, 0);
  }
  return Math.round(amount * 100) / 100;
}
