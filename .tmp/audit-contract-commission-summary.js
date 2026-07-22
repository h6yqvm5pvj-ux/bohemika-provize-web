const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { createJiti } = require("jiti");
const Module = require("module");
const path = require("path");

loadEnvConfig(process.cwd());

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(process.cwd(), "src", request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

function loadCredentials() {
  const rawJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
  }
  return {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
}

function normalizeContractNumber(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

async function main() {
  const contractNumber = normalizeContractNumber(process.argv[2]);
  if (!contractNumber) throw new Error("Pass contract number.");

  const credentials = loadCredentials();
  if (!credentials.projectId || !credentials.clientEmail || !credentials.privateKey) {
    throw new Error("Missing Firebase Admin credentials.");
  }

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const snap = await db.collectionGroup("entries").get();
  const doc = snap.docs.find(
    (item) => normalizeContractNumber(item.data()?.contractNumber) === contractNumber
  );
  if (!doc) throw new Error(`Contract ${contractNumber} not found.`);

  const jiti = createJiti(`${process.cwd()}/.tmp/audit-contract-commission-summary.js`);
  const { generateCashflow } = jiti("../src/app/cashflow/generator.ts");
  const { commissionAuditSummaryForContract } = jiti("../src/app/lib/commissionAudit.ts");
  const data = { id: doc.id, ...doc.data() };
  const ownerEmail = doc.ref.parent.parent?.id ?? data.userEmail ?? null;
  const now = new Date(process.argv[3] || "2026-07-19T00:00:00.000Z");

  const cashflow = generateCashflow([data], 4, ownerEmail)
    .filter((item) => item.contractNumber === contractNumber)
    .map((item) => ({
      date: item.date.toISOString().slice(0, 10),
      code: item.commissionCode,
      status: item.payoutStatus ?? "predicted",
      amount: item.amount,
      predictedAmount: item.predictedAmount,
      originalDate: item.originalDate?.toISOString().slice(0, 10) ?? null,
    }));

  const audit = commissionAuditSummaryForContract(data, {
    mode: "all",
    viewerEmail: ownerEmail,
    now,
  });

  console.log(
    JSON.stringify(
      {
        path: doc.ref.path,
        ownerEmail,
        commissionPayouts: (data.commissionPayouts ?? []).map((item) => ({
          code: item.code,
          status: item.status,
          amount: item.amount,
          expectedAmount: item.expectedAmount,
          payoutMonthKey: item.payoutMonthKey,
        })),
        cashflow,
        audit,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
