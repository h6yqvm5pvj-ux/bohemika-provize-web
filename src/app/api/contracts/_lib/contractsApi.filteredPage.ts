import type { DocumentSnapshot, Firestore, QuerySnapshot } from "firebase-admin/firestore";
import { contractMatchesListFilters, contractSortDate } from "./contractsApi.listFilters";
import type { ContractDoc, ContractListFilters } from "./contractsApi.types";

// These fields cover search, lifecycle, anniversaries, products and replacements.
// Commission checks use full records because their cashflow calculation needs the complete input.
export const CONTRACT_FILTER_PROJECTION = [
  "clientName", "contractNumber", "contractSignedDate", "createdAt", "productKey", "paid", "position",
  "status", "stornoDate", "policyStartDate", "policyEndDate", "durationYears", "durationMonths",
  "isRefresh", "refreshOriginalContractNumber", "refreshCommissionBase", "userEmail",
] as const;

export async function readFilteredContractPage({ db, owners, filters, cursor, pageSize }: {
  db: Firestore;
  owners: string[];
  filters: ContractListFilters;
  cursor: { ts: number; key: string | null } | null;
  pageSize: number;
}): Promise<{ doc: DocumentSnapshot; ownerEmail: string }[]> {
  const project = filters.commissionAuditMode === "off";
  const snapshots: { ownerEmail: string; snapshot: QuerySnapshot }[] = [];
  for (let start = 0; start < owners.length; start += 10) {
    snapshots.push(...await Promise.all(owners.slice(start, start + 10).map(async ownerEmail => {
      const entries = db.collection("users").doc(ownerEmail).collection("entries");
      const snapshot = await (project ? entries.select(...CONTRACT_FILTER_PROJECTION) : entries).get();
      return { ownerEmail, snapshot };
    })));
  }

  // Filter before pagination: a rare match can be older than the query batch limit.
  // Stored category/lifecycle/paid indexes may also be absent on legacy entries.
  const candidates = snapshots.flatMap(({ ownerEmail, snapshot }) => snapshot.docs.map(doc => {
    const data = doc.data() as ContractDoc;
    return { doc, ownerEmail, snapshot, data, ts: contractSortDate(data)?.getTime() ?? null, key: `${ownerEmail}___${doc.id}` };
  })).filter(item => {
    if (cursor?.ts) {
      if (item.ts === null || item.ts > cursor.ts) return false;
      if (item.ts === cursor.ts && (!cursor.key || item.key >= cursor.key)) return false;
    }
    return contractMatchesListFilters(item.data, filters, item.ownerEmail);
  }).sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0) || (a.key === b.key ? 0 : a.key > b.key ? -1 : 1))
    .slice(0, pageSize + 1);

  if (!project || candidates.length === 0) return candidates.map(({ doc, ownerEmail }) => ({ doc, ownerEmail }));
  const hydrated = new Map<string, DocumentSnapshot>();
  const pageOwners = [...new Set(candidates.map(item => item.ownerEmail))];
  for (let start = 0; start < pageOwners.length; start += 10) {
    await Promise.all(pageOwners.slice(start, start + 10).map(async ownerEmail => {
      const selected = candidates.filter(item => item.ownerEmail === ownerEmail);
      const readTime = selected[0].snapshot.readTime;
      if (!readTime) throw new Error("Filtered contract snapshot has no read time");
      const docs = await db.runTransaction(
        transaction => transaction.getAll(...selected.map(item => item.doc.ref)),
        { readOnly: true, readTime },
      );
      for (const doc of docs) hydrated.set(doc.ref.path, doc);
    }));
  }
  return candidates.map(item => {
    const doc = hydrated.get(item.doc.ref.path);
    if (!doc?.exists) throw new Error("Filtered contract snapshot is incomplete");
    return { doc, ownerEmail: item.ownerEmail };
  });
}
