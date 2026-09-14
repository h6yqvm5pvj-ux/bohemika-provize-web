import { createHash } from "node:crypto";
import { FieldPath, FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { clientSlugForName } from "@/app/_klienti/clientIdentity";
import { toDate, type ClientContractItem } from "@/app/_klienti/clientCardHelpers";
import { originalAdviserEmailForContract } from "@/app/api/contracts/_lib/contractsApi.transfer";
import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";

// Private, server-maintained links. One document per contract avoids growing a
// single client document without limit. Equality queries use automatic indexes.
const COLLECTION = "clientContractIndex";
export const CLIENT_CONTRACT_LINKS_COLLECTION = "clientContractLinks";
const VERSION = 2;
const BACKFILL_PAGE_SIZE = 150;
const fields = [
  "entryType", "clientName", "clientEmail", "clientPhone", "clientAddress",
  "contractNumber", "productKey", "status", "acquisitionType", "userEmail",
  "originalAdviserEmail", "originalAdviserName", "durationYears", "durationMonths",
] as const;
const dates = ["stornoDate", "contractSignedDate", "createdAt", "policyStartDate", "policyEndDate"] as const;
const projection = [...fields, ...dates];
type IndexWriter = {
  set(ref: DocumentReference, data: Record<string, unknown>): unknown;
  delete(ref: DocumentReference): unknown;
};

const ownerIndex = (db: Firestore, owner: string) => db.collection(COLLECTION).doc(owner);
const indexKey = (owner: string, value: string) => createHash("sha256").update(`${owner}\0${value}`).digest("hex");
export const clientContractLinkRef = (db: Firestore, owner: string, entryId: string) => db.collection(CLIENT_CONTRACT_LINKS_COLLECTION).doc(indexKey(owner, entryId));

export function clientContractIndexRecord(data: Record<string, unknown>, owner: string): Record<string, unknown> | null {
  const clientSlug = typeof data.clientName === "string" ? clientSlugForName(data.clientName) : null;
  if (!clientSlug || data.entryType === "endorsement") return null;
  const record: Record<string, unknown> = { clientSlug };
  for (const field of projection) {
    const value = data[field];
    // Preserve server timestamps in the same commit; deletion transforms cannot
    // be used in a replacement set. No notes, documents or commissions here.
    if (value !== undefined && !(value instanceof FieldValue && value.isEqual(FieldValue.delete()))) record[field] = value;
  }
  record.originalAdviserEmail = originalAdviserEmailForContract(data as ContractDoc, owner);
  return record;
}

/** Must share the contract's transaction/batch and its concurrency precondition. */
export function writeClientContractLink(writer: IndexWriter, ref: DocumentReference, before: Record<string, unknown>, patch: Record<string, unknown>, transfer = false) {
  if (!transfer && Object.keys(before).length > 0 && !projection.some(field => Object.hasOwn(patch, field))) return;
  const parts = ref.path.split("/");
  if (parts.length !== 4 || parts[0] !== "users" || parts[2] !== "entries") throw new Error("Invalid contract index source");
  const oldOwner = parts[1]!;
  const owner = transfer && typeof patch.userEmail === "string" ? patch.userEmail.trim().toLowerCase() : oldOwner;
  if (!owner || owner.includes("/")) throw new Error("Invalid contract index owner");
  if (oldOwner !== owner) writer.delete(clientContractLinkRef(ref.firestore, oldOwner, ref.id));
  const target = clientContractLinkRef(ref.firestore, owner, ref.id);
  const record = clientContractIndexRecord({ ...before, ...patch }, owner);
  if (record) writer.set(target, { ...record, ownerEmail: owner, entryId: ref.id, ownerClientKey: indexKey(owner, String(record.clientSlug)), ownerAuthorKey: indexKey(owner, String(record.originalAdviserEmail)) });
  else writer.delete(target);
}

/** Backfill only legacy data, resumably. A request processes one bounded page
 * per owner. Re-read source documents inside the transaction so an edit,
 * deletion or transfer during migration cannot resurrect a stale link. */
export async function ensureClientContractIndex(db: Firestore, owner: string): Promise<{ ready: boolean; processed: number }> {
  const meta = ownerIndex(db, owner);
  const state = (await meta.get()).data();
  if (state?.version === VERSION) return { ready: true, processed: Number(state.processed) || 0 };
  const cursorOf = (data: Record<string, unknown> | undefined) => data?.buildVersion === VERSION && typeof data.after === "string" ? data.after : null;
  const after = cursorOf(state);
  let query = db.collection("users").doc(owner).collection("entries").select().orderBy(FieldPath.documentId());
  if (after) query = query.startAfter(after);
  const page = await query.limit(BACKFILL_PAGE_SIZE).get();
  return db.runTransaction(async tx => {
    const current = (await tx.get(meta)).data();
    if (current?.version === VERSION || cursorOf(current) !== after) {
      return { ready: current?.version === VERSION, processed: Number(current?.processed) || 0 };
    }
    const sources = page.docs.length ? await tx.getAll(...page.docs.map(doc => doc.ref), { fieldMask: projection }) : [];
    for (const source of sources) {
      if (source.exists) writeClientContractLink(tx, source.ref, {}, source.data()!);
      else tx.delete(clientContractLinkRef(db, owner, source.id));
    }
    const ready = page.size < BACKFILL_PAGE_SIZE;
    const processed = (current?.buildVersion === VERSION ? Number(current.processed) || 0 : 0) + page.size;
    tx.set(meta, { version: ready ? VERSION : 0, buildVersion: VERSION, after: page.docs.at(-1)?.id ?? after, processed });
    return { ready, processed };
  });
}

export async function readClientContractLinks(db: Firestore, owner: string, authors: string[] | null, slug: string | null, adviserName: string | null): Promise<ClientContractItem[]> {
  const links = db.collection(CLIENT_CONTRACT_LINKS_COLLECTION);
  // A card reads only its linked contracts. The directory queries its selected
  // authors directly, so "my" never downloads the entire team's portfolio.
  const queries = slug ? [links.where("ownerClientKey", "==", indexKey(owner, slug))]
    : authors === null ? [links.where("ownerEmail", "==", owner)]
    : Array.from({ length: Math.ceil(authors.length / 30) }, (_, i) => {
      const chunk = authors.slice(i * 30, i * 30 + 30).map(author => indexKey(owner, author));
      return chunk.length === 1 ? links.where("ownerAuthorKey", "==", chunk[0]) : links.where("ownerAuthorKey", "in", chunk);
    });
  const allowed = authors === null ? null : new Set(authors);
  const snapshots = await Promise.all(queries.map(query => query.get()));
  return snapshots.flatMap(snapshot => snapshot.docs.flatMap(doc => {
    const data = doc.data();
    if (data.ownerEmail !== owner || (slug && data.clientSlug !== slug)) return [];
    if (allowed && !allowed.has(String(data.originalAdviserEmail ?? ""))) return [];
    return [clientContractFromIndex(data, adviserName)];
  }));
}

/** Only call after the current owner has passed the contract access check. */
export function clientContractFromIndex(data: Record<string, unknown>, adviserName: string | null): ClientContractItem {
  const result: Record<string, unknown> = { id: data.entryId, clientSlug: data.clientSlug, adviserEmail: data.ownerEmail, adviserName };
  for (const field of fields) if (data[field] !== undefined) result[field] = data[field];
  for (const field of dates) result[field] = toDate(data[field])?.getTime() ?? null;
  return result as ClientContractItem;
}

/** One bounded migration step for legacy advisers outside the viewer's team.
 * Called separately from the main card, never while loading the directory.
 * A completed roster costs one metadata read on subsequent visits. */
export async function advanceSharedClientIndex(db: Firestore, ownerEmails: string[]): Promise<boolean> {
  const owners = [...new Set(ownerEmails.map(email => email.trim().toLowerCase()).filter(Boolean))].sort();
  const fingerprint = createHash("sha256").update(JSON.stringify([VERSION, owners])).digest("hex");
  const ref = db.collection("clientContractIndexMigrations").doc("shared-clients");
  const state = (await ref.get()).data();
  if (state?.fingerprint === fingerprint && state.ready === true) return true;
  const start = state?.fingerprint === fingerprint ? Number(state.nextOwner) || 0 : 0;
  const chunk = owners.slice(start, start + 6);
  const results = await Promise.all(chunk.map(owner => ensureClientContractIndex(db, owner)));
  const unfinished = results.findIndex(result => !result.ready);
  const nextOwner = start + (unfinished < 0 ? chunk.length : unfinished);
  const ready = nextOwner >= owners.length;
  return db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (current?.fingerprint !== state?.fingerprint || current?.nextOwner !== state?.nextOwner || current?.ready !== state?.ready) {
      return current?.fingerprint === fingerprint && current?.ready === true;
    }
    tx.set(ref, { fingerprint, nextOwner, ready });
    return ready;
  });
}
