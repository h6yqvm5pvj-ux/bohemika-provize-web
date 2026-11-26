import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import { isLifeIncreaseCode, lifeIncreaseExpectedAmount, lifeIncreaseItemCode, matchesLifePremiumIncrease } from "./lifePremiumIncrease";
import type { CommissionResultItemDTO } from "@/app/types/domain";

export type LifeStatementEntry = {
  id?: string | null;
  productKey?: string | null;
  entryType?: string | null;
  rootContractEntryId?: string | null;
  parentContractEntryId?: string | null;
  policyStartDate?: unknown;
  contractSignedDate?: unknown;
  premiumDelta?: number | null;
  premiumIncreaseAmount?: number | null;
  previousInputAmount?: number | null;
  newInputAmount?: number | null;
  items?: CommissionResultItemDTO[] | null;
};

export type LifeStatementSource = {
  commissionCode?: string | null;
  baseAmount?: number | null;
  validFrom?: string | null;
  signedAt?: string | null;
};

type FlexiIncreaseSource = LifeStatementSource & { commission: number };

export function isFlexiIncreaseWithoutBase(product: string | null | undefined, row: LifeStatementSource): boolean {
  return product === "flexi" && isLifeIncreaseCode(row.commissionCode) &&
    (row.baseAmount == null || row.baseAmount === 0);
}

const isEndorsement = (entry: LifeStatementEntry): boolean =>
  entry.entryType === "endorsement" || Boolean(entry.rootContractEntryId && entry.parentContractEntryId);

export function matchingFlexiIncreaseCommission(entry: LifeStatementEntry, row: FlexiIncreaseSource): number | null {
  const delta = entry.premiumDelta ?? entry.premiumIncreaseAmount ??
    (entry.previousInputAmount != null && entry.previousInputAmount > 0 && entry.newInputAmount != null
      ? entry.newInputAmount - entry.previousInputAmount : null);
  if (!isEndorsement(entry) || !isFlexiIncreaseWithoutBase(entry.productKey, row) ||
      typeof delta !== "number" || !Number.isFinite(delta) || delta <= 0 ||
      !Array.isArray(entry.items) || !Number.isFinite(row.commission) || row.commission <= 0) return null;
  const expected = lifeIncreaseExpectedAmount(entry.items, [row.commissionCode ?? ""]);
  // The statement and the stored calculation can round a component independently.
  return expected != null && expected > 0 && Math.abs(Math.round(row.commission * 100) - Math.round(expected * 100)) <= 1
    ? expected : null;
}

function sourceDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  return endorsementCommissionDay(match
    ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : value);
}

/** Match only within one policy family, using each paid commission component as evidence. */
export function matchFlexiIncreaseByCommission<T extends LifeStatementEntry>(entries: T[], rows: FlexiIncreaseSource[]): T | null {
  const codes = rows.map(row => lifeIncreaseItemCode(row.commissionCode));
  if (!codes.length || codes.some(code => !code) || new Set(codes).size !== codes.length) return null;
  const endorsementDates = new Set(entries.filter(isEndorsement)
    .map(entry => endorsementCommissionDay(entry.policyStartDate)));
  let candidates = entries.filter(entry => rows.every(row => matchingFlexiIncreaseCommission(entry, row) != null));

  for (const row of rows) {
    const effective = sourceDay(row.validFrom);
    if (row.validFrom && !effective && !/^[-–—]$/.test(row.validFrom.trim())) return null;
    // The source date can refer to the policy rather than to this payout's increase.
    if (effective && endorsementDates.has(effective)) {
      candidates = candidates.filter(entry => endorsementCommissionDay(entry.policyStartDate) === effective);
    }
  }
  if (candidates.length > 1) {
    const signedDates = [...new Set(rows.map(row => sourceDay(row.signedAt)).filter(Boolean))];
    if (signedDates.length === 1) {
      candidates = candidates.filter(entry => endorsementCommissionDay(entry.contractSignedDate) === signedDates[0]);
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}

/** The caller supplies a single, backend-authorized policy family. Never break ties by order. */
export function matchLifeStatementEntry<T extends LifeStatementEntry>(entries: T[], row: LifeStatementSource): T | null {
  const increase = isLifeIncreaseCode(row.commissionCode);
  const endorsements = entries.filter(entry => entry.entryType === "endorsement");
  let candidates = increase
    ? endorsements.filter(entry => matchesLifePremiumIncrease(entry, row.baseAmount ?? NaN))
    : entries;
  // Keep evidence on a standalone legacy original without claiming it settles
  // its acquisition commission. Once amendments exist, an increase must match one.
  if (increase && endorsements.length === 0 && entries.length === 1) return entries[0];
  const effective = sourceDay(row.validFrom);
  if (row.validFrom && !effective) return null;
  if (effective) candidates = candidates.filter(entry => endorsementCommissionDay(entry.policyStartDate) === effective);
  if (!effective && !increase) candidates = candidates.filter(entry => entry.entryType !== "endorsement");
  if (candidates.length > 1) {
    const signed = sourceDay(row.signedAt);
    if (signed) candidates = candidates.filter(entry => endorsementCommissionDay(entry.contractSignedDate) === signed);
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export function matchDatedLifeIncreaseReceipt<T extends LifeStatementEntry>(entries: T[], row: FlexiIncreaseSource): T | null {
  const effective = sourceDay(row.validFrom);
  if (!effective || !isLifeIncreaseCode(row.commissionCode)) return null;
  const endorsements = entries.filter(entry => entry.entryType === "endorsement" &&
    endorsementCommissionDay(entry.policyStartDate) === effective);
  if (endorsements.length === 0) return null;
  return isFlexiIncreaseWithoutBase(endorsements[0].productKey, row)
    ? matchFlexiIncreaseByCommission(endorsements, [row])
    : matchLifeStatementEntry(endorsements, row);
}
