#!/usr/bin/env node
// Default: read-only preview. --apply writes only missing private-card emails.
// Example: node scripts/backfill-client-card-emails.mjs --adviser=name@example.cz --apply
import nextEnv from "@next/env";
import { createJiti } from "jiti";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const jiti = createJiti(import.meta.url, { alias: { "@": `${process.cwd()}/src` } });
const { adminDb: db, adminAuth: auth } = jiti("../src/lib/server/firebaseAdmin.ts");
const { clientSlugForName } = jiti("../src/app/_klienti/clientIdentity.ts");
const { originalAdviserEmailForContract } = jiti("../src/app/api/contracts/_lib/contractsApi.transfer.ts");
const { normalizeStoredContractPdfAttachment } = jiti("../src/lib/server/contractPdfStorage.ts");
const { readClientEmailFromStoredPdf } = jiti("../src/lib/server/clientEmailPdf.ts");
const { planClientCardEmail, saveClientCardEmail } = jiti("../src/lib/server/clientCardEmailBackfill.ts");
const adviserEmail = process.argv.find(value => value.startsWith("--adviser="))?.slice(10).trim().toLowerCase();
const apply = process.argv.includes("--apply");
const product = process.argv.find(value => value.startsWith("--product="))?.slice(10);
if (!adviserEmail || !/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(adviserEmail)) throw new Error("Zadej --adviser=email poradce.");
if (!db || !auth) throw new Error("Chybí Firebase Admin konfigurace.");

async function run() {
  const account = await auth.getUserByEmail(adviserEmail);
  const profile = (await db.collection("users").doc(adviserEmail).get()).data();
  if (!profile || account.disabled || String(profile.accountType ?? profile.userRole ?? "advisor").toLowerCase() === "tipster") throw new Error("Neplatný účet poradce.");
  const snapshot = await db.collection("users").doc(adviserEmail).collection("entries").select(
    "clientName", "clientEmail", "clientPhone", "clientAddress", "entryType", "productKey", "originalAdviserEmail", "acquisitionType", "contractSignedDate", "createdAt", "contractPdfAttachment",
  ).get();
  const saved = await db.collection("clientCardsPrivate").doc(account.uid).collection("cards").select("card.email").get();
  const existing = new Set(saved.docs.filter(doc => doc.data().card?.email?.trim()).map(doc => doc.id));
  const groups = new Map();
  for (const source of snapshot.docs) {
    const data = source.data(), slug = clientSlugForName(data.clientName);
    if (!slug || data.entryType === "endorsement" || originalAdviserEmailForContract(data, adviserEmail) !== adviserEmail) continue;
    const group = groups.get(slug) ?? [];
    group.push({ snapshot: source, result: null }); groups.set(slug, group);
  }
  const selected = [...groups.values()].filter(sources => !product || sources.some(source => source.snapshot.data().productKey === product));
  const stats = { mode: apply ? "apply" : "preview", clients: selected.length, existing: 0, pdfs: 0, foundInPdf: 0, ready: 0, saved: 0, conflict: 0, missing: 0, failedPdf: 0, failedSave: 0, stale: 0, products: {} };
  const entries = selected.filter(sources => {
    if (!existing.has(clientSlugForName(sources[0].snapshot.data().clientName))) return true;
    stats.existing++; return false;
  });
  for (let offset = 0; offset < entries.length; offset += 3) {
    await Promise.all(entries.slice(offset, offset + 3).map(async sources => {
      let failed = false;
      for (const source of sources) {
        const data = source.snapshot.data(), attachment = normalizeStoredContractPdfAttachment(data.contractPdfAttachment);
        if (!attachment) continue;
        stats.pdfs++;
        const product = stats.products[data.productKey || "unknown"] ??= { checked: 0, found: 0, ambiguous: 0, nameMismatch: 0, missing: 0, failed: 0 };
        product.checked++;
        try {
          source.result = await readClientEmailFromStoredPdf(attachment, data.clientName);
          if (source.result.status === "found") { stats.foundInPdf++; product.found++; }
          else if (source.result.status === "ambiguous") product.ambiguous++;
          else if (source.result.status === "name-mismatch") product.nameMismatch++;
          else product.missing++;
        } catch { stats.failedPdf++; product.failed++; failed = true; }
      }
      // A failed download may hide a conflicting address; do not finalize this
      // client's email until all available source PDFs have been checked.
      if (failed) return;
      const decision = planClientCardEmail(sources, adviserEmail);
      if (decision.status !== "ready") { stats[decision.status]++; return; }
      stats.ready++;
      if (apply) {
        try { stats[await saveClientCardEmail(db, { email: adviserEmail, uid: account.uid }, decision.plan)]++; }
        catch { stats.failedSave++; }
      }
    }));
    if ((offset + 3) % 15 === 0) console.log(JSON.stringify({ checkedClients: Math.min(offset + 3, entries.length), totalClients: entries.length, checkedPdfs: stats.pdfs, foundInPdf: stats.foundInPdf }));
  }
  // Intentionally print counts only; no names, addresses, storage paths or PDF text.
  console.log(JSON.stringify(stats, null, 2));
  if (stats.failedPdf || stats.failedSave || stats.stale) process.exitCode = 1;
}
run().catch(() => { console.error("Doplnění se nezdařilo; žádné citlivé údaje nejsou vypsány."); process.exitCode = 1; });
