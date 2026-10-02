import { createHash } from "node:crypto";
import type { DocumentReference, DocumentSnapshot } from "firebase-admin/firestore";

// Notes retain their storage location across transfers. This server-only index
// resolves that location to the current contract for scheduled reminders.
export function contractNoteLocationRef(notesParent: DocumentReference) {
  return notesParent.firestore.collection("contractNoteLocations").doc(createHash("sha256").update(notesParent.path).digest("hex"));
}

type ReadDocument = (ref: DocumentReference) => Promise<DocumentSnapshot>;
const conflict = () => Object.assign(new Error("Umístění poznámek neodpovídá této smlouvě. Obnov detail smlouvy."), { statusCode: 409 });

/** Resolve aliases before reading/decrypting notes or rebinding them on transfer.
 * Transfer transactions must use their own reader; batch transfers also guard
 * the source contract with lastUpdateTime, which every valid rebind changes. */
export async function authorizeContractNoteLocation(
  contractRef: DocumentReference,
  contract: Record<string, unknown>,
  read: ReadDocument = ref => ref.get(),
): Promise<DocumentReference> {
  const path = contract.contractNotesPath ?? contractRef.path;
  if (typeof path !== "string" || !/^users\/[^/]+\/entries\/[^/]+$/.test(path)) throw conflict();
  const parent = contractRef.firestore.doc(path);
  const location = await read(contractNoteLocationRef(parent));
  if (location.exists) {
    if (location.data()?.contractPath !== contractRef.path) throw conflict();
  } else if (path !== contractRef.path) {
    // Every supported transfer writes the registry atomically with the move.
    // An unresolved cross-contract pointer must never grant access by itself.
    throw conflict();
  }
  return parent;
}

/** A transferred notes root remains reserved even after its contract is moved
 * or deleted. A retry key must not create a different contract at that root. */
export async function assertContractNoteNamespaceAvailable(
  contractRef: DocumentReference,
  read: ReadDocument,
): Promise<void> {
  if ((await read(contractNoteLocationRef(contractRef))).exists) throw conflict();
}
