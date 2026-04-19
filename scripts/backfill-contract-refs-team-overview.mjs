#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const TEAM_OVERVIEW_MODEL_VERSION = 1;
const CONTRACT_REFS_COLLECTION = "contractRefs";
const TEAM_OVERVIEW_TOTALS_COLLECTION = "teamOverviewTotals";
const TEAM_OVERVIEW_MONTHLY_COLLECTION = "teamOverviewMonthly";
const BATCH_LIMIT = 400;

const PRODUCT_CATEGORY = {
  neon: "life",
  flexi: "life",
  maximaMaxEfekt: "life",
  pillowInjury: "life",
  zamex: "property",
  domex: "property",
  koopmajetekobcan: "property",
  maxdomov: "property",
  cppsimplex: "property",
  cppAuto: "auto",
  slaviaauto: "auto",
  cppPPRs: "property",
  cppPPRbez: "property",
  allianzAuto: "auto",
  csobAuto: "auto",
  uniqaAuto: "auto",
  uniqaflotila: "auto",
  pillowAuto: "auto",
  kooperativaAuto: "auto",
  cppcestovko: "travel",
  axacestovko: "travel",
  comfortcc: "comfort",
};

const PRODUCT_INSTITUTION_LABEL = {
  neon: "ČPP",
  zamex: "ČPP",
  domex: "ČPP",
  cppsimplex: "ČPP",
  cppAuto: "ČPP",
  cppPPRs: "ČPP",
  cppPPRbez: "ČPP",
  cppcestovko: "ČPP",
  flexi: "Kooperativa",
  koopmajetekobcan: "Kooperativa",
  kooperativaAuto: "Kooperativa",
  maximaMaxEfekt: "Maxima",
  maxdomov: "Maxima",
  allianzAuto: "Allianz",
  slaviaauto: "SLAVIA",
  uniqaAuto: "UNIQA",
  uniqaflotila: "UNIQA",
  csobAuto: "ČSOB",
  pillowAuto: "Pillow",
  pillowInjury: "Pillow",
  axacestovko: "AXA",
  comfortcc: "Comfort Commodity",
};

function hasArg(name) {
  return process.argv.includes(name);
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeContractNumber(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function normalizeContractNumberLoose(value) {
  return normalizeContractNumber(value).replace(/^0+/, "");
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value === "number" || typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function productCategory(productKey) {
  return PRODUCT_CATEGORY[productKey] ?? "other";
}

function productInstitutionLabel(productKey) {
  return PRODUCT_INSTITUTION_LABEL[productKey] ?? "Ostatní";
}

function isLifeProduct(productKey) {
  return productCategory(productKey) === "life";
}

function paymentsPerYear(freq) {
  switch (freq) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    default:
      return 1;
  }
}

function annualPremiumFromEntry(data, category) {
  const raw = toFiniteNumber(data?.inputAmount);
  if (raw <= 0) return 0;
  if (isLifeProduct(data?.productKey)) return raw * 12;
  if (category === "comfort") return raw;
  return raw * paymentsPerYear(data?.frequencyRaw ?? "annual");
}

function emptyCategoryCounts() {
  return {
    life: 0,
    auto: 0,
    property: 0,
    travel: 0,
    comfort: 0,
    other: 0,
  };
}

function emptyCategoryMetrics() {
  return {
    life: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    auto: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    property: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    travel: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    comfort: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    other: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
  };
}

function emptyInstitutionByCategory() {
  return {
    life: {},
    auto: {},
    property: {},
    travel: {},
    comfort: {},
    other: {},
  };
}

function emptyStats() {
  return {
    total: 0,
    month: 0,
    categories: emptyCategoryCounts(),
    categoryMetrics: emptyCategoryMetrics(),
    institutionMetrics: {},
    institutionByCategory: emptyInstitutionByCategory(),
  };
}

function monthDocId(ownerEmail, yearMonth) {
  return `${ownerEmail}___${yearMonth}`;
}

function contractRefDocId(ownerEmail, entryId) {
  return `${ownerEmail}___${entryId}`;
}

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
    } catch {
      // fallback to split env vars
    }
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

async function main() {
  const apply = hasArg("--apply");
  const dryRun = !apply;

  if (dryRun) {
    console.log(
      "[dry-run] Nic nezapisuju. Pro zápis spusť: node scripts/backfill-contract-refs-team-overview.mjs --apply"
    );
  }

  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error("Chybí FIREBASE_ADMIN_* credentials.");
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert(credentials),
    });

  const db = getFirestore(app);
  const usersSnap = await db.collection("users").select().get();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const updatedAtMs = Date.now();

  const statsByOwner = new Map();
  let scannedUsers = 0;
  let scannedEntries = 0;
  let seenContractRefs = 0;
  let removedContractRefs = 0;

  let batch = db.batch();
  let opsInBatch = 0;

  const commitBatch = async () => {
    if (dryRun || opsInBatch === 0) return;
    await batch.commit();
    batch = db.batch();
    opsInBatch = 0;
  };

  for (const userDoc of usersSnap.docs) {
    scannedUsers += 1;
    const ownerFromDocId = normalizeEmail(userDoc.id);
    if (!ownerFromDocId) continue;

    const entriesSnap = await db
      .collection("users")
      .doc(userDoc.id)
      .collection("entries")
      .get();

    for (const entryDoc of entriesSnap.docs) {
      scannedEntries += 1;
      const data = entryDoc.data() ?? {};
      const ownerEmail = normalizeEmail(data.userEmail ?? ownerFromDocId);
      if (!ownerEmail) continue;

      const productKey =
        typeof data.productKey === "string" ? data.productKey.trim() : null;
      const category = productCategory(productKey);
      const institution = productInstitutionLabel(productKey);

      const stats = statsByOwner.get(ownerEmail) ?? emptyStats();
      stats.total += 1;
      stats.categories[category] = (stats.categories[category] ?? 0) + 1;

      const annualPremium = annualPremiumFromEntry(data, category);
      const monthlyPremium = annualPremium / 12;

      const byCategory = stats.categoryMetrics[category] ?? {
        contracts: 0,
        annualPremium: 0,
        monthlyPremium: 0,
      };
      byCategory.contracts += 1;
      byCategory.annualPremium += annualPremium;
      byCategory.monthlyPremium += monthlyPremium;
      stats.categoryMetrics[category] = byCategory;

      const byInstitution = stats.institutionMetrics[institution] ?? {
        contracts: 0,
        annualPremium: 0,
        monthlyPremium: 0,
      };
      byInstitution.contracts += 1;
      byInstitution.annualPremium += annualPremium;
      byInstitution.monthlyPremium += monthlyPremium;
      stats.institutionMetrics[institution] = byInstitution;

      const byInstitutionForCategory =
        stats.institutionByCategory[category][institution] ?? {
          contracts: 0,
          annualPremium: 0,
          monthlyPremium: 0,
        };
      byInstitutionForCategory.contracts += 1;
      byInstitutionForCategory.annualPremium += annualPremium;
      byInstitutionForCategory.monthlyPremium += monthlyPremium;
      stats.institutionByCategory[category][institution] = byInstitutionForCategory;

      const signed = toDate(data.contractSignedDate ?? data.createdAt);
      const ts = signed?.getTime();
      if (ts != null && ts >= monthStart && ts < nextMonthStart) {
        stats.month += 1;
      }

      statsByOwner.set(ownerEmail, stats);

      const contractNumberRaw =
        typeof data.contractNumber === "string" ? data.contractNumber.trim() : "";
      const contractNumberNormalized = normalizeContractNumber(contractNumberRaw);
      const contractNumberLoose = normalizeContractNumberLoose(contractNumberRaw);

      const ref = db
        .collection(CONTRACT_REFS_COLLECTION)
        .doc(contractRefDocId(ownerEmail, entryDoc.id));

      if (contractNumberNormalized) {
        seenContractRefs += 1;
        batch.set(
          ref,
          {
            ownerEmail,
            entryId: entryDoc.id,
            entryPath: `users/${ownerEmail}/entries/${entryDoc.id}`,
            contractNumberRaw,
            contractNumberNormalized,
            contractNumberLoose,
            productKey: productKey ?? null,
            updatedAt: new Date(),
          },
          { merge: true }
        );
      } else {
        removedContractRefs += 1;
        batch.delete(ref);
      }
      opsInBatch += 1;

      if (opsInBatch >= BATCH_LIMIT) {
        await commitBatch();
      }
    }
  }

  for (const [ownerEmail, stats] of statsByOwner.entries()) {
    const totalsRef = db.collection(TEAM_OVERVIEW_TOTALS_COLLECTION).doc(ownerEmail);
    const monthRef = db
      .collection(TEAM_OVERVIEW_MONTHLY_COLLECTION)
      .doc(monthDocId(ownerEmail, yearMonth));

    batch.set(
      totalsRef,
      {
        version: TEAM_OVERVIEW_MODEL_VERSION,
        ownerEmail,
        total: toFiniteNumber(stats.total),
        categories: stats.categories,
        categoryMetrics: stats.categoryMetrics,
        institutionMetrics: stats.institutionMetrics,
        institutionByCategory: stats.institutionByCategory,
        updatedAtMs,
      },
      { merge: true }
    );
    batch.set(
      monthRef,
      {
        version: TEAM_OVERVIEW_MODEL_VERSION,
        ownerEmail,
        yearMonth,
        monthCount: toFiniteNumber(stats.month),
        updatedAtMs,
      },
      { merge: true }
    );
    opsInBatch += 2;

    if (opsInBatch >= BATCH_LIMIT) {
      await commitBatch();
    }
  }

  await commitBatch();

  console.log("----- backfill-contract-refs-team-overview -----");
  console.log(`users scanned: ${scannedUsers}`);
  console.log(`entries scanned: ${scannedEntries}`);
  console.log(`owners aggregated: ${statsByOwner.size}`);
  console.log(`contractRefs upserts: ${seenContractRefs}`);
  console.log(`contractRefs deletes (missing number): ${removedContractRefs}`);
  if (dryRun) {
    console.log("dry-run mode: no writes");
  } else {
    console.log("write mode: done");
  }
}

main().catch((error) => {
  console.error("backfill-contract-refs-team-overview failed:", error?.message ?? error);
  process.exit(1);
});
