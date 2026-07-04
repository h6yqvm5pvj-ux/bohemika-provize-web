#!/usr/bin/env node

import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const jiti = createJiti(import.meta.url);
const { calculateCppAuto } = jiti("../src/app/lib/productFormulas/cppAuto.ts");
const { calculateSlaviaAuto } = jiti("../src/app/lib/productFormulas/slaviaAuto.ts");
const { calculateAllianzAuto } = jiti("../src/app/lib/productFormulas/allianzAuto.ts");
const { calculateCsobAuto } = jiti("../src/app/lib/productFormulas/csobAuto.ts");
const { calculateUniqaAuto } = jiti("../src/app/lib/productFormulas/uniqaAuto.ts");
const { calculatePillowAuto } = jiti("../src/app/lib/productFormulas/pillowAuto.ts");
const { calculateKooperativaAuto } = jiti(
  "../src/app/lib/productFormulas/kooperativaAuto.ts"
);
const {
  normalizeCommissionCoefficientSet,
  signedDateForCoefficientSetOverride,
} = jiti("../src/app/lib/productFormulas/coefficientSets.ts");

const BATCH_LIMIT = 350;
const AUTO_PRODUCTS = new Set([
  "cppAuto",
  "slaviaauto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowAuto",
  "kooperativaAuto",
]);
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

const parseArgValue = (key, fallback = null) => {
  const prefix = `${key}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(key);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const normalizeEmail = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const normalizeContractNumber = (value) =>
  String(value ?? "").replace(/\s+/g, "").trim();

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

const normalizePosition = (value) =>
  typeof value === "string" && POSITIONS.has(value) ? value : null;

const normalizeFrequency = (value) =>
  typeof value === "string" && FREQUENCIES.has(value) ? value : "annual";

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

const normalizeItemForStore = (item) => ({
  title: String(item?.title ?? ""),
  amount: toNumber(item?.amount),
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

const calculateAutoResult = ({
  productKey,
  amount,
  frequencyRaw,
  position,
  signedIso,
  coefficientSetOverride,
}) => {
  const effectiveSignedIso = signedDateForCoefficientSetOverride({
    product: productKey,
    contractSignedDateIso: signedIso,
    coefficientSetOverride: normalizeCommissionCoefficientSet(coefficientSetOverride),
  });
  const frequency = normalizeFrequency(frequencyRaw);

  switch (productKey) {
    case "cppAuto":
      return calculateCppAuto(amount, frequency, position, effectiveSignedIso);
    case "slaviaauto":
      return calculateSlaviaAuto(amount, frequency, position);
    case "allianzAuto":
      return calculateAllianzAuto(amount, frequency, position, effectiveSignedIso);
    case "csobAuto":
      return calculateCsobAuto(amount, frequency, position, effectiveSignedIso);
    case "uniqaAuto":
      return calculateUniqaAuto(amount, frequency, position, effectiveSignedIso);
    case "uniqaflotila":
      return calculateUniqaAuto(amount, frequency, position, effectiveSignedIso);
    case "pillowAuto":
      return calculatePillowAuto(amount, frequency, position, effectiveSignedIso);
    case "kooperativaAuto":
      return calculateKooperativaAuto(amount, frequency, position);
    default:
      return null;
  }
};

const diffItemsByKey = (upperItems, lowerItems) => {
  const upperMap = new Map();
  upperItems.filter((item) => !isTotalRow(item)).forEach((item) => {
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
  lowerItems.filter((item) => !isTotalRow(item)).forEach((item) => {
    const key = itemKey(item);
    const upper = upperMap.get(key);
    const remaining = toNumber(upper?.amount) - toNumber(item?.amount);
    if (remaining > 0) {
      diffItems.push(
        normalizeItemForStore({
          title: upper?.title ?? item.title,
          amount: roundMoney(remaining),
          code: upper?.code ?? item.code ?? null,
          note: upper?.note ?? item.note ?? null,
          excludeFromTotal: Boolean(upper?.excludeFromTotal || item.excludeFromTotal),
        })
      );
    }
    upperMap.delete(key);
  });

  upperMap.forEach((value) => {
    if (toNumber(value.amount) > 0) {
      diffItems.push(
        normalizeItemForStore({
          ...value,
          amount: roundMoney(value.amount),
        })
      );
    }
  });

  return diffItems;
};

const computeManagerOverrides = ({ entry, amount, frequencyRaw, signedIso }) => {
  const managerChain = Array.isArray(entry?.managerChain) ? entry.managerChain : [];
  const adviserPosition = normalizePosition(entry?.position);
  if (!adviserPosition || managerChain.length === 0) return Array.isArray(entry?.managerOverrides) ? entry.managerOverrides : [];

  const overrides = [];
  let childPositionForBaseline = adviserPosition;

  for (const manager of managerChain) {
    const managerPosition = normalizePosition(manager?.position);
    if (!managerPosition || !childPositionForBaseline) continue;

    const managerResult = calculateAutoResult({
      productKey: entry.productKey,
      amount,
      frequencyRaw,
      position: managerPosition,
      signedIso,
      coefficientSetOverride: entry.commissionCoefficientSetOverride,
    });
    const baselineResult = calculateAutoResult({
      productKey: entry.productKey,
      amount,
      frequencyRaw,
      position: childPositionForBaseline,
      signedIso,
      coefficientSetOverride: entry.commissionCoefficientSetOverride,
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

const buildNextContractCalculation = (entry) => {
  const position = normalizePosition(entry?.position);
  if (!position) return { ok: false, reason: "missing-position" };

  const amount = amountForCalculation(entry);
  if (amount <= 0) return { ok: false, reason: "missing-amount" };

  const signedIso = toIsoDay(entry.contractSignedDate);
  const frequencyRaw = normalizeFrequency(entry.frequencyRaw);
  const result = calculateAutoResult({
    productKey: entry.productKey,
    amount,
    frequencyRaw,
    position,
    signedIso,
    coefficientSetOverride: entry.commissionCoefficientSetOverride,
  });
  if (!result) return { ok: false, reason: "formula-missing" };

  let nextItems = result.items.map(normalizeItemForStore);
  let nextTotal = roundMoney(result.total);
  const tipPercent = normalizeTipPercent(entry.tipContractTipsterPercent);
  const tipUpdate = {};
  if (tipPercent != null) {
    const adjusted = applyTipContractAdjustment({
      items: nextItems,
      total: nextTotal,
      tipsterPercent: tipPercent,
    });
    nextItems = adjusted.items;
    nextTotal = adjusted.total;
    tipUpdate.tipContractImmediateFirstYearGross = adjusted.tipContractImmediateFirstYearGross;
    tipUpdate.tipContractImmediateFirstYearNet = adjusted.tipContractImmediateFirstYearNet;
    tipUpdate.tipContractTipsterAmountFirstYear = adjusted.tipContractTipsterAmountFirstYear;
  }

  const nextManagerOverrides = computeManagerOverrides({
    entry,
    amount,
    frequencyRaw,
    signedIso,
  });

  return {
    ok: true,
    items: nextItems,
    total: nextTotal,
    managerOverrides: nextManagerOverrides,
    tipUpdate,
  };
};

const buildUpdate = (entry, calculation) => {
  const update = {};
  if (JSON.stringify(comparableItems(entry.items)) !== JSON.stringify(comparableItems(calculation.items))) {
    update.items = calculation.items;
  }
  if (Math.abs(toNumber(entry.total) - calculation.total) > 0.000001) {
    update.total = calculation.total;
  }
  if (
    JSON.stringify(comparableOverrides(entry.managerOverrides)) !==
    JSON.stringify(comparableOverrides(calculation.managerOverrides))
  ) {
    update.managerOverrides = calculation.managerOverrides;
  }
  Object.entries(calculation.tipUpdate).forEach(([key, value]) => {
    if (Math.abs(toNumber(entry[key]) - toNumber(value)) > 0.000001) {
      update[key] = value;
    }
  });
  return update;
};

async function main() {
  const apply = hasArg("--apply");
  const verbose = hasArg("--verbose");
  const targetEmail = normalizeEmail(parseArgValue("--email"));
  const contractNumbersArg = parseArgValue("--contracts");
  const targetContracts = new Set(
    String(contractNumbersArg ?? "")
      .split(",")
      .map(normalizeContractNumber)
      .filter(Boolean)
  );
  const limitRaw = Number(parseArgValue("--limit", "0"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : null;

  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials in environment.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const snap = await db.collectionGroup("entries").get();

  const stats = {
    scanned: 0,
    autoContracts: 0,
    planned: 0,
    alreadyOk: 0,
    totalChanged: 0,
    updateKeyCounts: {},
    skipped: {},
  };
  const planned = [];

  let batch = db.batch();
  let pending = 0;
  let committed = 0;

  const commitBatch = async () => {
    if (!apply || pending === 0) return;
    await batch.commit();
    committed += pending;
    batch = db.batch();
    pending = 0;
  };

  for (const docSnap of snap.docs) {
    if (limit != null && planned.length >= limit) break;
    stats.scanned += 1;
    const entry = docSnap.data() ?? {};
    if (String(entry.entryType ?? "contract").trim().toLowerCase() !== "contract") continue;
    if (!AUTO_PRODUCTS.has(entry.productKey)) continue;
    if (targetEmail && normalizeEmail(entry.userEmail) !== targetEmail) continue;
    const contractNumber = normalizeContractNumber(entry.contractNumber);
    if (targetContracts.size > 0 && !targetContracts.has(contractNumber)) continue;

    stats.autoContracts += 1;
    const calculation = buildNextContractCalculation(entry);
    if (!calculation.ok) {
      stats.skipped[calculation.reason] = (stats.skipped[calculation.reason] ?? 0) + 1;
      continue;
    }

    const update = buildUpdate(entry, calculation);
    const updateKeys = Object.keys(update);
    if (updateKeys.length === 0) {
      stats.alreadyOk += 1;
      continue;
    }

    stats.planned += 1;
    updateKeys.forEach((key) => {
      stats.updateKeyCounts[key] = (stats.updateKeyCounts[key] ?? 0) + 1;
    });
    if (updateKeys.includes("total")) {
      stats.totalChanged += 1;
    }
    const row = {
      path: docSnap.ref.path,
      contractNumber,
      productKey: entry.productKey,
      userEmail: entry.userEmail ?? null,
      updateKeys,
      oldItems: Array.isArray(entry.items) ? entry.items.length : 0,
      newItems: calculation.items.length,
      oldTotal: toNumber(entry.total),
      newTotal: calculation.total,
    };
    planned.push(row);

    if (verbose || planned.length <= 30) {
      console.log(
        `${apply ? "UPDATE" : "PLAN"} ${row.path} | ${row.contractNumber || "bez-cisla"} | ${row.productKey} | keys=${updateKeys.join(",")} | items ${row.oldItems}->${row.newItems} | total ${roundMoney(row.oldTotal)}->${roundMoney(row.newTotal)}`
      );
    }

    if (apply) {
      batch.set(docSnap.ref, update, { merge: true });
      pending += 1;
      if (pending >= BATCH_LIMIT) await commitBatch();
    }
  }

  await commitBatch();

  console.log("\nsummary");
  console.log(`dry_run=${!apply}`);
  console.log(`scanned=${stats.scanned}`);
  console.log(`auto_contracts=${stats.autoContracts}`);
  console.log(`planned_changes=${stats.planned}`);
  console.log(`total_changed=${stats.totalChanged}`);
  console.log(`update_key_counts=${JSON.stringify(stats.updateKeyCounts)}`);
  console.log(`already_ok=${stats.alreadyOk}`);
  console.log(`skipped=${JSON.stringify(stats.skipped)}`);
  console.log(`committed=${committed}`);

  if (!apply) {
    console.log("\nRun with --apply to write changes.");
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error?.stack ?? error?.message ?? error);
  process.exit(1);
});
