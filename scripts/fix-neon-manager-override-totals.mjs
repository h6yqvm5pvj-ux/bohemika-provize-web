#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

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

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const stripTotalRows = (items) =>
  (Array.isArray(items) ? items : []).filter(
    (item) => !normalizeTitle(item?.title).includes("celkem")
  );

const itemMultiplier = (title) => {
  const normalized = normalizeTitle(title);
  if (normalized.includes("2.–5.")) return 4;
  if (normalized.includes("5.–10.")) return 6;
  return 1;
};

const computeOverrideTotal = (items) =>
  roundToCents(
    stripTotalRows(items).reduce((sum, item) => {
      return sum + toNumber(item?.amount) * itemMultiplier(item?.title);
    }, 0)
  );

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
  if (!creds) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);

  const snap = await db.collectionGroup("entries").get();

  let scanned = 0;
  let neonContracts = 0;
  let changedContracts = 0;
  let changedOverrides = 0;
  const updates = [];

  for (const docSnap of snap.docs) {
    scanned += 1;
    const data = docSnap.data() ?? {};
    const entryType =
      typeof data.entryType === "string" ? data.entryType.trim().toLowerCase() : "contract";
    if (entryType !== "contract") continue;
    if (data.productKey !== "neon") continue;
    neonContracts += 1;

    const managerOverrides = Array.isArray(data.managerOverrides)
      ? data.managerOverrides
      : [];
    if (managerOverrides.length === 0) continue;

    let localChanged = false;
    let localChangedOverrides = 0;
    const repaired = managerOverrides.map((override) => {
      const expected = computeOverrideTotal(override?.items);
      const current = roundToCents(toNumber(override?.total));
      if (Math.abs(current - expected) <= 0.009) return override;
      localChanged = true;
      localChangedOverrides += 1;
      return {
        ...override,
        total: expected,
      };
    });

    if (!localChanged) continue;
    changedContracts += 1;
    changedOverrides += localChangedOverrides;
    updates.push({
      ref: docSnap.ref,
      managerOverrides: repaired,
      path: docSnap.ref.path,
      contractNumber:
        typeof data.contractNumber === "string" ? data.contractNumber.trim() : "—",
    });
  }

  console.log("=== Neon manager override total fix ===");
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`Scanned entries: ${scanned}`);
  console.log(`Neon contracts: ${neonContracts}`);
  console.log(`Changed contracts: ${changedContracts}`);
  console.log(`Changed overrides: ${changedOverrides}`);

  if (updates.length > 0) {
    console.log("\nSample updates:");
    updates.slice(0, 12).forEach((row) => {
      console.log(`- ${row.path} | contract=${row.contractNumber}`);
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

