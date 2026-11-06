#!/usr/bin/env node
// Preview by default. --apply fills empty fields only; all diagnostics are
// aggregate counts and field keys, never contract identities or PDF contents.
import { createHash } from "node:crypto";
import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { withCashflowScriptMutation, trackCashflowScriptWrite } from "./cashflow-mutation.mjs";

const args = process.argv.slice(2);
if (args.some(arg => arg !== "--apply" && !/^--expected-contracts=\d+$/.test(arg))) {
  throw new Error("Use --expected-contracts=N and optionally --apply.");
}
const apply = args.includes("--apply");
const expectedCount = Number(args.find(arg => arg.startsWith("--expected-contracts="))?.split("=")[1]);
if (!Number.isSafeInteger(expectedCount) || expectedCount < 1 || expectedCount > 100) {
  throw new Error("An explicit expected contract count between 1 and 100 is required.");
}
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
// Maintenance writes must invalidate existing candidates even when a local
// development environment does not enable production cache tracking.
if (apply) process.env.CASHFLOW_CACHE_TRACK_WRITES = "1";
const jiti = createJiti(import.meta.url, { alias: { "@": `${process.cwd()}/src` }, fsCache: false });
const { adminDb: db, adminAuth: auth } = await jiti.import("../src/lib/server/firebaseAdmin.ts");
const { normalizeStoredContractPdfAttachment, downloadContractPdfAttachment, CONTRACT_PDF_MAX_BYTES } = await jiti.import("../src/lib/server/contractPdfStorage.ts");
const { parseDomexNeuronPdf } = await jiti.import("../src/app/lib/parseDomexPdf.ts");
const { planDomexNeuronPdfBackfill } = await jiti.import("../src/lib/server/domexNeuronPdfBackfill.ts");
const { withContractHistory } = await jiti.import("../src/lib/server/contractHistory.ts");
const { contractListIndexFieldsForContract } = await jiti.import("../src/app/api/contracts/_lib/contractsApi.listFilters.ts");
const { fillClientCardEmailFromUploadedPdf } = await jiti.import("../src/lib/server/clientCardEmailImport.ts");
const { FieldValue } = await import("firebase-admin/firestore");
const inScope = snapshot => /^users\/[^/]+\/entries\/[^/]+$/.test(snapshot.ref.path) &&
  (snapshot.data()?.entryType ?? "contract") === "contract";
const fingerprint = attachment => JSON.stringify(attachment);

async function run() {
  if (!db || !auth) throw new Error("Database unavailable");
  const query = db.collectionGroup("entries").where("productKey", "==", "domexneuron");
  const snapshots = (await query.get()).docs.filter(inScope);
  if (snapshots.length !== expectedCount) throw new Error("Contract scope changed");
  const prepared = [];
  const reports = [];
  for (const snapshot of snapshots) {
    const current = snapshot.data();
    const owner = snapshot.ref.path.split("/")[1];
    const attachment = normalizeStoredContractPdfAttachment(current.contractPdfAttachment);
    if ((current.userEmail && current.userEmail !== owner) || !attachment) {
      throw new Error("Invalid source contract");
    }
    const bytes = await downloadContractPdfAttachment(attachment);
    let parsed;
    try {
      if (bytes.length > CONTRACT_PDF_MAX_BYTES || bytes.length !== attachment.sizeBytes ||
        createHash("sha256").update(bytes).digest("hex") !== attachment.sha256) {
        throw new Error("PDF integrity check failed");
      }
      parsed = await parseDomexNeuronPdf(new File([bytes], "stored-contract.pdf", { type: "application/pdf" }), { allowOcr: false });
    } finally { bytes.fill(0); }
    const plan = planDomexNeuronPdfBackfill(current, parsed);
    if (plan.status === "rejected") throw new Error("A source failed validation");
    prepared.push({ snapshot, attachment, parsed, plan, owner });
    reports.push({ record: reports.length + 1, status: plan.status, changedKeys: plan.changedKeys, conflictKeys: plan.conflictKeys });
  }
  console.log(JSON.stringify({ mode: "preview", contracts: prepared.length, records: reports }));
  if (!apply) return;

  const result = await trackCashflowScriptWrite(() => db.runTransaction(async tx => {
      const scope = (await tx.get(query.select("entryType"))).docs.filter(inScope);
      if (scope.length !== prepared.length || scope.some(doc => !prepared.some(item => item.snapshot.ref.path === doc.ref.path))) {
        return { status: "stale", updated: 0 };
      }
      const fresh = await tx.getAll(...prepared.map(item => item.snapshot.ref));
      const writes = [];
      for (let index = 0; index < prepared.length; index++) {
        const item = prepared[index], snapshot = fresh[index], current = snapshot.data();
        const attachment = normalizeStoredContractPdfAttachment(current?.contractPdfAttachment);
        if (!snapshot.exists || !snapshot.updateTime?.isEqual(item.snapshot.updateTime) ||
          current.productKey !== "domexneuron" || (current.entryType ?? "contract") !== "contract" ||
          (current.userEmail && current.userEmail !== item.owner) || fingerprint(attachment) !== fingerprint(item.attachment)) {
          return { status: "stale", updated: 0 };
        }
        const plan = planDomexNeuronPdfBackfill(current, item.parsed);
        if (plan.status === "rejected") return { status: "stale", updated: 0 };
        if (plan.status === "ready") writes.push({ snapshot, current, patch: plan.patch });
      }
      // All source reads and checks precede the first write. Contract changes,
      // history events and affected projections commit atomically.
      for (const { snapshot, current, patch } of writes) {
        const indexed = ["contractSignedDate", "policyStartDate", "policyEndDate"].some(key => Object.hasOwn(patch, key))
          ? contractListIndexFieldsForContract({ ...current, ...patch }) : {};
        tx.update(snapshot.ref, withContractHistory(tx, snapshot.ref, current, {
          ...patch, ...indexed, updatedAt: FieldValue.serverTimestamp(),
        }, { actorEmail: null, title: "Doplnění údajů z uloženého PDF" }));
      }
      return { status: "saved", updated: writes.length };
    }), db);
  console.log(JSON.stringify({ mode: "apply", ...result }));
  if (result.status !== "saved") { process.exitCode = 1; return; }

  const verification = [];
  for (const item of prepared) {
    const snapshot = await item.snapshot.ref.get();
    const attachment = normalizeStoredContractPdfAttachment(snapshot.data()?.contractPdfAttachment);
    const plan = planDomexNeuronPdfBackfill(snapshot.data(), item.parsed);
    const complete = plan.status === "unchanged" && fingerprint(attachment) === fingerprint(item.attachment);
    verification.push({ complete, conflictKeys: plan.conflictKeys });
  }
  if (verification.some(item => !item.complete)) throw new Error("Post-write verification failed");
  console.log(JSON.stringify({ mode: "verification", verified: verification.length, complete: true }));

  const emailResults = {};
  const profiles = new Map();
  for (const item of prepared) {
    let status = "unavailable";
    try {
      if (!profiles.has(item.owner)) profiles.set(item.owner, await auth.getUserByEmail(item.owner));
      const account = profiles.get(item.owner);
      status = account.disabled ? "skipped" : await fillClientCardEmailFromUploadedPdf(db,
        { email: item.owner, uid: account.uid }, item.snapshot.id, item.attachment.sha256);
    } catch { /* Card enrichment must not invalidate a verified contract write. */ }
    emailResults[status] = (emailResults[status] ?? 0) + 1;
  }
  console.log(JSON.stringify({ mode: "client-card-email", counts: emailResults }));
}

async function main() {
  return withCashflowScriptMutation("maintenance-domex-neuron-pdf-details", run);
}

try { await main(); }
catch { console.error("DOMEX Neuron PDF backfill could not complete; sensitive details suppressed."); process.exitCode = 1; }
finally { if (db) await db.terminate(); }
