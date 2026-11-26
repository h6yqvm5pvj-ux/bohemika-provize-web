import { endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { statementOrderDate, statementOrderProblem } from "@/app/lib/statementProcessingOrder";
import { toMillis } from "./savedStatementArchive";

export class StatementOrderError extends Error {}

const historyFields = ["period", "periodEndMs", "statementDate", "statementDateMs", "processedAtMs", "updatedAtMs"];

function savedOrder(snapshot: FirebaseFirestore.QuerySnapshot) {
  let latest: number | null = null;
  const unfinished: { id: string; day: number }[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const day = statementOrderDate(data) ?? toMillis(data.periodEndMs) ?? toMillis(data.statementDateMs);
    if (day === null) continue;
    if (toMillis(data.processedAtMs) !== null) {
      latest = Math.max(latest ?? day, day);
    } else if (data.updatedAtMs) {
      unfinished.push({ id: doc.id, day });
    }
  }
  return { latest, unfinished };
}

async function firstContractMonth(db: Firestore, owner: string): Promise<number | null> {
  const entries = db.collection("users").doc(owner).collection("entries");
  const signedMonth = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const { contractSignedDate, entryType } = doc.data();
    if (entryType && entryType !== "contract") return null;
    const day = endorsementCommissionDay(contractSignedDate) ??
      (typeof contractSignedDate === "string" ? statementOrderDate({ statementDate: contractSignedDate }) : null);
    if (day === null) return null;
    const date = new Date(day);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  };
  // Firestore sorts different field types separately. Use the date index for
  // timestamps and numeric epochs, and compare legacy text dates after parsing.
  const firstIndexedMonth = async (min: Date | number, max: Date | number) => {
    const query = entries.where("contractSignedDate", ">=", min).where("contractSignedDate", "<=", max)
      .orderBy("contractSignedDate").select("entryType", "contractSignedDate").limit(8);
    let page = await query.get();
    while (page.docs.length) {
      for (const doc of page.docs) {
        const month = signedMonth(doc);
        if (month !== null) return month;
      }
      if (page.docs.length < 8) break;
      page = await query.startAfter(page.docs[page.docs.length - 1]).get();
    }
    return null;
  };
  const [timestamp, epoch, strings] = await Promise.all([
    firstIndexedMonth(new Date("0001-01-01T00:00:00Z"), new Date("9999-12-31T23:59:59.999Z")),
    firstIndexedMonth(-86_400_000_000_000, 86_400_000_000_000),
    entries.where("contractSignedDate", ">=", "").where("contractSignedDate", "<=", "\uf8ff")
      .select("entryType", "contractSignedDate").get(),
  ]);
  let first = timestamp ?? epoch;
  if (epoch !== null) first = Math.min(first ?? epoch, epoch);
  for (const doc of strings.docs) {
    const month = signedMonth(doc);
    if (month !== null) first = Math.min(first ?? month, month);
  }
  return first;
}

export async function readStatementOrder(db: Firestore, owner: string) {
  const history = db.collection("usersPrivate").doc(owner).collection("commissionStatements");
  const snapshot = await history.select(...historyFields).get();
  const { latest, unfinished } = savedOrder(snapshot);
  const firstMonth = snapshot.docs.some(doc => toMillis(doc.data().processedAtMs) !== null)
    ? null : await firstContractMonth(db, owner);
  const earliestUnfinished = unfinished.reduce<number | null>((oldest, { day }) =>
    latest !== null && day < latest ? oldest : Math.min(oldest ?? day, day), null);
  return { latest, firstMonth, earliestUnfinished };
}

// The lease outlives a processing request and allows recovery after a terminated
// worker. The checked source document stays available for retry after a partial write.
export async function withStatementOrder<T>(
  db: Firestore, owner: string, statementId: string, day: number | null, work: () => Promise<T>,
): Promise<T> {
  const account = db.collection("usersPrivate").doc(owner);
  const lock = account.collection("statementProcessing").doc("order");
  const history = account.collection("commissionStatements").select(...historyFields);
  const token = randomUUID();
  await db.runTransaction(async tx => {
    const current = (await tx.get(lock)).data();
    if (current && current.until > Date.now()) {
      throw new StatementOrderError("Právě se zpracovává jiný požadavek. Po jeho dokončení zkus výpis znovu.");
    }
    const { latest, unfinished } = savedOrder(await tx.get(history));
    const problem = statementOrderProblem(day, latest);
    if (problem) throw new StatementOrderError(problem);
    if (day !== null && unfinished.some(item => item.id !== statementId && item.day < day && (latest === null || item.day >= latest))) {
      throw new StatementOrderError("Nejdřív dokonči zpracování předchozího výpisu.");
    }
    tx.set(lock, { token, until: Date.now() + 60 * 60_000 });
  });
  try {
    return await work();
  } finally {
    await db.runTransaction(async tx => {
      if ((await tx.get(lock)).data()?.token === token) tx.delete(lock);
    });
  }
}
