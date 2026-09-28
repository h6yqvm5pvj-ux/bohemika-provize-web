import { randomUUID } from "node:crypto";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { getAllBatched } from "./firestoreReads";
import { aggregateHallEntries, hallDayKey, hallParticipantId, HALL_PERIOD_MONTHS, type HallPeriodStats, type HallProductionEntry, type HallStats } from "./hallOfFame";
import type { HallPeriod } from "@/app/sin-slavy/hallOfFame.types";

const COLLECTION = "hallOfFameOwners";
const VERSION = 2;
const PERIODS = Object.keys(HALL_PERIOD_MONTHS) as HallPeriod[];
type Writer = { set(ref: DocumentReference, data: Record<string, unknown>): unknown };
type OwnerStats = Record<HallPeriod, HallStats>;
const ownerRef = (db: Firestore, email: string) => db.collection(COLLECTION).doc(hallParticipantId(email));

/** A revision marker replaces the projection in the same batch as its source write. */
export function markHallOwnerDirty(writer: Writer, db: Firestore, email: string): void {
  if (!email.trim()) return;
  writer.set(ownerRef(db, email), { revision: randomUUID() });
}

// The revision also fences home production and the team's active portfolio.
// Commission and lifecycle edits invalidate their aggregates in the same write.
const SOURCE_FIELDS = ["userEmail", "productKey", "inputAmount", "frequencyRaw", "contractSignedDate", "createdAt", "acquisitionType", "items", "managerOverrides", "status", "policyStartDate", "policyEndDate", "durationYears", "durationMonths"];
export function invalidateHallContractChange(writer: Writer, ref: DocumentReference, before: Record<string, unknown>, patch: Record<string, unknown>): void {
  if (!SOURCE_FIELDS.some((field) => Object.hasOwn(patch, field) && JSON.stringify(before[field]) !== JSON.stringify(patch[field]))) return;
  const pathOwner = ref.parent.parent?.id ?? "";
  const beforeOwner = typeof before.userEmail === "string" ? before.userEmail : pathOwner;
  const afterOwner = typeof patch.userEmail === "string" ? patch.userEmail : beforeOwner;
  for (const email of new Set([beforeOwner, afterOwner].map((value) => value.trim().toLowerCase()))) {
    markHallOwnerDirty(writer, ref.firestore, email);
  }
}

function validStats(value: unknown): value is OwnerStats {
  if (!value || typeof value !== "object") return false;
  return PERIODS.every((period) => {
    const metrics = (value as OwnerStats)[period]?.categoryMetrics;
    return metrics && typeof metrics === "object" && Object.values(metrics).every((metric) =>
      metric && Number.isFinite(metric.contracts) && metric.contracts >= 0 && Number.isFinite(metric.annualPremium) && metric.annualPremium >= 0);
  });
}

/** Persist small category aggregates for four periods per owner. A normal cold server
 * reads these documents; only changed owners need their contracts read again.
 * The Czech day key rebuilds date-sensitive periods after midnight. */
export async function loadHallOwnerStats(
  db: Firestore,
  ownerEmails: string[],
  now: Date,
  readEntries: (owners: string[]) => Promise<HallProductionEntry[]>,
): Promise<HallPeriodStats> {
  const owners = [...new Set(ownerEmails.map((email) => email.trim().toLowerCase()))];
  const day = hallDayKey(now);
  const stats = Object.fromEntries(PERIODS.map((period) => [period, {}])) as HallPeriodStats;
  const snapshots = await getAllBatched(db, owners.map((email) => ownerRef(db, email)));
  const missing: { email: string; ref: DocumentReference; revision: unknown }[] = [];
  const apply = (email: string, data: OwnerStats) => {
    for (const period of PERIODS) stats[period][email] = data[period];
  };
  owners.forEach((email, index) => {
    const snapshot = snapshots[index];
    const data = snapshot.data();
    if (data?.version === VERSION && data.day === day && validStats(data.stats)) apply(email, data.stats);
    else missing.push({ email, ref: snapshot.ref, revision: data?.revision ?? null });
  });
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, Math.ceil(missing.length / 10)) }, async () => {
    while (next < missing.length) {
      let batch = missing.slice(next, next += 10);
      for (let attempt = 0; batch.length && attempt < 3; attempt++) {
        const entries = await readEntries(batch.map(({ email }) => email));
        const aggregate = aggregateHallEntries(entries, now);
        const projections = batch.map(({ email }) => Object.fromEntries(PERIODS.map((period) => [period, aggregate[period][email] ?? { categoryMetrics: {} }])) as OwnerStats);
        let changed: typeof batch;
        try {
          changed = await db.runTransaction(async (tx) => {
            const current = await tx.getAll(...batch.map(({ ref }) => ref));
            const retry: typeof batch = [];
            batch.forEach(({ email, ref, revision }, index) => {
              const latestRevision = current[index].data()?.revision ?? null;
              if (latestRevision !== revision) {
                retry.push({ email, ref, revision: latestRevision });
                return;
              }
              tx.set(ref, { version: VERSION, day, revision, stats: projections[index] });
            });
            return retry;
          });
        } catch (error) {
          // Cache persistence is optional, revision validation is not. Keep the
          // former read-only fallback, but independently verify the source first.
          const current = await getAllBatched(db, batch.map(({ ref }) => ref));
          changed = batch.flatMap((owner, index) => {
            const revision = current[index].data()?.revision ?? null;
            return revision === owner.revision ? [] : [{ ...owner, revision }];
          });
          console.warn("Uložení součtů síně slávy se nezdařilo:", error);
        }
        const changedOwners = new Set(changed.map(({ email }) => email));
        batch.forEach(({ email }, index) => {
          if (!changedOwners.has(email)) apply(email, projections[index]);
        });
        batch = changed;
      }
      // Neither durable nor process-local caches may turn a concurrent mutation
      // or failed validation into a successful but outdated ranking.
      if (batch.length) throw new Error("Výsledky síně slávy se právě mění. Zopakujte načtení.");
    }
  }));
  return stats;
}
