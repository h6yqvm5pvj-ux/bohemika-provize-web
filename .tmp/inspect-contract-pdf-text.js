const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

loadEnvConfig(process.cwd());

function loadCredentials() {
  const rawJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        };
      }
    } catch {}
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (projectId && clientEmail && privateKeyRaw) {
    return {
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

function normalizeContractNumber(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function toIsoDay(value) {
  if (!value) return null;
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function findContract(db, contractNumber) {
  const snap = await db.collectionGroup("entries").get();
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (normalizeContractNumber(data.contractNumber) === contractNumber) {
      return { path: docSnap.ref.path, data };
    }
  }
  return null;
}

async function extractPdfText(bytes) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
  }).promise;
  const pages = [];
  for (let pageIndex = 1; pageIndex <= doc.numPages; pageIndex += 1) {
    const page = await doc.getPage(pageIndex);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ page: pageIndex, text });
  }
  return pages;
}

function printHits(pages) {
  const patterns = [
    /\b\d{1,2}\.\s*\d{1,2}\.\s*20\d{2}\b/g,
    /\b20\d{2}-\d{2}-\d{2}\b/g,
    /\b1\s*000\b/g,
    /\b1000\b/g,
    /\b12\s*000\b/g,
    /\b7502081798\b/g,
  ];
  for (const { page, text } of pages) {
    const hits = new Set();
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const start = Math.max(0, match.index - 90);
        const end = Math.min(text.length, match.index + match[0].length + 120);
        hits.add(text.slice(start, end));
      }
    }
    if (hits.size === 0) continue;
    console.log(`\n--- page ${page} ---`);
    for (const hit of hits) {
      console.log(hit);
    }
  }
}

async function main() {
  const contractNumber = normalizeContractNumber(process.argv[2]);
  if (!contractNumber) throw new Error("Usage: node .tmp/inspect-contract-pdf-text.js <contract-number>");

  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const match = await findContract(db, contractNumber);
  if (!match) throw new Error(`Contract ${contractNumber} not found.`);

  const attachment = match.data.contractPdfAttachment || {};
  console.log(
    JSON.stringify(
      {
        path: match.path,
        contractSignedDate: toIsoDay(match.data.contractSignedDate),
        policyStartDate: toIsoDay(match.data.policyStartDate),
        inputAmount: match.data.inputAmount,
        effectiveInputAmount: match.data.effectiveInputAmount,
        attachment: {
          bucketName: attachment.bucketName,
          storagePath: attachment.storagePath,
          originalName: attachment.originalName,
        },
      },
      null,
      2
    )
  );

  if (!attachment.bucketName || !attachment.storagePath) {
    throw new Error("Contract has no stored PDF attachment.");
  }

  const [bytes] = await getStorage()
    .bucket(attachment.bucketName)
    .file(attachment.storagePath)
    .download();
  console.log(`downloaded=${bytes.length}`);
  const pages = await extractPdfText(bytes);
  printHits(pages);
}

main().catch((err) => {
  console.error("Inspect PDF failed:", err?.stack || err?.message || err);
  process.exit(1);
});
