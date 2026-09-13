import { AsyncLocalStorage } from "node:async_hooks";
import type { Firestore } from "firebase-admin/firestore";
import {
  beginCashflowMutation,
  completeCashflowMutation,
  failCashflowMutation,
  type CashflowMutationToken,
} from "./cashflowCacheState";

type MutationContext = {
  reason: string;
  db: Firestore | null;
  started: Promise<CashflowMutationToken> | null;
  pending: Set<Promise<unknown>>;
  failed: boolean;
  closed: boolean;
};
const mutations = new AsyncLocalStorage<MutationContext>();

export const cashflowMutationTrackingEnabled = () => process.env.CASHFLOW_CACHE_TRACK_WRITES === "1";

/** Marks a logical partial failure even if its HTTP handler keeps old success semantics. */
export function markCashflowMutationIncomplete(): void {
  const context = mutations.getStore();
  if (context && !context.closed) context.failed = true;
}

async function finish(context: MutationContext): Promise<void> {
  while (context.pending.size) await Promise.allSettled([...context.pending]);
  context.closed = true;
  if (!context.started || !context.db) return;
  try {
    const token = await context.started;
    if (context.failed) await failCashflowMutation(context.db, token);
    else await completeCashflowMutation(context.db, token);
  } catch {
    // Uncertain completion must leave the durable barrier closed. Do not turn
    // an already successful business write into an apparent failure/retry.
    console.error("Cashflow mutation tracking could not finalize; cached candidates remain unavailable.");
  }
}

function observe<T>(promise: Promise<T>): Promise<T> {
  // Keep the returned promise rejected for awaiting callers, but a forgotten
  // await must not become an unhandled rejection after the fence recorded it.
  void promise.catch(() => undefined);
  return promise;
}

function trackPending<T>(context: MutationContext, promise: Promise<T>): Promise<T> {
  context.pending.add(promise);
  void promise.then(
    () => context.pending.delete(promise),
    () => context.pending.delete(promise),
  );
  return promise;
}

async function runWork<T>(context: MutationContext, work: () => Promise<T>): Promise<T> {
  try {
    const result = await work();
    if (result instanceof Response && !result.ok) context.failed = true;
    return result;
  } catch (error) {
    context.failed = true;
    throw error;
  }
}

/**
 * One logical operation across batches, transactions and nested helpers. No
 * state write occurs during authorization/validation/read-only or dry-run work.
 */
export function withCashflowMutation<T>(reason: string, work: () => Promise<T>): Promise<T> {
  const parent = mutations.getStore();
  if (parent && !parent.closed) {
    // Include nested logical work before its first SDK write, so a delayed read
    // or swallowed failure cannot let the outer operation publish completion.
    return trackPending(parent, runWork(parent, work));
  }
  if (!cashflowMutationTrackingEnabled()) return (async () => work())();
  const context: MutationContext = {
    reason, db: null, started: null, pending: new Set(), failed: false, closed: false,
  };
  return observe(mutations.run(context, async () => {
    try {
      return await runWork(context, work);
    } finally {
      await finish(context);
    }
  }));
}

/** Must surround the actual SDK promise, before it starts, not an existing promise. */
export function trackCashflowWrite<T>(work: () => Promise<T>, db?: Firestore): Promise<T> {
  const context = mutations.getStore();
  if (!context || context.closed) {
    if (!cashflowMutationTrackingEnabled()) return (async () => work())();
    return withCashflowMutation("standalone-write", () => trackCashflowWrite(work, db));
  }

  const pending = (async () => {
    try {
      if (!context.started) {
        // Assign the promise before any await; concurrent batches share a fence.
        context.started = (async () => {
          const target = db ?? (await import("./firebaseAdmin")).adminDb;
          if (!target) throw new Error("Cashflow mutation database unavailable.");
          context.db = target;
          return beginCashflowMutation(target, context.reason);
        })();
      }
      await context.started;
      if (db && context.db !== db) throw new Error("A cashflow mutation cannot span databases.");
      return await work();
    } catch (error) {
      context.failed = true;
      throw error;
    }
  })();
  return trackPending(context, pending);
}
