#!/usr/bin/env node

import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HELP = `Cashflow diagnostic cache maintenance (no displayed amounts are changed).
  node scripts/cashflow-cache-state.mjs [status]
  node scripts/cashflow-cache-state.mjs init --apply
  node scripts/cashflow-cache-state.mjs cleanup --apply [--limit=100]
  node scripts/cashflow-cache-state.mjs fail-active --apply --operation=UUID --epoch=UUID --revision=N --writer-stopped-and-data-verified
  node scripts/cashflow-cache-state.mjs recover --apply --operation=UUID --epoch=UUID --revision=N --writer-stopped-and-data-verified

status is read-only and shows at most 100 active/failed operations. init creates
only missing, empty state and never clears existing barriers. cleanup removes
expired candidates/chunks only (at most limit documents per collection).

For a crashed active operation: stop its writer, inspect and repair its partial
business writes, then fail-active with the current epoch/revision. Inspect status
again before recover. A timeout is not proof that a writer stopped. Other active
or failed operations continue blocking candidates. No credentials are printed.
Environment is loaded from the current project's .env files, as in other scripts.
`;

export function parseCashflowCacheArgs(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) return { action: "help" };
  const action = args[0] && !args[0].startsWith("--") ? args[0] : "status";
  if (!["status", "init", "cleanup", "fail-active", "recover"].includes(action)) throw new Error("Unknown action. Use --help.");
  const flags = new Map();
  for (const arg of args.slice(args[0] === action ? 1 : 0)) {
    const match = /^(--[a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!match || flags.has(match[1])) throw new Error("Invalid or duplicate argument. Use --help.");
    flags.set(match[1], match[2] ?? true);
  }
  const allowed = action === "status" ? [] : action === "cleanup" ? ["--apply", "--limit"]
    : action === "init" ? ["--apply"]
    : ["--apply", "--operation", "--epoch", "--revision", "--writer-stopped-and-data-verified"];
  for (const flag of flags.keys()) if (!allowed.includes(flag)) throw new Error("Unsupported argument for this action. Use --help.");
  if (action !== "status" && flags.get("--apply") !== true) throw new Error("Mutating actions require --apply. Default status is read-only.");
  if (action === "cleanup") {
    const rawLimit = flags.get("--limit");
    const limit = rawLimit === undefined ? 100
      : typeof rawLimit === "string" && /^\d+$/.test(rawLimit) ? Number(rawLimit) : NaN;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error("Cleanup limit must be 1..200.");
    return { action, limit };
  }
  if (action === "fail-active" || action === "recover") {
    const id = flags.get("--operation");
    const epoch = flags.get("--epoch");
    const rawRevision = flags.get("--revision");
    const revision = typeof rawRevision === "string" && /^\d+$/.test(rawRevision) ? Number(rawRevision) : NaN;
    if (typeof id !== "string" || !UUID.test(id) || typeof epoch !== "string" || !UUID.test(epoch) || !Number.isSafeInteger(revision)) {
      throw new Error("Recovery requires a specific operation UUID and the current epoch/revision from status.");
    }
    if (flags.get("--writer-stopped-and-data-verified") !== true) {
      throw new Error("Stop the writer and independently verify/repair its partial business writes before recovery.");
    }
    return { action, token: { id, epoch }, expected: { epoch, revision } };
  }
  return { action };
}

export async function runCashflowCacheAction(options, { db, state, candidates }) {
  if (options.action === "init") return state.initializeCashflowCacheState(db);
  if (options.action === "cleanup") return candidates.cleanupExpiredCashflowCandidates(db, { limit: options.limit });
  if (options.action === "fail-active") {
    await state.failCashflowMutation(db, options.token, options.expected);
    return { status: "failed", operation: options.token.id };
  }
  if (options.action === "recover") {
    await state.recoverFailedCashflowMutation(db, options.token, options.expected);
    return { status: "recovered", operation: options.token.id };
  }
  if (options.action !== "status") throw new Error("Unsupported action.");
  const ref = db.doc(state.CASHFLOW_CACHE_STATE_PATH);
  // A single read transaction keeps the operator's revision and operation list consistent.
  return db.runTransaction(async tx => {
    const control = await tx.get(ref);
    const open = await tx.get(ref.collection("mutations").where("status", "in", ["active", "failed"]).limit(100));
    const data = control.data();
    return {
      initialized: control.exists,
      epoch: data?.epoch ?? null,
      revision: data?.revision ?? null,
      activeCount: data?.activeCount ?? null,
      possiblyTruncated: open.size === 100,
      operations: open.docs.map(doc => {
        const operation = doc.data();
        return { id: doc.id, epoch: operation.epoch, status: operation.status, reason: operation.reason, startedAtMs: operation.startedAtMs };
      }),
    };
  }, { readOnly: true });
}

async function main() {
  const options = parseCashflowCacheArgs(process.argv.slice(2));
  if (options.action === "help") { console.log(HELP); return; }
  const { default: nextEnv } = await import("@next/env");
  nextEnv.loadEnvConfig(process.cwd());
  const { createJiti } = await import("jiti");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") } });
  const { adminDb } = await jiti.import("../src/lib/server/firebaseAdmin.ts");
  if (!adminDb) throw new Error("Firebase Admin database is unavailable.");
  const state = await jiti.import("../src/lib/server/cashflowCacheState.ts");
  const candidates = await jiti.import("../src/lib/server/cashflowCandidateStore.ts");
  const result = await runCashflowCacheAction(options, { db: adminDb, state, candidates });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error("Cashflow cache operation failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}
