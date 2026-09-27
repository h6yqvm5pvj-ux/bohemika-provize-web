import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { hallParticipantId } from "./hallOfFame";
import { summarizeOwnerProduction, type OwnerProductionSummary, type ProductionWindow } from "@/app/home/productionSummary";
import type { EntryDoc } from "@/app/home/useHomeData";

const VERSION = 1;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const FIELDS = ["contractSignedDate", "createdAt", "acquisitionType", "productKey", "inputAmount", "frequencyRaw", "items", "managerOverrides"];

export function parseProductionWindow(params: URLSearchParams): ProductionWindow | null {
  const values = ["signedFrom", "summarySplit", "summaryTo"].map(key => Number(params.get(key)));
  if (values.some(value => !Number.isSafeInteger(value) || value <= 0)) return null;
  const [from, split, to] = values;
  const day = 86_400_000;
  // Bound source reads to two adjacent months, also allowing DST transitions.
  if ([split - from, to - split].some(duration => duration < 27 * day || duration > 32 * day)) return null;
  if (Math.abs(split - Date.now()) > 32 * day) return null;
  return { from, split, to };
}

function validSummary(value: unknown): value is OwnerProductionSummary {
  if (!value || typeof value !== "object") return false;
  return ["current", "previous"].every(key => {
    const month = (value as OwnerProductionSummary)[key as keyof OwnerProductionSummary];
    return month && Number.isSafeInteger(month.count) && month.count >= 0 && Number.isFinite(month.immediate)
      && month.premiums && Number.isFinite(month.premiums.lifeMonthly) && Number.isFinite(month.premiums.otherAnnual)
      && month.leaderboard && Number.isFinite(month.leaderboard.life) && Number.isFinite(month.leaderboard.other)
      && typeof month.leaderboard.hasLife === "boolean" && typeof month.leaderboard.hasOther === "boolean"
      && month.managers && typeof month.managers === "object" && Object.values(month.managers).every(Number.isFinite);
  });
}

/** Reuse the contract-production revision already atomically invalidated by
 * creates, updates, deletes and transfers. Cache documents contain sums only. */
export async function loadOwnerHomeProduction(db: Firestore, email: string, window: ProductionWindow, force = false): Promise<OwnerProductionSummary> {
  const marker = db.collection("hallOfFameOwners").doc(hallParticipantId(email));
  const key = createHash("sha256").update(JSON.stringify(window)).digest("hex");
  const cache = marker.collection("homeProduction").doc(key);
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await db.runTransaction(async tx => {
      const [revisionDoc, cachedDoc] = await tx.getAll(marker, cache);
      const revision = revisionDoc.data()?.revision ?? null;
      const data = cachedDoc.data();
      return { revision, cached: data?.version === VERSION && data.revision === revision
        && typeof data.builtAt === "number" && data.builtAt <= Date.now() && Date.now() - data.builtAt < MAX_AGE_MS
        && validSummary(data.summary) ? data.summary : null };
    });
    if (state.cached && !force) return state.cached;
    const entries = db.collection("users").doc(email).collection("entries");
    const [signed, created] = await Promise.all(["contractSignedDate", "createdAt"].map(field => entries
      .where(field, ">=", new Date(window.from)).where(field, "<", new Date(window.to)).select(...FIELDS).get()));
    const rows = new Map<string, EntryDoc>();
    for (const doc of [...signed.docs, ...created.docs]) {
      const data = doc.data();
      // Match the existing shape=home serializer for legacy malformed fields.
      rows.set(doc.id, { ...data, id: doc.id,
        items: Array.isArray(data.items) ? data.items : [],
        managerOverrides: Array.isArray(data.managerOverrides) ? data.managerOverrides : [],
      } as EntryDoc);
    }
    const summary = summarizeOwnerProduction([...rows.values()], window);
    const published = await db.runTransaction(async tx => {
      const current = await tx.get(marker);
      if ((current.data()?.revision ?? null) !== state.revision) return false;
      tx.set(cache, { version: VERSION, revision: state.revision, builtAt: Date.now(), window, summary });
      return true;
    });
    if (published) return summary;
    // A concurrent source write invalidates both persistence and this response.
  }
  throw new Error("Produkce se právě mění. Zopakujte načtení.");
}

export async function loadHomeProductionOwners(db: Firestore, emails: string[], window: ProductionWindow, force = false) {
  const result = new Map<string, OwnerProductionSummary>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, emails.length) }, async () => {
    while (next < emails.length) {
      const email = emails[next++];
      result.set(email, await loadOwnerHomeProduction(db, email, window, force));
    }
  }));
  return result;
}
