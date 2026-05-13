#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const LEGACY_PRODUCTS = new Set([
  "cppAuto",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "kooperativaAuto",
  "slaviaauto",
  "zamex",
  "cppsimplex",
  "cppPPRs",
]);

const BATCH_LIMIT = 350;

const hasArg = (name) => process.argv.includes(name);

const roundToCents = (value) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

const normalizeTitle = (title) =>
  String(title ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

const paymentsPerYear = (frequencyRaw) => {
  switch (frequencyRaw) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    default:
      return 1;
  }
};

const expectedAnnualTitle = (productKey) =>
  productKey === "kooperativaAuto" ? "Celkem za rok" : "📅 Provize za rok";

const normalizeItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const title = typeof item.title === "string" ? item.title : "";
      const amountNumber = Number(item.amount);
      const amount = Number.isFinite(amountNumber) ? amountNumber : 0;
      return {
        ...item,
        title,
        amount,
      };
    })
    .filter(Boolean);
};

const sumImmediate = (items) =>
  roundToCents(
    items.reduce((sum, item) => {
      const title = normalizeTitle(item.title);
      if (!title.includes("okamžitá provize")) return sum;
      return sum + (item.amount ?? 0);
    }, 0)
  );

const sumAnnual = (items) =>
  roundToCents(
    items.reduce((sum, item) => {
      const title = normalizeTitle(item.title);
      if (!title.includes("za rok")) return sum;
      return sum + (item.amount ?? 0);
    }, 0)
  );

const normalizeTotal = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? roundToCents(n) : 0;
};

const repairOverride = ({ override, productKey, frequencyRaw }) => {
  if (!override || typeof override !== "object") {
    return { changed: false, next: override };
  }

  const currentItems = normalizeItems(override.items);
  const currentTotal = normalizeTotal(override.total);
  if (currentItems.length === 0) {
    if (currentTotal === 0) return { changed: false, next: override };
    return {
      changed: true,
      next: {
        ...override,
        total: 0,
      },
    };
  }

  const multiplier = paymentsPerYear(frequencyRaw);
  const immediate = sumImmediate(currentItems);
  const annualRows = currentItems
    .map((item, idx) => ({ idx, title: normalizeTitle(item.title) }))
    .filter((row) => row.title.includes("za rok"));

  let nextItems = currentItems.slice();
  let changed = false;

  if (immediate > 0 && multiplier > 1) {
    const expectedAnnual = roundToCents(immediate * multiplier);
    if (annualRows.length === 0) {
      nextItems.push({
        title: expectedAnnualTitle(productKey),
        amount: expectedAnnual,
      });
      changed = true;
    } else if (annualRows.length === 1) {
      const annualIdx = annualRows[0].idx;
      const currentAnnual = normalizeTotal(nextItems[annualIdx]?.amount);
      if (Math.abs(currentAnnual - expectedAnnual) > 0.009) {
        nextItems[annualIdx] = {
          ...nextItems[annualIdx],
          amount: expectedAnnual,
        };
        changed = true;
      }
    }
  }

  const normalizedAnnual = sumAnnual(nextItems);
  const nextTotal =
    normalizedAnnual > 0
      ? normalizedAnnual
      : immediate > 0
      ? roundToCents(immediate * multiplier)
      : 0;

  if (Math.abs(nextTotal - currentTotal) > 0.009) {
    changed = true;
  }

  if (!changed) {
    return { changed: false, next: override };
  }

  return {
    changed: true,
    next: {
      ...override,
      items: nextItems,
      total: nextTotal,
    },
  };
};

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

async function commitBatches(db, updates) {
  let batch = db.batch();
  let inBatch = 0;
  let committed = 0;

  for (const row of updates) {
    batch.update(row.ref, {
      managerOverrides: row.managerOverrides,
      updatedAt: new Date(),
    });
    inBatch += 1;

    if (inBatch >= BATCH_LIMIT) {
      await batch.commit();
      committed += inBatch;
      batch = db.batch();
      inBatch = 0;
    }
  }

  if (inBatch > 0) {
    await batch.commit();
    committed += inBatch;
  }

  return committed;
}

async function main() {
  const apply = hasArg("--apply");
  const creds = loadCredentials();
  if (!creds) {
    throw new Error("Missing FIREBASE_ADMIN_* credentials.");
  }

  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);

  const snap = await db.collectionGroup("entries").get();

  let scanned = 0;
  let legacyContracts = 0;
  let withOverrides = 0;
  let changedContracts = 0;
  let changedOverrides = 0;
  let addedAnnualRows = 0;

  const updates = [];

  for (const docSnap of snap.docs) {
    scanned += 1;
    const data = docSnap.data() ?? {};
    const productKey = typeof data.productKey === "string" ? data.productKey : null;
    if (!productKey || !LEGACY_PRODUCTS.has(productKey)) continue;
    legacyContracts += 1;

    const managerOverrides = Array.isArray(data.managerOverrides)
      ? data.managerOverrides
      : [];
    if (managerOverrides.length === 0) continue;
    withOverrides += 1;

    const frequencyRaw =
      typeof data.frequencyRaw === "string" ? data.frequencyRaw : "annual";

    let localChanged = false;
    let localChangedOverrides = 0;
    let localAddedAnnualRows = 0;

    const repairedOverrides = managerOverrides.map((override) => {
      const beforeAnnualCount = normalizeItems(override?.items).filter((item) =>
        normalizeTitle(item.title).includes("za rok")
      ).length;
      const repaired = repairOverride({
        override,
        productKey,
        frequencyRaw,
      });
      if (repaired.changed) {
        localChanged = true;
        localChangedOverrides += 1;
      }
      const afterAnnualCount = normalizeItems(repaired.next?.items).filter((item) =>
        normalizeTitle(item.title).includes("za rok")
      ).length;
      if (afterAnnualCount > beforeAnnualCount) {
        localAddedAnnualRows += afterAnnualCount - beforeAnnualCount;
      }
      return repaired.next;
    });

    if (!localChanged) continue;

    changedContracts += 1;
    changedOverrides += localChangedOverrides;
    addedAnnualRows += localAddedAnnualRows;

    updates.push({
      ref: docSnap.ref,
      managerOverrides: repairedOverrides,
      path: docSnap.ref.path,
      contractNumber:
        typeof data.contractNumber === "string" ? data.contractNumber.trim() : "—",
      productKey,
      frequencyRaw,
    });
  }

  console.log("=== Legacy manager override frequency fix ===");
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`Scanned entries: ${scanned}`);
  console.log(`Legacy product entries: ${legacyContracts}`);
  console.log(`Legacy entries with overrides: ${withOverrides}`);
  console.log(`Changed contracts: ${changedContracts}`);
  console.log(`Changed override rows: ${changedOverrides}`);
  console.log(`Added annual rows: ${addedAnnualRows}`);

  if (updates.length > 0) {
    console.log("\nSample updates:");
    updates.slice(0, 12).forEach((row) => {
      console.log(
        `- ${row.path} | contract=${row.contractNumber} | product=${row.productKey} | freq=${row.frequencyRaw}`
      );
    });
  }

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to persist changes.");
    return;
  }

  const committed = await commitBatches(db, updates);
  console.log(`\nCommitted updates: ${committed}`);
}

main().catch((error) => {
  console.error("Fix failed:", error?.message ?? error);
  process.exit(1);
});

