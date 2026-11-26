import { contractPdfFamilyKey, readWithoutPdfPage } from "./contractsApi.withoutPdf";
import type { DocumentSnapshot, Firestore, Timestamp } from "firebase-admin/firestore";
import { contractHasPdfAttachment, contractMatchesListFilters, contractProductKeysForFilters, contractSortDate } from "./contractsApi.listFilters";
import type { ContractDoc, ContractListFilters } from "./contractsApi.types";
import { exactContractNumberFromSearch, prepareContractSearch } from "@/app/lib/contractSearch";
import { canUseProjectedContractSearch, CONTRACT_SEARCH_PROJECTION, withVehicleSearchField } from "./contractsApi.projectedSearch";
import { filterStatementDerivedContractDataForViewer, type StatementDataViewer } from "./contractsApi.statementVisibility";
import { hasContractAccess } from "./contractsApi.access";
import { isFirestoreFailedPrecondition } from "./contractsApi.duplicates";
import { getStornoEstimateIssue, MISSING_STORNO_ESTIMATE_MODE, type StornoEstimateIssue } from "@/app/lib/commissionStornoAudit";

// These fields cover search, lifecycle, anniversaries, products and replacements.
// Commission checks use full records because their cashflow calculation needs the complete input.
export const CONTRACT_FILTER_PROJECTION = [
  "clientName", "contractNumber", "contractSignedDate", "createdAt", "productKey", "paid", "position",
  "acquisitionType", "status", "stornoDate", "policyStartDate", "policyEndDate", "durationYears", "durationMonths",
  "isRefresh", "refreshOriginalContractNumber", "refreshCommissionBase", "userEmail",
  "contractPdfAttachment", "entryType", "rootContractEntryId",
] as const;

export async function readFilteredContractPage({ db, owners, filters, cursor, pageSize, viewer, hydrate = true }: {
  db: Firestore;
  owners: string[];
  filters: ContractListFilters;
  cursor: { ts: number; key: string | null } | null;
  pageSize: number;
  viewer: StatementDataViewer;
  hydrate?: boolean;
}): Promise<{ matches: { doc: DocumentSnapshot; ownerEmail: string; ts: number | null; stornoEstimateIssue?: StornoEstimateIssue }[]; totalCount?: number }> {
  const auditStorno = filters.commissionAuditMode === MISSING_STORNO_ESTIMATE_MODE;
  const project = filters.commissionAuditMode === "off" || auditStorno;
  const projection = withVehicleSearchField(
    !auditStorno && canUseProjectedContractSearch(filters) ? CONTRACT_SEARCH_PROJECTION : CONTRACT_FILTER_PROJECTION,
    filters,
  );
  if (filters.withoutPdfOnly && filters.commissionAuditMode === "off") {
    return { matches: await readWithoutPdfPage(db, owners, filters, cursor, pageSize, projection, hydrate) };
  }
  const rowFilters: ContractListFilters = auditStorno ? { ...filters, stornoOnly: true, commissionAuditMode: "off" } : filters;
  const search = prepareContractSearch(filters.query);
  const exactNumber = exactContractNumberFromSearch(filters.query);
  const productKeys = contractProductKeysForFilters(filters);
  if (productKeys?.length === 0) return { matches: [], ...(auditStorno ? { totalCount: 0 } : {}) };
  let totalCount = 0;
  const visibleOwners = auditStorno ? owners.filter(ownerEmail => hasContractAccess({
    ownerEmail, viewerEmail: viewer.viewerEmail, teamEmails: viewer.teamEmails, contract: {},
  })) : owners;
  const candidates: {
    doc: DocumentSnapshot;
    ownerEmail: string;
    readTime: Timestamp;
    ts: number | null;
    key: string;
    stornoEstimateIssue?: StornoEstimateIssue;
  }[] = [];
  for (let start = 0; start < visibleOwners.length; start += 10) {
    const snapshots = await Promise.all(visibleOwners.slice(start, start + 10).map(async ownerEmail => {
      const entries = db.collection("users").doc(ownerEmail).collection("entries");
      // PDF and storno checks require related entries even when those entries
      // fail the selected filters. Other queries can use the stored source fields.
      let query: FirebaseFirestore.Query = entries;
      if (!filters.withoutPdfOnly && !auditStorno) {
        if (exactNumber) query = entries.where("contractNumber", "==", exactNumber);
        else if (productKeys && productKeys.length <= 30) query = entries.where("productKey", "in", productKeys);
        else if (filters.positions.size > 0) query = entries.where("position", "in", [...filters.positions]);
      }
      const read = (source: FirebaseFirestore.Query) => (project ? source.select(...projection) : source).get();
      const snapshot = await read(query).catch((error: unknown) => {
        if (query !== entries && isFirestoreFailedPrecondition(error)) return read(entries);
        throw error;
      });
      return { ownerEmail, snapshot };
    }));

    for (const { ownerEmail, snapshot } of snapshots) {
      const familyHasPdf = new Set<string>();
      const explicitRootEntryKeys = new Set<string>();
      const sourceEntries = filters.withoutPdfOnly || auditStorno
        ? new Map(snapshot.docs.map(doc => [doc.id, doc.data() as ContractDoc]))
        : null;
      if (filters.withoutPdfOnly && sourceEntries) {
        for (const contract of sourceEntries.values()) {
          if (contract.entryType !== "endorsement") continue;
          const rootId = (contract.rootContractEntryId ?? "").trim();
          if (rootId) explicitRootEntryKeys.add(`${ownerEmail}___${rootId}`);
        }
        for (const [docId, contract] of sourceEntries) {
          if (contractHasPdfAttachment(contract)) {
            familyHasPdf.add(contractPdfFamilyKey({ ownerEmail, docId, contract, explicitRootEntryKeys }));
          }
        }
      }

      const hasFamilyPdf = (id: string, contract: ContractDoc) => filters.withoutPdfOnly
        ? familyHasPdf.has(contractPdfFamilyKey({ ownerEmail, docId: id, contract, explicitRootEntryKeys })) : undefined;
      const matchesRow = (id: string, contract: ContractDoc) =>
        contractMatchesListFilters(contract, rowFilters, ownerEmail, search, hasFamilyPdf(id, contract));

      const auditEntries = new Map<string, ContractDoc & { id: string }>();
      const auditFamilies = new Map<string, (ContractDoc & { id: string })[]>();
      const auditDocs = new Map<string, DocumentSnapshot>();
      if (auditStorno && sourceEntries) {
        const roots = new Set([...sourceEntries].flatMap(([id, contract]) =>
          contract.entryType !== "endorsement" && matchesRow(id, contract) ? [id] : []));
        const inputs = snapshot.docs.filter(doc => {
          const entry = sourceEntries.get(doc.id);
          return roots.has(entry?.entryType === "endorsement" ? entry.rootContractEntryId ?? "" : doc.id);
        });
        for (let offset = 0; offset < inputs.length; offset += 100) {
          if (!snapshot.readTime) throw new Error("Storno audit snapshot has no read time");
          const details = await db.runTransaction(
            transaction => transaction.getAll(...inputs.slice(offset, offset + 100).map(doc => doc.ref)),
            { readOnly: true, readTime: snapshot.readTime },
          );
          if (details.length !== Math.min(inputs.length - offset, 100) || details.some(doc => !doc.exists)) {
            throw new Error("Storno audit snapshot is incomplete");
          }
          for (const doc of details) auditDocs.set(doc.id, doc);
        }
        for (const [id, doc] of auditDocs) {
          const contract = doc.data() as ContractDoc;
          if (!hasContractAccess({ ownerEmail, viewerEmail: viewer.viewerEmail, teamEmails: viewer.teamEmails, contract })) continue;
          const visible = filterStatementDerivedContractDataForViewer({ contract, ownerEmail, ...viewer });
          const entry = { ...visible, id, items: visible.items ?? visible.result?.items ?? undefined };
          auditEntries.set(id, entry);
          const rootId = entry.entryType === "endorsement" ? entry.rootContractEntryId : entry.id;
          if (!rootId) continue;
          const family = auditFamilies.get(rootId) ?? [];
          family.push(entry);
          auditFamilies.set(rootId, family);
        }
      }

      // Filter before pagination, including old entries that have no stored list indexes.
      for (const doc of snapshot.docs) {
        const contract = sourceEntries?.get(doc.id) ?? doc.data() as ContractDoc;
        let ts: number | null | undefined;
        if (!auditStorno && cursor?.ts) {
          ts = contractSortDate(contract)?.getTime() ?? null;
          if (ts === null || ts > cursor.ts) continue;
          if (ts === cursor.ts && (!cursor.key || `${ownerEmail}___${doc.id}` >= cursor.key)) continue;
        }
        const data = project ? contract : filterStatementDerivedContractDataForViewer({ contract, ownerEmail, ...viewer });
        if (!matchesRow(doc.id, data)) continue;
        let stornoEstimateIssue: StornoEstimateIssue | undefined;
        if (auditStorno) {
          const entry = auditEntries.get(doc.id);
          if (!entry) continue;
          const issue = getStornoEstimateIssue({ contract: entry, timeline: auditFamilies.get(doc.id) ?? [], ownerEmail }, viewer.viewerEmail);
          if (!issue) continue;
          stornoEstimateIssue = issue;
          totalCount++;
          ts = contractSortDate(data)?.getTime() ?? 0;
          if (cursor && (ts > cursor.ts || (ts === cursor.ts && (!cursor.key || `${ownerEmail}___${doc.id}` >= cursor.key)))) continue;
        }
        candidates.push({
          doc: auditDocs.get(doc.id) ?? doc, ownerEmail, readTime: snapshot.readTime,
          ts: ts === undefined ? contractSortDate(data)?.getTime() ?? null : ts,
          key: `${ownerEmail}___${doc.id}`,
          stornoEstimateIssue,
        });
      }
    }
  }

  candidates.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0) || (a.key === b.key ? 0 : a.key > b.key ? -1 : 1));
  const page = candidates.slice(0, pageSize + 1);

  const pagination = auditStorno ? { totalCount } : {};
  if (!hydrate || !project || auditStorno || page.length === 0) return { matches: page, ...pagination };
  const hydrated = new Map<string, DocumentSnapshot>();
  const pageOwners = [...new Set(page.map(item => item.ownerEmail))];
  for (let start = 0; start < pageOwners.length; start += 10) {
    await Promise.all(pageOwners.slice(start, start + 10).map(async ownerEmail => {
      const selected = page.filter(item => item.ownerEmail === ownerEmail);
      const readTime = selected[0].readTime;
      if (!readTime) throw new Error("Filtered contract snapshot has no read time");
      const docs = await db.runTransaction(
        transaction => transaction.getAll(...selected.map(item => item.doc.ref)),
        { readOnly: true, readTime },
      );
      for (const doc of docs) hydrated.set(doc.ref.path, doc);
    }));
  }
  const matches = page.map(item => {
    const doc = hydrated.get(item.doc.ref.path);
    if (!doc?.exists) throw new Error("Filtered contract snapshot is incomplete");
    return { doc, ownerEmail: item.ownerEmail, ts: item.ts, stornoEstimateIssue: item.stornoEstimateIssue };
  });
  return { matches, ...pagination };
}
