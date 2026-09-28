import type { DocumentReference, Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import type { ContractStats } from "@/app/api/team-overview/teamOverview.types";
import { isInheritedContract } from "@/app/lib/inheritedContracts";
import { toDate } from "@/app/lib/formatters";
import { hallParticipantId } from "./hallOfFame";
import { getAllBatched } from "./firestoreReads";
import { buildTeamOverviewReadModelDocuments, TEAM_OVERVIEW_MODEL_VERSION } from "./teamOverviewReadModel";
import { consumeOwnerEntry, currentYearMonth, emptyContractStats, previousMonthToDateEnd, previousYearMonth } from "./teamOverviewStats";

const VERSION = 1;
// A periodic rebuild also bounds staleness after unsupported, direct database edits.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const OWNER_BATCH_SIZE = 10;
const MAX_CONCURRENT_BATCHES = 4;
export const TEAM_OVERVIEW_ENTRY_FIELDS = [
  "userEmail", "productKey", "inputAmount", "frequencyRaw", "contractSignedDate", "createdAt",
  "acquisitionType", "status", "policyStartDate", "policyEndDate", "durationYears", "durationMonths",
] as const;

type Clock = {
  builtAtMs: number;
  day: string;
  timeZone: string;
  previousCutoffMs: number;
  nextSignedAtMs: number | null;
  nextPreviousSignedAtMs: number | null;
};
type Projection = {
  version: number;
  revision: unknown;
  clock: Clock;
  all: ContractStats;
  active: ContractStats;
};
type Owner = { email: string; marker: DocumentReference; cache: DocumentReference; revision: unknown };
type OwnerStats = { all: Record<string, ContractStats>; active: Record<string, ContractStats> };

function clockAt(now: Date): Clock {
  return {
    builtAtMs: now.getTime(),
    day: `${currentYearMonth(now)}-${String(now.getDate()).padStart(2, "0")}`,
    // Keep the route's existing server-local calendar semantics, including DST.
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    previousCutoffMs: previousMonthToDateEnd(now),
    nextSignedAtMs: null,
    nextPreviousSignedAtMs: null,
  };
}

function clockValid(value: Clock | undefined, now: Clock): boolean {
  if (!value || value.day !== now.day || value.timeZone !== now.timeZone) return false;
  if (!Number.isFinite(value.builtAtMs) || now.builtAtMs < value.builtAtMs || now.builtAtMs - value.builtAtMs >= MAX_AGE_MS) return false;
  if (!Number.isFinite(value.previousCutoffMs) || now.previousCutoffMs < value.previousCutoffMs) return false;
  // Compare in each original timeline instead of moving dates between months.
  // This preserves millisecond boundaries, clamped month ends and DST folds.
  return (value.nextSignedAtMs === null || (Number.isFinite(value.nextSignedAtMs) && now.builtAtMs < value.nextSignedAtMs))
    && (value.nextPreviousSignedAtMs === null || (Number.isFinite(value.nextPreviousSignedAtMs) && now.previousCutoffMs < value.nextPreviousSignedAtMs));
}

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nonnegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const metric = (value: unknown) => object(value) && [value.contracts, value.annualPremium, value.monthlyPremium].every(nonnegative);
const metricMap = (value: unknown) => object(value) && Object.values(value).every(metric);
const categories = Object.keys(emptyContractStats().categories);
function validStats(value: unknown): value is ContractStats {
  if (!object(value)) return false;
  return [value.total, value.month, value.previousMonth, value.previousMonthToDate].every(nonnegative)
    && [value.monthMetrics, value.previousMonthMetrics, value.previousMonthToDateMetrics].every(metric)
    && object(value.categories) && categories.every(key => nonnegative((value.categories as Record<string, unknown>)[key]))
    && [value.monthCategoryMetrics, value.categoryMetrics].every(map => object(map) && categories.every(key => metric(map[key])))
    && metricMap(value.institutionMetrics)
    && object(value.institutionByCategory) && categories.every(key => metricMap((value.institutionByCategory as Record<string, unknown>)[key]));
}

/** Same aggregation/order/date precedence as the former unbounded route scan.
 * Inherited contracts stay in the portfolio, but not in monthly production. */
export function buildTeamOverviewOwnerProjections(docs: QueryDocumentSnapshot[], emails: string[], now: Date) {
  const all: OwnerStats["all"] = {}, active: OwnerStats["active"] = {};
  const ownerSet = new Set(emails), seen = new Set<string>();
  const clock = clockAt(now);
  const clocks = Object.fromEntries(emails.map(email => [email, { ...clock }]));
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const previousMonthToDateEndMs = previousMonthToDateEnd(now);
  for (const doc of docs) {
    const data = doc.data();
    const email = String(data.userEmail ?? doc.ref.parent.parent?.id ?? "").trim().toLowerCase();
    if (!ownerSet.has(email) || seen.has(`${email}___${doc.id}`)) continue;
    consumeOwnerEntry({ stats: all, activeStats: active, ownerSet, seen, data, entryId: doc.id,
      ownerEmailRaw: doc.ref.parent.parent?.id, now, previousMonthStart, previousMonthToDateEndMs,
      monthStart, currentMonthToDateEnd: now.getTime() });
    const signed = isInheritedContract(data) ? null : toDate(data.contractSignedDate ?? data.createdAt)?.getTime();
    if (signed == null) continue;
    const clock = clocks[email];
    if (signed > now.getTime() && signed < nextMonthStart) {
      clock.nextSignedAtMs = Math.min(clock.nextSignedAtMs ?? signed, signed);
    } else if (signed >= previousMonthStart && signed < monthStart && signed > previousMonthToDateEndMs) {
      clock.nextPreviousSignedAtMs = Math.min(clock.nextPreviousSignedAtMs ?? signed, signed);
    }
  }
  return Object.fromEntries(emails.map(email => [email, {
    clock: clocks[email], all: all[email] ?? emptyContractStats(), active: active[email] ?? emptyContractStats(),
  }]));
}

export async function readTeamOverviewEntries(db: Firestore, emails: string[]) {
  return (await db.collectionGroup("entries").where("userEmail", "in", emails)
    .select(...TEAM_OVERVIEW_ENTRY_FIELDS).get()).docs;
}

/** Auth/team membership is resolved freshly by the caller. Only per-owner
 * business aggregates are shared, never a viewer's team or authorization. */
export async function loadTeamOverviewOwnerStats(
  db: Firestore, ownerEmails: string[], now: Date,
  readEntries = (emails: string[]) => readTeamOverviewEntries(db, emails),
): Promise<OwnerStats> {
  const emails = [...new Set(ownerEmails.map(email => email.trim().toLowerCase()).filter(Boolean))];
  const result: OwnerStats = { all: {}, active: {} };
  const nowClock = clockAt(now);
  const apply = (email: string, projection: Pick<Projection, "all" | "active">) => {
    result.all[email] = projection.all; result.active[email] = projection.active;
  };
  let offset = 0;
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_BATCHES, Math.ceil(emails.length / OWNER_BATCH_SIZE)) }, async () => {
    while (offset < emails.length) {
      const batch = emails.slice(offset, offset += OWNER_BATCH_SIZE).map(email => ({
        email, marker: db.collection("hallOfFameOwners").doc(hallParticipantId(email)),
        cache: db.collection("teamOverviewTotals").doc(email), revision: null as unknown,
      }));
      // One consistent snapshot prevents a cache read from straddling a mutation.
      const initial = await db.runTransaction(tx => tx.getAll(
        ...batch.flatMap(owner => [owner.marker, owner.cache]),
        { fieldMask: ["revision", "version", "ownerEmail", "updatedAtMs", "projection"] },
      ), { readOnly: true });
      let pending: Owner[] = [];
      batch.forEach((owner, index) => {
        owner.revision = initial[index * 2].data()?.revision ?? null;
        const stored = initial[index * 2 + 1].data();
        const projection = stored?.projection as Projection | undefined;
        if (stored?.version === TEAM_OVERVIEW_MODEL_VERSION && stored.ownerEmail === owner.email
          && projection?.version === VERSION && projection.revision === owner.revision
          && stored.updatedAtMs === projection.clock?.builtAtMs && clockValid(projection.clock, nowClock)
          && validStats(projection.all) && validStats(projection.active)) apply(owner.email, projection);
        else pending.push(owner);
      });
      for (let attempt = 0; pending.length && attempt < 3; attempt++) {
        const docs = await readEntries(pending.map(owner => owner.email));
        const projections = buildTeamOverviewOwnerProjections(docs, pending.map(owner => owner.email), now);
        let changed: Owner[];
        try {
          changed = await db.runTransaction(async tx => {
            const latest = await tx.getAll(...pending.map(owner => owner.marker), { fieldMask: ["revision"] });
            const retry: Owner[] = [];
            pending.forEach((owner, index) => {
              const revision = latest[index].data()?.revision ?? null;
              if (revision !== owner.revision) { retry.push({ ...owner, revision }); return; }
              const projection = projections[owner.email];
              const yearMonth = currentYearMonth(now), previousMonth = previousYearMonth(now);
              const documents = buildTeamOverviewReadModelDocuments({ ownerEmail: owner.email,
                stat: projection.all, activeStat: projection.active, yearMonth, previousMonth, updatedAtMs: now.getTime() });
              // Keep existing admin diagnostics and monthly read models compatible.
              tx.set(owner.cache, { ...documents.totals, projection: { ...projection, version: VERSION, revision } });
              tx.set(db.collection("teamOverviewMonthly").doc(`${owner.email}___${yearMonth}`), documents.currentMonth);
              tx.set(db.collection("teamOverviewMonthly").doc(`${owner.email}___${previousMonth}`), documents.previousMonth);
            });
            return retry;
          });
        } catch (error) {
          // Cache persistence is optional; source verification is mandatory.
          const latest = await getAllBatched(db, pending.map(owner => owner.marker));
          changed = pending.flatMap((owner, index) => {
            const revision = latest[index].data()?.revision ?? null;
            return revision === owner.revision ? [] : [{ ...owner, revision }];
          });
          console.warn("Uložení týmových souhrnů se nezdařilo:", error);
        }
        const changedEmails = new Set(changed.map(owner => owner.email));
        pending.forEach(owner => { if (!changedEmails.has(owner.email)) apply(owner.email, projections[owner.email]); });
        pending = changed;
      }
      if (pending.length) throw new Error("Týmové výsledky se právě mění. Zopakujte načtení.");
    }
  }));
  return result;
}
