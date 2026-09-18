import { randomUUID } from "node:crypto";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { getAllBatched } from "./firestoreReads";
import { aggregateHallEntries, hallDayKey, hallParticipantId, HALL_PERIOD_MONTHS, type HallPeriodStats, type HallProductionEntry, type HallStats } from "./hallOfFame";
import type { HallPeriod } from "@/app/sin-slavy/hallOfFame.types";

const COLLECTION = "hallOfFameOwners";
const VERSION = 1;
const PERIODS = Object.keys(HALL_PERIOD_MONTHS) as HallPeriod[];
type Writer = { set(ref: DocumentReference, data: Record<string, unknown>): unknown };
type OwnerStats = Record<HallPeriod, HallStats>;
const ownerRef = (db: Firestore, email: string) => db.collection(COLLECTION).doc(hallParticipantId(email));

/** A revision marker replaces the projection in the same batch as its source write. */
export function markHallOwnerDirty(writer: Writer, db: Firestore, email: string): void {
  if (!email.trim()) return;
  writer.set(ownerRef(db, email), { revision: randomUUID() });
}

const SOURCE_FIELDS = ["userEmail", "productKey", "inputAmount", "frequencyRaw", "contractSignedDate", "createdAt", "acquisitionType"];
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

/** Persist only four small category aggregates per owner. A normal cold server
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
      const batch = missing.slice(next, next += 10);
      const entries = await readEntries(batch.map(({ email }) => email));
      const aggregate = aggregateHallEntries(entries, now);
      const projections = batch.map(({ email }) => Object.fromEntries(PERIODS.map((period) => [period, aggregate[period][email] ?? { categoryMetrics: {} }])) as OwnerStats);
      batch.forEach(({ email }, index) => apply(email, projections[index]));
      try {
        await db.runTransaction(async (tx) => {
          const current = await tx.getAll(...batch.map(({ ref }) => ref));
          batch.forEach(({ ref, revision }, index) => {
            // A write during the scan must leave its dirty revision in place.
            if ((current[index].data()?.revision ?? null) !== revision) return;
            tx.set(ref, { version: VERSION, day, revision, stats: projections[index] });
          });
        });
      } catch (error) {
        // The freshly computed result is still usable; never cache a partial scan.
        console.warn("Uložení součtů síně slávy se nezdařilo:", error);
      }
    }
  }));
  return stats;
}
