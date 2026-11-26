import { createRequire } from "node:module";
import { trackCashflowScriptWrite, withCashflowScriptMutation } from "./cashflow-mutation.mjs";

const require = createRequire(`${process.cwd()}/package.json`);
const { loadEnvConfig } = require("@next/env");
const { createJiti } = require("jiti");
loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

const args = new Set(process.argv.slice(2));
const allowed = new Set(["--apply", "--all-accounts"]);
if ([...args].some(arg => !allowed.has(arg))) throw new Error("Unsupported migration flag.");
const apply = args.has("--apply");
if (apply && !args.has("--all-accounts")) throw new Error("Applying the migration requires --all-accounts.");

const expectedProjectId = "bohemikasmlouvy";
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST) {
  throw new Error("Refusing to run against a Firebase emulator.");
}
if (process.env.FIREBASE_ADMIN_PROJECT_ID !== expectedProjectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== expectedProjectId) {
  throw new Error("Firebase project does not match the approved production project.");
}

const jiti = createJiti(import.meta.url, { alias: { "@": `${process.cwd()}/src` }, fsCache: false });
const [{ adminDb }, storage, history] = await Promise.all([
  jiti.import(`${process.cwd()}/src/lib/server/firebaseAdmin.ts`),
  jiti.import(`${process.cwd()}/src/lib/server/contractPdfStorage.ts`),
  jiti.import(`${process.cwd()}/src/lib/server/contractHistory.ts`),
]);
const { FieldValue } = require("firebase-admin/firestore");
if (!adminDb) throw new Error("Firebase Admin database is unavailable.");

const summary = {
  mode: apply ? "apply" : "dry_run",
  entriesScanned: 0,
  entriesWithAttachmentMetadata: 0,
  alreadyBound: 0,
  readyToBind: 0,
  missingContractNumber: 0,
  invalidAttachmentMetadata: 0,
  unreadableRecord: 0,
  conflictingBinding: 0,
  missingOrInvalidStorageObject: 0,
  storageBindingUnconfirmed: 0,
  writeConflict: 0,
  writeUnconfirmed: 0,
  updated: 0,
};

async function processTarget({ doc, attachment, contractNumber, fingerprint }) {
  try {
    const bytes = await storage.downloadContractPdfAttachment(attachment);
    const sizeMatches = bytes.length === attachment.sizeBytes;
    bytes.fill(0);
    if (!sizeMatches) throw new Error("Stored PDF size differs from attachment metadata.");
    await storage.verifyContractPdfStorageObject({ ...attachment, contractNumberFingerprint: fingerprint });
  } catch {
    summary.missingOrInvalidStorageObject += 1;
    return;
  }
  summary.readyToBind += 1;
  if (!apply) return;

  let current;
  try {
    current = await doc.ref.get();
  } catch {
    summary.writeUnconfirmed += 1;
    return;
  }
  if (!doc.updateTime || !current.updateTime || !doc.updateTime.isEqual(current.updateTime)) {
    summary.writeConflict += 1;
    return;
  }

  let rebound;
  try {
    rebound = await storage.strengthenExistingContractPdfBinding({ attachment, contractNumber, preserveExistingBinding: true });
    await storage.verifyContractPdfStorageObject(rebound, { requireBinding: true });
  } catch {
    summary.storageBindingUnconfirmed += 1;
    return;
  }

  try {
    const batch = adminDb.batch();
    const patch = history.withContractHistory(batch, doc.ref, current.data(), {
      contractPdfAttachment: rebound,
      contractPdfAttachmentUpdatedAt: FieldValue.serverTimestamp(),
    }, {
      actorEmail: null,
      kind: "attachment",
      title: "Zpevněna vazba PDF",
      changes: [{ label: "Vazba PDF", before: "neověřená", after: "číslo smlouvy" }],
    });
    batch.update(doc.ref, patch, { lastUpdateTime: doc.updateTime });
    await trackCashflowScriptWrite(() => batch.commit(), adminDb);
  } catch {
    // A transport error can follow a committed batch. Check the saved reference below.
  }

  try {
    const savedContract = (await doc.ref.get()).data();
    const saved = storage.normalizeStoredContractPdfAttachment(savedContract?.contractPdfAttachment);
    if (saved?.bucketName === rebound.bucketName && saved.storagePath === rebound.storagePath &&
      saved.sha256 === rebound.sha256 &&
      storage.contractPdfNumberBindingStatus(saved, savedContract?.contractNumber) === "verified") {
      summary.updated += 1;
      return;
    }
  } catch {
    // Keep the Storage object available if the Firestore write cannot be confirmed.
  }
  summary.writeUnconfirmed += 1;
}

const main = async () => {
  return withCashflowScriptMutation("script:strengthen-contract-pdf-bindings", async () => {
    const snapshot = await adminDb.collectionGroup("entries").select("contractPdfAttachment", "contractNumber").get();
    const targets = [];
    const references = new Map();
    for (const doc of snapshot.docs) {
      if (!/^users\/[^/]+\/entries\/[^/]+$/.test(doc.ref.path)) continue;
      summary.entriesScanned += 1;
      try {
        const raw = doc.data();
        if (raw.contractPdfAttachment == null) continue;
        summary.entriesWithAttachmentMetadata += 1;
        const attachment = storage.normalizeStoredContractPdfAttachment(raw.contractPdfAttachment);
        if (!attachment || !attachment.storagePath.startsWith("contract-pdfs/")) {
          summary.invalidAttachmentMetadata += 1;
          continue;
        }
        const { contractNumber } = raw;
        const fingerprint = storage.contractPdfNumberFingerprint(contractNumber);
        const numbers = references.get(attachment.storagePath) ?? new Set();
        numbers.add(fingerprint);
        references.set(attachment.storagePath, numbers);
        if (!fingerprint) {
          summary.missingContractNumber += 1;
          continue;
        }
        if (storage.contractPdfNumberBindingStatus(attachment, contractNumber) === "verified") {
          summary.alreadyBound += 1;
          continue;
        }
        const pathBinding = attachment.storagePath.split("/").find(segment => /^contract-[a-f0-9]{64}$/.test(segment));
        if ((attachment.contractNumberFingerprint && attachment.contractNumberFingerprint !== fingerprint) ||
          (pathBinding && pathBinding !== `contract-${fingerprint}`)) {
          summary.conflictingBinding += 1;
          continue;
        }
        targets.push({ doc, attachment, contractNumber, fingerprint });
      } catch {
        summary.unreadableRecord += 1;
      }
    }

    const pending = targets.filter(({ attachment }) => {
      if (references.get(attachment.storagePath)?.size === 1) return true;
      summary.conflictingBinding += 1;
      return false;
    });
    console.log(JSON.stringify({ mode: summary.mode, entriesScanned: summary.entriesScanned, alreadyBound: summary.alreadyBound, pending: pending.length }));
    const concurrency = 8;
    for (let start = 0; start < pending.length; start += concurrency) {
      await Promise.all(pending.slice(start, start + concurrency).map(processTarget));
    }

    console.log(JSON.stringify(summary));
    const confirmed = summary.alreadyBound + (apply ? summary.updated : summary.readyToBind);
    if (summary.unreadableRecord || confirmed !== summary.entriesWithAttachmentMetadata) process.exitCode = 1;
  });
};

main().catch(() => {
  console.error("Contract PDF binding migration failed.");
  process.exitCode = 1;
});
