#!/usr/bin/env node

import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const jiti = createJiti(import.meta.url);
const {
  calculateAllianzAuto,
  calculateCppAuto,
  calculateCsobAuto,
  calculateKooperativaAuto,
  calculatePillowAuto,
  calculateSlaviaAuto,
  calculateUniqaAuto,
} = jiti("../src/app/lib/productFormulas.ts");
const {
  normalizeCommissionCoefficientSet,
  signedDateForCoefficientSetOverride,
} = jiti("../src/app/lib/productFormulas/coefficientSets.ts");

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
const BATCH_LIMIT = 350;

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
  const effective = toNumber(entry?.effectiveInputAmount);
  if (effective > 0) return effective;
  const input = toNumber(entry?.inputAmount);
  if (input > 0) return input;
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
  const title = normalizeTextKey(item?.title);
  return code === "TOTAL" || title.includes("celkem") || title.includes("provize za rok");
};

const itemKey = (item) => {
  const code = normalizeCommissionCode(item?.code);
  return code ? `code:${code}` : normalizeTextKey(item?.title);
};

const totalWithMultipliers = (items) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => !item?.excludeFromTotal && !isTotalRow(item))
    .reduce((sum, item) => sum + toNumber(item?.amount), 0);

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

const jsonChanged = (a, b) => JSON.stringify(a) !== JSON.stringify(b);

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
  return {
    items: adjustedItems,
    total: roundMoney(Math.max(0, total - tipsterAmount)),
    tipContractImmediateFirstYearGross: immediateGross,
    tipContractImmediateFirstYearNet: roundMoney(immediateGross - tipsterAmount),
    tipContractTipsterAmountFirstYear: tipsterAmount,
  };
};

const effectiveSignedDate = (entry, productKey, signedIso) =>
  signedDateForCoefficientSetOverride({
    product: productKey,
    contractSignedDateIso: signedIso,
    coefficientSetOverride: normalizeCommissionCoefficientSet(
      entry?.commissionCoefficientSetOverride
    ),
  });

const calculateAutoResult = ({ productKey, amount, frequencyRaw, position, signedDate }) => {
  const frequency = normalizeFrequency(frequencyRaw);
  switch (productKey) {
    case "cppAuto":
      return calculateCppAuto(amount, frequency, position, signedDate);
    case "allianzAuto":
      return calculateAllianzAuto(amount, frequency, position, signedDate);
    case "csobAuto":
      return calculateCsobAuto(amount, frequency, position, signedDate);
    case "uniqaAuto":
    case "uniqaflotila":
      return calculateUniqaAuto(amount, frequency, position, signedDate);
    case "pillowAuto":
      return calculatePillowAuto(amount, frequency, position, signedDate);
    case "slaviaauto":
      return calculateSlaviaAuto(amount, frequency, position);
    case "kooperativaAuto":
      return calculateKooperativaAuto(amount, frequency, position);
    default:
      return null;
  }
};

const calculateStoredAuto = ({ entry, productKey, amount, frequencyRaw, position, signedIso }) => {
  const result = calculateAutoResult({
    productKey,
    amount,
    frequencyRaw,
    position,
    signedDate: effectiveSignedDate(entry, productKey, signedIso),
  });
  if (!result) return null;

  let items = result.items.map(normalizeItemForStore);
  let total = roundMoney(result.total);
  const tipPercent = normalizeTipPercent(entry?.tipContractTipsterPercent);
  const tipUpdate = {};
  if (tipPercent != null) {
    const adjusted = applyTipContractAdjustment({
      items,
      total,
      tipsterPercent: tipPercent,
    });
    items = adjusted.items;
    total = adjusted.total;
    tipUpdate.tipContractImmediateFirstYearGross =
      adjusted.tipContractImmediateFirstYearGross;
    tipUpdate.tipContractImmediateFirstYearNet =
      adjusted.tipContractImmediateFirstYearNet;
    tipUpdate.tipContractTipsterAmountFirstYear =
      adjusted.tipContractTipsterAmountFirstYear;
  }
  return { items, total, tipUpdate };
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
        row?.commissionMode === "accelerated" || row?.commissionMode === "standard"
          ? row.commissionMode
          : entry?.managerModeSnapshot === "accelerated" ||
              entry?.managerModeSnapshot === "standard"
            ? entry.managerModeSnapshot
            : entry?.commissionMode === "accelerated" || entry?.commissionMode === "standard"
              ? entry.commissionMode
              : null,
    }))
    .filter((row) => row.position);
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
      diffItems.push(normalizeItemForStore({ ...value, amount: roundMoney(value.amount) }));
    }
  });

  return diffItems;
};

const computeManagerOverrides = ({
  entry,
  productKey,
  amount,
  frequencyRaw,
  signedIso,
  adviserPosition,
}) => {
  const managerChain = normalizeManagerChain(entry);
  if (managerChain.length === 0) return [];

  const overrides = [];
  let childPositionForBaseline = adviserPosition;

  for (const manager of managerChain) {
    if (!manager.position || !childPositionForBaseline) continue;
    const managerResult = calculateStoredAuto({
      entry,
      productKey,
      amount,
      frequencyRaw,
      position: manager.position,
      signedIso,
    });
    const baselineResult = calculateStoredAuto({
      entry,
      productKey,
      amount,
      frequencyRaw,
      position: childPositionForBaseline,
      signedIso,
    });
    if (!managerResult || !baselineResult) {
      childPositionForBaseline = manager.position;
      continue;
    }

    const diffItems = diffItemsByKey(managerResult.items, baselineResult.items);
    const total = roundMoney(totalWithMultipliers(diffItems));
    if (diffItems.length > 0 && total > 0) {
      overrides.push({
        email: manager.email ?? null,
        position: manager.position,
        commissionMode: manager.commissionMode,
        items: diffItems,
        total,
      });
    }

    childPositionForBaseline = manager.position;
  }

  return overrides;
};

const hasPremiumStatementChange = (entry) => {
  if (entry?.premiumUpdatedFromStatementAtMs != null) return true;
  const history = Array.isArray(entry?.premiumStatementHistory)
    ? entry.premiumStatementHistory
    : [];
  return history.some((row) => row?.premiumKind === "auto_change");
};

const buildUpdate = (docSnap) => {
  const entry = docSnap.data() ?? {};
  const productKey = entry.productKey;
  if (!AUTO_PRODUCTS.has(productKey)) return { skipped: true, reason: "non-auto" };
  if (!hasPremiumStatementChange(entry)) {
    return { skipped: true, reason: "no-statement-premium-change" };
  }
  if (String(entry.entryType ?? "contract").trim().toLowerCase() !== "contract") {
    return { skipped: true, reason: "non-contract" };
  }

  const signedIso = toIsoDay(entry.contractSignedDate);
  const position = normalizePosition(entry.position);
  if (!position) return { skipped: true, reason: "missing-position", signedIso };

  const amount = amountForCalculation(entry);
  if (amount <= 0) return { skipped: true, reason: "missing-amount", signedIso };

  const frequencyRaw = normalizeFrequency(entry.frequencyRaw);
  const expected = calculateStoredAuto({
    entry,
    productKey,
    amount,
    frequencyRaw,
    position,
    signedIso,
  });
  if (!expected) return { skipped: true, reason: "unsupported-product", signedIso };

  const expectedOverrides = computeManagerOverrides({
    entry,
    productKey,
    amount,
    frequencyRaw,
    signedIso,
    adviserPosition: position,
  });

  const patch = {};
  const updateKeys = [];

  if (jsonChanged(comparableItems(entry.items), comparableItems(expected.items))) {
    patch.items = expected.items;
    updateKeys.push("items");
  }

  if (Math.abs(toNumber(entry.total) - expected.total) > 0.000001) {
    patch.total = expected.total;
    updateKeys.push("total");
  }

  const existingResult =
    entry.result && typeof entry.result === "object" && !Array.isArray(entry.result)
      ? entry.result
      : {};
  if (
    jsonChanged(comparableItems(existingResult.items), comparableItems(expected.items)) ||
    Math.abs(toNumber(existingResult.total) - expected.total) > 0.000001
  ) {
    patch.result = {
      ...existingResult,
      items: expected.items,
      total: expected.total,
    };
    updateKeys.push("result");
  }

  if (
    jsonChanged(
      comparableOverrides(entry.managerOverrides),
      comparableOverrides(expectedOverrides)
    )
  ) {
    patch.managerOverrides = expectedOverrides;
    updateKeys.push("managerOverrides");
  }

  Object.assign(patch, expected.tipUpdate);
  Object.keys(expected.tipUpdate).forEach((key) => {
    if (!updateKeys.includes(key)) updateKeys.push(key);
  });

  return {
    skipped: false,
    hasChanges: updateKeys.length > 0,
    patch,
    updateKeys,
    meta: {
      path: docSnap.ref.path,
      userEmail: normalizeEmail(entry.userEmail),
      contractNumber: normalizeContractNumber(entry.contractNumber),
      clientName:
        typeof entry.clientName === "string" && entry.clientName.trim()
          ? entry.clientName.trim()
          : "-",
      productKey,
      signedIso,
      position,
      amount,
      frequencyRaw,
      oldTotal: toNumber(entry.total),
      newTotal: expected.total,
      oldItems: Array.isArray(entry.items) ? entry.items.length : 0,
      newItems: expected.items.length,
      oldOverrides: Array.isArray(entry.managerOverrides) ? entry.managerOverrides.length : 0,
      newOverrides: expectedOverrides.length,
    },
  };
};

async function loadEntries(db, targetEmail) {
  if (targetEmail) {
    return db.collection("users").doc(targetEmail).collection("entries").get();
  }
  return db.collectionGroup("entries").get();
}

async function main() {
  const apply = hasArg("--apply");
  const verbose = hasArg("--verbose");
  const limitRaw = Number(parseArgValue("--limit", "0"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : null;
  const targetEmail = normalizeEmail(parseArgValue("--email"));

  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials in environment.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const snap = await loadEntries(db, targetEmail);

  const planned = [];
  const counters = new Map();
  let scanned = 0;

  for (const docSnap of snap.docs) {
    const update = buildUpdate(docSnap);
    if (update.skipped) {
      counters.set(update.reason, (counters.get(update.reason) ?? 0) + 1);
      continue;
    }

    scanned += 1;
    if (!update.hasChanges) {
      counters.set("already-ok", (counters.get("already-ok") ?? 0) + 1);
      continue;
    }

    planned.push({ ref: docSnap.ref, ...update });
    if (limit && planned.length >= limit) break;
  }

  console.log(`auto_contracts_with_statement_premium_change=${scanned}`);
  console.log(`contracts_to_update=${planned.length}`);
  if (counters.size > 0) {
    console.log(
      "counters=" +
        [...counters.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([key, value]) => `${key}:${value}`)
          .join(",")
    );
  }

  planned.forEach((row) => {
    console.log(
      [
        row.meta.contractNumber || "-",
        row.meta.clientName,
        row.meta.productKey,
        row.meta.amount,
        `total:${row.meta.oldTotal}->${row.meta.newTotal}`,
        `items:${row.meta.oldItems}->${row.meta.newItems}`,
        `overrides:${row.meta.oldOverrides}->${row.meta.newOverrides}`,
        `keys:${row.updateKeys.join("+")}`,
        row.meta.path,
      ].join(" | ")
    );
    if (verbose) console.log(JSON.stringify(row.patch, null, 2));
  });

  if (!apply) {
    console.log("DRY_RUN_ONLY");
    return;
  }

  let batch = db.batch();
  let ops = 0;
  let written = 0;
  for (const row of planned) {
    batch.set(row.ref, { ...row.patch, updatedAt: new Date() }, { merge: true });
    ops += 1;
    written += 1;
    if (ops >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log(`updated=${written}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
