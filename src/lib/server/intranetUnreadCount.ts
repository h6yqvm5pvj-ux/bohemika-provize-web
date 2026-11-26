import { randomUUID } from "node:crypto";
import { FieldPath, type Firestore, type DocumentReference } from "firebase-admin/firestore";
import { INTRANET_SECTION_KEYS, type IntranetSectionKey } from "@/app/intranet/sections";
import { normalizeWallPersonalState } from "@/app/intranet/wallPersonal";

const wallRef = (db: Firestore) => db.collection("intranetUnreadCounts").doc("wall");
const viewerRef = (db: Firestore, email: string) => wallRef(db).collection("viewers").doc(email);

// Replace the viewer document to invalidate its count in the same commit as a read-state change.
export function invalidateWallUnreadCount(db: Firestore, writer: { set(ref: DocumentReference, data: { revision: string }): unknown }, email?: string) {
  writer.set(email ? viewerRef(db, email) : wallRef(db), { revision: randomUUID() });
}

const BATCH_SIZE = 300;

async function countUnreadPosts(db: Firestore, email: string) {
  // Match the feed's visibility, without loading comments, attachments or author profiles.
  const base = db.collection("intranetWallPosts")
    .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc")
    .select("createdAt", "section", "title", "text").limit(BATCH_SIZE);
  let query: FirebaseFirestore.Query = base;
  let unreadCount = 0;
  while (true) {
    const posts = await query.get();
    if (posts.empty) break;
    const visible = posts.docs.filter(doc => {
      const row = doc.data();
      return typeof row.section === "string" && INTRANET_SECTION_KEYS.has(row.section.trim() as IntranetSectionKey) &&
        typeof row.title === "string" && row.title.trim() &&
        typeof row.text === "string" && row.text.trim();
    });
    if (visible.length) {
      const states = await db.getAll(
        ...visible.map(doc => doc.ref.collection("viewerStates").doc(email)),
        { fieldMask: ["readAtMs"] }
      );
      unreadCount += states.filter(state => normalizeWallPersonalState(state.data()).readAtMs === null).length;
    }
    if (posts.size < BATCH_SIZE) break;
    query = base.startAfter(posts.docs[posts.docs.length - 1]);
  }
  return unreadCount;
}

export async function loadWallUnreadCount(db: Firestore, email: string): Promise<number> {
  const wall = wallRef(db);
  const viewer = viewerRef(db, email);
  for (let attempt = 0; attempt < 3; attempt++) {
    const [wallDoc, viewerDoc] = await db.getAll(wall, viewer);
    const wallRevision = wallDoc.data()?.revision ?? null;
    const cached = viewerDoc.data();
    const viewerRevision = cached?.revision ?? null;
    if (cached && cached.wallRevision === wallRevision && Number.isSafeInteger(cached.count) && cached.count >= 0) {
      return cached.count;
    }
    const count = await countUnreadPosts(db, email);
    // Keep the scan outside the transaction. Both revisions must still match before publication.
    const published = await db.runTransaction(async tx => {
      const [currentWall, currentViewer] = await tx.getAll(wall, viewer);
      if ((currentWall.data()?.revision ?? null) !== wallRevision ||
          (currentViewer.data()?.revision ?? null) !== viewerRevision) return false;
      tx.set(viewer, { revision: viewerRevision, wallRevision, count });
      return true;
    });
    if (published) return count;
  }
  throw new Error("Intranet se právě mění.");
}
