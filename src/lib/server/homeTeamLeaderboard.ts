import type { Firestore, Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { TZDate } from "@date-fns/tz";
import { addLeaderboardPremium, isLeaderboardTotals, type LeaderboardTotals } from "@/app/home/productionSummary";
import { entrySignedDate } from "@/app/home/homeUtils";
import { isInheritedContract } from "@/app/lib/inheritedContracts";
import { isRetiredProduct } from "@/app/lib/retiredProducts";
import { hallParticipantId } from "./hallOfFame";

const FIELDS = ["contractSignedDate", "createdAt", "productKey", "acquisitionType", "inputAmount", "frequencyRaw"];
const PAGE_SIZE = 300;

export function leaderboardWindow(months: string | null, zone: string | null, now = Date.now()) {
  if ((months !== "6" && months !== "12") || !zone || zone.length > 80) return null;
  try {
    const timeZone = new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
    const today = new TZDate(now, timeZone);
    const year = today.getFullYear();
    const month = today.getMonth();
    // Preserve the former browser filter, including Date.setMonth overflow at month end.
    const from = new TZDate(year, month - Number(months), today.getDate(), timeZone).getTime();
    const to = new TZDate(year, month + 1, 1, timeZone).getTime();
    return { months, from, to };
  } catch {
    return null;
  }
}

type Window = NonNullable<ReturnType<typeof leaderboardWindow>>;

async function sumOwner(db: Firestore, email: string, window: Window) {
  const entries = db.collection("users").doc(email).collection("entries").select(...FIELDS);
  const totals: LeaderboardTotals = { life: 0, other: 0, hasLife: false, hasOther: false };
  for (const field of ["contractSignedDate", "createdAt"] as const) {
    const base = entries.orderBy(field);
    // Timestamp, numeric milliseconds, and legacy text/serialized dates have separate index ranges.
    const ranges = [
      base.where(field, ">=", new Date(window.from - 1)).where(field, "<", new Date(window.to)),
      base.where(field, ">=", window.from).where(field, "<", window.to),
      base.startAt(""),
    ];
    for (const range of ranges) {
      let query: Query = range.limit(PAGE_SIZE);
      while (true) {
        const page = await query.get();
        for (const doc of page.docs) {
          const row = doc.data();
          if (isRetiredProduct(row.productKey) || isInheritedContract(row)) continue;
          // A valid signing date belongs exclusively to the signing-date stream.
          const signed = entrySignedDate({ contractSignedDate: row.contractSignedDate });
          if (field === "createdAt" && signed) continue;
          const date = signed ?? (field === "createdAt" ? entrySignedDate({ createdAt: row.createdAt }) : null);
          if (date && date.getTime() >= window.from && date.getTime() < window.to) addLeaderboardPremium(totals, row);
        }
        if (page.size < PAGE_SIZE) break;
        const last: QueryDocumentSnapshot = page.docs[page.size - 1];
        query = range.startAfter(last).limit(PAGE_SIZE);
      }
    }
  }
  return totals;
}

async function loadOwner(db: Firestore, email: string, window: Window, force: boolean) {
  const owner = db.collection("hallOfFameOwners").doc(hallParticipantId(email));
  const cache = owner.collection("homeLeaderboard").doc(window.months);
  for (let attempt = 0; attempt < 3; attempt++) {
    const [source, snapshot] = await db.getAll(owner, cache);
    const revision = source.data()?.revision ?? null;
    const saved = snapshot.data();
    if (!force && saved && saved.revision === revision && saved.from === window.from && saved.to === window.to &&
        isLeaderboardTotals(saved.totals)) return saved.totals;
    const totals = await sumOwner(db, email, window);
    const published = await db.runTransaction(async tx => {
      const current = await tx.get(owner);
      if ((current.data()?.revision ?? null) !== revision) return false;
      tx.set(cache, { revision, from: window.from, to: window.to, totals });
      return true;
    });
    if (published) return totals;
  }
  throw new Error("Produkce se právě mění.");
}

export async function loadTeamLeaderboard(db: Firestore, owners: string[], names: Map<string, string | null>, window: Window, force: boolean) {
  const rows = [];
  for (let i = 0; i < owners.length; i += 8) {
    const batch = await Promise.all(owners.slice(i, i + 8).map(async email => ({
      email, name: names.get(email) ?? null, ...await loadOwner(db, email, window, force),
    })));
    rows.push(...batch.filter(row => row.hasLife || row.hasOther));
  }
  return rows;
}
