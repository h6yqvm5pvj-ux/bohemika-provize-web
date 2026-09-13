import type { DocumentReference, DocumentSnapshot, Firestore } from "firebase-admin/firestore";

const READ_BATCH_SIZE = 200;

/** Preserve input order (including missing documents) without one RPC per ref. */
export async function getAllBatched(
  db: Firestore,
  refs: DocumentReference[]
): Promise<DocumentSnapshot[]> {
  const snapshots: DocumentSnapshot[] = [];
  for (let offset = 0; offset < refs.length; offset += READ_BATCH_SIZE) {
    snapshots.push(...await db.getAll(...refs.slice(offset, offset + READ_BATCH_SIZE)));
  }
  return snapshots;
}
