#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const BATCH_LIMIT = 350;
const HISTORICAL_VALID_FROM = "2019-08-01";
const CURRENT_VALID_FROM = "2026-04-01";
const TIP_CONTRACT_PERCENT_MIN = 5;
const TIP_CONTRACT_PERCENT_MAX = 95;

const POSITIONS = [
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
];

const POSITION_SET = new Set(POSITIONS);

const HISTORICAL_COEFFICIENTS = {
  poradce1: 0.0416,
  poradce2: 0.0464,
  poradce3: 0.0504,
  poradce4: 0.0629,
  poradce5: 0.0707,
  poradce6: 0.0756,
  poradce7: 0.0844,
  poradce8: 0.0895,
  poradce9: 0.0933,
  poradce10: 0.0959,
  manazer4: 0.0756,
  manazer5: 0.0844,
  manazer6: 0.0927,
  manazer7: 0.1008,
  manazer8: 0.1096,
  manazer9: 0.1172,
  manazer10: 0.126,
};

const hasArg = (name) => process.argv.includes(name);

const roundToCents = (value) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toNonNegativeNumber = (value) => Math.max(0, toNumber(value));

const normalizeEmail = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized : null;
};

const normalizePosition = (value) =>
  typeof value === "string" && POSITION_SET.has(value) ? value : null;

const normalizeMode = (value) =>
  value === "accelerated" || value === "standard" ? value : null;

const paymentsPerYear = (frequencyRaw) => {
  switch (frequencyRaw) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    case "annual":
    default:
      return 1;
  }
};

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(
      trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : trimmed
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

const toIsoDay = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  }
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
};

const isHistoricalPeriod = (signedIso) =>
  typeof signedIso === "string" &&
  signedIso >= HISTORICAL_VALID_FROM &&
  signedIso < CURRENT_VALID_FROM;

const amountForCalculation = (entry) => {
  const fromCalculation = toNumber(entry?.calculationInputAmount);
  if (fromCalculation > 0) return fromCalculation;
  const fromInput = toNumber(entry?.inputAmount);
  if (fromInput > 0) return fromInput;
  const fromEffective = toNumber(entry?.effectiveInputAmount);
  if (fromEffective > 0) return fromEffective;
  return 0;
};

const calculateGrossAllianzAuto = ({ amount, frequencyRaw, position }) => {
  const coefficient = HISTORICAL_COEFFICIENTS[position];
  if (!Number.isFinite(coefficient)) return null;
  const annualPremium = amount * paymentsPerYear(frequencyRaw);
  const immediate = annualPremium * coefficient;
  return {
    items: [{ title: "📅 Okamžitá provize", amount: immediate }],
    total: immediate,
  };
};

const normalizeTipContractTitle = (title) =>
  String(title ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const isTipContractImmediateBaseTitle = (title) => {
  const normalized = normalizeTipContractTitle(title);
  return (
    normalized.includes("okamzita provize") ||
    normalized.includes("ziskatelska provize") ||
    normalized.includes("provize a101") ||
    normalized.includes("provize b0301") ||
    normalized.includes("50% z b3601") ||
    normalized.includes("50% z b36")
  );
};

const isTipContractImmediateAnnualTitle = (title) => {
  const normalized = normalizeTipContractTitle(title);
  if (!normalized.includes("za rok")) return false;
  if (normalized.includes("nasledna")) return false;
  return true;
};

const sumTipContractImmediateFirstYear = (items) => {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const annualImmediate = items.reduce((sum, item) => {
    if (!isTipContractImmediateAnnualTitle(item?.title)) return sum;
    return sum + toNumber(item?.amount);
  }, 0);
  if (annualImmediate > 0) return annualImmediate;

  return items.reduce((sum, item) => {
    if (!isTipContractImmediateBaseTitle(item?.title)) return sum;
    return sum + toNumber(item?.amount);
  }, 0);
};

const normalizeTipPercent = (value) => {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (
    rounded < TIP_CONTRACT_PERCENT_MIN ||
    rounded > TIP_CONTRACT_PERCENT_MAX
  ) {
    return null;
  }
  return rounded;
};

const applyTipContractAdjustment = ({ grossResult, tipsterPercent }) => {
  const ratio = 1 - tipsterPercent / 100;
  const items = grossResult.items.map((item) => {
    const shouldAdjust =
      isTipContractImmediateBaseTitle(item.title) ||
      isTipContractImmediateAnnualTitle(item.title);
    if (!shouldAdjust) return item;
    return {
      ...item,
      amount: roundToCents(toNumber(item.amount) * ratio),
    };
  });

  const immediateGross = roundToCents(
    sumTipContractImmediateFirstYear(grossResult.items)
  );
  const tipsterAmount = roundToCents(immediateGross * (tipsterPercent / 100));
  const immediateNet = roundToCents(immediateGross - tipsterAmount);
  const total = roundToCents(Math.max(0, grossResult.total - tipsterAmount));

  return {
    items,
    total,
    tipContractImmediateFirstYearGross: immediateGross,
    tipContractImmediateFirstYearNet: immediateNet,
    tipContractTipsterAmountFirstYear: tipsterAmount,
  };
};

const buildMainResult = ({ entry, amount, frequencyRaw, position }) => {
  const grossResult = calculateGrossAllianzAuto({
    amount,
    frequencyRaw,
    position,
  });
  if (!grossResult) return null;

  const tipsterPercent = normalizeTipPercent(entry?.tipContractTipsterPercent);
  if (tipsterPercent == null) {
    return {
      items: grossResult.items,
      total: grossResult.total,
      tipFields: null,
    };
  }

  const tipAdjusted = applyTipContractAdjustment({
    grossResult,
    tipsterPercent,
  });
  return {
    items: tipAdjusted.items,
    total: tipAdjusted.total,
    tipFields: {
      tipContractImmediateFirstYearGross:
        tipAdjusted.tipContractImmediateFirstYearGross,
      tipContractImmediateFirstYearNet:
        tipAdjusted.tipContractImmediateFirstYearNet,
      tipContractTipsterAmountFirstYear:
        tipAdjusted.tipContractTipsterAmountFirstYear,
    },
  };
};

const normalizeManagerChain = (entry) => {
  const raw = Array.isArray(entry?.managerChain) ? entry.managerChain : null;
  const source =
    raw && raw.length > 0
      ? raw
      : Array.isArray(entry?.managerOverrides)
      ? entry.managerOverrides
      : [];

  return source
    .map((row) => ({
      email: normalizeEmail(row?.email),
      position: normalizePosition(row?.position),
      commissionMode:
        normalizeMode(row?.commissionMode) ||
        normalizeMode(entry?.managerModeSnapshot) ||
        normalizeMode(entry?.commissionMode),
    }))
    .filter((row) => row.position);
};

const buildManagerOverrides = ({ entry, amount, frequencyRaw, adviserPosition }) => {
  const managerChain = normalizeManagerChain(entry);
  if (managerChain.length === 0) return [];

  const overrides = [];
  let childPosition = adviserPosition;

  managerChain.forEach((manager) => {
    const managerCoefficient = HISTORICAL_COEFFICIENTS[manager.position];
    const baselineCoefficient = HISTORICAL_COEFFICIENTS[childPosition];
    if (
      Number.isFinite(managerCoefficient) &&
      Number.isFinite(baselineCoefficient)
    ) {
      const remainingCoefficient = managerCoefficient - baselineCoefficient;
      if (remainingCoefficient > 0) {
        const amountValue =
          amount * paymentsPerYear(frequencyRaw) * remainingCoefficient;
        if (amountValue > 0) {
          overrides.push({
            email: manager.email,
            position: manager.position,
            commissionMode: manager.commissionMode,
            items: [{ title: "📅 Okamžitá provize", amount: amountValue }],
            total: amountValue,
          });
        }
      }
    }

    childPosition = manager.position;
  });

  return overrides;
};

const normalizeItemsForCompare = (items) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    title: String(item?.title ?? ""),
    amount: roundToCents(toNumber(item?.amount)),
    note: item?.note ?? null,
  }));

const normalizeOverridesForCompare = (overrides) =>
  (Array.isArray(overrides) ? overrides : []).map((row) => ({
    email: normalizeEmail(row?.email),
    position: normalizePosition(row?.position),
    commissionMode: normalizeMode(row?.commissionMode),
    total: roundToCents(toNumber(row?.total)),
    items: normalizeItemsForCompare(row?.items),
  }));

const amountsDiffer = (a, b) => Math.abs(toNumber(a) - toNumber(b)) > 0.009;

const arraysDiffer = (a, b) => JSON.stringify(a) !== JSON.stringify(b);

const ownerDocIdFromPath = (ref) => {
  const segments = ref.path.split("/");
  const usersIdx = segments.indexOf("users");
  return usersIdx >= 0 && segments[usersIdx + 1] ? segments[usersIdx + 1] : null;
};

function buildPatchForEntry(docSnap) {
  const entry = docSnap.data() ?? {};
  const signedIso = toIsoDay(entry.contractSignedDate);
  if (!isHistoricalPeriod(signedIso)) {
    return { skipped: true, reason: signedIso ? "outside-period" : "missing-date" };
  }

  const position = normalizePosition(entry.position);
  if (!position) return { skipped: true, reason: "missing-position", signedIso };

  const amount = toNonNegativeNumber(amountForCalculation(entry));
  if (!(amount > 0)) return { skipped: true, reason: "invalid-amount", signedIso };

  const frequencyRaw =
    typeof entry.frequencyRaw === "string" ? entry.frequencyRaw : "annual";
  const result = buildMainResult({ entry, amount, frequencyRaw, position });
  if (!result) return { skipped: true, reason: "calculation-failed", signedIso };

  const managerOverrides = buildManagerOverrides({
    entry,
    amount,
    frequencyRaw,
    adviserPosition: position,
  });

  const patch = {};
  const stats = {
    mainChanged: false,
    resultChanged: false,
    managerOverridesChanged: false,
    tipFieldsChanged: false,
    tipContract: result.tipFields != null,
  };

  if (
    arraysDiffer(normalizeItemsForCompare(entry.items), normalizeItemsForCompare(result.items)) ||
    amountsDiffer(entry.total, result.total)
  ) {
    patch.items = result.items;
    patch.total = result.total;
    stats.mainChanged = true;
  }

  if (
    entry.result &&
    typeof entry.result === "object" &&
    !Array.isArray(entry.result)
  ) {
    if (
      arraysDiffer(
        normalizeItemsForCompare(entry.result.items),
        normalizeItemsForCompare(result.items)
      ) ||
      amountsDiffer(entry.result.total, result.total)
    ) {
      patch.result = {
        ...entry.result,
        items: result.items,
        total: result.total,
      };
      stats.resultChanged = true;
    }
  } else {
    patch.result = {
      items: result.items,
      total: result.total,
    };
    stats.resultChanged = true;
  }

  if (
    arraysDiffer(
      normalizeOverridesForCompare(entry.managerOverrides),
      normalizeOverridesForCompare(managerOverrides)
    )
  ) {
    patch.managerOverrides = managerOverrides;
    stats.managerOverridesChanged = true;
  }

  if (result.tipFields) {
    Object.entries(result.tipFields).forEach(([key, value]) => {
      if (amountsDiffer(entry[key], value)) {
        patch[key] = value;
        stats.tipFieldsChanged = true;
      }
    });
  }

  const hasChanges = Object.keys(patch).length > 0;
  const ownerDocId = ownerDocIdFromPath(docSnap.ref);
  const ownerEmail = normalizeEmail(entry.userEmail) ?? ownerDocId ?? "unknown";

  return {
    skipped: false,
    hasChanges,
    signedIso,
    patch,
    stats,
    meta: {
      path: docSnap.ref.path,
      ownerEmail,
      entryId: docSnap.id,
      contractNumber:
        typeof entry.contractNumber === "string" && entry.contractNumber.trim()
          ? entry.contractNumber.trim()
          : "—",
      clientName:
        typeof entry.clientName === "string" && entry.clientName.trim()
          ? entry.clientName.trim()
          : "—",
      signedIso,
      amount,
      frequencyRaw,
      position,
      oldTotal: toNumber(entry.total),
      newTotal: result.total,
      oldOverrides: Array.isArray(entry.managerOverrides)
        ? entry.managerOverrides.length
        : 0,
      newOverrides: managerOverrides.length,
    },
  };
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

async function commitBatches(db, updates) {
  let batch = db.batch();
  let inBatch = 0;
  let committed = 0;
  const now = new Date();

  for (const update of updates) {
    batch.update(update.ref, {
      ...update.patch,
      updatedAt: now,
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
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert(credentials),
    });
  const db = getFirestore(app);

  const snap = await db
    .collectionGroup("entries")
    .where("productKey", "==", "allianzAuto")
    .get();

  const stats = {
    scannedAllianzAuto: snap.size,
    historicalCandidates: 0,
    changedEntries: 0,
    mainChanged: 0,
    resultChanged: 0,
    managerOverridesChanged: 0,
    tipContracts: 0,
    tipFieldsChanged: 0,
    skippedMissingDate: 0,
    skippedOutsidePeriod: 0,
    skippedMissingPosition: 0,
    skippedInvalidAmount: 0,
    skippedOther: 0,
  };
  const updates = [];

  for (const docSnap of snap.docs) {
    const built = buildPatchForEntry(docSnap);
    if (built.skipped) {
      switch (built.reason) {
        case "missing-date":
          stats.skippedMissingDate += 1;
          break;
        case "outside-period":
          stats.skippedOutsidePeriod += 1;
          break;
        case "missing-position":
          stats.skippedMissingPosition += 1;
          break;
        case "invalid-amount":
          stats.skippedInvalidAmount += 1;
          break;
        default:
          stats.skippedOther += 1;
          break;
      }
      continue;
    }

    stats.historicalCandidates += 1;
    if (built.stats.tipContract) stats.tipContracts += 1;
    if (!built.hasChanges) continue;

    stats.changedEntries += 1;
    if (built.stats.mainChanged) stats.mainChanged += 1;
    if (built.stats.resultChanged) stats.resultChanged += 1;
    if (built.stats.managerOverridesChanged) stats.managerOverridesChanged += 1;
    if (built.stats.tipFieldsChanged) stats.tipFieldsChanged += 1;
    updates.push({
      ref: docSnap.ref,
      patch: built.patch,
      meta: built.meta,
    });
  }

  console.log("=== Allianz Auto historical coefficient fix ===");
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(
    `Historical period: ${HISTORICAL_VALID_FROM} <= contractSignedDate < ${CURRENT_VALID_FROM}`
  );
  console.log(`Allianz Auto entries scanned: ${stats.scannedAllianzAuto}`);
  console.log(`Historical candidates: ${stats.historicalCandidates}`);
  console.log(`Changed entries: ${stats.changedEntries}`);
  console.log(`Main items/total changed: ${stats.mainChanged}`);
  console.log(`Result object changed: ${stats.resultChanged}`);
  console.log(`Manager overrides changed: ${stats.managerOverridesChanged}`);
  console.log(`Tip contracts in historical candidates: ${stats.tipContracts}`);
  console.log(`Tip fields changed: ${stats.tipFieldsChanged}`);
  console.log(`Skipped missing date: ${stats.skippedMissingDate}`);
  console.log(`Skipped outside period: ${stats.skippedOutsidePeriod}`);
  console.log(`Skipped missing position: ${stats.skippedMissingPosition}`);
  console.log(`Skipped invalid amount: ${stats.skippedInvalidAmount}`);
  console.log(`Skipped other: ${stats.skippedOther}`);

  if (updates.length > 0) {
    console.log("\nSample updates:");
    updates.slice(0, 15).forEach(({ meta }) => {
      console.log(
        `- ${meta.path} | signed=${meta.signedIso} | contract=${meta.contractNumber} | client=${meta.clientName} | pos=${meta.position} | total ${roundToCents(
          meta.oldTotal
        )} -> ${roundToCents(meta.newTotal)} | overrides ${meta.oldOverrides} -> ${
          meta.newOverrides
        }`
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
