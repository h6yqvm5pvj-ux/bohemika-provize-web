import { FieldValue, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";

import { contractLifecycleStatus } from "../../app/lib/contractLifecycle";
import { toDate } from "../../app/lib/formatters";
import { adminDb } from "./firebaseAdmin";

const ENTRY_PAGE_SIZE = 300;
const BATCH_LIMIT = 300;
const DOZITA_STATUS_VALUE = "dožitá";

type ExpiredContractUpdate = {
  ownerEmail: string;
  entryId: string;
  contractNumber: string | null;
  policyEndDate: string | null;
  ref: FirebaseFirestore.DocumentReference<DocumentData>;
};

export type MarkExpiredPolicyEndContractsOptions = {
  write?: boolean;
  now?: Date;
  limit?: number;
  ownerEmail?: string | null;
};

export type MarkExpiredPolicyEndContractsResult = {
  ok: true;
  mode: "dry-run" | "write";
  cutoffExclusive: string;
  stats: {
    scannedUsers: number;
    candidateEntries: number;
    contractEntries: number;
    alreadyDozita: number;
    skippedStorno: number;
    skippedNonContract: number;
    plannedUpdates: number;
    written: number;
  };
  examples: Array<{
    ownerEmail: string;
    entryId: string;
    contractNumber: string | null;
    policyEndDate: string | null;
  }>;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeToken = (value: unknown): string =>
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    : "";

const normalizeEntryType = (value: unknown): string => {
  const normalized = normalizeToken(value);
  return normalized || "contract";
};

const normalizeContractNumber = (value: unknown): string | null => {
  const normalized = String(value ?? "").replace(/\s+/g, "").trim();
  return normalized || null;
};

const startOfUtcDay = (value: Date): Date =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );

const isoDayFromUnknown = (value: unknown): string | null => {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
};

const isExplicitDozitaStatus = (value: unknown): boolean => {
  const status = normalizeToken(value);
  return status === "dozita" || status === "dozite" || status === "dozito";
};

const commitUpdates = async (updates: ExpiredContractUpdate[]): Promise<number> => {
  if (!adminDb) throw new Error("Missing Firebase Admin configuration.");

  let batch = adminDb.batch();
  let inBatch = 0;
  let written = 0;

  for (const update of updates) {
    batch.update(update.ref, {
      status: DOZITA_STATUS_VALUE,
      updatedAt: FieldValue.serverTimestamp(),
    });
    inBatch += 1;

    if (inBatch >= BATCH_LIMIT) {
      await batch.commit();
      written += inBatch;
      batch = adminDb.batch();
      inBatch = 0;
    }
  }

  if (inBatch > 0) {
    await batch.commit();
    written += inBatch;
  }

  return written;
};

export async function markExpiredPolicyEndContractsDozita(
  options: MarkExpiredPolicyEndContractsOptions = {}
): Promise<MarkExpiredPolicyEndContractsResult> {
  if (!adminDb) throw new Error("Missing Firebase Admin configuration.");

  const now = options.now ?? new Date();
  const cutoffExclusive = startOfUtcDay(now);
  const write = options.write === true;
  const limit = Math.max(0, Math.floor(Number(options.limit) || 0));
  const ownerFilter = normalizeEmail(options.ownerEmail);

  const stats = {
    scannedUsers: 0,
    candidateEntries: 0,
    contractEntries: 0,
    alreadyDozita: 0,
    skippedStorno: 0,
    skippedNonContract: 0,
    plannedUpdates: 0,
    written: 0,
  };
  const planned: ExpiredContractUpdate[] = [];

  const userDocs: Array<{
    id: string;
    ref: FirebaseFirestore.DocumentReference<DocumentData>;
    data: () => DocumentData | undefined;
  }> = [];

  if (ownerFilter) {
    const ref = adminDb.collection("users").doc(ownerFilter);
    const snap = await ref.get();
    userDocs.push({ id: ownerFilter, ref, data: () => snap.data() });
  } else {
    const snap = await adminDb.collection("users").get();
    snap.docs.forEach((doc) => userDocs.push(doc));
  }

  for (const userDoc of userDocs) {
    if (limit > 0 && stats.candidateEntries >= limit) break;

    const ownerEmail = normalizeEmail(userDoc.data()?.email ?? userDoc.id);
    if (!ownerEmail) continue;
    stats.scannedUsers += 1;

    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
    while (true) {
      if (limit > 0 && stats.candidateEntries >= limit) break;

      let query = userDoc.ref
        .collection("entries")
        .where("policyEndDate", "<", cutoffExclusive)
        .orderBy("policyEndDate")
        .limit(ENTRY_PAGE_SIZE);

      if (cursor) query = query.startAfter(cursor);

      const snap = await query.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        if (limit > 0 && stats.candidateEntries >= limit) break;
        stats.candidateEntries += 1;

        const data = doc.data() ?? {};
        if (normalizeEntryType(data.entryType) !== "contract") {
          stats.skippedNonContract += 1;
          continue;
        }
        stats.contractEntries += 1;

        const lifecycleStatus = contractLifecycleStatus(data, now);
        if (lifecycleStatus === "storno") {
          stats.skippedStorno += 1;
          continue;
        }
        if (isExplicitDozitaStatus(data.status)) {
          stats.alreadyDozita += 1;
          continue;
        }
        if (lifecycleStatus !== "dozita") continue;

        planned.push({
          ownerEmail,
          entryId: doc.id,
          contractNumber: normalizeContractNumber(data.contractNumber),
          policyEndDate: isoDayFromUnknown(data.policyEndDate),
          ref: doc.ref,
        });
      }

      cursor = snap.docs[snap.docs.length - 1] ?? null;
      if (!cursor || snap.size < ENTRY_PAGE_SIZE) break;
    }
  }

  stats.plannedUpdates = planned.length;
  if (write && planned.length > 0) {
    stats.written = await commitUpdates(planned);
  }

  return {
    ok: true,
    mode: write ? "write" : "dry-run",
    cutoffExclusive: cutoffExclusive.toISOString().slice(0, 10),
    stats,
    examples: planned.slice(0, 20).map((item) => ({
      ownerEmail: item.ownerEmail,
      entryId: item.entryId,
      contractNumber: item.contractNumber,
      policyEndDate: item.policyEndDate,
    })),
  };
}
