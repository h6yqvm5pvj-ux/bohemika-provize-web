const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

loadEnvConfig(process.cwd());

const LIFE_PRODUCTS = new Set(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"]);

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

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizeMode(value) {
  return value === "standard" || value === "accelerated" ? value : null;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDay(value) {
  const d = toDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const snap = await db.collectionGroup("entries").get();

  let lifeEntries = 0;
  let lifeEntriesWithOverrides = 0;
  let standardOverrides = 0;
  let acceleratedOverrides = 0;
  let missingOverrides = 0;
  const anomalies = [];

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (!LIFE_PRODUCTS.has(data.productKey)) return;
    const entryType = normalizeText(data.entryType).toLowerCase() || "contract";
    if (entryType !== "contract" && entryType !== "endorsement") return;

    lifeEntries += 1;
    const overrides = Array.isArray(data.managerOverrides) ? data.managerOverrides : [];
    if (overrides.length > 0) lifeEntriesWithOverrides += 1;

    const badModes = [];
    overrides.forEach((override) => {
      const mode = normalizeMode(override?.commissionMode);
      if (mode === "standard") {
        standardOverrides += 1;
      } else if (mode === "accelerated") {
        acceleratedOverrides += 1;
        badModes.push(`${normalizeEmail(override?.email) || "unknown"}:accelerated`);
      } else {
        missingOverrides += 1;
        badModes.push(`${normalizeEmail(override?.email) || "unknown"}:missing`);
      }
    });

    const chain = Array.isArray(data.managerChain) ? data.managerChain : [];
    chain.forEach((node) => {
      const mode = normalizeMode(node?.commissionMode);
      if (mode && mode !== "standard") {
        badModes.push(`${normalizeEmail(node?.email) || "unknown"}:chain:${mode}`);
      }
    });

    const snapshotMode = normalizeMode(data.managerModeSnapshot);
    if (snapshotMode && snapshotMode !== "standard") {
      badModes.push(`snapshot:${snapshotMode}`);
    }

    if (badModes.length > 0) {
      anomalies.push({
        path: docSnap.ref.path,
        contractNumber: normalizeText(data.contractNumber) || "NO_CONTRACT_NUMBER",
        productKey: data.productKey,
        entryType,
        signed: toIsoDay(data.contractSignedDate),
        owner: normalizeEmail(data.userEmail) || docSnap.ref.parent.parent?.id || "unknown",
        modes: Array.from(new Set(badModes)).join(","),
      });
    }
  });

  anomalies.sort((a, b) => {
    if (a.signed !== b.signed) return String(a.signed).localeCompare(String(b.signed));
    return a.contractNumber.localeCompare(b.contractNumber, "cs");
  });

  console.log(`life_entries=${lifeEntries}`);
  console.log(`life_entries_with_overrides=${lifeEntriesWithOverrides}`);
  console.log(`override_standard=${standardOverrides}`);
  console.log(`override_accelerated=${acceleratedOverrides}`);
  console.log(`override_missing=${missingOverrides}`);
  console.log(`anomalies=${anomalies.length}`);
  if (anomalies.length > 0) {
    console.log("--- anomalies");
    anomalies.forEach((row) => {
      console.log(
        [
          row.contractNumber,
          row.productKey,
          row.entryType,
          `signed=${row.signed || "null"}`,
          `owner=${row.owner}`,
          `modes=${row.modes}`,
          row.path,
        ].join(" | ")
      );
    });
  }
}

main().catch((error) => {
  console.error(`audit_failed=${error?.message || error}`);
  process.exit(1);
});
