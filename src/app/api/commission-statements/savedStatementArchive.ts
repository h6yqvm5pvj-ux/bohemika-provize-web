import { commissionStatementIdentityKey } from "./statementIdentity";
import { normalizeText } from "./statementPayoutRows";

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
};

export const toMillis = (value: unknown): number | null => {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object") {
    const ts = value as FirestoreTimestamp;
    if (typeof ts.toDate === "function") {
      const ms = ts.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    if (
      typeof ts.seconds === "number" &&
      Number.isFinite(ts.seconds) &&
      typeof ts.nanoseconds === "number" &&
      Number.isFinite(ts.nanoseconds)
    ) {
      return ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1_000_000);
    }
  }
  return null;
};

export const parseCzechDate = (value: string | null | undefined): number | null => {
  const match = value?.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
};

export const parsePeriodRange = (period: string | null) => {
  const match = period?.match(
    /(\d{1,2}\.\d{1,2}\.\d{4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{4})/
  );
  if (!match) return { periodStartMs: null, periodEndMs: null };
  return {
    periodStartMs: parseCzechDate(match[1]),
    periodEndMs: parseCzechDate(match[2]),
  };
};

export const monthKeyFromMs = (ms: number | null): string | null => {
  if (ms == null) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
};

const nextMonthKeyFromMs = (ms: number | null): string | null => {
  if (ms == null) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  const nextMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return `${nextMonth.getUTCFullYear()}-${nextMonth.getUTCMonth() + 1}`;
};

export const resolvePayoutMonthKey = ({
  statementDateMs,
  periodEndMs,
  periodStartMs,
}: {
  statementDateMs: number | null;
  periodEndMs: number | null;
  periodStartMs: number | null;
}): string | null =>
  monthKeyFromMs(statementDateMs) ?? nextMonthKeyFromMs(periodEndMs) ?? monthKeyFromMs(periodStartMs);

export const statementSnapshotIdentity = (
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): string => {
  const data = docSnap.data() ?? {};
  return commissionStatementIdentityKey({
    statementId: docSnap.id,
    statementNumber: data.statementNumber,
    statementPeriod: data.period,
    statementDate: data.statementDate,
    advisorNumber: data.advisorNumber,
  });
};

const statementSnapshotRecency = (
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): number =>
  toMillis(docSnap.data()?.updatedAtMs) ??
  toMillis(docSnap.data()?.processedAtMs) ??
  toMillis(docSnap.data()?.createdAtMs) ??
  0;

export const dedupeStatementSnapshots = (
  docs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]
): FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] => {
  const byIdentity = new Map<
    string,
    FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
  >();
  const order: string[] = [];

  for (const docSnap of docs) {
    const identity = statementSnapshotIdentity(docSnap);
    const current = byIdentity.get(identity);
    if (!current) {
      byIdentity.set(identity, docSnap);
      order.push(identity);
      continue;
    }
    if (statementSnapshotRecency(docSnap) > statementSnapshotRecency(current)) {
      byIdentity.set(identity, docSnap);
    }
  }

  return order
    .map((identity) => byIdentity.get(identity))
    .filter(
      (
        docSnap
      ): docSnap is FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> =>
        Boolean(docSnap)
    );
};

export const statementChronologyMsFromParts = ({
  statementDate,
  statementDateMs,
  statementPeriod,
  periodEndMs,
  periodStartMs,
}: {
  statementDate?: string | null;
  statementDateMs?: number | null;
  statementPeriod?: string | null;
  periodEndMs?: number | null;
  periodStartMs?: number | null;
}): number | null => {
  if (statementDateMs != null) return statementDateMs;
  const parsedStatementDate = parseCzechDate(statementDate);
  if (parsedStatementDate != null) return parsedStatementDate;
  if (periodEndMs != null) return periodEndMs;
  const parsedPeriod = parsePeriodRange(statementPeriod ?? null);
  return parsedPeriod.periodEndMs ?? periodStartMs ?? parsedPeriod.periodStartMs ?? null;
};

export type SavedStatementReprocessItem = {
  id: string;
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  html: string;
  advisorNumber: string | null;
  statementNumber: string | null;
  statementPeriod: string | null;
  statementDate: string | null;
  periodEndMs: number | null;
  statementChronologyMs: number | null;
  payoutMonthKey: string | null;
};

export const savedStatementMetadataFromDoc = (
  docSnap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
): Omit<SavedStatementReprocessItem, "html"> => {
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;

  const statementDate = normalizeText(data.statementDate, 32);
  const statementDateMs = toMillis(data.statementDateMs) ?? parseCzechDate(statementDate);
  const statementPeriod = normalizeText(data.period, 80);
  const storedPeriodStartMs = toMillis(data.periodStartMs);
  const storedPeriodEndMs = toMillis(data.periodEndMs);
  const parsedPeriod = parsePeriodRange(statementPeriod);
  const periodStartMs = storedPeriodStartMs ?? parsedPeriod.periodStartMs;
  const periodEndMs = storedPeriodEndMs ?? parsedPeriod.periodEndMs;
  const statementChronologyMs =
    toMillis(data.statementChronologyMs) ??
    statementChronologyMsFromParts({
      statementDate,
      statementDateMs,
      statementPeriod,
      periodEndMs,
      periodStartMs,
    });
  const payoutMonthKey =
    normalizeText(data.payoutMonthKey, 16) ??
    resolvePayoutMonthKey({ statementDateMs, periodEndMs, periodStartMs });

  return {
    id: docSnap.id,
    ref: docSnap.ref,
    advisorNumber: normalizeText(data.advisorNumber, 64),
    statementNumber: normalizeText(data.statementNumber, 64),
    statementPeriod,
    statementDate,
    periodEndMs,
    statementChronologyMs,
    payoutMonthKey,
  };
};
