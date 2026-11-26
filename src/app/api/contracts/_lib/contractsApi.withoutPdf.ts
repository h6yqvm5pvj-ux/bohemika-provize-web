import type { DocumentSnapshot, Firestore, QueryDocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { isRetiredProduct } from "@/app/lib/retiredProducts";
import { prepareContractSearch } from "@/app/lib/contractSearch";
import { hallParticipantId } from "@/lib/server/hallOfFame";
import { contractHasPdfAttachment, contractMatchesListFilters, contractSortDate, hasContractListFilters } from "./contractsApi.listFilters";
import type { ContractDoc, ContractListFilters } from "./contractsApi.types";

export function contractPdfFamilyKey({ ownerEmail, docId, contract, explicitRootEntryKeys }: {
  ownerEmail: string;
  docId: string;
  contract: ContractDoc;
  explicitRootEntryKeys: Set<string>;
}): string {
  const contractNo = (contract.contractNumber ?? "").trim().toLowerCase();
  const productKey = (contract.productKey ?? "unknown").toString();
  const isEndorsement = contract.entryType === "endorsement";
  const rootContractEntryId = (contract.rootContractEntryId ?? "").trim();
  const explicitRootKey = rootContractEntryId ? `${ownerEmail}___${rootContractEntryId}` : "";
  const ownRootKey = `${ownerEmail}___${docId}`;
  const isExplicitRootContract = !isEndorsement && explicitRootEntryKeys.has(ownRootKey);

  if (explicitRootKey || isExplicitRootContract) {
    return `${ownerEmail}___root___${rootContractEntryId || docId}`;
  }
  if (contractNo) return `${ownerEmail}___${productKey}___${contractNo}`;
  return `${ownerEmail}___entry___${docId}`;
}

type MissingRow = { id: string; ts: number | null };
type Candidate = MissingRow & { ownerEmail: string; key: string; readTime: Timestamp };
export const PDF_FIELDS = ["contractPdfAttachment", "contractNumber", "productKey", "entryType", "rootContractEntryId", "contractSignedDate", "createdAt"];

function missingRows(ownerEmail: string, docs: QueryDocumentSnapshot[]): MissingRow[] {
  const roots = new Set<string>();
  const families = new Set<string>();
  const contracts = docs.map(doc => ({ docId: doc.id, contract: doc.data() as ContractDoc }));
  for (const { contract } of contracts) {
    const root = contract.rootContractEntryId?.trim();
    if (contract.entryType === "endorsement" && root) roots.add(`${ownerEmail}___${root}`);
  }
  const family = (row: typeof contracts[number]) => contractPdfFamilyKey({ ...row, ownerEmail, explicitRootEntryKeys: roots });
  for (const row of contracts) if (contractHasPdfAttachment(row.contract)) families.add(family(row));
  return contracts.filter(row => !isRetiredProduct(row.contract.productKey) && !families.has(family(row)))
    .map(({ docId, contract }) => ({ id: docId, ts: contractSortDate(contract)?.getTime() ?? null }));
}

async function ownerMissingIndex(db: Firestore, owner: string) {
  const marker = db.collection("hallOfFameOwners").doc(hallParticipantId(owner));
  const cache = marker.collection("contractLists").doc("withoutPdfV1");
  const parts = cache.collection("parts");
  const entries = db.collection("users").doc(owner).collection("entries");
  const state = await db.runTransaction(async tx => {
    const [source, stored] = await tx.getAll(marker, cache);
    const revision = source.data()?.revision ?? null;
    const data = stored.data();
    // Expiry also bounds staleness after out-of-band operator writes.
    if (data && data.revision === revision && data.builtAt > Date.now() - 300_000 && Array.isArray(data.rows)) {
      const rows: MissingRow[] = [...data.rows];
      for (let start = 1; start < data.parts; start += 100) {
        const refs = Array.from({ length: Math.min(100, data.parts - start) }, (_, i) => parts.doc(String(start + i)));
        for (const part of await tx.getAll(...refs)) rows.push(...part.data()!.rows);
      }
      return { hit: true, revision, rows, readTime: source.readTime };
    }
    const snapshot = await tx.get(entries.select(...PDF_FIELDS));
    return { hit: false, revision, rows: missingRows(owner, snapshot.docs), readTime: snapshot.readTime };
  }, { readOnly: true });

  if (!state.hit) {
    // Even a maximum-length Firestore ID fits well below 1 MiB in chunks of 100 rows.
    const chunkSize = 100;
    const count = Math.max(1, Math.ceil(state.rows.length / chunkSize));
    // Publish all parts atomically. Oversized indexes still return a complete live result.
    if (count <= 400 && Buffer.byteLength(JSON.stringify(state.rows)) < 4_000_000) {
      await db.runTransaction(async tx => {
        const [current, previous] = await tx.getAll(marker, cache);
        if ((current.data()?.revision ?? null) !== state.revision || previous.data()?.builtAt > state.readTime.toMillis()) return;
        for (let part = 1; part < count; part++) tx.set(parts.doc(String(part)), { rows: state.rows.slice(part * chunkSize, (part + 1) * chunkSize) });
        for (let part = count; part < (previous.data()?.parts ?? 0); part++) tx.delete(parts.doc(String(part)));
        tx.set(cache, { revision: state.revision, builtAt: state.readTime.toMillis(), parts: count, rows: state.rows.slice(0, chunkSize) });
      });
    }
  }
  return { owner, rows: state.rows, readTime: state.readTime };
}

async function readCandidateDocs(db: Firestore, page: Candidate[], fields?: readonly string[]) {
  const byOwner = new Map<string, Candidate[]>();
  for (const row of page) {
    const group = byOwner.get(row.ownerEmail);
    if (group) group.push(row);
    else byOwner.set(row.ownerEmail, [row]);
  }
  const documents = new Map<string, DocumentSnapshot>();
  await Promise.all([...byOwner].map(async ([owner, rows]) => {
    const entries = db.collection("users").doc(owner).collection("entries");
    const refs = rows.map(row => entries.doc(row.id));
    const docs = await db.runTransaction(tx => fields
      ? tx.getAll(...refs, { fieldMask: [...fields] }) : tx.getAll(...refs),
      { readOnly: true, readTime: rows[0].readTime });
    for (const doc of docs) documents.set(`${owner}___${doc.id}`, doc);
  }));
  return documents;
}

export async function readWithoutPdfPage(db: Firestore, owners: string[], filters: ContractListFilters,
  cursor: { ts: number; key: string | null } | null, pageSize: number, projection: readonly string[], hydrate: boolean) {
  const candidates: Candidate[] = [];
  for (let start = 0; start < owners.length; start += 8) {
    const indexes = await Promise.all(owners.slice(start, start + 8).map(owner => ownerMissingIndex(db, owner)));
    for (const { owner, rows, readTime } of indexes) {
      for (const { id, ts } of rows) {
        const key = `${owner}___${id}`;
        if (cursor?.ts && (ts === null || ts > cursor.ts || (ts === cursor.ts && (!cursor.key || key >= cursor.key)))) continue;
        candidates.push({ ownerEmail: owner, id, ts, key, readTime });
      }
    }
  }
  candidates.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0) || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
  const combined = hasContractListFilters({ ...filters, withoutPdfOnly: false });
  const search = prepareContractSearch(filters.query);
  const selected: Candidate[] = [];
  const matches: { doc: DocumentSnapshot; ownerEmail: string; ts: number | null }[] = [];
  const batchSize = combined ? Math.max(32, pageSize + 1) : pageSize + 1;
  for (let start = 0; start < candidates.length && matches.length <= pageSize; start += batchSize) {
    const page = candidates.slice(start, start + batchSize);
    const documents = await readCandidateDocs(db, page, combined || !hydrate ? projection : undefined);
    for (const row of page) {
      const doc = documents.get(row.key);
      if (!doc?.exists) continue;
      if (contractMatchesListFilters(doc.data() as ContractDoc, filters, row.ownerEmail, search, false)) {
        selected.push(row);
        matches.push({ doc, ownerEmail: row.ownerEmail, ts: row.ts });
        if (matches.length > pageSize) break;
      }
    }
  }
  if (combined && hydrate && selected.length) {
    const full = await readCandidateDocs(db, selected);
    for (const [index, row] of selected.entries()) {
      const doc = full.get(row.key);
      if (!doc?.exists) throw new Error("Filtered contract snapshot is incomplete");
      matches[index].doc = doc;
    }
  }
  return matches;
}
