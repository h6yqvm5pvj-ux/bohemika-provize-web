#!/usr/bin/env node

import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const jiti = createJiti(import.meta.url);
const { calculateAllianzAuto } = jiti("../src/app/lib/productFormulas/allianzAuto.ts");
const {
  normalizeCommissionCoefficientSet,
  signedDateForCoefficientSetOverride,
} = jiti("../src/app/lib/productFormulas/coefficientSets.ts");

const TARGET_PATH =
  "users/jakub.rauscher@bohemika.eu/entries/idem_7c577d872d55ad3108358096eca861776bd2d028";
const TARGET_CONTRACT_NUMBER = "789525166";
const TARGET_PRODUCT = "allianzAuto";
const OLD_POSITION = "poradce6";
const NEW_POSITION = "poradce4";
const EXPECTED_SIGNED_DATE = "2023-06-05";

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
const FREQUENCIES = new Set(["monthly", "quarterly", "semiannual", "annual"]);
const TIP_PERCENT_MIN = 5;
const TIP_PERCENT_MAX = 95;

const hasArg = (name) => process.argv.includes(name);

const normalizeEmail = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const normalizePosition = (value) =>
  typeof value === "string" && POSITIONS.has(value) ? value : null;

const normalizeFrequency = (value) =>
  typeof value === "string" && FREQUENCIES.has(value) ? value : "annual";

const normalizeContractNumber = (value) =>
  String(value ?? "").replace(/\s+/g, "").trim();

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
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
    const date = new Date(trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : trimmed);
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

const loadCredentials = () => {
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
};

const amountForCalculation = (entry) => {
  const calculation = toNumber(entry?.calculationInputAmount);
  if (calculation > 0) return calculation;
  const input = toNumber(entry?.inputAmount);
  if (input > 0) return input;
  const effective = toNumber(entry?.effectiveInputAmount);
  if (effective > 0) return effective;
  return 0;
};

const normalizeTextKey = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeCommissionCode = (value) =>
  typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "") : "";

const isTotalRow = (item) => {
  const code = normalizeCommissionCode(item?.code);
  return code === "TOTAL" || normalizeTextKey(item?.title).includes("celkem");
};

const itemKey = (item) => {
  const code = normalizeCommissionCode(item?.code);
  return code ? `code:${code}` : normalizeTextKey(item?.title);
};

const itemMultiplier = (item) => {
  const title = normalizeTextKey(item?.title);
  if (title.includes("2 5")) return 4;
  if (title.includes("5 10")) return 6;
  return 1;
};

const totalWithMultipliers = (items) => {
  const clean = (Array.isArray(items) ? items : []).filter(
    (item) => !item?.excludeFromTotal && !isTotalRow(item)
  );
  const yearly = clean.filter((item) =>
    normalizeTextKey(item?.title).includes("provize za rok")
  );
  const source = yearly.length > 0 ? yearly : clean;
  return source.reduce((sum, item) => sum + toNumber(item?.amount) * itemMultiplier(item), 0);
};

const normalizeItemForStore = (item, { round = false } = {}) => ({
  title: String(item?.title ?? ""),
  amount: round ? roundMoney(toNumber(item?.amount)) : toNumber(item?.amount),
  ...(item?.code ? { code: String(item.code) } : {}),
  ...(item?.note ? { note: String(item.note) } : {}),
  ...(item?.excludeFromTotal ? { excludeFromTotal: true } : {}),
});

const comparableItems = (items) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    title: String(item?.title ?? ""),
    amount: Math.round(toNumber(item?.amount) * 1e8) / 1e8,
    code: item?.code ?? null,
    note: item?.note ?? null,
    excludeFromTotal: Boolean(item?.excludeFromTotal),
  }));

const comparableOverrides = (overrides) =>
  (Array.isArray(overrides) ? overrides : []).map((override) => ({
    email: normalizeEmail(override?.email),
    position: normalizePosition(override?.position),
    commissionMode:
      override?.commissionMode === "accelerated" || override?.commissionMode === "standard"
        ? override.commissionMode
        : null,
    total: Math.round(toNumber(override?.total) * 1e8) / 1e8,
    items: comparableItems(override?.items),
  }));

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
  return normalized.includes("za rok") && !normalized.includes("nasledna");
};

const sumTipContractImmediateFirstYear = (items) => {
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
  if (rounded < TIP_PERCENT_MIN || rounded > TIP_PERCENT_MAX) return null;
  return rounded;
};

const applyTipContractAdjustment = ({ items, total, tipsterPercent }) => {
  const ratio = 1 - tipsterPercent / 100;
  const adjustedItems = items.map((item) => {
    const shouldAdjust =
      isTipContractImmediateBaseTitle(item.title) ||
      isTipContractImmediateAnnualTitle(item.title);
    if (!shouldAdjust) return item;
    return {
      ...item,
      amount: roundMoney(toNumber(item.amount) * ratio),
    };
  });

  const immediateGross = roundMoney(sumTipContractImmediateFirstYear(items));
  const tipsterAmount = roundMoney(immediateGross * (tipsterPercent / 100));
  const immediateNet = roundMoney(immediateGross - tipsterAmount);

  return {
    items: adjustedItems,
    total: roundMoney(Math.max(0, total - tipsterAmount)),
    tipContractImmediateFirstYearGross: immediateGross,
    tipContractImmediateFirstYearNet: immediateNet,
    tipContractTipsterAmountFirstYear: tipsterAmount,
  };
};

const signedDateForEntry = (entry, signedIso) =>
  signedDateForCoefficientSetOverride({
    product: entry.productKey,
    contractSignedDateIso: signedIso,
    coefficientSetOverride: normalizeCommissionCoefficientSet(
      entry.commissionCoefficientSetOverride
    ),
  });

const calculateAllianzResult = ({ entry, amount, frequencyRaw, position, signedIso }) => {
  const effectiveSignedIso = signedDateForEntry(entry, signedIso);
  return calculateAllianzAuto(amount, frequencyRaw, position, effectiveSignedIso);
};

const diffItemsByKey = (upperItems, lowerItems) => {
  const upperMap = new Map();
  upperItems
    .filter((item) => !isTotalRow(item))
    .forEach((item) => {
      const key = itemKey(item);
      const prev = upperMap.get(key);
      upperMap.set(key, {
        title: item.title ?? prev?.title ?? key,
        amount: (prev?.amount ?? 0) + toNumber(item.amount),
        code: item.code ?? prev?.code ?? null,
        note: item.note ?? prev?.note ?? null,
        excludeFromTotal: Boolean(prev?.excludeFromTotal || item.excludeFromTotal),
      });
    });

  const diffItems = [];
  lowerItems
    .filter((item) => !isTotalRow(item))
    .forEach((item) => {
      const key = itemKey(item);
      const upper = upperMap.get(key);
      const remaining = toNumber(upper?.amount) - toNumber(item?.amount);
      if (remaining > 0) {
        diffItems.push(
          normalizeItemForStore(
            {
              title: upper?.title ?? item.title,
              amount: remaining,
              code: upper?.code ?? item.code ?? null,
              note: upper?.note ?? item.note ?? null,
              excludeFromTotal: Boolean(upper?.excludeFromTotal || item.excludeFromTotal),
            },
            { round: true }
          )
        );
      }
      upperMap.delete(key);
    });

  upperMap.forEach((value) => {
    if (toNumber(value.amount) > 0) {
      diffItems.push(normalizeItemForStore(value, { round: true }));
    }
  });

  return diffItems;
};

const computeManagerOverrides = ({ entry, amount, frequencyRaw, signedIso }) => {
  const managerChain = Array.isArray(entry?.managerChain) ? entry.managerChain : [];
  const adviserPosition = normalizePosition(entry?.position);
  if (!adviserPosition || managerChain.length === 0) {
    return Array.isArray(entry?.managerOverrides) ? entry.managerOverrides : [];
  }

  const overrides = [];
  let childPositionForBaseline = adviserPosition;

  for (const manager of managerChain) {
    const managerPosition = normalizePosition(manager?.position);
    if (!managerPosition || !childPositionForBaseline) continue;

    const managerResult = calculateAllianzResult({
      entry,
      amount,
      frequencyRaw,
      position: managerPosition,
      signedIso,
    });
    const baselineResult = calculateAllianzResult({
      entry,
      amount,
      frequencyRaw,
      position: childPositionForBaseline,
      signedIso,
    });
    if (!managerResult || !baselineResult) {
      childPositionForBaseline = managerPosition;
      continue;
    }

    const diffItems = diffItemsByKey(managerResult.items, baselineResult.items);
    const total = roundMoney(totalWithMultipliers(diffItems));
    if (diffItems.length > 0 && total > 0) {
      overrides.push({
        email: normalizeEmail(manager?.email) ?? null,
        position: managerPosition,
        commissionMode:
          manager?.commissionMode === "accelerated" || manager?.commissionMode === "standard"
            ? manager.commissionMode
            : null,
        items: diffItems,
        total,
      });
    }

    childPositionForBaseline = managerPosition;
  }

  return overrides;
};

const buildCalculation = (entry) => {
  const nextEntry = { ...entry, position: NEW_POSITION };
  const amount = amountForCalculation(nextEntry);
  if (amount <= 0) throw new Error("Cannot calculate commission without amount.");

  const signedIso = toIsoDay(nextEntry.contractSignedDate);
  if (signedIso !== EXPECTED_SIGNED_DATE) {
    throw new Error(`Unexpected signed date ${signedIso}; expected ${EXPECTED_SIGNED_DATE}.`);
  }

  const frequencyRaw = normalizeFrequency(nextEntry.frequencyRaw);
  const result = calculateAllianzResult({
    entry: nextEntry,
    amount,
    frequencyRaw,
    position: NEW_POSITION,
    signedIso,
  });
  if (!result) throw new Error("Allianz auto calculation failed.");

  let nextItems = result.items.map((item) => normalizeItemForStore(item));
  let nextTotal = roundMoney(result.total);
  const tipUpdate = {};
  const tipPercent = normalizeTipPercent(nextEntry.tipContractTipsterPercent);
  if (tipPercent != null) {
    const adjusted = applyTipContractAdjustment({
      items: nextItems,
      total: nextTotal,
      tipsterPercent: tipPercent,
    });
    nextItems = adjusted.items;
    nextTotal = adjusted.total;
    tipUpdate.tipContractImmediateFirstYearGross =
      adjusted.tipContractImmediateFirstYearGross;
    tipUpdate.tipContractImmediateFirstYearNet =
      adjusted.tipContractImmediateFirstYearNet;
    tipUpdate.tipContractTipsterAmountFirstYear =
      adjusted.tipContractTipsterAmountFirstYear;
  }

  return {
    signedIso,
    amount,
    frequencyRaw,
    items: nextItems,
    total: nextTotal,
    result: {
      items: nextItems,
      total: nextTotal,
    },
    managerOverrides: computeManagerOverrides({
      entry: nextEntry,
      amount,
      frequencyRaw,
      signedIso,
    }),
    tipUpdate,
  };
};

const buildPatch = (entry, calculation) => {
  const patch = {
    position: NEW_POSITION,
  };

  if (JSON.stringify(comparableItems(entry.items)) !== JSON.stringify(comparableItems(calculation.items))) {
    patch.items = calculation.items;
  }
  if (Math.abs(toNumber(entry.total) - calculation.total) > 0.000001) {
    patch.total = calculation.total;
  }
  if (
    !entry.result ||
    typeof entry.result !== "object" ||
    Array.isArray(entry.result) ||
    JSON.stringify(comparableItems(entry.result.items)) !==
      JSON.stringify(comparableItems(calculation.result.items)) ||
    Math.abs(toNumber(entry.result.total) - calculation.result.total) > 0.000001
  ) {
    patch.result = {
      ...(entry.result && typeof entry.result === "object" && !Array.isArray(entry.result)
        ? entry.result
        : {}),
      ...calculation.result,
    };
  }
  if (
    JSON.stringify(comparableOverrides(entry.managerOverrides)) !==
    JSON.stringify(comparableOverrides(calculation.managerOverrides))
  ) {
    patch.managerOverrides = calculation.managerOverrides;
  }
  Object.entries(calculation.tipUpdate).forEach(([key, value]) => {
    if (Math.abs(toNumber(entry[key]) - toNumber(value)) > 0.000001) {
      patch[key] = value;
    }
  });

  return patch;
};

const compactValue = (value) => JSON.stringify(value, null, 2);

async function main() {
  const apply = hasArg("--apply");
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const ref = db.doc(TARGET_PATH);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Target document not found: ${TARGET_PATH}`);

  const entry = snap.data() ?? {};
  const contractNumber = normalizeContractNumber(entry.contractNumber);
  if (contractNumber !== TARGET_CONTRACT_NUMBER) {
    throw new Error(`Unexpected contract number ${contractNumber}.`);
  }
  if (entry.productKey !== TARGET_PRODUCT) {
    throw new Error(`Unexpected product ${entry.productKey}.`);
  }
  if (normalizePosition(entry.position) !== OLD_POSITION && normalizePosition(entry.position) !== NEW_POSITION) {
    throw new Error(`Unexpected position ${entry.position}.`);
  }
  if (normalizePosition(entry.position) === NEW_POSITION) {
    console.log("Position is already fixed; recalculating derived fields check only.");
  }

  const calculation = buildCalculation(entry);
  const patch = buildPatch(entry, calculation);
  const updateKeys = Object.keys(patch);

  console.log(`mode=${apply ? "APPLY" : "DRY_RUN"}`);
  console.log(`path=${TARGET_PATH}`);
  console.log(`contract=${TARGET_CONTRACT_NUMBER}`);
  console.log(`signed=${calculation.signedIso}`);
  console.log(`amount=${calculation.amount}`);
  console.log(`frequency=${calculation.frequencyRaw}`);
  console.log(`position=${entry.position} -> ${NEW_POSITION}`);
  console.log(`total=${roundMoney(toNumber(entry.total))} -> ${calculation.total}`);
  console.log(`updateKeys=${updateKeys.join(",") || "none"}`);
  console.log("nextItems=");
  console.log(compactValue(calculation.items));
  console.log("nextManagerOverrides=");
  console.log(compactValue(calculation.managerOverrides));

  if (!apply) {
    console.log("Dry run complete. Run with --apply to persist.");
    return;
  }

  if (updateKeys.length === 0) {
    console.log("No changes to write.");
    return;
  }

  await ref.update({
    ...patch,
    updatedAt: new Date(),
  });
  console.log(`Updated ${TARGET_PATH}`);
}

main().catch((error) => {
  console.error("Fix failed:", error?.stack ?? error?.message ?? error);
  process.exit(1);
});
