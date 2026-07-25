#!/usr/bin/env node

import nextEnv from "@next/env";
import { createJiti } from "jiti";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const jiti = createJiti(import.meta.url);
const { adminDb } = jiti("../src/lib/server/firebaseAdmin.ts");
const {
  downloadContractPdfAttachment,
  normalizeStoredContractPdfAttachment,
} = jiti("../src/lib/server/contractPdfStorage.ts");
const { parseNeonPdf } = jiti("../src/app/lib/parseNeonPdf.ts");
const { toDate } = jiti("../src/app/lib/formatters.ts");

const BATCH_LIMIT = 300;

const hasArg = (name) => process.argv.includes(name);

const parseArgValue = (key, fallback = null) => {
  const prefix = `${key}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(key);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const normalizeEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeContractNumber = (value) =>
  String(value ?? "").replace(/\s+/g, "").trim();

const isoDayFromUnknown = (value) => {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
};

const dateFromIsoDay = (isoDay) => new Date(`${isoDay}T00:00:00.000Z`);

const collectEntries = async ({ contractFilter }) => {
  const usersSnap = await adminDb.collection("users").get();
  const entries = [];

  await Promise.all(
    usersSnap.docs.map(async (userDoc) => {
      const ownerEmail = normalizeEmail(userDoc.data()?.email ?? userDoc.id);
      if (!ownerEmail) return;

      let query = adminDb
        .collection("users")
        .doc(ownerEmail)
        .collection("entries")
        .where("productKey", "==", "neon");

      const snap = await query.get();
      snap.docs.forEach((entryDoc) => {
        const data = entryDoc.data() ?? {};
        const contractNumber = normalizeContractNumber(data.contractNumber);
        if (contractFilter && contractNumber !== contractFilter) return;
        entries.push({ ownerEmail, ref: entryDoc.ref, id: entryDoc.id, data });
      });
    })
  );

  return entries;
};

const commitUpdates = async (updates) => {
  let batch = adminDb.batch();
  let inBatch = 0;
  let written = 0;

  for (const update of updates) {
    batch.update(update.ref, {
      policyEndDate: dateFromIsoDay(update.policyEndDate),
      updatedAt: new Date(),
    });
    inBatch += 1;

    if (inBatch >= BATCH_LIMIT) {
      await batch.commit();
      written += inBatch;
      batch = adminDb.batch();
      inBatch = 0;
    }
  }

  if (inBatch > 0) {
    await batch.commit();
    written += inBatch;
  }

  return written;
};

const main = async () => {
  if (!adminDb) throw new Error("Missing Firebase Admin configuration.");

  const write = hasArg("--write") || hasArg("--apply");
  const limitRaw = parseArgValue("--limit");
  const limit = limitRaw ? Math.max(0, Number.parseInt(limitRaw, 10) || 0) : 0;
  const contractFilter = normalizeContractNumber(parseArgValue("--contract"));

  const entries = await collectEntries({ contractFilter });
  const stats = {
    mode: write ? "write" : "dry-run",
    scannedNeonEntries: 0,
    neonContracts: 0,
    withPdf: 0,
    parsedPolicyEndDate: 0,
    alreadySame: 0,
    missingPolicyEndDate: 0,
    differentPolicyEndDate: 0,
    plannedUpdates: 0,
    written: 0,
    skippedNonContract: 0,
    skippedNoPdf: 0,
    skippedNoPolicyEndDateInPdf: 0,
    skippedContractNumberMismatch: 0,
    errors: 0,
  };
  const planned = [];
  const examples = [];
  const errors = [];

  for (const entry of entries) {
    if (limit > 0 && stats.scannedNeonEntries >= limit) break;
    stats.scannedNeonEntries += 1;

    const entryType =
      typeof entry.data.entryType === "string"
        ? entry.data.entryType.trim().toLowerCase()
        : "contract";
    if (entryType !== "contract") {
      stats.skippedNonContract += 1;
      continue;
    }
    stats.neonContracts += 1;

    const attachment = normalizeStoredContractPdfAttachment(
      entry.data.contractPdfAttachment
    );
    if (!attachment) {
      stats.skippedNoPdf += 1;
      continue;
    }
    stats.withPdf += 1;

    try {
      const bytes = await downloadContractPdfAttachment(attachment);
      const file = new File([bytes], attachment.originalName || "smlouva.pdf", {
        type: "application/pdf",
      });
      const parsed = await parseNeonPdf(file);
      const parsedPolicyEndDate = parsed.policyEndDate ?? null;

      if (!parsedPolicyEndDate) {
        stats.skippedNoPolicyEndDateInPdf += 1;
        continue;
      }
      stats.parsedPolicyEndDate += 1;

      const storedContractNumber = normalizeContractNumber(entry.data.contractNumber);
      const parsedContractNumber = normalizeContractNumber(parsed.contractNumber);
      if (
        storedContractNumber &&
        parsedContractNumber &&
        storedContractNumber !== parsedContractNumber
      ) {
        stats.skippedContractNumberMismatch += 1;
        examples.push({
          ownerEmail: entry.ownerEmail,
          entryId: entry.id,
          contractNumber: storedContractNumber,
          parsedContractNumber,
          reason: "contract-number-mismatch",
        });
        continue;
      }

      const currentPolicyEndDate = isoDayFromUnknown(entry.data.policyEndDate);
      if (currentPolicyEndDate === parsedPolicyEndDate) {
        stats.alreadySame += 1;
        continue;
      }

      if (currentPolicyEndDate) {
        stats.differentPolicyEndDate += 1;
      } else {
        stats.missingPolicyEndDate += 1;
      }

      planned.push({
        ref: entry.ref,
        ownerEmail: entry.ownerEmail,
        entryId: entry.id,
        contractNumber: storedContractNumber || parsedContractNumber,
        currentPolicyEndDate,
        policyEndDate: parsedPolicyEndDate,
      });

      if (examples.length < 20) {
        examples.push({
          ownerEmail: entry.ownerEmail,
          entryId: entry.id,
          contractNumber: storedContractNumber || parsedContractNumber,
          currentPolicyEndDate,
          policyEndDate: parsedPolicyEndDate,
        });
      }
    } catch (error) {
      stats.errors += 1;
      if (errors.length < 20) {
        errors.push({
          ownerEmail: entry.ownerEmail,
          entryId: entry.id,
          contractNumber: normalizeContractNumber(entry.data.contractNumber),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  stats.plannedUpdates = planned.length;
  if (write && planned.length > 0) {
    stats.written = await commitUpdates(planned);
  }

  console.log(JSON.stringify({ stats, examples, errors }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
