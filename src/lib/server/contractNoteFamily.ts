import type { DocumentSnapshot } from "firebase-admin/firestore";
import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import { normalizeContractNumber } from "@/app/api/contracts/_lib/contractsApi.identity";
import { isSafeContractNoteId } from "@/app/api/contracts/notes/contractNotes";

export const CONTRACT_NOTE_FAMILY_LIMIT = 50;
const MAX_PARENT_DEPTH = 50;
const conflict = () => Object.assign(new Error("Nepodařilo se načíst úplné poznámky smlouvy. Obnov detail smlouvy."), { statusCode: 409 });
const idValue = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** A policy number is only a candidate lookup. A same-owner, same-product,
 * authorized parent chain is required before notes from another entry are read. */
export async function resolveContractNoteFamily(
  requested: DocumentSnapshot,
  canAccess: (contract: ContractDoc) => boolean,
): Promise<{ root: DocumentSnapshot; entries: DocumentSnapshot[] }> {
  const initial = requested.data() as ContractDoc;
  const product = initial.productKey;
  const number = normalizeContractNumber(initial.contractNumber);
  const explicitRoot = idValue(initial.rootContractEntryId);
  const parent = idValue(initial.parentContractEntryId);
  if ((explicitRoot && !isSafeContractNoteId(explicitRoot)) || (parent && !isSafeContractNoteId(parent))) throw conflict();
  if (!product || !number) {
    if (initial.entryType === "endorsement" || (explicitRoot && explicitRoot !== requested.id)) throw conflict();
    return { root: requested, entries: [requested] };
  }

  const entriesRef = requested.ref.parent;
  const samePolicy = (snapshot: DocumentSnapshot) => {
    if (!snapshot.exists) return false;
    const data = snapshot.data() as ContractDoc;
    return data.productKey === product && normalizeContractNumber(data.contractNumber) === number && canAccess(data);
  };
  let root = requested;
  const ancestors = new Map<string, DocumentSnapshot>([[requested.id, requested]]);
  if (explicitRoot && explicitRoot !== requested.id) {
    if (initial.entryType !== "endorsement") throw conflict();
    root = await entriesRef.doc(explicitRoot).get();
    if (!samePolicy(root)) throw conflict();
    ancestors.set(root.id, root);
  } else {
    // Older endorsements can have a parent link without a root ID.
    for (let depth = 0; (root.data() as ContractDoc).entryType === "endorsement"; depth++) {
      const nextId = idValue((root.data() as ContractDoc).parentContractEntryId);
      if (depth >= MAX_PARENT_DEPTH || !isSafeContractNoteId(nextId) || ancestors.has(nextId)) throw conflict();
      const next = await entriesRef.doc(nextId).get();
      if (!samePolicy(next)) throw conflict();
      ancestors.set(next.id, next);
      root = next;
    }
  }
  const rootData = root.data() as ContractDoc;
  if (rootData.entryType === "endorsement" || (idValue(rootData.rootContractEntryId) && idValue(rootData.rootContractEntryId) !== root.id)) throw conflict();

  const [explicit, legacy] = await Promise.all([
    entriesRef.where("rootContractEntryId", "==", root.id).limit(CONTRACT_NOTE_FAMILY_LIMIT + 1).get(),
    entriesRef.where("contractNumber", "==", String(rootData.contractNumber ?? "").trim()).limit(CONTRACT_NOTE_FAMILY_LIMIT + 1).get(),
  ]);
  if (explicit.size > CONTRACT_NOTE_FAMILY_LIMIT || legacy.size > CONTRACT_NOTE_FAMILY_LIMIT) throw conflict();
  const candidates = new Map([...ancestors.values(), ...explicit.docs, ...legacy.docs].map(snapshot => [snapshot.id, snapshot]));
  const children = new Map<string, DocumentSnapshot[]>();
  for (const snapshot of candidates.values()) {
    if (!samePolicy(snapshot) || snapshot.id === root.id) continue;
    const data = snapshot.data() as ContractDoc;
    const candidateRoot = idValue(data.rootContractEntryId);
    const candidateParent = idValue(data.parentContractEntryId);
    if (data.entryType !== "endorsement" || (candidateRoot && candidateRoot !== root.id) || !isSafeContractNoteId(candidateParent) || candidateParent === snapshot.id) continue;
    const siblings = children.get(candidateParent) ?? [];
    siblings.push(snapshot);
    children.set(candidateParent, siblings);
  }
  const entries = [root];
  const linkedIds = new Set([root.id]);
  for (let index = 0; index < entries.length; index++) {
    for (const child of children.get(entries[index].id) ?? []) {
      if (linkedIds.has(child.id)) continue;
      if (entries.length >= CONTRACT_NOTE_FAMILY_LIMIT) throw conflict();
      linkedIds.add(child.id);
      entries.push(child);
    }
  }
  if (!linkedIds.has(requested.id)) throw conflict();
  return { root, entries };
}
