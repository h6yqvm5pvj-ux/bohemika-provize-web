#!/usr/bin/env node

import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { trackCashflowScriptWrite, withCashflowScriptMutation } from "./cashflow-mutation.mjs";

nextEnv.loadEnvConfig(process.cwd());
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
const { adminDb } = jiti("../src/lib/server/firebaseAdmin.ts");
const { withContractHistory } = jiti("../src/lib/server/contractHistory.ts");
const { planNeonRefreshCareBackfill } = jiti("../src/app/lib/neonRefreshCareBackfill.ts");
const { parseNeonPdf } = jiti("../src/app/lib/parseNeonPdf.ts");
const {
  contractPdfNumberBindingStatus,
  downloadContractPdfAttachment,
  normalizeStoredContractPdfAttachment,
} = jiti("../src/lib/server/contractPdfStorage.ts");

const apply = process.argv.includes("--apply");
const normalizeNumber = value => typeof value === "string" ? value.replace(/\s/g, "") : "";

async function verifyPdfPremium(contract) {
  const attachment = normalizeStoredContractPdfAttachment(contract.contractPdfAttachment);
  const number = normalizeNumber(contract.contractNumber);
  if (!attachment || !number || contractPdfNumberBindingStatus(attachment, number) === "mismatch") return null;
  const bytes = await downloadContractPdfAttachment(attachment);
  try {
    const parsed = await parseNeonPdf(new File([bytes], "smlouva.pdf", { type: "application/pdf" }));
    return !parsed.isEndorsement && normalizeNumber(parsed.contractNumber) === number ? parsed.amount : null;
  } finally {
    bytes.fill(0);
  }
}

async function scan() {
  if (!adminDb) throw new Error("Firebase Admin configuration unavailable");
  const stats = { mode: apply ? "apply" : "dry-run", ready: 0, current: 0, review_full_premium: 0,
    review_calculation: 0, out_of_scope: 0, verifiedByPdf: 0, pdfErrors: 0,
    statementLinksForReplay: 0, payoutComparisonsReady: 0, payoutComparisonsWritten: 0,
    written: 0, concurrentChanges: 0 };
  const ready = [];
  const users = await adminDb.collection("users").select().get();
  for (let start = 0; start < users.docs.length; start += 8) {
    const pages = await Promise.all(users.docs.slice(start, start + 8).map(user =>
      user.ref.collection("entries").where("productKey", "==", "neon").where("isRefresh", "==", true).get()));
    for (const page of pages) {
      for (const entry of page.docs) {
        const contract = entry.data();
        let plan = planNeonRefreshCareBackfill(contract);
        if (plan.status === "review_full_premium") {
          try {
            const premium = await verifyPdfPremium(contract);
            if (premium != null) {
              plan = planNeonRefreshCareBackfill(contract, premium);
              if (plan.status === "ready") stats.verifiedByPdf += 1;
            }
          } catch {
            stats.pdfErrors += 1;
          }
        }
        stats[plan.status] += 1;
        if (plan.status === "ready") {
          stats.statementLinksForReplay += plan.statementCount;
          stats.payoutComparisonsReady += plan.payoutCount;
          if (apply) ready.push({ entry, plan });
        }
      }
    }
  }
  return { ready, stats };
}

async function main(ready, stats) {
  return withCashflowScriptMutation("script:backfill-neon-refresh-care", async () => {
    for (const { entry, plan } of ready) {
      const batch = adminDb.batch();
      const patch = withContractHistory(batch, entry.ref, entry.data(),
        { ...plan.patch, updatedAt: new Date() },
        { actorEmail: null, title: "Přepočet pečovatelské provize NEON Refresh" });
      batch.update(entry.ref, patch, { lastUpdateTime: entry.updateTime });
      try {
        await trackCashflowScriptWrite(() => batch.commit(), adminDb);
        stats.written += 1;
        stats.payoutComparisonsWritten += plan.payoutCount;
      } catch (error) {
        if (![5, 9, 10].includes(error?.code)) throw error;
        stats.concurrentChanges += 1;
      }
    }
  });
}

scan().then(async ({ ready, stats }) => {
  if (apply && ready.length) await main(ready, stats);
  console.log(JSON.stringify(stats, null, 2));
}).catch(error => {
  console.error("NEON Refresh care backfill failed", { code: error?.code ?? null });
  process.exitCode = 1;
});
