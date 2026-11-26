// Add a confirmed, contract-specific read projection. Source receipts are never rewritten.
// Dry run: node scripts/correct-commission-code-sequence.mjs <owner-email> <entry-id> <YYYY-M>
// Apply the reviewed metadata: append --apply.
import { createRequire } from "node:module";
import { withCashflowScriptMutation, trackCashflowScriptWrite } from "./cashflow-mutation.mjs";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const jiti = require("jiti").createJiti(import.meta.url, { alias: { "@": `${process.cwd()}/src` }, fsCache: false });
const [owner, entryId, fromPayoutMonthKey, flag] = process.argv.slice(2);
if (!/^[^/@\s]+@[^/@\s]+\.[^/@\s]+$/.test(owner ?? "") || !/^[\w-]{1,200}$/.test(entryId ?? "") ||
  !/^\d{4}-(?:[1-9]|1[0-2])$/.test(fromPayoutMonthKey ?? "") || (flag && flag !== "--apply") || process.argv.length > 6) throw new Error("Invalid arguments.");
const apply = flag === "--apply";
const [{ adminDb }, { projectConfirmedCommissionCodes }] = await Promise.all([
  jiti.import("../src/lib/server/firebaseAdmin.ts"), jiti.import("../src/app/lib/commissionPayoutCodeAdjustment.ts"),
]);
if (!adminDb) throw new Error("Database unavailable.");
const ref = adminDb.collection("users").doc(owner.toLowerCase()).collection("entries").doc(entryId);
function prepare(data) {
  if (!data || data.productKey !== "cppAuto" || data.frequencyRaw !== "annual" || data.entryType === "endorsement" || data.paymentFrequencyChanges?.length) throw new Error("Expected an annual CPP Auto contract without frequency changes.");
  const payouts = data.commissionPayouts ?? [];
  if (!payouts.some(payout => payout.code === "A102" && payout.payoutMonthKey === fromPayoutMonthKey && payout.writtenBy === owner && payout.amount > 0 && payout.key && payout.statementId)) throw new Error("The confirmed A102 anchor is missing.");
  const previous = data.commissionPayoutCodeAdjustment;
  if (previous && (previous.kind !== "cpp-auto-annual-sequence-offset" || previous.writtenBy !== owner || previous.fromPayoutMonthKey !== fromPayoutMonthKey)) throw new Error("A different adjustment already exists.");
  const adjustment = previous ?? { kind: "cpp-auto-annual-sequence-offset", writtenBy: owner, fromPayoutMonthKey, confirmedAtMs: Date.now() };
  const projected = projectConfirmedCommissionCodes({ ...data, commissionPayoutCodeAdjustment: adjustment }, payouts);
  const changes = projected.filter(payout => payout.statementCode);
  if (!changes.length || projected.length !== payouts.length || projected.some((payout, index) => payout.amount !== payouts[index].amount || payout.key !== payouts[index].key || payout.statementId !== payouts[index].statementId || payout.payoutMonthKey !== payouts[index].payoutMonthKey)) throw new Error("Source invariants failed.");
  return { adjustment, existing: Boolean(previous), summary: { adjustedReceipts: changes.length, mappings: [...new Set(changes.map(payout => `${payout.statementCode} -> ${payout.code}`))], sourceReceiptsUnchanged: true } };
}
const db = adminDb;
async function main() {
  return withCashflowScriptMutation("confirmed-commission-code-sequence", async () => {
    const preview = prepare((await ref.get()).data());
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...preview.summary, alreadyApplied: preview.existing }));
    if (apply && !preview.existing) {
      await trackCashflowScriptWrite(() => db.runTransaction(async tx => {
        const current = prepare((await tx.get(ref)).data());
        if (!current.existing) tx.update(ref, { commissionPayoutCodeAdjustment: current.adjustment });
      }), db);
      const after = prepare((await ref.get()).data());
      if (!after.existing) throw new Error("Read-back verification failed.");
      console.log(JSON.stringify({ saved: true, ...after.summary }));
    }
  });
}
if (apply) process.env.CASHFLOW_CACHE_TRACK_WRITES = "1";
await main();
