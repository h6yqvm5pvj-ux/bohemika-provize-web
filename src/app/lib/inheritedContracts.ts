import type { CommissionResultDTO, CommissionResultItemDTO, Position } from "@/app/types/domain";
import { totalWithMultipliers } from "./commissionTotals";

export type InheritedContractFields = {
  acquisitionType?: "inherited" | null;
  originalAdviserName?: string | null;
  originalPosition?: Position | null;
  transferEffectiveDate?: string | null;
};

export const isInheritedContract = (entry: { acquisitionType?: unknown } | null | undefined): boolean =>
  entry?.acquisitionType === "inherited";

export function isSubsequentCommissionItem(item: Pick<CommissionResultItemDTO, "title">): boolean {
  const title = item.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Deferred acquisition instalments (including B36/B48) are not servicing income.
  return title.includes("nasledna") || title.includes("pecovatelska");
}

export function inheritedCommissionResult(result: CommissionResultDTO): CommissionResultDTO {
  const items = result.items.filter(isSubsequentCommissionItem).map((item) => ({
    ...item,
    // These rows are informational only in the acquisition total. For an
    // inherited contract they are the commission rates that belong to its owner.
    excludeFromTotal: false,
  }));
  return { items, total: totalWithMultipliers(items) };
}

/** Reapply the entitlement when reading records that may have been recalculated. */
export function withInheritedCommissionItems<T extends InheritedContractFields & {
  items?: CommissionResultItemDTO[] | null;
  total?: number | null;
  result?: { items?: CommissionResultItemDTO[] | null; total?: number | null } | null;
}>(entry: T): T {
  if (!isInheritedContract(entry)) return entry;
  const result = inheritedCommissionResult({ items: entry.items ?? entry.result?.items ?? [], total: 0 });
  return { ...entry, ...result, result: { ...entry.result, ...result } };
}
