#!/usr/bin/env node
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { trackCashflowScriptWrite, withCashflowScriptMutation } from "./cashflow-mutation.mjs";

const require = createRequire(import.meta.url);
const workspace = fileURLToPath(new URL("../", import.meta.url));
require("@next/env").loadEnvConfig(workspace, false, { info() {}, error() {} });
const jiti = require("jiti").createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  fsCache: false,
});

const [ownerInput, actorInput, ...flags] = process.argv.slice(2);
const owner = ownerInput?.trim().toLowerCase();
const actor = actorInput?.trim().toLowerCase();
const emailPattern = /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/;
const apply = flags.includes("--apply");
const limitFlag = flags.find(flag => /^--limit=[1-9]\d*$/.test(flag));
const limit = limitFlag ? Number(limitFlag.split("=")[1]) : Infinity;
if (!emailPattern.test(owner ?? "") || !emailPattern.test(actor ?? "") ||
    flags.some(flag => flag !== "--apply" && flag !== limitFlag) ||
    new Set(flags).size !== flags.length || (!apply && limitFlag)) {
  console.error("Použití: node scripts/import-investment-statements.mjs <poradce> <správce> [--apply] [--limit=N]");
  process.exit(2);
}
if (apply) process.env.CASHFLOW_CACHE_TRACK_WRITES = "1";

let db;
try {
  const { adminDb } = await jiti.import("../src/lib/server/firebaseAdmin.ts");
  db = adminDb;
  if (!db) throw new Error("Databáze není dostupná.");

  const { authorizeInvestmentArchiveMaintenance } = await jiti.import("../src/app/api/contracts/_lib/contractsApi.ts");
  const { planInvestmentArchiveImport } = await jiti.import("../src/app/api/commission-statements/investmentArchiveImport.ts");
  const { mergeInvestmentStatementPayouts } = await jiti.import("../src/app/api/commission-statements/investmentStatementPayouts.ts");
  const { normalizeContractNumber } = await jiti.import("../src/app/api/commission-statements/statementPayoutRows.ts");
  const { ownsStatementRecord } = await jiti.import("../src/app/api/commission-statements/statementRebuildScope.ts");
  const { buildIdempotentEntryId } = await jiti.import("../src/app/api/contracts/_lib/contractsApi.identity.ts");
  const { withContractHistory } = await jiti.import("../src/lib/server/contractHistory.ts");
  const access = await authorizeInvestmentArchiveMaintenance(owner, actor);
  const entries = db.collection("users").doc(owner).collection("entries");
  const archive = db.collection("usersPrivate").doc(owner).collection("commissionStatements");
  const [storedStatements, storedEntries] = await Promise.all([archive.get(), entries.get()]);
  const plan = planInvestmentArchiveImport(storedStatements.docs, storedEntries.docs, access.canCreateOnDate);
  const nowMs = Date.now();
  const merging = (existing, statements) => mergeInvestmentStatementPayouts({ existing, statements, viewer: owner, nowMs });
  const existingChanges = plan.existing.flatMap(({ entry, statements }) => {
    const current = entry.data().commissionPayouts;
    const merged = merging(current, statements);
    // A historical correction could remove an item. Leave these cases for the
    // interactive reconciliation instead of removing any row during import.
    const incomingKeys = new Set(merged.merged.map(payout => payout?.key));
    const wouldRemove = current?.some(payout => ownsStatementRecord(payout, owner) && !incomingKeys.has(payout.key));
    return merged.added || merged.updated ? [{ entry, merged, wouldRemove }] : [];
  });
  const safeUpdates = existingChanges.filter(change => !change.wouldRemove);
  const toCreate = plan.additions.slice(0, limit);
  const previouslyImported = plan.existing.filter(({ entry }) =>
    entry.id === buildIdempotentEntryId(owner, `investment-archive:${normalizeContractNumber(entry.data().contractNumber)}`));
  const storedImportedPayouts = previouslyImported.reduce((count, { entry }) => count +
    (entry.data().commissionPayouts ?? []).filter(payout =>
      typeof payout?.key === "string" && payout.key.startsWith("investment:") && ownsStatementRecord(payout, owner)
    ).length, 0);
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    archiveCount: plan.archiveCount,
    latestDate: plan.latestDate,
    latestSupportedContractCount: plan.latestSupportedContractCount,
    eligibleToCreate: plan.additions.length,
    selectedToCreate: toCreate.length,
    newPayoutsInSelectedContracts: toCreate.reduce((count, candidate) => count + merging(undefined, candidate.statements).added, 0),
    storedImportedContracts: previouslyImported.length,
    storedImportedPayouts,
    existingContractsWithPayoutChanges: safeUpdates.length,
    existingContractsRequiringReview: existingChanges.length - safeUpdates.length,
    review: plan.review,
    unsupportedProducts: plan.unsupportedProducts,
  }));

  async function main() {
    return withCashflowScriptMutation("import-investment-statements", async () => {
      const outcome = { created: 0, newContractPayouts: 0, existingUpdated: 0, existingPayoutsAdded: 0,
        existingPayoutsUpdated: 0, unresolved: {}, concurrentExistingChanges: 0 };
      let next = 0;
      let completed = 0;
      const createPending = async () => {
        while (next < toCreate.length) {
          const candidate = toCreate[next++];
          const { incoming } = merging(undefined, candidate.statements);
          const response = await access.create({
            contractNumber: candidate.contractNumber,
            clientName: candidate.clientName,
            contractSignedDate: candidate.contractSignedDate,
            productKey: candidate.productKey,
            statementId: candidate.source.id,
            statementChronologyMs: candidate.source.statementChronologyMs,
            payouts: incoming,
            nowMs,
          });
          if (response.ok) {
            outcome.created += 1;
            outcome.newContractPayouts += incoming.length;
          } else {
            const result = await response.json().catch(() => ({}));
            const reason = response.status === 409 ? "existingOrConflict"
              : response.status === 400 && /pozic|manažer|timeline/i.test(String(result.error)) ? "missingCareerPosition"
              : response.status === 400 ? "invalidContractData"
              : `http${response.status}`;
            outcome.unresolved[reason] = (outcome.unresolved[reason] ?? 0) + 1;
          }
          completed += 1;
          if (completed % 20 === 0) console.log(JSON.stringify({ completed, total: toCreate.length, created: outcome.created }));
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, toCreate.length) }, createPending));
      if (!limitFlag) {
        for (const { entry, merged } of safeUpdates) {
          const batch = db.batch();
          batch.update(entry.ref, withContractHistory(batch, entry.ref, entry.data(), {
            commissionPayouts: merged.merged,
            commissionStatementProcessedAtMs: nowMs,
            updatedAt: new Date(nowMs),
          }, { actorEmail: actor, title: "Spárování investičních provizí z archivu" }), { lastUpdateTime: entry.updateTime });
          try {
            await trackCashflowScriptWrite(() => batch.commit(), db);
            outcome.existingUpdated += 1;
            outcome.existingPayoutsAdded += merged.added;
            outcome.existingPayoutsUpdated += merged.updated;
          } catch (error) {
            if (![5, 9, 10].includes(Number(error?.code))) throw error;
            outcome.concurrentExistingChanges += 1;
          }
        }
      }
      console.log(JSON.stringify(outcome));
      if (Object.keys(outcome.unresolved).some(reason => /^http5/.test(reason))) process.exitCode = 1;
    });
  }
  if (apply) await main();
} catch (error) {
  console.error(JSON.stringify({ failed: true, code: error?.code ?? null, type: error?.name ?? "Error" }));
  process.exitCode = 1;
} finally {
  await db?.terminate();
}
