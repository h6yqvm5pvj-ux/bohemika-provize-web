import { randomUUID } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";

export const CASHFLOW_CACHE_STATE_PATH = "_cashflowCache/control";
export type CashflowRevision = { epoch: string; revision: number };
export type CashflowMutationToken = { id: string; epoch: string };
type CacheState = CashflowRevision & { activeCount: number };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export class CashflowCacheStateError extends Error {
  constructor(readonly code: "invalid_state" | "invalid_mutation" | "revision_changed") {
    super("Cashflow cache state is unavailable.");
    this.name = "CashflowCacheStateError";
  }
}

function parseState(data: unknown): CacheState | null {
  if (!data || typeof data !== "object") return null;
  const state = data as Partial<CacheState>;
  if (typeof state.epoch !== "string" || !UUID.test(state.epoch) ||
    !Number.isSafeInteger(state.revision) || (state.revision ?? -1) < 0 ||
    !Number.isSafeInteger(state.activeCount) || (state.activeCount ?? -1) < 0) return null;
  return state as CacheState;
}

function requireState(data: unknown): CacheState {
  const state = parseState(data);
  if (!state) throw new CashflowCacheStateError("invalid_state");
  return state;
}

function nextRevision(state: CacheState): number {
  if (state.revision === Number.MAX_SAFE_INTEGER) throw new CashflowCacheStateError("invalid_state");
  return state.revision + 1;
}

function mutationRef(db: Firestore, token: CashflowMutationToken) {
  if (!UUID.test(token.id) || !UUID.test(token.epoch)) throw new CashflowCacheStateError("invalid_mutation");
  return db.doc(CASHFLOW_CACHE_STATE_PATH).collection("mutations").doc(token.id);
}

async function rejectOrphanedOperations(db: Firestore, tx: Transaction): Promise<void> {
  // Deleting a parent document does not delete its subcollections. Recreating
  // state while an old writer can resume would lose its durable barrier.
  const operations = await tx.get(db.doc(CASHFLOW_CACHE_STATE_PATH).collection("mutations").limit(1).select());
  if (!operations.empty) throw new CashflowCacheStateError("invalid_state");
}

/** Explicit initialization never resets existing barriers or repairs malformed state. */
export async function initializeCashflowCacheState(db: Firestore): Promise<CashflowRevision> {
  const ref = db.doc(CASHFLOW_CACHE_STATE_PATH);
  const epoch = randomUUID();
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists) {
      const state = requireState(snapshot.data());
      return { epoch: state.epoch, revision: state.revision };
    }
    await rejectOrphanedOperations(db, tx);
    tx.create(ref, { epoch, revision: 0, activeCount: 0, updatedAtMs: Date.now() });
    return { epoch, revision: 0 };
  });
}

/** Commit this barrier BEFORE starting any write or multi-step import. */
export async function beginCashflowMutation(db: Firestore, reason: string): Promise<CashflowMutationToken> {
  if (!reason.trim() || reason.length > 120) throw new CashflowCacheStateError("invalid_mutation");
  const id = randomUUID();
  const newEpoch = randomUUID();
  const ref = db.doc(CASHFLOW_CACHE_STATE_PATH);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) await rejectOrphanedOperations(db, tx);
    const state = snapshot.exists ? requireState(snapshot.data()) : { epoch: newEpoch, revision: 0, activeCount: 0 };
    if (state.activeCount === Number.MAX_SAFE_INTEGER) throw new CashflowCacheStateError("invalid_state");
    const token = { id, epoch: state.epoch };
    const nowMs = Date.now();
    tx.set(ref, { ...state, revision: nextRevision(state), activeCount: state.activeCount + 1, updatedAtMs: nowMs });
    tx.create(mutationRef(db, token), { epoch: state.epoch, reason, status: "active", startedAtMs: nowMs });
    return token;
  });
}

async function transitionMutation(
  db: Firestore,
  token: CashflowMutationToken,
  transition: "complete" | "fail" | "recover",
  expected?: CashflowRevision,
): Promise<void> {
  const operation = mutationRef(db, token);
  const ref = db.doc(CASHFLOW_CACHE_STATE_PATH);
  await db.runTransaction(async tx => {
    const [stateSnapshot, operationSnapshot] = await tx.getAll(ref, operation);
    const state = requireState(stateSnapshot.data());
    const mutation = operationSnapshot.data();
    if (state.epoch !== token.epoch || mutation?.epoch !== token.epoch) throw new CashflowCacheStateError("invalid_mutation");
    if (expected && (state.epoch !== expected.epoch || state.revision !== expected.revision)) {
      throw new CashflowCacheStateError("revision_changed");
    }
    if ((transition === "complete" && mutation.status === "completed") ||
      (transition === "fail" && mutation.status === "failed")) return;
    if (state.activeCount < 1 || mutation.status !== (transition === "recover" ? "failed" : "active")) {
      throw new CashflowCacheStateError("invalid_mutation");
    }
    const nowMs = Date.now();
    tx.update(ref, {
      revision: nextRevision(state),
      activeCount: state.activeCount - (transition === "fail" ? 0 : 1),
      updatedAtMs: nowMs,
    });
    tx.update(operation, {
      status: transition === "complete" ? "completed" : transition === "fail" ? "failed" : "recovered",
      updatedAtMs: nowMs,
    });
  });
}

/** Only call after ALL writes, including derived writes, have settled successfully. */
export function completeCashflowMutation(db: Firestore, token: CashflowMutationToken): Promise<void> {
  return transitionMutation(db, token, "complete");
}

/** Failure remains a durable barrier. There is deliberately no lease or automatic expiry. */
export function failCashflowMutation(
  db: Firestore, token: CashflowMutationToken, expectedRevision?: CashflowRevision,
): Promise<void> {
  return transitionMutation(db, token, "fail", expectedRevision);
}

/**
 * Operational recovery only, after the caller independently proves the writer
 * has stopped and repairs/verifies its partial writes. An elapsed timeout is
 * not that proof. Active operations cannot be recovered by this function.
 */
export function recoverFailedCashflowMutation(
  db: Firestore, token: CashflowMutationToken, expectedRevision: CashflowRevision,
): Promise<void> {
  return transitionMutation(db, token, "recover", expectedRevision);
}

export async function captureCashflowRevision(db: Firestore): Promise<CashflowRevision | null> {
  const snapshot = await db.doc(CASHFLOW_CACHE_STATE_PATH).get();
  const state = parseState(snapshot.data());
  return state?.activeCount === 0 ? { epoch: state.epoch, revision: state.revision } : null;
}

/** Also used inside the atomic publication and final reader validation. */
export async function isCashflowRevisionCurrent(
  db: Firestore, tx: Transaction, expected: CashflowRevision,
): Promise<boolean> {
  const snapshot = await tx.get(db.doc(CASHFLOW_CACHE_STATE_PATH));
  const state = parseState(snapshot.data());
  return state !== null && state.activeCount === 0 &&
    state.epoch === expected.epoch && state.revision === expected.revision;
}
