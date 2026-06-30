#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const BATCH_LIMIT = 350;
const NOTE =
  "Pro okamžité vyplacení podmíněno zpracováním karty klienta dle podmínek!";

const A101 = {
  poradce1: 21.207,
  poradce2: 23.6887,
  poradce3: 25.7191,
  poradce4: 32.1038,
  poradce5: 36.097,
  poradce6: 38.5787,
  poradce7: 43.0908,
  poradce8: 45.6627,
  poradce9: 47.6029,
  poradce10: 48.9566,
  manazer4: 38.5787,
  manazer5: 43.0908,
  manazer6: 47.2871,
  manazer7: 51.4382,
  manazer8: 55.9504,
  manazer9: 59.7857,
  manazer10: 64.2978,
};

const B0301 = {
  poradce1: 5.0742,
  poradce2: 5.668,
  poradce3: 6.1538,
  poradce4: 7.6815,
  poradce5: 8.637,
  poradce6: 9.2308,
  poradce7: 10.3104,
  poradce8: 10.9258,
  poradce9: 11.39,
  poradce10: 11.7139,
  manazer4: 9.2308,
  manazer5: 10.3104,
  manazer6: 11.3144,
  manazer7: 12.3077,
  manazer8: 13.3873,
  manazer9: 14.305,
  manazer10: 15.3846,
};

const B36_HALF = {
  poradce1: 6.46015,
  poradce2: 7.21615,
  poradce3: 7.8347,
  poradce4: 9.7796,
  poradce5: 10.99605,
  poradce6: 11.752,
  poradce7: 13.12655,
  poradce8: 13.91,
  poradce9: 14.50105,
  poradce10: 14.9134,
  manazer4: 11.752,
  manazer5: 13.12655,
  manazer6: 14.4048,
  manazer7: 15.66935,
  manazer8: 17.04385,
  manazer9: 18.2122,
  manazer10: 19.5867,
};

const hasArg = (name) => process.argv.includes(name);

const roundToCents = (value) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

const toCents = (value) => Math.round((Number(value) || 0) * 100);

const fromCents = (value) => value / 100;

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

const cleanTitle = (title) => {
  const raw = String(title ?? "");
  const match = raw.match(/[\p{L}\p{N}]/u);
  if (!match) return raw.trim();
  return raw.slice(raw.indexOf(match[0])).trim();
};

const normalizeTitle = (title) => normalizeText(cleanTitle(title));

const normalizeMode = (value) =>
  value === "accelerated" || value === "standard" ? value : null;

const normalizePosition = (value) =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(A101, value)
    ? value
    : null;

const isLegacyImmediateTitle = (title) => {
  const normalized = normalizeTitle(title);
  return (
    normalized.includes("okamzita provize") &&
    !normalized.includes("a101") &&
    !normalized.includes("b0301") &&
    !normalized.includes("b36")
  );
};

const isSplitImmediateTitle = (title) => {
  const normalized = normalizeTitle(title);
  return (
    normalized === "provize a101" ||
    normalized === "provize b0301" ||
    normalized === "provize 50% z b36" ||
    normalized === "provize 50% z b3601"
  );
};

const codeForSplitImmediateTitle = (title) => {
  const normalized = normalizeTitle(title);
  if (normalized === "provize a101") return "A101";
  if (normalized === "provize b0301") return "B0301";
  if (normalized === "provize 50% z b36" || normalized === "provize 50% z b3601") {
    return "B36_HALF";
  }
  if (normalized.includes("provize po 3 letech")) return "B36";
  if (normalized.includes("provize po 4 letech")) return "B48";
  if (normalized.includes("nasledna provize") && normalized.includes("od 6")) {
    return "B201-B206";
  }
  if (normalized.includes("celkem")) return "TOTAL";
  return null;
};

const ensureSplitImmediateCodes = (items) => {
  let changed = false;
  const nextItems = items.map((item) => {
    const code = codeForSplitImmediateTitle(item?.title);
    if (!code || item?.code === code) return item;
    changed = true;
    return { ...item, code };
  });
  return { changed, items: nextItems };
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

function splitImmediateAmount(amount, position, mode) {
  const includeB36 = mode === "accelerated";
  const definitions = [
    { title: "💸 Provize A101", coefficient: A101[position], code: "A101" },
    {
      title: "💸 Provize B0301",
      coefficient: B0301[position],
      code: "B0301",
      note: NOTE,
    },
    ...(includeB36
      ? [
          {
            title: "💸 Provize 50% z B36",
            coefficient: B36_HALF[position],
            code: "B36_HALF",
          },
        ]
      : []),
  ].filter((part) => Number.isFinite(part.coefficient) && part.coefficient > 0);

  const coefficientTotal = definitions.reduce((sum, part) => sum + part.coefficient, 0);
  if (definitions.length === 0 || coefficientTotal <= 0) return null;

  const totalCents = toCents(amount);
  const partCents = definitions.map((part) => ({
    title: part.title,
    code: part.code,
    note: part.note,
    cents: Math.max(0, toCents((amount * part.coefficient) / coefficientTotal)),
  }));

  const lastIdx = partCents.length - 1;
  const roundedSum = partCents.reduce((sum, part) => sum + part.cents, 0);
  partCents[lastIdx].cents += totalCents - roundedSum;

  if (partCents[lastIdx].cents < 0) {
    let deficit = -partCents[lastIdx].cents;
    partCents[lastIdx].cents = 0;
    for (let idx = lastIdx - 1; idx >= 0 && deficit > 0; idx -= 1) {
      const reduceBy = Math.min(partCents[idx].cents, deficit);
      partCents[idx].cents -= reduceBy;
      deficit -= reduceBy;
    }
    if (deficit > 0) return null;
  }

  return partCents.map((part) => ({
    title: part.title,
    amount: roundToCents(fromCents(part.cents)),
    code: part.code,
    ...(part.note ? { note: part.note } : {}),
  }));
}

function tipRatioForEntry(entry) {
  const percent = toNumber(entry?.tipContractTipsterPercent);
  if (!Number.isFinite(percent) || percent <= 0) return 1;
  return Math.max(0, 1 - percent / 100);
}

function inferModeFromAmount({ entry, position, immediateAmount, tipRatio = 1 }) {
  const explicit = normalizeMode(entry?.commissionMode);
  if (explicit) return { mode: explicit, source: "stored" };

  const monthly = toNumber(entry?.inputAmount);
  if (!monthly || monthly <= 0) return { mode: "standard", source: "fallback" };

  const annual = monthly * 12;
  const expectedStandard = annual * ((A101[position] + B0301[position]) / 100) * tipRatio;
  const expectedAccelerated =
    annual * ((A101[position] + B0301[position] + B36_HALF[position]) / 100) * tipRatio;
  const standardDiff = Math.abs(expectedStandard - immediateAmount);
  const acceleratedDiff = Math.abs(expectedAccelerated - immediateAmount);

  return acceleratedDiff < standardDiff
    ? { mode: "accelerated", source: "inferred" }
    : { mode: "standard", source: "inferred" };
}

function splitItems(items, { entry, position, mode, tipRatio = 1 }) {
  if (!Array.isArray(items) || items.length === 0) {
    return { changed: false, items, reason: "no-items" };
  }

  if (items.some((item) => isSplitImmediateTitle(item?.title))) {
    const codeResult = ensureSplitImmediateCodes(items);
    return codeResult.changed
      ? { changed: true, items: codeResult.items, reason: "code-backfill" }
      : { changed: false, items, reason: "already-split" };
  }

  const idx = items.findIndex((item) => isLegacyImmediateTitle(item?.title));
  if (idx < 0) return { changed: false, items, reason: "no-legacy-immediate" };

  const usedPosition = normalizePosition(position);
  if (!usedPosition) return { changed: false, items, reason: "missing-coefficient" };

  const immediateAmount = toNumber(items[idx]?.amount);
  if (!Number.isFinite(immediateAmount) || immediateAmount <= 0) {
    return { changed: false, items, reason: "invalid-immediate-amount" };
  }

  const modeResolution =
    normalizeMode(mode) != null
      ? { mode: normalizeMode(mode), source: "stored" }
      : inferModeFromAmount({
          entry,
          position: usedPosition,
          immediateAmount,
          tipRatio,
        });

  const split = splitImmediateAmount(immediateAmount, usedPosition, modeResolution.mode);
  if (!split) return { changed: false, items, reason: "split-failed" };

  return {
    changed: true,
    items: ensureSplitImmediateCodes([
      ...items.slice(0, idx),
      ...split,
      ...items.slice(idx + 1),
    ]).items,
    reason: "split",
    modeSource: modeResolution.source,
  };
}

function buildPatchForEntry(data) {
  const entryPosition = data.position;
  const entryMode = normalizeMode(data.commissionMode);
  const tipRatio = tipRatioForEntry(data);
  const patch = {};
  const stats = {
    itemChanged: false,
    resultChanged: false,
    managerOverridesChanged: 0,
    skippedReason: null,
    inferredModes: 0,
  };

  const itemsResult = splitItems(data.items, {
    entry: data,
    position: entryPosition,
    mode: entryMode,
    tipRatio,
  });
  if (itemsResult.changed) {
    patch.items = itemsResult.items;
    stats.itemChanged = true;
    if (itemsResult.modeSource === "inferred") stats.inferredModes += 1;
  } else {
    stats.skippedReason = itemsResult.reason;
  }

  if (data.result && typeof data.result === "object" && Array.isArray(data.result.items)) {
    const resultItemsResult = splitItems(data.result.items, {
      entry: data,
      position: entryPosition,
      mode: entryMode,
      tipRatio,
    });
    if (resultItemsResult.changed) {
      patch.result = {
        ...data.result,
        items: resultItemsResult.items,
      };
      stats.resultChanged = true;
      if (resultItemsResult.modeSource === "inferred") stats.inferredModes += 1;
    }
  }

  if (Array.isArray(data.managerOverrides) && data.managerOverrides.length > 0) {
    let changed = false;
    const nextOverrides = data.managerOverrides.map((override) => {
      const overrideMode =
        normalizeMode(override?.commissionMode) ||
        normalizeMode(data.commissionMode) ||
        normalizeMode(data.managerModeSnapshot);
      const overrideResult = splitItems(override?.items, {
        entry: data,
        position: override?.position,
        mode: overrideMode,
        tipRatio: 1,
      });
      if (!overrideResult.changed) return override;
      changed = true;
      stats.managerOverridesChanged += 1;
      if (overrideResult.modeSource === "inferred") stats.inferredModes += 1;
      return {
        ...override,
        items: overrideResult.items,
      };
    });
    if (changed) patch.managerOverrides = nextOverrides;
  }

  return { patch, stats, hasChanges: Object.keys(patch).length > 0 };
}

async function commitBatches(db, updates) {
  let batch = db.batch();
  let inBatch = 0;
  let committed = 0;

  for (const row of updates) {
    batch.update(row.ref, {
      ...row.patch,
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
  let flexiContracts = 0;
  let changedContracts = 0;
  let changedItems = 0;
  let changedResults = 0;
  let changedOverrides = 0;
  let skippedAlreadySplit = 0;
  let skippedNoLegacyImmediate = 0;
  let skippedMissingCoefficient = 0;
  let inferredModes = 0;
  const updates = [];

  for (const docSnap of snap.docs) {
    scanned += 1;
    const data = docSnap.data() ?? {};
    const entryType =
      typeof data.entryType === "string" ? data.entryType.trim().toLowerCase() : "contract";
    if (entryType !== "contract") continue;
    if (data.productKey !== "flexi") continue;
    flexiContracts += 1;

    const { patch, stats, hasChanges } = buildPatchForEntry(data);
    if (stats.skippedReason === "already-split") skippedAlreadySplit += 1;
    if (stats.skippedReason === "no-legacy-immediate") skippedNoLegacyImmediate += 1;
    if (stats.skippedReason === "missing-coefficient") skippedMissingCoefficient += 1;
    inferredModes += stats.inferredModes;

    if (!hasChanges) continue;
    changedContracts += 1;
    if (stats.itemChanged) changedItems += 1;
    if (stats.resultChanged) changedResults += 1;
    changedOverrides += stats.managerOverridesChanged;
    updates.push({
      ref: docSnap.ref,
      patch,
      path: docSnap.ref.path,
      contractNumber:
        typeof data.contractNumber === "string" && data.contractNumber.trim()
          ? data.contractNumber.trim()
          : "-",
      clientName:
        typeof data.clientName === "string" && data.clientName.trim()
          ? data.clientName.trim()
          : "-",
    });
  }

  console.log("=== FLEXI immediate split items fix ===");
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`Scanned entries: ${scanned}`);
  console.log(`FLEXI contracts: ${flexiContracts}`);
  console.log(`Changed contracts: ${changedContracts}`);
  console.log(`Changed root items: ${changedItems}`);
  console.log(`Changed result.items: ${changedResults}`);
  console.log(`Changed manager override item sets: ${changedOverrides}`);
  console.log(`Mode inferred count: ${inferredModes}`);
  console.log(`Skipped already split: ${skippedAlreadySplit}`);
  console.log(`Skipped without legacy immediate row: ${skippedNoLegacyImmediate}`);
  console.log(`Skipped missing manager coefficient: ${skippedMissingCoefficient}`);

  if (updates.length > 0) {
    console.log("\nSample updates:");
    updates.slice(0, 15).forEach((row) => {
      console.log(`- ${row.path} | contract=${row.contractNumber} | client=${row.clientName}`);
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
