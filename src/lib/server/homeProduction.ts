import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { hallParticipantId } from "./hallOfFame";
import { summarizeOwnerProduction, type OwnerProductionSummary, type ProductionWindow } from "@/app/home/productionSummary";
import type { EntryDoc } from "@/app/home/useHomeData";

const VERSION = 2;
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

async function calculateOwnerProduction(db: Firestore, email: string, window: ProductionWindow) {
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
  return summarizeOwnerProduction([...rows.values()], window);
}

const CACHE_BATCH_SIZE = 32;
const PARALLEL_REBUILDS = 8;

/** Read each cached sum and its source revision in the same snapshot. Only
 * publish a rebuild if the revision still matches that snapshot. */
export async function loadHomeProductionOwners(db: Firestore, emails: string[], window: ProductionWindow, force = false) {
  const key = createHash("sha256").update(JSON.stringify(window)).digest("hex");
  const result = new Map<string, OwnerProductionSummary>();
  const owners = [...new Set(emails)];
  for (let start = 0; start < owners.length; start += CACHE_BATCH_SIZE) {
    let pending = owners.slice(start, start + CACHE_BATCH_SIZE).map(email => {
      const marker = db.collection("hallOfFameOwners").doc(hallParticipantId(email));
      return { email, marker, cache: marker.collection("homeProduction").doc(key) };
    });
    for (let attempt = 0; pending.length && attempt < 3; attempt++) {
      const refs = pending.flatMap(owner => [owner.marker, owner.cache]);
      const snapshots = await db.runTransaction(tx => tx.getAll(...refs));
      // The Firestore SDK returns snapshots in the same order as the references.
      const misses = pending.flatMap((owner, index) => {
        const revision = snapshots[2 * index].data()?.revision ?? null;
        const data = snapshots[2 * index + 1].data();
        if (!force && data?.version === VERSION && data.revision === revision
          && typeof data.builtAt === "number" && data.builtAt <= Date.now() && Date.now() - data.builtAt < MAX_AGE_MS
          && validSummary(data.summary)) {
          result.set(owner.email, data.summary);
          return [];
        }
        return [{ ...owner, revision }];
      });
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(PARALLEL_REBUILDS, misses.length) }, async () => {
        while (next < misses.length) {
          const { email, marker, cache, revision } = misses[next++];
          const summary = await calculateOwnerProduction(db, email, window);
          const published = await db.runTransaction(async tx => {
            const current = await tx.get(marker);
            if ((current.data()?.revision ?? null) !== revision) return false;
            tx.set(cache, { version: VERSION, revision, builtAt: Date.now(), window, summary });
            return true;
          });
          if (published) result.set(email, summary);
        }
      }));
      pending = pending.filter(owner => !result.has(owner.email));
    }
    if (pending.length) throw new Error("Produkce se právě mění. Zopakujte načtení.");
  }
  return result;
}

export async function loadOwnerHomeProduction(db: Firestore, email: string, window: ProductionWindow, force = false) {
  const summaries = await loadHomeProductionOwners(db, [email], window, force);
  return summaries.get(email)!;
}
