#!/usr/bin/env node
// Preview by default. Writes require the exact preview plan hash and project.
// Outputs aggregate counts only, never names, owner emails or document paths.
import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { withCashflowScriptMutation, trackCashflowScriptWrite } from "./cashflow-mutation.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const args = process.argv.slice(2);
const allowed = /^(?:--apply|--project=[A-Za-z0-9-]+|--plan-hash=[a-f0-9]{64})$/;
if (args.some(arg => !allowed.test(arg)) || new Set(args.map(arg => arg.split("=")[0])).size !== args.length) {
  console.error("Neplatné nebo opakované přepínače.");
  process.exit(1);
}
const apply = args.includes("--apply");
const project = args.find(arg => arg.startsWith("--project="))?.slice(10);
const expectedHash = args.find(arg => arg.startsWith("--plan-hash="))?.slice(12);
const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
});
let db;
const deadline = setTimeout(() => {
  console.error("Kontrola překročila časový limit; před opakováním spusť nový náhled.");
  process.exit(1);
}, 180_000);

try {
  const credentialProject = process.env.FIREBASE_ADMIN_CREDENTIALS
    ? JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS).project_id
    : process.env.FIREBASE_ADMIN_PROJECT_ID;
  if (!project || project !== credentialProject || process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("project-configuration");
  }
  if (apply && !expectedHash) throw new Error("missing-preview-hash");
  ({ adminDb: db } = jiti("../src/lib/server/firebaseAdmin.ts"));
  if (!db) throw new Error("missing-admin-configuration");
  const { planClientNameCaseRepairs, applyClientNameCaseRepair } = jiti("../src/lib/server/clientNameCaseRepair.ts");
  const snapshot = await db.collectionGroup("entries").select("clientName", "entryType").get();
  const sources = snapshot.docs.map(doc => ({ path: doc.ref.path, clientName: doc.data().clientName, entryType: doc.data().entryType }));
  const plans = planClientNameCaseRepairs(sources).sort((left, right) => left.path.localeCompare(right.path, "en"));
  const planHash = createHash("sha256").update(JSON.stringify({ project, plans })).digest("hex");
  const stats = {
    mode: apply ? "apply" : "preview", readEntries: snapshot.size,
    plannedPeople: new Set(plans.map(plan => `${plan.path.split("/")[1]}\0${plan.clientSlug}`)).size,
    plannedChanges: plans.length, planHash, updated: 0, unchanged: 0, stale: 0, verificationFailures: 0,
  };
  if (apply) {
    if (expectedHash !== planHash) throw new Error("preview-plan-changed");
    await withCashflowScriptMutation("normalize-client-name-case", async () => {
      for (const plan of plans) {
        const status = await trackCashflowScriptWrite(() => applyClientNameCaseRepair(db, plan, null), db);
        stats[status]++;
      }
    });
    // Re-read only affected names to verify the committed values and IDs.
    for (const plan of plans) {
      const snap = await db.doc(plan.path).get();
      if (!snap.exists || snap.data().clientName !== plan.clientName) stats.verificationFailures++;
    }
  }
  console.log(JSON.stringify(stats, null, 2));
  if (stats.stale || stats.verificationFailures) process.exitCode = 1;
} catch {
  // Provider errors can contain document paths; expose no raw diagnostic data.
  console.error("Sjednocení se nezdařilo. Ověř projekt, konfiguraci a aktuální hash náhledu; opakuj nejprve náhled.");
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  if (db) await db.terminate();
}
