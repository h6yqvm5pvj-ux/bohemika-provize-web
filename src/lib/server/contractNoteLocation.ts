import { createHash } from "node:crypto";
import type { DocumentReference } from "firebase-admin/firestore";

// Notes retain their storage location across transfers. This server-only index
// resolves that location to the current contract for scheduled reminders.
export function contractNoteLocationRef(notesParent: DocumentReference) {
  return notesParent.firestore.collection("contractNoteLocations").doc(createHash("sha256").update(notesParent.path).digest("hex"));
}
