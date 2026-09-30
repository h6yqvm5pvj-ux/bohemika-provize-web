const objectRecord = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const email = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

export const statementRecordArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export const ownsStatementRecord = (value: unknown, writer: string): boolean => {
  const record = objectRecord(value);
  return Boolean(record && text(record.statementId) && email(writer) && email(record.writtenBy) === email(writer));
};

export class StatementRebuildCapacityError extends Error {
  constructor() {
    super("Přepočet nelze dokončit: historii zaplňují záznamy jiných autorů nebo záznamy bez určeného autora.");
  }
}

export const remainingStatementRebuildCapacity = (existing: unknown, writer: string, maxCount: number): number =>
  Math.max(0, maxCount - statementRecordArray(existing).filter(value => !ownsStatementRecord(value, writer)).length);

type MergeResult<T> = { merged: T[]; added: number; existingCount: number; updatedExisting: number };

export const mergeRebuiltStatementRecords = <T extends { key: string }>({
  existing, incoming, writer, maxCount, merge,
}: {
  existing: unknown;
  incoming: T[];
  writer: string;
  maxCount: number;
  merge: (existing: T[], incoming: T[], maxCount: number) => MergeResult<T>;
}): Omit<MergeResult<T>, "merged"> & { merged: unknown[] } => {
  const records = statementRecordArray(existing);
  // Preserve even malformed, manual and unattributed records byte-for-byte.
  // Only this writer's imported records participate in deduplication/retention.
  const protectedRecords = records.filter(value => !ownsStatementRecord(value, writer));
  const own = records.filter(value => ownsStatementRecord(value, writer) &&
    typeof objectRecord(value)?.key === "string") as T[];
  const available = remainingStatementRebuildCapacity(existing, writer, maxCount);
  if (available === 0 && incoming.length > 0) throw new StatementRebuildCapacityError();
  const result = merge(own, incoming, Math.max(1, available));
  return { ...result, merged: [...protectedRecords, ...(available > 0 ? result.merged : [])] };
};
