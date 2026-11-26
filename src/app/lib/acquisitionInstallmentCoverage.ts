import { baseCommissionCodeForPayoutComparison } from "./commissionPayoutRules";
import { autoCommissionReceiptMonth, type AutoCommissionReceipt } from "./autoSubsequentInstallmentCoverage";

type Installment = { code: string; codes: string[]; amount: number; commissionPeriod?: string | null };
type Receipt = AutoCommissionReceipt & { key?: string | null; systemBaseAmount?: number | null };
type InstallmentReceipts = { part: Installment; expected: number; received: number; indices: number[] };
type Transfer = { target: InstallmentReceipts; amount: number };
type Allocation = { sourceIndex: number; donor: InstallmentReceipts; transfers: Transfer[] };
export type AcquisitionCoverage = { installmentCoverageNote?: string; installmentSourceCode?: string | null };
const cents = (value: number) => Math.round(value * 100);
const money = (value: number) => value.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const positive = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const statementBase = (receipt: Receipt) => receipt.sourceBaseAmount ?? receipt.statementBaseAmount;
const closeToSingle = (amount: number, expected: number) => Math.abs(amount - expected) <= Math.max(1, expected * 0.02);
const COMBINED_COMMISSION_TOLERANCE_CENTS = 1000;

const eligibleReceipt = (receipt: Receipt) =>
  positive(receipt.amount) && ["", "paid", "difference"].includes(receipt.status ?? "") &&
  (!receipt.differenceReason || ["commission_amount_mismatch", "premium_base_mismatch"].includes(receipt.differenceReason)) &&
  (receipt.expectedAmount == null || Number.isFinite(receipt.expectedAmount));

function targetPeriodHasStarted(part: Installment, paidMonth: number | null): boolean {
  if (paidMonth == null || !part.commissionPeriod) return true;
  const [year, month] = part.commissionPeriod.split("-").map(Number);
  return paidMonth >= year * 12 + month;
}

function verifiedTransfers(donor: InstallmentReceipts, targets: InstallmentReceipts[], expectedTotal: number): Transfer[] | null {
  let expectedSoFar = donor.expected;
  let allocated = Math.round(donor.received * expectedSoFar / expectedTotal);
  if (allocated <= 0) return null;
  const transfers: Transfer[] = [];
  for (const target of targets) {
    expectedSoFar += target.expected;
    const next = Math.round(donor.received * expectedSoFar / expectedTotal);
    if (next <= allocated) return null;
    transfers.push({ target, amount: next - allocated });
    allocated = next;
  }
  return transfers;
}

function legacyAllocation(
  groups: InstallmentReceipts[], missing: InstallmentReceipts[], receipts: readonly Receipt[],
): Allocation | null {
  const tolerance = groups.length; // At most one haléř of rounding per installment.
  const donors = groups.filter(group => group.received > group.expected + tolerance);
  if (donors.length !== 1 || donors[0].indices.length !== 1) return null;
  const donor = donors[0];
  const totalDifference = groups.reduce((sum, group) => sum + group.received - group.expected, 0);
  const inconsistent = groups.some(group => group.indices.length && (group.received < group.expected - 1 ||
    group.indices.some(index => {
      const receipt = receipts[index];
      return !eligibleReceipt(receipt) || receipt.differenceReason === "premium_base_mismatch" ||
        (receipt.expectedAmount != null && Math.abs(cents(receipt.expectedAmount) - group.expected) > 1);
    })));
  if (Math.abs(totalDifference) > tolerance || inconsistent) return null;
  const transfers: Transfer[] = [];
  let available = donor.received - donor.expected;
  for (const target of missing) {
    const amount = Math.min(target.expected, available);
    if (!amount || target.expected - amount > tolerance) return null;
    transfers.push({ target, amount });
    available -= amount;
  }
  return available <= tolerance ? { sourceIndex: donor.indices[0], donor, transfers } : null;
}

/** Read-only allocation within one authorized contract's complete first-year A schedule. */
export function projectAcquisitionInstallmentReceipts<T extends Receipt>(
  receipts: T[], installments: Installment[],
): (T & AcquisitionCoverage)[] {
  const groups: InstallmentReceipts[] = installments.map(part => ({ part, expected: cents(part.amount), received: 0, indices: [] }));
  if (groups.length < 2 || groups.length > 12 || groups.some(({ part, expected }, index) =>
    part.code !== `A${101 + index}` || !Number.isSafeInteger(expected) || expected <= 0)) return receipts;
  for (const [index, receipt] of receipts.entries()) {
    const code = baseCommissionCodeForPayoutComparison(receipt.code);
    if (!/^(?:A|AC)\d/.test(code)) continue;
    const groupIndex = groups.findIndex(group => group.part.codes.includes(code));
    // A range or unknown A code could represent several of the same periods.
    if (groupIndex < 0) return receipts;
    if (positive(receipt.amount)) groups[groupIndex].received += cents(receipt.amount);
    groups[groupIndex].indices.push(index);
  }
  const missing = groups.filter(group => group.indices.length === 0);
  if (!missing.length) return receipts;

  const observedBases = groups.flatMap(group => {
    if (group.indices.length !== 1 || !closeToSingle(group.received, group.expected)) return [];
    const receipt = receipts[group.indices[0]];
    const base = statementBase(receipt);
    return eligibleReceipt(receipt) && !receipt.differenceReason && positive(base) ? [cents(base)] : [];
  });
  const candidates: Allocation[] = [];
  let hasComparableBase = false;
  let matchesAllOpenPeriods = false;
  for (const [position, donor] of groups.entries()) {
    if (donor.indices.length !== 1 || donor.received <= donor.expected + groups.length) continue;
    const sourceIndex = donor.indices[0];
    const source = receipts[sourceIndex];
    if (!eligibleReceipt(source)) continue;
    const base = statementBase(source);
    const singleBases = positive(source.systemBaseAmount) ? [...observedBases, cents(source.systemBaseAmount)] : observedBases;
    if (!positive(base) || !singleBases.length) continue;
    hasComparableBase = true;
    if (source.expectedAmount != null && !closeToSingle(cents(source.expectedAmount), donor.expected)) continue;

    const paidMonth = autoCommissionReceiptMonth(source);
    const sizes = new Set(singleBases.map(single => cents(base) / single)
      .filter(count => Number.isInteger(count) && count >= 2 && count <= groups.length));
    matchesAllOpenPeriods ||= sizes.has(missing.length + 1);
    for (const count of sizes) {
      for (let start = Math.max(0, position - count + 1); start <= Math.min(position, groups.length - count); start++) {
        const targets = groups.slice(start, start + count).filter(group => group !== donor);
        // A verified payment can settle all remaining periods in advance.
        // For a partial bundle, the statement date excludes future targets.
        if (targets.some(group => group.indices.length ||
          (targets.length !== missing.length && !targetPeriodHasStarted(group.part, paidMonth)))) continue;
        const expectedTotal = targets.reduce((sum, group) => sum + group.expected, donor.expected);
        if (Math.abs(donor.received - expectedTotal) > COMBINED_COMMISSION_TOLERANCE_CENTS) continue;
        const transfers = verifiedTransfers(donor, targets, expectedTotal);
        if (transfers) candidates.push({ sourceIndex, donor, transfers });
      }
    }
  }

  const allocations = new Map<number, Allocation>();
  for (const candidate of candidates) {
    // Competing placements leave the receipt and disputed installments open.
    const ambiguous = candidates.some(other => other !== candidate &&
      (other.sourceIndex === candidate.sourceIndex ||
        other.transfers.some(({ target }) => candidate.transfers.some(transfer => transfer.target === target))));
    if (!ambiguous) allocations.set(candidate.sourceIndex, candidate);
  }
  if (!candidates.length && (!hasComparableBase || matchesAllOpenPeriods)) {
    const legacy = legacyAllocation(groups, missing, receipts);
    if (legacy) allocations.set(legacy.sourceIndex, legacy);
  }
  if (!allocations.size) return receipts;

  return receipts.flatMap((receipt, index) => {
    const match = allocations.get(index);
    if (!match) return [receipt];
    const { donor, transfers } = match;
    const originalAmount = receipt.amount!;
    const coveredCodes = transfers.map(({ target }) => target.part.code).join(", ");
    const note = `Souhrnná výplata pod kódem ${receipt.code}: ${money(originalAmount)} Kč. Pokrývá také ${coveredCodes}.`;
    const allocation = (group: InstallmentReceipts, amount: number, suffix: string) => ({
      ...receipt, code: group.part.code, amount: amount / 100, expectedAmount: group.expected / 100,
      status: "paid", difference: 0, differenceReason: null, detail: null,
      key: `${receipt.key ?? index}${suffix}`, installmentCoverageNote: note, installmentSourceCode: receipt.code,
    });
    return [allocation(donor, donor.received - transfers.reduce((sum, transfer) => sum + transfer.amount, 0), ""),
      ...transfers.map(({ target, amount }) => allocation(target, amount, `:covers:${target.part.code}`))];
  });
}
