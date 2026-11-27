import { isLifeProduct } from "./productCatalog";
import { isLifeIncreaseCode, matchesLifePremiumIncrease } from "./lifePremiumIncrease";
import { baseCommissionCodeForPayoutComparison } from "./commissionPayoutRules";
import { endorsementCommissionDay, type EndorsementCommissionPlanEntry } from "./endorsementCommissionPlan";
import { matchDatedLifeIncreaseReceipt, type LifeStatementEntry } from "./lifeStatementMatching";
import type { Product } from "@/app/types/domain";

type Receipt = {
  key?: string | null; statementId?: string | null; writtenBy?: string | null;
  code?: string | null; amount?: number | null; expectedAmount?: number | null;
  statementCode?: string | null; statementPeriod?: string | null; statementDate?: string | null;
  statementChronologyMs?: number | null; payoutMonthKey?: string | null;
  status?: string | null; differenceReason?: string | null; career?: string | null;
  sourceBaseAmount?: number | null; statementBaseAmount?: number | null;
  sourceValidFrom?: string | null; sourceSignedAt?: string | null;
};
type Entry = LifeStatementEntry & {
  originalEntryId?: string | null; userEmail?: string | null; contractNumber?: string | null; source?: string;
  commissionPayouts?: Receipt[] | null;
};
const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

export type LifeIncreaseReceiptEvidence = {
  key: string; contractNumber: string; productKey: Product; source: "own" | "manager";
  code: string; amount: number; validFrom: string; signedAt: string | null; baseAmount: number | null;
};
export type LifeIncreaseStatementEvidence = {
  id: string; writer: string; rows: readonly LifeIncreaseReceiptEvidence[];
};
export type LifeIncreaseReceiptIndex = ReadonlyMap<string, LifeIncreaseReceiptEvidence | null>;

export function needsLifeIncreaseReceiptEvidence(payout: Receipt): boolean {
  return Boolean(payout.statementId && payout.key && payout.writtenBy && !payout.sourceValidFrom &&
    isLifeIncreaseCode(payout.statementCode ?? payout.code) && !isStornoPayoutRecord(payout) && validPayoutAmount(payout.amount) > 0);
}

export function indexLifeIncreaseReceiptEvidence(statements: Iterable<LifeIncreaseStatementEvidence>): LifeIncreaseReceiptIndex {
  const index = new Map<string, LifeIncreaseReceiptEvidence | null>();
  for (const statement of statements) {
    for (const row of statement.rows) {
      const key = JSON.stringify([norm(statement.writer), statement.id, row.key]);
      index.set(key, index.has(key) ? null : row);
    }
  }
  return index;
}

function addLifeIncreaseReceiptEvidence(payout: Receipt, entry: Entry, evidence: LifeIncreaseReceiptIndex): Receipt {
  if (!needsLifeIncreaseReceiptEvidence(payout)) return payout;
  const source = evidence.get(JSON.stringify([norm(payout.writtenBy), payout.statementId, payout.key]));
  if (!source || source.productKey !== entry.productKey || source.contractNumber !== entry.contractNumber?.replace(/\D/g, "") ||
      (entry.source && entry.source !== source.source) || source.amount !== payout.amount ||
      source.code !== (payout.statementCode ?? payout.code)) return payout;
  return { ...payout, sourceValidFrom: source.validFrom, sourceSignedAt: source.signedAt, sourceBaseAmount: source.baseAmount };
}

export const COMMISSION_PAYOUT_AMOUNT_TOLERANCE = 10;
const FULL_STORNO_OFFSET_TOLERANCE = 0.01;

export const validPayoutAmount = (value: number | null | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export function isStornoPayoutRecord(record: Receipt): boolean {
  const status = String(record.status ?? "").trim().toLowerCase();
  const reason = String(record.differenceReason ?? "").trim().toLowerCase();
  return status === "storno" || reason === "storno" || validPayoutAmount(record.amount) < 0;
}

function payoutRecordsCanOffset(payout: Receipt, storno: Receipt, product?: Product): boolean {
  const payoutCode = baseCommissionCodeForPayoutComparison(payout.code, product);
  const stornoCode = baseCommissionCodeForPayoutComparison(storno.code, product);
  if (payoutCode && stornoCode && payoutCode !== stornoCode) return false;

  const payoutCareer = baseCommissionCodeForPayoutComparison(payout.career);
  const stornoCareer = baseCommissionCodeForPayoutComparison(storno.career);
  return !payoutCareer || !stornoCareer || payoutCareer === stornoCareer;
}

export function activePayoutRecordsAfterFullStornos<T extends Receipt>(records: T[], product?: Product): T[] {
  const pairedIndexes = new Set<number>();
  records.forEach((storno, stornoIndex) => {
    if (!isStornoPayoutRecord(storno) || pairedIndexes.has(stornoIndex)) return;
    const stornoAmount = Math.abs(validPayoutAmount(storno.amount));
    if (stornoAmount <= 0) return;
    const payoutIndex = records.findIndex((payout, index) => !pairedIndexes.has(index) &&
      !isStornoPayoutRecord(payout) && validPayoutAmount(payout.amount) > 0 &&
      Math.abs(validPayoutAmount(payout.amount) - stornoAmount) <= FULL_STORNO_OFFSET_TOLERANCE &&
      payoutRecordsCanOffset(payout, storno, product));
    if (payoutIndex < 0) return;
    pairedIndexes.add(payoutIndex);
    pairedIndexes.add(stornoIndex);
  });
  return pairedIndexes.size ? records.filter((_, index) => !pairedIndexes.has(index)) : records;
}

export function commissionStatementDay(record: Receipt): string | null {
  const periodEnd = record.statementPeriod?.match(/[-–]\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})\s*$/)?.[1];
  for (const date of [periodEnd, record.statementDate, record.statementChronologyMs]) {
    const czechDate = typeof date === "string" ? date.trim().match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/) : null;
    const day = endorsementCommissionDay(czechDate
      ? `${czechDate[3]}-${czechDate[2].padStart(2, "0")}-${czechDate[1].padStart(2, "0")}`
      : date);
    if (day) return day;
  }
  const month = record.payoutMonthKey?.match(/^(\d{4})-(0?[1-9]|1[0-2])$/);
  return month ? endorsementCommissionDay(new Date(Date.UTC(Number(month[1]), Number(month[2]), 0))) : null;
}

export function contractStornoDeductionKind(
  record: Receipt & { detail?: string | null; correction?: boolean },
  stornoDay: string | null,
  statementDay = commissionStatementDay(record),
): "storno" | "undated" | null {
  if (!isStornoPayoutRecord(record) || record.correction || record.detail?.startsWith("Součást opravného výpisu")) return null;
  if (!stornoDay || !statementDay) return "undated";
  return statementDay >= stornoDay ? "storno" : null;
}

export function wasNeonCommissionSettledBefore(
  receipts: Receipt[], changeDay: string, commissionPeriod: string | null,
): boolean {
  const prior = receipts.filter(receipt => {
    const day = commissionStatementDay(receipt);
    return day ? day < changeDay : Boolean(commissionPeriod && commissionPeriod < changeDay);
  });
  return activePayoutRecordsAfterFullStornos(prior, "neon").some(receipt =>
    !isStornoPayoutRecord(receipt) && validPayoutAmount(receipt.amount) > 0 &&
    ["", "paid", "difference"].includes(norm(receipt.status)));
}

/** Find one increase in an already authorized family for a legacy NV/NB receipt on the root. */
export function neonEndorsementForOriginalPayout<T extends EndorsementCommissionPlanEntry>(
  receipt: Receipt, increases: T[],
): T | null {
  if (!isLifeIncreaseCode(receipt.statementCode ?? receipt.code)) return null;
  if (receipt.sourceValidFrom) {
    return matchDatedLifeIncreaseReceipt(increases, { commissionCode: receipt.statementCode ?? receipt.code,
      status: isStornoPayoutRecord(receipt) ? "storno" : receipt.status,
      baseAmount: receipt.sourceBaseAmount ?? receipt.statementBaseAmount, validFrom: receipt.sourceValidFrom,
      signedAt: receipt.sourceSignedAt, commission: validPayoutAmount(receipt.amount) }, commissionStatementDay(receipt));
  }
  const base = receipt.sourceBaseAmount ?? receipt.statementBaseAmount;
  const candidates = base != null ? increases.filter(change => matchesLifePremiumIncrease(change, base)) : increases;
  if (candidates.length !== 1) return null;
  const day = commissionStatementDay(receipt);
  const effective = endorsementCommissionDay(candidates[0].policyStartDate);
  return day && effective && day >= effective ? candidates[0] : null;
}

/** Assign distinct source rows to their proven amendments in an already authorized portfolio. */
export function uniqueFamilyCommissionReceipts<T extends Entry>(entries: T[], evidence?: LifeIncreaseReceiptIndex): T[] {
  const families = new Map<string, T[]>();
  for (const entry of entries) {
    const owner = norm(entry.userEmail);
    const contractNumber = entry.contractNumber?.trim();
    const root = entry.rootContractEntryId || entry.originalEntryId || entry.id;
    if (!owner || !root || !contractNumber || !isLifeProduct(entry.productKey as Product)) continue;
    const key = JSON.stringify([owner, entry.productKey, contractNumber, root, entry.source ?? "own"]);
    const family = families.get(key) ?? [];
    family.push(entry);
    families.set(key, family);
  }
  const projected = new Map<T, Receipt[]>();
  for (const family of families.values()) {
    type Row = { source: T; target: T; payout: Receipt; rank: number; identity?: string };
    const rows: Row[] = [];
    const winners = new Map<string, Row>();
    for (const entry of family) {
      projected.set(entry, []);
      for (const original of entry.commissionPayouts ?? []) {
        const writer = norm(original.writtenBy);
        const amount = original.amount;
        if (!original.key || !original.statementId || !writer || typeof amount !== "number" || !Number.isFinite(amount)) {
          rows.push({ source: entry, target: entry, payout: original, rank: 0 });
          continue;
        }
        const payout = evidence?.size ? addLifeIncreaseReceiptEvidence(original, entry, evidence) : original;
        const code = payout.statementCode ?? payout.code;
        const increase = isLifeIncreaseCode(code);
        const amendment = increase && payout.sourceValidFrom && amount > 0 && !isStornoPayoutRecord(payout)
          ? matchDatedLifeIncreaseReceipt(family, { commissionCode: code, commission: amount,
              validFrom: payout.sourceValidFrom, signedAt: payout.sourceSignedAt,
              baseAmount: payout.sourceBaseAmount ?? payout.statementBaseAmount }, commissionStatementDay(payout)) : null;
        const preferredKind = increase ? entry.entryType === "endorsement" : entry.entryType !== "endorsement";
        const rank = (amendment ? 4 : 0) + (preferredKind ? 2 : 0) + Number(typeof payout.expectedAmount === "number");
        const identity = JSON.stringify([writer, payout.statementId, payout.key, payout.code, amount]);
        const row = { source: entry, target: amendment ?? entry, payout, rank, identity };
        const previous = winners.get(identity);
        if (!previous || rank > previous.rank) winners.set(identity, row);
        rows.push(row);
      }
    }
    const selected = rows.filter(row => !row.identity || winners.get(row.identity) === row);
    for (const row of selected) if (row.source === row.target) projected.get(row.target)!.push(row.payout);
    for (const row of selected) if (row.source !== row.target) projected.get(row.target)!.push(row.payout);
  }
  return entries.map(entry => {
    const payouts = projected.get(entry);
    const original = entry.commissionPayouts ?? [];
    return payouts && (payouts.length !== original.length || payouts.some((payout, index) => payout !== original[index]))
      ? { ...entry, commissionPayouts: payouts } : entry;
  });
}
