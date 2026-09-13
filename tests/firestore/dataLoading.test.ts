import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAllBatched } from "../../src/lib/server/firestoreReads";

let db: Firestore;
let app: App;
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") {
    throw new Error("Only the local demo Firestore emulator is allowed.");
  }
  app = initializeApp({ projectId: "demo-bohemika-rules" }, "data-loading-tests");
  db = getFirestore(app);
  const batch = db.batch();
  for (let i = 0; i < 405; i++) {
    if (i === 199) continue;
    batch.set(db.collection("dataLoadingProbe").doc(String(i)), {
      owner: `synthetic-${i}@example.test`, read: false,
      snoozedUntil: new Date("2026-09-11T12:00:00Z"),
      body: "Synthetic message content", metadata: { unused: true },
    });
  }
  await batch.commit();
});
afterAll(async () => {
  await db?.terminate();
  if (app) await deleteApp(app);
});

describe("optimized reads against the real Firestore SDK and local emulator", () => {
  it("keeps owner alignment across batches, missing documents and duplicate references", async () => {
    const refs = Array.from({ length: 405 }, (_, i) => db.collection("dataLoadingProbe").doc(String(i)));
    refs.push(refs[0]);
    const snapshots = await getAllBatched(db, refs);
    expect(snapshots.map(snapshot => snapshot.id)).toEqual(refs.map(ref => ref.id));
    expect(snapshots[199].exists).toBe(false);
    expect(snapshots[200].data()?.owner).toBe("synthetic-200@example.test");
    expect(snapshots[405].data()).toEqual(snapshots[0].data());
  });

  it("projects state fields without dropping messages that lack archive fields", async () => {
    const snapshot = await db.collection("dataLoadingProbe").where("read", "==", false)
      .select("archivedAtMs", "archivedAt", "snoozedUntilMs", "snoozedUntil").get();
    expect(snapshot.size).toBe(404);
    for (const doc of snapshot.docs) {
      expect(Object.keys(doc.data())).toEqual(["snoozedUntil"]);
      expect(doc.data().snoozedUntil.toDate()).toEqual(new Date("2026-09-11T12:00:00Z"));
    }
  });

  it("supports the ID-only existence check used for the profile's team flag", async () => {
    const snapshot = await db.collection("dataLoadingProbe").limit(1).select().get();
    expect(snapshot.empty).toBe(false);
    expect(snapshot.docs[0].exists).toBe(true);
    expect(snapshot.docs[0].data()).toEqual({});
  });
});
