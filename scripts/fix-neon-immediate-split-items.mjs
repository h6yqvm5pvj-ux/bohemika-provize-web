#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const BATCH_LIMIT = 350;
const CURRENT_VALID_FROM = "2024-07-01";
const HISTORICAL_VALID_FROM = "2019-10-01";
const CURRENT_MAX_YEARS = 15;
const NOTE =
  "Pro okamžité vyplacení podmíněno zpracováním karty klienta dle podmínek!";

const POSITIONS = new Set([
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
  "poradce7",
  "poradce8",
  "poradce9",
  "poradce10",
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
  "manazer10",
]);

const A101 = {
  poradce1: 1.2,
  poradce2: 1.38,
  poradce3: 1.502,
  poradce4: 2.16,
  poradce5: 2.4,
  poradce6: 2.58,
  poradce7: 2.702,
  poradce8: 2.881,
  poradce9: 3.002,
  poradce10: 3.122,
  manazer4: 2.404,
  manazer5: 2.683,
  manazer6: 2.962,
  manazer7: 3.243,
  manazer8: 3.522,
  manazer9: 3.802,
  manazer10: 4.083,
};

const B0301 = {
  poradce1: 0.444,
  poradce2: 0.489,
  poradce3: 0.533,
  poradce4: 0.622,
  poradce5: 0.645,
  poradce6: 0.665,
  poradce7: 0.687,
  poradce8: 0.71,
  poradce9: 0.73,
  poradce10: 0.752,
  manazer4: 0.633,
  manazer5: 0.69,
  manazer6: 0.747,
  manazer7: 0.807,
  manazer8: 0.863,
  manazer9: 0.92,
  manazer10: 0.987,
};

const B3601_HALF = {
  poradce1: 0.4445,
  poradce2: 0.489,
  poradce3: 0.5335,
  poradce4: 0.689,
  poradce5: 0.761,
  poradce6: 0.8,
  poradce7: 0.8385,
  poradce8: 0.877,
  poradce9: 0.9165,
  poradce10: 0.955,
  manazer4: 0.7575,
  manazer5: 0.8395,
  manazer6: 0.9205,
  manazer7: 1.0015,
  manazer8: 1.083,
  manazer9: 1.1635,
  manazer10: 1.2445,
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
  typeof value === "string" && POSITIONS.has(value) ? value : null;

const isHistoricalPeriod = (signedIso) =>
  typeof signedIso === "string" &&
  signedIso >= HISTORICAL_VALID_FROM &&
  signedIso < CURRENT_VALID_FROM;

const normalizeDurationYears = (years) => {
  const raw = typeof years === "number" && Number.isFinite(years) ? years : CURRENT_MAX_YEARS;
  return Math.min(CURRENT_MAX_YEARS, Math.max(1, Math.floor(raw)));
};

const isLegacyImmediateTitle = (title) => {
  const normalized = normalizeTitle(title);
  return (
    normalized.includes("okamzita provize") &&
    !normalized.includes("a101") &&
    !normalized.includes("b0301") &&
    !normalized.includes("b3601")
  );
};

const isSplitImmediateTitle = (title) => {
  const normalized = normalizeTitle(title);
  return (
    normalized === "provize a101" ||
    normalized === "provize b0301" ||
    normalized === "provize 50% z b3601"
  );
};

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

const toIsoDay = (value) => {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
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
  const includeB3601 = mode === "accelerated";
  const definitions = [
    { title: "💸 Provize A101", coefficient: A101[position] },
    {
      title: "💸 Provize B0301",
      coefficient: B0301[position],
      note: NOTE,
    },
    ...(includeB3601
      ? [{ title: "💸 Provize 50% z B3601", coefficient: B3601_HALF[position] }]
      : []),
  ].filter((part) => Number.isFinite(part.coefficient) && part.coefficient > 0);

  const coefficientTotal = definitions.reduce((sum, part) => sum + part.coefficient, 0);
  if (definitions.length === 0 || coefficientTotal <= 0) return null;

  const totalCents = toCents(amount);
  const partCents = definitions.map((part) => ({
    title: part.title,
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
    ...(part.note ? { note: part.note } : {}),
  }));
}

function inferModeFromAmount({
  entry,
  position,
  immediateAmount,
  signedIso,
  tipRatio = 1,
}) {
  const explicit = normalizeMode(entry?.commissionMode);
  if (explicit) return { mode: explicit, source: "stored" };

  const monthly = toNumber(entry?.inputAmount);
  if (!monthly || !Number.isFinite(monthly) || monthly <= 0) {
    return { mode: "standard", source: "fallback" };
  }

  const annual = monthly * 12;
  const years = normalizeDurationYears(entry?.durationYears);
  const standardCoefficient = (A101[position] + B0301[position]) / 100;
  const acceleratedCoefficient =
    (A101[position] + B0301[position] + B3601_HALF[position]) / 100;
  const expectedStandard = annual * years * standardCoefficient * tipRatio;
  const expectedAccelerated = annual * years * acceleratedCoefficient * tipRatio;
  const standardDiff = Math.abs(expectedStandard - immediateAmount);
  const acceleratedDiff = Math.abs(expectedAccelerated - immediateAmount);

  if (acceleratedDiff < standardDiff) {
    return { mode: "accelerated", source: "inferred" };
  }
  return { mode: "standard", source: signedIso ? "inferred" : "fallback" };
}

function splitItems(items, { entry, position, mode, signedIso, tipRatio = 1 }) {
  if (!Array.isArray(items) || items.length === 0) {
    return { changed: false, items, reason: "no-items" };
  }

  if (items.some((item) => isSplitImmediateTitle(item?.title))) {
    return { changed: false, items, reason: "already-split" };
  }

  const idx = items.findIndex((item) => isLegacyImmediateTitle(item?.title));
  if (idx < 0) return { changed: false, items, reason: "no-legacy-immediate" };

  const usedPosition = normalizePosition(position);
  if (!usedPosition) return { changed: false, items, reason: "missing-position" };

  if (isHistoricalPeriod(signedIso)) {
    return { changed: false, items, reason: "historical-period" };
  }

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
          signedIso,
          tipRatio,
        });
  if (!modeResolution.mode) return { changed: false, items, reason: "missing-mode" };

  const split = splitImmediateAmount(immediateAmount, usedPosition, modeResolution.mode);
  if (!split) return { changed: false, items, reason: "split-failed" };

  return {
    changed: true,
    items: [...items.slice(0, idx), ...split, ...items.slice(idx + 1)],
    reason: "split",
    mode: modeResolution.mode,
    modeSource: modeResolution.source,
  };
}

function tipRatioForEntry(entry) {
  const percent = toNumber(entry?.tipContractTipsterPercent);
  if (!Number.isFinite(percent) || percent <= 0) return 1;
  return Math.max(0, 1 - percent / 100);
}

function buildPatchForEntry(data) {
  const signedIso = toIsoDay(data.contractSignedDate);
  const entryPosition = normalizePosition(data.position);
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
    signedIso,
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
      signedIso,
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
      const overridePosition = normalizePosition(override?.position);
      const overrideMode =
        normalizeMode(override?.commissionMode) ||
        normalizeMode(data.commissionMode) ||
        normalizeMode(data.managerModeSnapshot);
      const overrideResult = splitItems(override?.items, {
        entry: data,
        position: overridePosition,
        mode: overrideMode,
        signedIso,
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

  return { patch, stats, hasChanges: Object.keys(patch).length > 0, signedIso };
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
  let neonContracts = 0;
  let changedContracts = 0;
  let changedItems = 0;
  let changedResults = 0;
  let changedOverrides = 0;
  let skippedHistorical = 0;
  let skippedAlreadySplit = 0;
  let skippedNoLegacyImmediate = 0;
  let skippedMissingPosition = 0;
  let inferredModes = 0;
  const updates = [];

  for (const docSnap of snap.docs) {
    scanned += 1;
    const data = docSnap.data() ?? {};
    const entryType =
      typeof data.entryType === "string" ? data.entryType.trim().toLowerCase() : "contract";
    if (entryType !== "contract") continue;
    if (data.productKey !== "neon") continue;
    neonContracts += 1;

    const { patch, stats, hasChanges, signedIso } = buildPatchForEntry(data);
    if (stats.skippedReason === "historical-period") skippedHistorical += 1;
    if (stats.skippedReason === "already-split") skippedAlreadySplit += 1;
    if (stats.skippedReason === "no-legacy-immediate") skippedNoLegacyImmediate += 1;
    if (stats.skippedReason === "missing-position") skippedMissingPosition += 1;
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
      signedIso: signedIso ?? "-",
      clientName:
        typeof data.clientName === "string" && data.clientName.trim()
          ? data.clientName.trim()
          : "-",
    });
  }

  console.log("=== NEON immediate split items fix ===");
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`Scanned entries: ${scanned}`);
  console.log(`NEON contracts: ${neonContracts}`);
  console.log(`Changed contracts: ${changedContracts}`);
  console.log(`Changed root items: ${changedItems}`);
  console.log(`Changed result.items: ${changedResults}`);
  console.log(`Changed manager override item sets: ${changedOverrides}`);
  console.log(`Mode inferred count: ${inferredModes}`);
  console.log(`Skipped historical contracts: ${skippedHistorical}`);
  console.log(`Skipped already split: ${skippedAlreadySplit}`);
  console.log(`Skipped without legacy immediate row: ${skippedNoLegacyImmediate}`);
  console.log(`Skipped missing position: ${skippedMissingPosition}`);

  if (updates.length > 0) {
    console.log("\nSample updates:");
    updates.slice(0, 15).forEach((row) => {
      console.log(
        `- ${row.path} | contract=${row.contractNumber} | signed=${row.signedIso} | client=${row.clientName}`
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
