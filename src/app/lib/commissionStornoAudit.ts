import { contractLifecycleStatus } from "./contractLifecycle";
import { commissionStatementDay, isStornoPayoutRecord, uniqueFamilyCommissionReceipts } from "./commissionReceipts";
import { buildCommissionStornoComparison, commissionStornoCode, type CommissionStornoEntry } from "./commissionStornoComparison";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import { isRecordOnlyProduct } from "./productCatalog";

export const MISSING_STORNO_ESTIMATE_MODE = "missing_storno_estimate";

export const STORNO_ESTIMATE_ISSUE_LABELS = {
  missing_storno_date: "Chybí platné datum účinnosti storna",
  missing_start: "Chybí platný počátek pojištění",
  missing_payout: "V historii chybí doložená výplata pro výpočet",
  missing_code: "U provizního záznamu chybí kód",
  payout_date: "Výplatu nelze podle výpisu zařadit před storno",
  unresolved_estimate: "Z dostupných údajů nelze určit vratku pro všechny kódy",
} as const;

export type StornoEstimateIssue = keyof typeof STORNO_ESTIMATE_ISSUE_LABELS;

type CommissionReceipt = NonNullable<CommissionStornoEntry["commissionPayouts"]>[number];
type FamilyEntry = Omit<CommissionStornoEntry, "commissionPayouts" | "items"> & {
  commissionPayouts?: CommissionReceipt[] | null;
  items?: NonNullable<CommissionStornoEntry["items"]>[number][] | null;
  parentContractEntryId?: string | null;
  contractNumber?: string | null;
  userEmail?: string | null;
};
type FamilyInput<T extends FamilyEntry> = {
  contract: T;
  timeline: readonly T[];
  ownerEmail: string | null;
};

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const email = (value: unknown): string => text(value).toLowerCase();

/** Both callers supply entries already authorized by the contract API. */
export function connectedContractFamily<T extends FamilyEntry>({ contract, timeline, ownerEmail }: FamilyInput<T>): T[] {
  const owner = email(ownerEmail);
  if (!owner || !contract.id || (contract.userEmail && email(contract.userEmail) !== owner)) return [];
  const rootId = contract.entryType === "endorsement" ? text(contract.rootContractEntryId) : contract.id;
  const entries = new Map<string, T>();
  for (const entry of timeline) {
    if (!entry.id || entry.productKey !== contract.productKey || (entry.userEmail && email(entry.userEmail) !== owner)) continue;
    if (text(contract.contractNumber) && text(entry.contractNumber) &&
      text(contract.contractNumber).replace(/\s+/g, "") !== text(entry.contractNumber).replace(/\s+/g, "")) continue;
    if (entry.entryType === "endorsement"
      ? entry.rootContractEntryId !== rootId || !entry.parentContractEntryId || entry.parentContractEntryId === entry.id
      : entry.id !== rootId) continue;
    if (!entries.has(entry.id)) entries.set(entry.id, entry);
  }
  entries.set(contract.id, contract);
  const reachable = new Set(entries.has(rootId) ? [rootId] : [contract.id]);
  const children = new Map<string, T[]>();
  for (const entry of entries.values()) {
    if (entry.entryType !== "endorsement" || !entry.parentContractEntryId) continue;
    const siblings = children.get(entry.parentContractEntryId) ?? [];
    siblings.push(entry);
    children.set(entry.parentContractEntryId, siblings);
  }
  const queue = [...reachable];
  for (let index = 0; index < queue.length; index++) {
    for (const entry of children.get(queue[index]) ?? []) {
      if (reachable.has(entry.id)) continue;
      reachable.add(entry.id);
      queue.push(entry.id);
    }
  }
  return [...entries.values()].filter(entry => reachable.has(entry.id));
}

export function calculateContractStornoRows(family: FamilyEntry[], ownerEmail: string | null, viewerEmail: string | null, stornoDate: unknown) {
  return buildCommissionStornoComparison({
    entries: uniqueFamilyCommissionReceipts(family.map(entry => ({ ...entry, userEmail: email(ownerEmail) }))),
    ownerEmail, viewerEmail, stornoDate,
  });
}

export function getStornoEstimateIssue<T extends FamilyEntry & { status?: string | null; stornoDate?: unknown }>(
  input: FamilyInput<T>, viewerEmail: string,
): StornoEstimateIssue | null {
  const { contract, ownerEmail } = input;
  const viewer = email(viewerEmail);
  if (!viewer || !contract.productKey || isRecordOnlyProduct(contract.productKey) ||
      contract.entryType === "endorsement" || contractLifecycleStatus(contract) !== "storno") return null;
  const family = connectedContractFamily(input);
  if (family.length === 0) return null;
  const receipts = family.flatMap(entry => (entry.commissionPayouts ?? []).filter(payout =>
    email(payout.writtenBy) === viewer && ["", "paid", "difference", "storno"].includes(email(payout.status))));
  if (email(ownerEmail) !== viewer && !receipts.length && !family.some(entry =>
    entry.managerOverrides?.some(override => email(override.email) === viewer))) return null;
  const day = endorsementCommissionDay(contract.stornoDate);
  if (!day) return "missing_storno_date";
  const start = endorsementCommissionDay(contract.policyStartDate);
  if (!start || start > day) return "missing_start";

  const rows = calculateContractStornoRows(family, ownerEmail, viewer, day);
  const unresolved = rows.filter(row => row.estimated === null);
  const payments = receipts.filter(receipt => typeof receipt.amount === "number" &&
    Number.isFinite(receipt.amount) && receipt.amount > 0 && !isStornoPayoutRecord(receipt));
  if (rows.length === 0) return payments.length === 0 ? "missing_payout" : null;
  if (unresolved.length === 0) return null;
  if (unresolved.some(row => !row.code)) return "missing_code";
  const unresolvedCodes = new Set(unresolved.filter(row => row.paid === null).map(row => row.code));
  const unresolvedPayments = payments.filter(receipt =>
    unresolvedCodes.has(commissionStornoCode(receipt.code || receipt.statementCode, contract.productKey)));
  if (unresolvedPayments.some(receipt => {
    const date = commissionStatementDay(receipt);
    return !date || date >= day;
  })) return "payout_date";
  if (unresolvedCodes.size && !unresolvedPayments.length) return "missing_payout";
  return "unresolved_estimate";
}
