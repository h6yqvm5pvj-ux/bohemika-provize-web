#!/usr/bin/env node

import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const jiti = createJiti(import.meta.url);
const { calculateAllianzMujDomov } = jiti("../src/app/lib/productFormulas/allianzMujDomov.ts");
const { calculateAxaCestovko } = jiti("../src/app/lib/productFormulas/axacestovko.ts");
const { calculateCppCestovko } = jiti("../src/app/lib/productFormulas/cppcestovko.ts");
const { calculateCppHafan } = jiti("../src/app/lib/productFormulas/cpphafan.ts");
const { calculateCppPPRbez } = jiti("../src/app/lib/productFormulas/cppPPRbez.ts");
const { calculateCppPPRs } = jiti("../src/app/lib/productFormulas/cppPPRs.ts");
const { calculateCppSimplex } = jiti("../src/app/lib/productFormulas/cppsimplex.ts");
const { calculateDomex } = jiti("../src/app/lib/productFormulas/domex.ts");
const { calculateKoopCestovko } = jiti("../src/app/lib/productFormulas/koopcestovko.ts");
const { calculateKoopMajetekObcan } = jiti("../src/app/lib/productFormulas/koopmajetekobcan.ts");
const { calculateKoopOdzam } = jiti("../src/app/lib/productFormulas/koopodzam.ts");
const { calculateKoopPmop } = jiti("../src/app/lib/productFormulas/kooppmop.ts");
const { calculateMaxEfekt } = jiti("../src/app/lib/productFormulas/maximaMaxEfekt.ts");
const { calculateMaxdomov } = jiti("../src/app/lib/productFormulas/maxdomov.ts");
const { calculatePillowMajetek } = jiti("../src/app/lib/productFormulas/pillowMajetek.ts");
const { calculatePillowInjury } = jiti("../src/app/lib/productFormulas/pillowInjury.ts");
const { calculateZamex } = jiti("../src/app/lib/productFormulas/zamex.ts");
const { applyTipContractAdjustmentToCommissionItems } = jiti(
  "../src/app/lib/tipContractCommission.ts"
);

const BATCH_LIMIT = 350;
const TARGET_PRODUCTS = new Set([
  "domex",
  "cpphafan",
  "pillowmajetek",
  "koopmajetekobcan",
  "koopfit",
  "koopodzam",
  "kooppmop",
  "maxdomov",
  "allianzmujdomov",
  "cppPPRbez",
  "cppPPRs",
  "cppsimplex",
  "zamex",
  "maximaMaxEfekt",
  "pillowInjury",
  "cppcestovko",
  "axacestovko",
  "koopcestovko",
]);
const LEGACY_FREQUENCY_OVERRIDE_PRODUCTS = new Set([
  "domex",
  "cpphafan",
  "koopmajetekobcan",
  "koopfit",
  "koopodzam",
  "kooppmop",
  "maxdomov",
  "zamex",
  "cppsimplex",
  "cppPPRs",
  "cppPPRbez",
]);
const LIFE_PRODUCTS = new Set(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"]);
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

const normalizeMode = (value) =>
  value === "accelerated" || value === "standard" ? value : "standard";

const normalizeFrequency = (value) =>
  typeof value === "string" && FREQUENCIES.has(value) ? value : "annual";

const allowedFrequenciesForProduct = (productKey) => {
  switch (productKey) {
    case "maximaMaxEfekt":
    case "pillowInjury":
      return ["monthly"];
    case "domex":
    case "cpphafan":
      return ["quarterly", "semiannual", "annual"];
    case "pillowmajetek":
    case "koopmajetekobcan":
    case "koopfit":
    case "koopodzam":
    case "kooppmop":
    case "maxdomov":
    case "allianzmujdomov":
      return ["monthly", "quarterly", "semiannual", "annual"];
    case "zamex":
    case "cppsimplex":
    case "cppPPRbez":
    case "cppPPRs":
      return ["quarterly", "semiannual", "annual"];
    case "cppcestovko":
    case "axacestovko":
    case "koopcestovko":
      return ["annual"];
    default:
      return ["annual"];
  }
};

const usedFrequencyForProduct = (productKey, frequencyRaw) => {
  const frequency = normalizeFrequency(frequencyRaw);
  const allowed = allowedFrequenciesForProduct(productKey);
  return allowed.includes(frequency) ? frequency : allowed[0];
};

const paymentsPerYear = (frequency) => {
  switch (frequency) {
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

const amountForCalculation = (entry) => {
  const calculation = toNumber(entry?.calculationInputAmount);
  if (calculation > 0) return calculation;
  const input = toNumber(entry?.inputAmount);
  if (input > 0) return input;
  const effective = toNumber(entry?.effectiveInputAmount);
  if (effective > 0) return effective;
  return 0;
};

const toDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(`${trimmed.length === 10 ? `${trimmed}T00:00:00` : trimmed}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const toIsoDay = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const date = toDateValue(value);
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
};

const normalizedDurationYears = (productKey, value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const floored = Math.floor(number);
  if (floored <= 0) return null;
  if (productKey === "maximaMaxEfekt") return Math.min(80, floored);
  return floored;
};

const normalizeTextKey = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeTitle = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

const normalizeCommissionCodeKey = (code) =>
  typeof code === "string" ? code.trim().toUpperCase().replace(/\s+/g, "") : "";

const isPaymentRow = (item) =>
  String(item?.title ?? "").toLowerCase().includes("(z platby)");

const isTotalRow = (item) => {
  const code = normalizeCommissionCodeKey(item?.code);
  return code === "TOTAL" || normalizeTextKey(item?.title).includes("celkem");
};

const stripTotalRows = (items = []) => (Array.isArray(items) ? items : []).filter((item) => !isTotalRow(item));

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
    commissionMode: normalizeMode(override?.commissionMode),
    total: Math.round(toNumber(override?.total) * 1e8) / 1e8,
    items: comparableItems(override?.items),
  }));

const paymentBasedTotals = (items, multiplier) => {
  let immediate = 0;
  let subsequent = 0;
  items.forEach((item) => {
    const title = String(item?.title ?? "").toLowerCase();
    if (title.includes("okamžitá")) {
      immediate += toNumber(item?.amount);
    } else if (title.includes("následná")) {
      subsequent += toNumber(item?.amount);
    }
  });
  return {
    immediate: roundMoney(immediate * multiplier),
    subsequent: roundMoney(subsequent * multiplier),
  };
};

const totalWithMultipliers = (items) => {
  const cleaned = (Array.isArray(items) ? items : []).filter(
    (item) => !item?.excludeFromTotal && !normalizeTitle(item?.title).includes("celkem")
  );
  const hasYearly = cleaned.some((item) => normalizeTitle(item?.title).includes("provize za rok"));
  const source = hasYearly
    ? cleaned.filter((item) => normalizeTitle(item?.title).includes("provize za rok"))
    : cleaned;
  return source.reduce((sum, item) => sum + toNumber(item?.amount), 0);
};

const computeLegacyFrequencyOverrideTotal = ({
  productKey,
  frequencyRaw,
  items,
  fallbackTotal,
}) => {
  if (!LEGACY_FREQUENCY_OVERRIDE_PRODUCTS.has(productKey)) {
    return roundMoney(fallbackTotal);
  }
  const normalizedItems = Array.isArray(items) ? items : [];
  if (normalizedItems.length === 0) return 0;
  const annualSum = roundMoney(
    normalizedItems.reduce((sum, item) => {
      if (item?.excludeFromTotal) return sum;
      return normalizeTitle(item?.title).includes("za rok") ? sum + toNumber(item?.amount) : sum;
    }, 0)
  );
  if (annualSum > 0) return annualSum;
  const immediateSum = roundMoney(
    normalizedItems.reduce((sum, item) => {
      if (item?.excludeFromTotal) return sum;
      return normalizeTitle(item?.title).includes("okamžitá provize")
        ? sum + toNumber(item?.amount)
        : sum;
    }, 0)
  );
  if (immediateSum <= 0) return roundMoney(fallbackTotal);
  return roundMoney(immediateSum * paymentsPerYear(frequencyRaw));
};

const commissionItemDiffKey = (item) => {
  const code = normalizeCommissionCodeKey(item?.code);
  return code ? `code:${code}` : normalizeTextKey(item?.title);
};

const diffItemsByKey = (upperItems, lowerItems) => {
  const upperMap = new Map();
  upperItems.forEach((item) => {
    const key = commissionItemDiffKey(item);
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
  lowerItems.forEach((item) => {
    const key = commissionItemDiffKey(item);
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

const separatedPaymentResult = (dto, frequency) => {
  const items = dto.items.filter(isPaymentRow).map(normalizeItemForStore);
  const totals = paymentBasedTotals(items, paymentsPerYear(frequency));
  return { items, total: totals.immediate };
};

const calculateStoredResult = ({
  productKey,
  amount,
  frequency,
  position,
  mode,
  contractSignedDateIso,
  durationYears,
}) => {
  switch (productKey) {
    case "maximaMaxEfekt": {
      const years = normalizedDurationYears(productKey, durationYears);
      if (!years) return null;
      return normalizeResult(
        calculateMaxEfekt(amount, years, position, mode, contractSignedDateIso)
      );
    }
    case "pillowInjury":
      return normalizeResult(calculatePillowInjury(amount, position, mode));
    case "domex": {
      return separatedPaymentResult(
        calculateDomex(amount, frequency, position, contractSignedDateIso),
        frequency
      );
    }
    case "cpphafan": {
      return separatedPaymentResult(calculateCppHafan(amount, frequency, position), frequency);
    }
    case "koopmajetekobcan":
    case "koopfit": {
      return separatedPaymentResult(
        calculateKoopMajetekObcan(amount, frequency, position),
        frequency
      );
    }
    case "koopodzam": {
      return separatedPaymentResult(calculateKoopOdzam(amount, frequency, position), frequency);
    }
    case "kooppmop": {
      return separatedPaymentResult(calculateKoopPmop(amount, frequency, position), frequency);
    }
    case "maxdomov": {
      return separatedPaymentResult(calculateMaxdomov(amount, frequency, position), frequency);
    }
    case "cppPPRbez": {
      return separatedPaymentResult(calculateCppPPRbez(amount, frequency, position), frequency);
    }
    case "pillowmajetek":
      return normalizeResult(calculatePillowMajetek(amount, frequency, position));
    case "allianzmujdomov":
      return normalizeResult(calculateAllianzMujDomov(amount, frequency, position));
    case "cppsimplex":
      return separatedPaymentResult(calculateCppSimplex(amount, frequency, position), frequency);
    case "zamex":
      return separatedPaymentResult(calculateZamex(amount, frequency, position), frequency);
    case "cppPPRs":
      return separatedPaymentResult(calculateCppPPRs(amount, frequency, position), frequency);
    case "cppcestovko":
      return normalizeResult(calculateCppCestovko(amount, position));
    case "axacestovko":
      return normalizeResult(calculateAxaCestovko(amount, position));
    case "koopcestovko":
      return normalizeResult(calculateKoopCestovko(amount, position));
    default:
      return null;
  }
};

function normalizeResult(dto) {
  return {
    items: (Array.isArray(dto?.items) ? dto.items : []).map(normalizeItemForStore),
    total: roundMoney(toNumber(dto?.total)),
  };
}

const computeManagerOverrides = ({ entry, amount, frequency, contractSignedDateIso }) => {
  const productKey = entry?.productKey;
  const managerChain = Array.isArray(entry?.managerChain) ? entry.managerChain : [];
  const adviserPosition = normalizePosition(entry?.position);
  if (!adviserPosition || managerChain.length === 0) {
    return Array.isArray(entry?.managerOverrides) ? entry.managerOverrides : [];
  }

  const overrides = [];
  let childPositionForBaseline = adviserPosition;
  const adviserMode = normalizeMode(entry?.commissionMode);
  const durationYears = entry?.durationYears;

  for (const manager of managerChain) {
    const managerPosition = normalizePosition(manager?.position);
    if (!managerPosition || !childPositionForBaseline) continue;
    const managerMode = LIFE_PRODUCTS.has(productKey)
      ? "standard"
      : normalizeMode(manager?.commissionMode ?? adviserMode);

    const managerResult = calculateStoredResult({
      productKey,
      amount,
      frequency,
      position: managerPosition,
      mode: managerMode,
      contractSignedDateIso,
      durationYears,
    });
    const baselineResult = calculateStoredResult({
      productKey,
      amount,
      frequency,
      position: childPositionForBaseline,
      mode: managerMode,
      contractSignedDateIso,
      durationYears,
    });
    if (!managerResult || !baselineResult) {
      childPositionForBaseline = managerPosition;
      continue;
    }

    const diffItems = diffItemsByKey(
      stripTotalRows(managerResult.items),
      stripTotalRows(baselineResult.items)
    );
    const total = computeLegacyFrequencyOverrideTotal({
      productKey,
      frequencyRaw: frequency,
      items: diffItems,
      fallbackTotal: totalWithMultipliers(diffItems),
    });
    if (diffItems.length > 0 && total > 0) {
      overrides.push({
        email: normalizeEmail(manager?.email) ?? null,
        position: managerPosition,
        commissionMode: managerMode,
        items: diffItems,
        total,
      });
    }
    childPositionForBaseline = managerPosition;
  }

  return overrides;
};

const buildNextCalculation = (entry) => {
  const productKey = entry?.productKey;
  if (!TARGET_PRODUCTS.has(productKey)) return { ok: false, reason: "not-target-product" };
  const position = normalizePosition(entry?.position);
  if (!position) return { ok: false, reason: "missing-position" };
  const amount = amountForCalculation(entry);
  if (amount <= 0) return { ok: false, reason: "missing-amount" };
  const frequency = usedFrequencyForProduct(productKey, entry?.frequencyRaw);
  const contractSignedDateIso = toIsoDay(entry?.contractSignedDate);
  const mode = normalizeMode(entry?.commissionMode);
  const result = calculateStoredResult({
    productKey,
    amount,
    frequency,
    position,
    mode,
    contractSignedDateIso,
    durationYears: entry?.durationYears,
  });
  if (!result) return { ok: false, reason: "calculation-failed" };
  const managerOverrides = computeManagerOverrides({
    entry,
    amount,
    frequency,
    contractSignedDateIso,
  });
  let items = result.items;
  let total = result.total;
  const tipsterPercent = toNumber(entry?.tipContractTipsterPercent);
  let tipContractImmediateFirstYearGross;
  let tipContractImmediateFirstYearNet;
  let tipContractTipsterAmountFirstYear;

  if (tipsterPercent > 0 && tipsterPercent <= 100) {
    const tipAdjusted = applyTipContractAdjustmentToCommissionItems({
      product: productKey,
      items: result.items,
      tipsterPercent,
    });
    items = tipAdjusted.items.map(normalizeItemForStore);
    total = roundMoney(Math.max(0, result.total - tipAdjusted.tipsterAmount));
    tipContractImmediateFirstYearGross = tipAdjusted.grossBase;
    tipContractImmediateFirstYearNet = tipAdjusted.netBase;
    tipContractTipsterAmountFirstYear = tipAdjusted.tipsterAmount;
  }

  return {
    ok: true,
    frequency,
    items,
    total,
    managerOverrides,
    tipContractImmediateFirstYearGross,
    tipContractImmediateFirstYearNet,
    tipContractTipsterAmountFirstYear,
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
  if (entry.result && typeof entry.result === "object" && !Array.isArray(entry.result)) {
    const currentResultItems = comparableItems(entry.result.items);
    const nextResultItems = comparableItems(calculation.items);
    const currentResultTotal = toNumber(entry.result.total);
    if (
      JSON.stringify(currentResultItems) !== JSON.stringify(nextResultItems) ||
      Math.abs(currentResultTotal - calculation.total) > 0.000001
    ) {
      update.result = {
        ...entry.result,
        items: calculation.items,
        total: calculation.total,
      };
    }
  }
  for (const key of [
    "tipContractImmediateFirstYearGross",
    "tipContractImmediateFirstYearNet",
    "tipContractTipsterAmountFirstYear",
  ]) {
    if (
      Object.prototype.hasOwnProperty.call(calculation, key) &&
      Math.abs(toNumber(entry[key]) - toNumber(calculation[key])) > 0.000001
    ) {
      update[key] = calculation[key];
    }
  }
  return update;
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

async function main() {
  const apply = hasArg("--apply");
  const verbose = hasArg("--verbose");
  const targetEmail = normalizeEmail(parseArgValue("--email"));
  const productsArg = parseArgValue("--products");
  const productFilter = new Set(
    String(productsArg ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const contractNumbersArg = parseArgValue("--contracts");
  const targetContracts = new Set(
    String(contractNumbersArg ?? "")
      .split(",")
      .map(normalizeContractNumber)
      .filter(Boolean)
  );

  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials in environment.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const snap = await db.collectionGroup("entries").get();

  const stats = {
    scanned: 0,
    targetContracts: 0,
    planned: 0,
    alreadyOk: 0,
    totalChanged: 0,
    updateKeyCounts: {},
    productCounts: {},
    plannedByProduct: {},
    skipped: {},
  };

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
    stats.scanned += 1;
    const entry = docSnap.data() ?? {};
    if (String(entry.entryType ?? "contract").trim().toLowerCase() !== "contract") continue;
    const productKey = String(entry.productKey ?? "");
    if (!TARGET_PRODUCTS.has(productKey)) continue;
    if (productFilter.size > 0 && !productFilter.has(productKey)) continue;
    if (targetEmail && normalizeEmail(entry.userEmail) !== targetEmail) continue;
    const contractNumber = normalizeContractNumber(entry.contractNumber);
    if (targetContracts.size > 0 && !targetContracts.has(contractNumber)) continue;

    stats.targetContracts += 1;
    stats.productCounts[productKey] = (stats.productCounts[productKey] ?? 0) + 1;
    const calculation = buildNextCalculation(entry);
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
    stats.plannedByProduct[productKey] = (stats.plannedByProduct[productKey] ?? 0) + 1;
    updateKeys.forEach((key) => {
      stats.updateKeyCounts[key] = (stats.updateKeyCounts[key] ?? 0) + 1;
    });
    if (updateKeys.includes("total")) {
      stats.totalChanged += 1;
    }

    if (verbose || stats.planned <= 40) {
      console.log(
        `${apply ? "UPDATE" : "PLAN"} ${docSnap.ref.path} | ${productKey} | ${contractNumber || "bez-cisla"} | freq=${calculation.frequency} | keys=${updateKeys.join(",")} | items ${(Array.isArray(entry.items) ? entry.items.length : 0)}->${calculation.items.length} | total ${roundMoney(toNumber(entry.total))}->${roundMoney(calculation.total)}`
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
  console.log(`target_contracts=${stats.targetContracts}`);
  console.log(`already_ok=${stats.alreadyOk}`);
  console.log(`planned_changes=${stats.planned}`);
  console.log(`committed=${committed}`);
  console.log(`total_changed=${stats.totalChanged}`);
  console.log(`product_counts=${JSON.stringify(stats.productCounts)}`);
  console.log(`planned_by_product=${JSON.stringify(stats.plannedByProduct)}`);
  console.log(`update_key_counts=${JSON.stringify(stats.updateKeyCounts)}`);
  console.log(`skipped=${JSON.stringify(stats.skipped)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
