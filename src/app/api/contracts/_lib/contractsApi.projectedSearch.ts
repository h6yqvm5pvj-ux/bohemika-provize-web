import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import {
  contractMatchesListFilters,
  contractSortDate,
  hasContractListClientFilters,
} from "./contractsApi.listFilters";
import type { ContractDoc, ContractListFilters } from "./contractsApi.types";

export const CONTRACT_SEARCH_PROJECTION = [
  "clientName", "contractNumber", "contractSignedDate", "createdAt", "productKey",
] as const;

/** The search projection retains product metadata used when displaying legacy matches. */
export function canUseProjectedContractSearch(filters?: ContractListFilters): boolean {
  if (!filters?.query.trim()) return false;
  return !hasContractListClientFilters({ ...filters, query: "" });
}

/**
 * Preserve the complete legacy scan, but hydrate only the requested page.
 * No search-index completeness assumption, cache, writes or new index needed.
 * Additional filters keep their existing full-document path.
 */
export async function readProjectedContractSearchPage({
  db, ownerEmail, filters, cursor, pageSize,
}: {
  db: Firestore;
  ownerEmail: string;
  filters: ContractListFilters;
  cursor: { ts: number; key: string | null } | null;
  pageSize: number;
}): Promise<DocumentSnapshot[] | null> {
  if (!canUseProjectedContractSearch(filters)) return null;
  const size = Math.floor(pageSize);
  if (!Number.isFinite(size) || size < 1 || size > 100) {
    throw new Error("Invalid projected search page size");
  }
  const snapshot = await db.collection("users").doc(ownerEmail)
    .collection("entries").select(...CONTRACT_SEARCH_PROJECTION).get();
  const candidates = snapshot.docs.map(doc => {
    const data = doc.data() as ContractDoc;
    return {
      doc, data,
      ts: contractSortDate(data)?.getTime() ?? null,
      key: `${ownerEmail.trim().toLowerCase()}___${doc.id}`,
    };
  }).filter(item => {
    if (cursor?.ts) {
      if (item.ts === null || item.ts > cursor.ts) return false;
      if (item.ts === cursor.ts && (!cursor.key || item.key >= cursor.key)) return false;
    }
    return contractMatchesListFilters(item.data, filters, ownerEmail);
  }).sort((left, right) => {
    if (left.ts === null && right.ts === null) return 0;
    if (left.ts === null) return 1;
    if (right.ts === null) return -1;
    return right.ts - left.ts || (left.key === right.key ? 0 : left.key > right.key ? -1 : 1);
  }).slice(0, size + 1);

  if (candidates.length === 0) return [];
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
