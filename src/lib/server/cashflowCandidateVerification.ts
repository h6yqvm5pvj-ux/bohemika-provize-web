import type { Firestore } from "firebase-admin/firestore";
import { hashCashflowValue } from "@/app/cashflow/shadowProtocol";
import { parseCashflowSnapshot, serializeCashflowSnapshot, type CashflowSnapshotResult } from "@/app/cashflow/cashflowSnapshotWire";
import { captureCashflowRevision, type CashflowRevision } from "./cashflowCacheState";
import { publishCashflowCandidate, readCashflowCandidate, type CashflowCandidateContext } from "./cashflowCandidateStore";

export type CashflowCandidateVerification = "verified" | "not_stored" | "revision_changed" | "storage_mismatch";
export type CashflowCandidateBuild = {
  db: Firestore;
  revision: CashflowRevision;
  context: CashflowCandidateContext;
};

export function cashflowCandidatesEnabled(): boolean {
  return process.env.CASHFLOW_CANDIDATES_ENABLED === "1" &&
    process.env.CASHFLOW_CACHE_TRACK_WRITES === "1";
}

/** Must run after authentication and BEFORE the first profile/portfolio read. */
export async function beginCashflowCandidateBuild(
  db: Firestore | null, context: CashflowCandidateContext,
): Promise<CashflowCandidateBuild | null> {
  if (!cashflowCandidatesEnabled() || !db) return null;
  try {
    const revision = await captureCashflowRevision(db);
    return revision ? { db, revision, context } : null;
  } catch { return null; }
}

/**
 * Exercise persistence and reconstruction, including every Date and amount.
 * This is diagnostic evidence only; it never selects the UI's data source.
 */
export async function verifyCashflowCandidateStorage(
  build: CashflowCandidateBuild | null,
  inputHash: string,
  result: CashflowSnapshotResult,
  expected: { itemsHash: string; monthsHash: string },
  signal?: AbortSignal,
): Promise<CashflowCandidateVerification> {
  if (!build || signal?.aborted) return "not_stored";
  try {
    const payload = serializeCashflowSnapshot(result);
    if (signal?.aborted) return "not_stored";
    const published = await publishCashflowCandidate(build.db, { ...build, inputHash, payload });
    if (!published) return "revision_changed";
    if (signal?.aborted) return "not_stored";
    const candidate = await readCashflowCandidate(build.db, { context: build.context });
    if (!candidate || candidate.revision.epoch !== build.revision.epoch ||
      candidate.revision.revision !== build.revision.revision) return "revision_changed";
    const restored = parseCashflowSnapshot(candidate.payload);
    if (!restored || candidate.inputHash !== inputHash) return "storage_mismatch";
    const [itemsHash, monthsHash] = await Promise.all([
      hashCashflowValue(restored.items), hashCashflowValue(restored.months),
    ]);
    if (signal?.aborted) return "not_stored";
    return itemsHash === expected.itemsHash && monthsHash === expected.monthsHash ? "verified" : "storage_mismatch";
  } catch { return "not_stored"; }
}
