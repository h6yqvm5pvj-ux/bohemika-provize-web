#!/usr/bin/env node
// Default: read-only verification and counts. No customer content, keys, or
// filenames are printed or backed up as plaintext by this script.
import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { getStorage } from "firebase-admin/storage";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { withCashflowScriptMutation, trackCashflowScriptWrite } from "./cashflow-mutation.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

export async function main() {
  return withCashflowScriptMutation("script:migrate-private-data-encryption", async () => {
  const jiti = createJiti(import.meta.url, { alias: { "@": `${process.cwd()}/src` } });
  const { adminDb } = jiti("../src/lib/server/firebaseAdmin.ts");
  const { rawBusinessMigrationDatabase } = jiti("../src/lib/server/businessDataFirestore.ts");
  const db = adminDb ? rawBusinessMigrationDatabase(adminDb) : null;
  const { planPrivateDataMigration } = jiti("../src/lib/server/privateDataMigration.ts");
  const { planLegacyClaimMigration, businessLookupToken } = jiti("../src/lib/server/businessDataEncryption.ts");
  const { encryptPrivateFile, decryptPrivateFile, isPrivateFile } = jiti("../src/lib/server/privateStorage.ts");
  const { resolveStorageBucketCandidates } = jiti("../src/lib/server/contractPdfStorage.ts");
  const { sealPrivateValue, openPrivateValue } = jiti("../src/lib/server/privateEncryption.ts");
  if (!db) throw new Error("Missing database configuration");
  const apply = process.argv.includes("--apply");
  const fileConcurrency = Number(process.argv.find(arg => arg.startsWith("--file-concurrency="))?.slice(19) ?? 4);
  if (![1, 2, 4, 8, 16].includes(fileConcurrency)) throw new Error("Invalid --file-concurrency; use 1, 2, 4, 8 or 16");
  // Preserve a 160 MiB ceiling for source buffers as concurrency increases.
  const maxFileBytes = Math.min(40, 160 / fileConcurrency) * 1024 * 1024;
  const project = process.argv.find(arg => arg.startsWith("--project="))?.slice(10);
  if (!project || project !== db.projectId) throw new Error("Specify the exact target with --project=<firebase-project-id>");
  if (apply && !process.argv.includes("--compatible-code-deployed")) throw new Error("Deploy compatible readers and writers before --apply; then pass --compatible-code-deployed");
  const expectedFingerprint = process.argv.find(arg => arg.startsWith("--key-fingerprint="))?.slice(18);
  const fingerprint = createHash("sha256").update(Buffer.from(process.env.MAILBOX_ENCRYPTION_KEY ?? "", "base64")).digest("hex");
  if (apply && expectedFingerprint !== fingerprint) throw new Error("--key-fingerprint must match the deployed production key fingerprint from check-security-config");
  businessLookupToken("migration-preflight", "synthetic-check");
  const indexFingerprint = createHash("sha256").update(Buffer.from(process.env.BUSINESS_DATA_INDEX_KEY ?? "", "base64")).digest("hex");
  const expectedIndexFingerprint = process.argv.find(arg => arg.startsWith("--index-key-fingerprint="))?.slice(24);
  if (apply && expectedIndexFingerprint !== indexFingerprint) throw new Error("--index-key-fingerprint must match the deployed business index key fingerprint");
  // Validate secret configuration before any data access or writes.
  if (openPrivateValue(sealPrivateValue("preflight", "migration-check"), "migration-check") !== "preflight") throw new Error("Encryption preflight failed");
  const stats = { mode: apply ? "apply" : "preview", documentsChecked: 0, documentsPending: 0, documentsWritten: 0, filesChecked: 0, filesPending: 0, filesWritten: 0, failed: 0 };
  const progress = setInterval(() => console.error(JSON.stringify({ progress: true, ...stats })), 30_000);
  progress.unref();
  try {
  const sources = [
    db.collectionGroup("cards"), db.collectionGroup("clientNotes"), db.collection("clientNoteReminders"),
    db.collection("documentDraftKeys"), db.collectionGroup("tipsterTips"), db.collectionGroup("mailbox"),
    db.collectionGroup("contractNotes"), db.collectionGroup("events"), db.collectionGroup("entries"),
    db.collection("userRequests"), db.collection("mailboxSharedPayloads"),
    db.collection("anniversaryReviews"),
    db.collection("onlineCardMeetingRequests"), db.collectionGroup("commissionStatements"),
    db.collection("clientContractLinks"), db.collection("contractRefs"), db.collection("contractNumberClaims"),
    db.collectionGroup("accountingRepairDrafts"), db.collectionGroup("externalUpdateTasks"), db.collectionGroup("tipPayouts"),
    db.collectionGroup("advisorTipStatuses"),
    db.collection("_cashflowCandidates"), db.collection("_cashflowCandidateChunks"),
  ];
  for (const source of sources) {
    let cursor;
    while (true) {
      let query = source.orderBy("__name__").limit(100);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      for (const doc of page.docs) {
        stats.documentsChecked++;
        try {
          if (!planLegacyClaimMigration(doc.ref.path, doc.data()) && !planPrivateDataMigration(doc.ref.path, doc.data())) continue;
          stats.documentsPending++;
          if (apply) {
            const written = await trackCashflowScriptWrite(() => db.runTransaction(async tx => {
              const current = await tx.get(doc.ref);
              if (!current.exists) return false;
              const move = planLegacyClaimMigration(doc.ref.path, current.data());
              if (move) {
                const destination = db.doc(move.path);
                const target = await tx.get(destination);
                if (target.exists && target.data().entryPath !== current.data().entryPath) throw new Error("Conflicting contract claim; manual review required");
                if (!target.exists) tx.create(destination, move.data);
                else {
                  const replacement = planPrivateDataMigration(destination.path, target.data());
                  if (replacement) tx.set(destination, replacement);
                }
                // Only --apply reaches this branch. The same transaction keeps
                // the uniqueness claim while removing its plaintext old ID.
                tx.delete(doc.ref);
                return true;
              }
              const replacement = planPrivateDataMigration(doc.ref.path, current.data());
              if (!replacement) return false;
              tx.set(doc.ref, replacement); // Full replacement removes old nested plaintext.
              return true;
            }), db);
            if (written) stats.documentsWritten++;
          }
        } catch { stats.failed++; }
      }
      if (page.size < 100) break;
      cursor = page.docs.at(-1);
    }
  }
  // Exact private prefixes only. Avatars and public business cards are excluded.
  const buckets = resolveStorageBucketCandidates();
  if (!buckets.length) throw new Error("Missing storage configuration");
  for (const bucketName of buckets) {
    const bucket = getStorage().bucket(bucketName);
    try {
      const [exists] = await bucket.exists();
      if (!exists) continue;
      for (const prefix of ["contract-pdfs/", "user-request-screenshots/", "tool-documents/"]) {
        const processFile = async file => {
          stats.filesChecked++;
          try {
            const [metadata] = await file.getMetadata();
            if (Number(metadata.size) > maxFileBytes) throw new Error("File exceeds bounded migration memory");
            const generation = metadata.generation;
            if (!/^\d+$/.test(String(generation))) throw new Error("Missing storage generation precondition");
            const [bytes] = await bucket.file(file.name, { generation }).download();
            if (isPrivateFile(bytes)) { decryptPrivateFile(bytes, bucketName, file.name); return; }
            stats.filesPending++;
            const encrypted = encryptPrivateFile(bytes, bucketName, file.name);
            if (!decryptPrivateFile(encrypted, bucketName, file.name).equals(bytes)) throw new Error("File verification failed");
            if (apply) {
              const custom = { ...(metadata.metadata ?? {}) };
              delete custom.firebaseStorageDownloadTokens;
              // A concurrently replaced or deleted object is never overwritten.
              await file.save(encrypted, { resumable: false, preconditionOpts: { ifGenerationMatch: generation }, metadata: {
                contentType: "application/octet-stream", cacheControl: "private, no-store, max-age=0", metadata: custom,
              } });
              const [savedMetadata] = await file.getMetadata();
              const [saved] = await bucket.file(file.name, { generation: savedMetadata.generation }).download();
              if (!decryptPrivateFile(saved, bucketName, file.name).equals(bytes)) throw new Error("Stored file verification failed");
              stats.filesWritten++;
            }
          } catch { stats.failed++; }
        };
        // Keep a bounded number of independent objects in memory. A slow large file
        // must not block the other slots, and listing failures drain started work.
        const active = new Set();
        try {
          for await (const file of bucket.getFilesStream({ prefix })) {
            const task = processFile(file).finally(() => active.delete(task));
            active.add(task);
            if (active.size === fileConcurrency) await Promise.race(active);
          }
        } finally {
          await Promise.all(active);
        }
      }
    } catch { stats.failed++; }
  }
  console.log(JSON.stringify(stats, null, 2));
  if (stats.failed) process.exitCode = 1;
  return stats;
  } finally {
    clearInterval(progress);
  }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Private-data migration stopped. Check deployment, target project and secret configuration. No sensitive data was logged."); process.exitCode = 1; });
}
