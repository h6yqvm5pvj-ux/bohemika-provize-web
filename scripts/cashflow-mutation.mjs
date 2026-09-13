// Share the application's durable mutation protocol with maintenance scripts,
// including scripts that initialize their own Firebase Admin application.
// Keeping the bridge lazy preserves existing behavior when tracking is off.
let runtimePromise;

async function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const [{ createJiti }, { fileURLToPath }] = await Promise.all([
        import("jiti"),
        import("node:url"),
      ]);
      const jiti = createJiti(import.meta.url, {
        alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
      });
      return jiti("../src/lib/server/cashflowMutationTracking.ts");
    })();
  }
  return runtimePromise;
}

/** @template T @param {string} reason @param {() => Promise<T>} work */
export async function withCashflowScriptMutation(reason, work) {
  if (process.env.CASHFLOW_CACHE_TRACK_WRITES !== "1") return work();
  const runtime = await loadRuntime();
  return runtime.withCashflowMutation(reason, work);
}

/**
 * @template T
 * @param {() => Promise<T>} work
 * @param {import("firebase-admin/firestore").Firestore} db
 */
export async function trackCashflowScriptWrite(work, db) {
  if (process.env.CASHFLOW_CACHE_TRACK_WRITES !== "1") return work();
  const runtime = await loadRuntime();
  return runtime.trackCashflowWrite(work, db);
}
