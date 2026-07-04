const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

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

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function toIsoDay(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function contractLifecycleStatus(data) {
  const raw = normalizeText(data.status).toLowerCase();
  if (raw === "storno" || raw === "stornovana" || raw === "stornována") return "storno";
  return "active";
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const snap = await db.collectionGroup("entries").where("productKey", "==", "neon").get();

  const rows = [];
  const counts = {
    neonEntries: 0,
    neonContracts: 0,
    neonEndorsements: 0,
    refreshAnySignal: 0,
    refreshContracts: 0,
    refreshIsRefreshTrue: 0,
    refreshOriginalNumber: 0,
    refreshCommissionBase: 0,
    refreshAlreadyStorno: 0,
    refreshMissingOriginalNumber: 0,
    refreshWithoutCommissionBase: 0,
  };
  const byOwner = new Map();

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const entryType = normalizeText(data.entryType) || "contract";
    const ownerDocId = docSnap.ref.parent.parent?.id ?? "";
    const ownerEmail = normalizeText(data.userEmail).toLowerCase() || ownerDocId;
    const isContract = entryType === "contract";
    const isRefresh = data.isRefresh === true;
    const originalNumber = normalizeText(data.refreshOriginalContractNumber);
    const hasRefreshCommissionBase =
      data.refreshCommissionBase &&
      typeof data.refreshCommissionBase === "object";
    const hasRefreshSignal = isRefresh || originalNumber.length > 0 || hasRefreshCommissionBase;

    counts.neonEntries += 1;
    if (isContract) counts.neonContracts += 1;
    if (entryType === "endorsement") counts.neonEndorsements += 1;
    if (isRefresh) counts.refreshIsRefreshTrue += 1;
    if (originalNumber) counts.refreshOriginalNumber += 1;
    if (hasRefreshCommissionBase) counts.refreshCommissionBase += 1;
    if (hasRefreshSignal) counts.refreshAnySignal += 1;
    if (hasRefreshSignal && isContract) counts.refreshContracts += 1;
    if (hasRefreshSignal && contractLifecycleStatus(data) === "storno") {
      counts.refreshAlreadyStorno += 1;
    }
    if (hasRefreshSignal && !originalNumber) counts.refreshMissingOriginalNumber += 1;
    if (hasRefreshSignal && !hasRefreshCommissionBase) counts.refreshWithoutCommissionBase += 1;

    if (hasRefreshSignal) {
      byOwner.set(ownerEmail, (byOwner.get(ownerEmail) || 0) + 1);
      rows.push({
        signed: toIsoDay(data.contractSignedDate) ?? "—",
        policyStart: toIsoDay(data.policyStartDate) ?? "—",
        contractNumber: normalizeText(data.contractNumber) || "—",
        originalNumber: originalNumber || "—",
        entryType,
        ownerEmail,
        status: contractLifecycleStatus(data),
        hasRefreshCommissionBase,
        path: docSnap.ref.path,
      });
    }
  }

  rows.sort((a, b) => {
    if (a.signed !== b.signed) return a.signed.localeCompare(b.signed, "cs");
    return a.contractNumber.localeCompare(b.contractNumber, "cs");
  });

  console.log(`NEON_ENTRIES=${counts.neonEntries}`);
  console.log(`NEON_CONTRACTS=${counts.neonContracts}`);
  console.log(`NEON_ENDORSEMENTS=${counts.neonEndorsements}`);
  console.log(`NEON_REFRESH_ANY_SIGNAL=${counts.refreshAnySignal}`);
  console.log(`NEON_REFRESH_CONTRACTS=${counts.refreshContracts}`);
  console.log(`NEON_REFRESH_IS_REFRESH_TRUE=${counts.refreshIsRefreshTrue}`);
  console.log(`NEON_REFRESH_WITH_ORIGINAL_NUMBER=${counts.refreshOriginalNumber}`);
  console.log(`NEON_REFRESH_WITH_COMMISSION_BASE=${counts.refreshCommissionBase}`);
  console.log(`NEON_REFRESH_ALREADY_STORNO=${counts.refreshAlreadyStorno}`);
  console.log(`NEON_REFRESH_MISSING_ORIGINAL_NUMBER=${counts.refreshMissingOriginalNumber}`);
  console.log(`NEON_REFRESH_WITHOUT_COMMISSION_BASE=${counts.refreshWithoutCommissionBase}`);
  console.log(`NEON_REFRESH_OWNER_COUNT=${byOwner.size}`);
  console.log("--- NEON_REFRESH_ROWS ---");
  for (const row of rows) {
    console.log(
      [
        row.signed,
        row.policyStart,
        row.contractNumber,
        row.originalNumber,
        row.entryType,
        row.status,
        row.hasRefreshCommissionBase ? "base=yes" : "base=no",
        row.ownerEmail,
        row.path,
      ].join(" | ")
    );
  }
}

main().catch((err) => {
  console.error("ERROR", err?.message || err);
  process.exit(1);
});
