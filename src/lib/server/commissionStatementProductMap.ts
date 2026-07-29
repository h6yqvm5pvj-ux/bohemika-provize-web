import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  DEFAULT_STATEMENT_PRODUCT_MAP_ENTRIES,
  extractStatementProductMapOverrides,
  mergeStatementProductMapEntries,
  normalizeStatementProductMapEntries,
  type StatementProductMapEntry,
} from "@/app/_provizni-vypisy/statementProductMap";

const CONFIG_COLLECTION = "appConfig";
const CONFIG_DOC_ID = "commissionStatementProductMap";

const mapDocRef = () =>
  adminDb?.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID) ?? null;

const entriesFromStoredValue = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).map(([code, entry]) =>
    entry && typeof entry === "object"
      ? { ...(entry as Record<string, unknown>), code }
      : { code }
  );
};

export type StatementProductMapConfig = {
  entries: StatementProductMapEntry[];
  defaultEntries: StatementProductMapEntry[];
  overrideEntries: StatementProductMapEntry[];
  updatedAtMs: number | null;
  updatedBy: string | null;
};

export const readStatementProductMapConfig =
  async (): Promise<StatementProductMapConfig> => {
    const ref = mapDocRef();
    if (!ref) {
      throw new Error("Server není správně nakonfigurován (Firestore).");
    }

    const snapshot = await ref.get();
    const data = snapshot.exists ? snapshot.data() : null;
    const storedEntries = entriesFromStoredValue(data?.entries);
    const overrideEntries = normalizeStatementProductMapEntries(storedEntries);
    const updatedAtMs =
      typeof data?.updatedAtMs === "number" && Number.isFinite(data.updatedAtMs)
        ? data.updatedAtMs
        : null;
    const updatedBy = typeof data?.updatedBy === "string" ? data.updatedBy : null;

    return {
      entries: mergeStatementProductMapEntries(overrideEntries),
      defaultEntries: DEFAULT_STATEMENT_PRODUCT_MAP_ENTRIES,
      overrideEntries,
      updatedAtMs,
      updatedBy,
    };
  };

export const saveStatementProductMapConfig = async ({
  entries,
  updatedBy,
}: {
  entries: unknown;
  updatedBy: string;
}): Promise<StatementProductMapConfig> => {
  const ref = mapDocRef();
  if (!ref) {
    throw new Error("Server není správně nakonfigurován (Firestore).");
  }

  const updatedAtMs = Date.now();
  const overrideEntries = extractStatementProductMapOverrides(
    entries,
    updatedBy,
    updatedAtMs
  );

  await ref.set(
    {
      entries: overrideEntries,
      updatedAtMs,
      updatedBy,
    },
    { merge: false }
  );

  return {
    entries: mergeStatementProductMapEntries(overrideEntries),
    defaultEntries: DEFAULT_STATEMENT_PRODUCT_MAP_ENTRIES,
    overrideEntries,
    updatedAtMs,
    updatedBy,
  };
};
