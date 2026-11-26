import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import {
  contractMatchesListFilters,
  contractSortDate,
  hasContractListClientFilters,
} from "./contractsApi.listFilters";
import type { ContractDoc, ContractListFilters } from "./contractsApi.types";
import { prepareContractSearch } from "@/app/lib/contractSearch";

export const CONTRACT_SEARCH_PROJECTION = [
  "clientName", "contractNumber", "contractSignedDate", "createdAt", "productKey",
] as const;

export function withVehicleSearchField(fields: readonly string[], filters: ContractListFilters): readonly string[] {
  return filters.vehiclePlate ? [...fields, "carPlate"] : fields;
}

/** The search projection retains product metadata used when displaying legacy matches. */
export function canUseProjectedContractSearch(filters?: ContractListFilters): boolean {
  if (!filters?.query.trim()) return false;
  return !hasContractListClientFilters({ ...filters, query: "" });
}

/**
 * Preserve the complete legacy scan and hydrate the requested page when needed.
 * No search-index completeness assumption, cache, writes or new index needed.
 * Additional filters keep their existing full-document path.
 */
export async function readProjectedContractSearchPage({
  db, ownerEmail, filters, cursor, pageSize, hydrate = true,
}: {
  db: Firestore;
  ownerEmail: string;
  filters: ContractListFilters;
  cursor: { ts: number; key: string | null } | null;
  pageSize: number;
  hydrate?: boolean;
}): Promise<DocumentSnapshot[] | null> {
  if (!canUseProjectedContractSearch(filters)) return null;
  const size = Math.floor(pageSize);
  if (!Number.isFinite(size) || size < 1 || size > 100) {
    throw new Error("Invalid projected search page size");
  }
  const snapshot = await db.collection("users").doc(ownerEmail)
    .collection("entries").select(...withVehicleSearchField(CONTRACT_SEARCH_PROJECTION, filters)).get();
  const search = prepareContractSearch(filters.query);
  const keyPrefix = `${ownerEmail.trim().toLowerCase()}___`;
  const candidates = snapshot.docs.flatMap(doc => {
    const data = doc.data() as ContractDoc;
    if (!contractMatchesListFilters(data, filters, ownerEmail, search)) return [];
    const ts = contractSortDate(data)?.getTime() ?? null;
    const key = keyPrefix + doc.id;
    if (cursor?.ts) {
      if (ts === null || ts > cursor.ts) return [];
      if (ts === cursor.ts && (!cursor.key || key >= cursor.key)) return [];
    }
    return [{ doc, ts, key }];
  }).sort((left, right) => {
    if (left.ts === null && right.ts === null) return 0;
    if (left.ts === null) return 1;
    if (right.ts === null) return -1;
    return right.ts - left.ts || (left.key === right.key ? 0 : left.key > right.key ? -1 : 1);
  }).slice(0, size + 1);

  if (candidates.length === 0) return [];
  if (!hydrate) return candidates.map(item => item.doc);
  if (!snapshot.readTime) throw new Error("Projected search snapshot has no read time");

  // Use the ordinary query's current read time, not a separate/latest read.
  // A concurrent edit or deletion cannot mix two versions of the portfolio.
  const hydrated = await db.runTransaction(
    transaction => transaction.getAll(...candidates.map(item => item.doc.ref)),
    { readOnly: true, readTime: snapshot.readTime },
  );
  const byPath = new Map(hydrated.map(doc => [doc.ref.path, doc]));
  return candidates.map(item => {
    const doc = byPath.get(item.doc.ref.path);
    if (!doc?.exists) throw new Error("Projected search snapshot is incomplete");
    return doc;
  });
}
