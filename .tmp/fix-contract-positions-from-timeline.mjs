#!/usr/bin/env node

import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const jiti = createJiti(import.meta.url);
const formulas = jiti("../src/app/lib/productFormulas.ts");
const { totalWithMultipliers } = jiti("../src/app/lib/commissionTotals.ts");
const { computeLegacyFrequencyOverrideTotal } = jiti("../src/app/lib/managerOverrideTotals.ts");
const {
  normalizeCommissionCoefficientSet,
  signedDateForCoefficientSetOverride,
} = jiti("../src/app/lib/productFormulas/coefficientSets.ts");

const DEFAULT_EMAIL = "jakub.rauscher@bohemika.eu";
const POSITION_ORDER = [
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
const POSITION_SET = new Set(POSITION_ORDER);
const FREQUENCY_SET = new Set(["monthly", "quarterly", "semiannual", "annual"]);
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const BATCH_LIMIT = 350;

const parseArgValue = (key, fallback = null) => {
  const prefix = `${key}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(key);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const hasArg = (name) => process.argv.includes(name);

const normalizeEmail = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const normalizePosition = (value) =>
  typeof value === "string" && POSITION_SET.has(value) ? value : null;

const normalizeMode = (value) =>
  value === "accelerated" || value === "standard" ? value : null;

const normalizeFrequency = (value) =>
  typeof value === "string" && FREQUENCY_SET.has(value) ? value : "annual";

const normalizeContractNumber = (value) =>
  String(value ?? "").replace(/\s+/g, "").trim();

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

const comparableNumber = (value) => Math.round(toNumber(value) * 1e8) / 1e8;

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
}

function isIsoDay(value) {
  if (typeof value !== "string" || !ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

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
  if (typeof value === "string" && isIsoDay(value.trim())) return value.trim();
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
};

function parsePositionTimeline(raw) {
  if (!Array.isArray(raw)) return [];
  const rows = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const position = normalizePosition(item.position);
    const validFrom = typeof item.validFrom === "string" ? item.validFrom.trim() : "";
    const validToRaw = typeof item.validTo === "string" ? item.validTo.trim() : "";
    const validTo = validToRaw || null;
    if (!position || !isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;
    rows.push({
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `timeline_${index}`,
      position,
      validFrom,
      validTo,
    });
  });
  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    return (a.validTo ?? "9999-12-31").localeCompare(b.validTo ?? "9999-12-31");
  });
  return rows;
}

function resolvePositionTimelineMatch(signedDateIso, timeline) {
  if (!isIsoDay(signedDateIso) || timeline.length === 0) return null;
  const candidates = timeline.filter((row) => {
    if (row.validFrom > signedDateIso) return false;
    if (row.validTo && signedDateIso >= row.validTo) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return b.validFrom.localeCompare(a.validFrom);
    return (b.validTo ?? "9999-12-31").localeCompare(a.validTo ?? "9999-12-31");
  });
  return candidates[0] ?? null;
}

function amountForCalculation(entry) {
  const calculation = toNumber(entry?.calculationInputAmount);
  if (calculation > 0) return calculation;
  const effective = toNumber(entry?.effectiveInputAmount);
  if (effective > 0) return effective;
  const input = toNumber(entry?.inputAmount);
  return input > 0 ? input : 0;
}

function normalizeDurationYears(product, years) {
  const fallback =
    product === "neon" ? 15 : product === "flexi" ? 30 : product === "maximaMaxEfekt" ? 20 : 1;
  const max =
    product === "neon" ? 99 : product === "flexi" ? 80 : product === "maximaMaxEfekt" ? 20 : 1;
  const raw = typeof years === "number" && Number.isFinite(years) ? years : fallback;
  return Math.min(max, Math.max(1, Math.floor(raw)));
}

const paymentBasedTotals = (items, multiplier) => {
  let immediate = 0;
  let subsequent = 0;
  items.forEach((item) => {
    const title = String(item?.title ?? "").toLowerCase();
    if (title.includes("okamžitá")) immediate += toNumber(item?.amount);
    if (title.includes("následná")) subsequent += toNumber(item?.amount);
  });
  return { immediate: immediate * multiplier, subsequent: subsequent * multiplier };
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

function effectiveCommissionModeForStoredProduct(
  productKey,
  mode,
  contractSignedDateIso,
  commissionCoefficientSetOverride,
  neonCoefficientSetOverride
) {
  const normalizedCoefficientSetOverride =
    normalizeCommissionCoefficientSet(commissionCoefficientSetOverride);
  const effectiveNeonCoefficientSetOverride =
    neonCoefficientSetOverride === "historical" || neonCoefficientSetOverride === "current"
      ? neonCoefficientSetOverride
      : normalizedCoefficientSetOverride;
  if (
    productKey === "neon" &&
    effectiveNeonCoefficientSetOverride !== "current" &&
    formulas.isNeonHistoricalPeriod(contractSignedDateIso)
  ) {
    return "standard";
  }
  return mode;
}

function resolveManagerCommissionModeForProduct(productKey, managerMode, adviserMode) {
  return ["neon", "flexi", "maximaMaxEfekt", "pillowInjury"].includes(productKey)
    ? "standard"
    : managerMode ?? adviserMode;
}

function computeItemsForEntry(entry, position, mode) {
  if (!position || !entry?.productKey) return null;
  const productKey = entry.productKey;
  const amount = Math.max(0, amountForCalculation(entry));
  const frequency = normalizeFrequency(entry.frequencyRaw);
  const signedDateIso = toIsoDay(entry.contractSignedDate);
  const normalizedCoefficientSetOverride = normalizeCommissionCoefficientSet(
    entry.commissionCoefficientSetOverride
  );
  const normalizedNeonCoefficientSetOverride =
    entry.neonCoefficientSetOverride === "historical" ||
    entry.neonCoefficientSetOverride === "current"
      ? entry.neonCoefficientSetOverride
      : normalizedCoefficientSetOverride === "historical" ||
          normalizedCoefficientSetOverride === "current"
        ? normalizedCoefficientSetOverride
        : null;
  const coefficientSignedDateIso = signedDateForCoefficientSetOverride({
    product: productKey,
    contractSignedDateIso: signedDateIso,
    coefficientSetOverride: normalizedCoefficientSetOverride,
  });

  switch (productKey) {
    case "neon": {
      const years = formulas.normalizeNeonDurationYears(
        entry.durationYears,
        signedDateIso,
        normalizedNeonCoefficientSetOverride
      );
      return formulas.calculateNeon(
        amount,
        position,
        years,
        mode,
        signedDateIso,
        normalizedNeonCoefficientSetOverride
      );
    }
    case "domex": {
      const dto = formulas.calculateDomex(amount, frequency, position);
      const items = dto.items.filter((item) =>
        String(item.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(items, paymentsPerYear(frequency));
      return { items, total: totals.immediate };
    }
    case "koopmajetekobcan":
    case "koopfit": {
      const dto = formulas.calculateKoopMajetekObcan(amount, frequency, position);
      const items = dto.items.filter((item) =>
        String(item.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(items, paymentsPerYear(frequency));
      return { items, total: totals.immediate + totals.subsequent };
    }
    case "cppAuto":
      return formulas.calculateCppAuto(amount, frequency, position, coefficientSignedDateIso);
    case "allianzAuto":
      return formulas.calculateAllianzAuto(amount, frequency, position, coefficientSignedDateIso);
    case "uniqaAuto":
      return formulas.calculateUniqaAuto(amount, frequency, position, coefficientSignedDateIso);
    case "kooperativaAuto":
      return formulas.calculateKooperativaAuto(
        amount,
        frequency,
        position,
        coefficientSignedDateIso
      );
    case "cppcestovko":
      return formulas.calculateCppCestovko(amount, position);
    case "flexi":
      return formulas.calculateFlexi(
        amount,
        position,
        mode,
        normalizeDurationYears("flexi", entry.durationYears)
      );
    case "maximaMaxEfekt":
      return formulas.calculateMaxEfekt(
        amount,
        normalizeDurationYears("maximaMaxEfekt", entry.durationYears),
        position,
        mode
      );
    case "pillowInjury":
      return formulas.calculatePillowInjury(amount, position, mode);
    default:
      return null;
  }
}

function normalizeItem(item) {
  return {
    title: String(item?.title ?? ""),
    amount: toNumber(item?.amount),
    ...(item?.code ? { code: String(item.code) } : {}),
    ...(item?.note ? { note: String(item.note) } : {}),
    ...(item?.excludeFromTotal ? { excludeFromTotal: true } : {}),
  };
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).map(normalizeItem);
}

const normalizeTitleKey = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizeCodeKey = (value) =>
  typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "") : "";

function isTotalRow(item) {
  const code = normalizeCodeKey(item?.code);
  const title = normalizeTitleKey(item?.title);
  return code === "TOTAL" || title.includes("celkem") || title.includes("provize za rok");
}

function stripTotalRows(items) {
  return normalizeItems(items).filter((item) => !isTotalRow(item));
}

function itemDiffKey(item) {
  const code = normalizeCodeKey(item?.code);
  if (code) return `code:${code}`;
  return normalizeTitleKey(item?.title);
}

function computeManagerOverrides(entry, adviserPosition, adviserMode) {
  const overrides = [];
  let childPosition = adviserPosition;
  const managerChain = Array.isArray(entry.managerChain) ? entry.managerChain : [];

  for (const managerRaw of managerChain) {
    const manager = {
      email: normalizeEmail(managerRaw?.email),
      position: normalizePosition(managerRaw?.position),
      commissionMode: normalizeMode(managerRaw?.commissionMode),
    };
    if (!manager.position || !childPosition) {
      childPosition = manager.position ?? childPosition;
      continue;
    }

    const managerMode = effectiveCommissionModeForStoredProduct(
      entry.productKey,
      resolveManagerCommissionModeForProduct(
        entry.productKey,
        manager.commissionMode,
        adviserMode
      ),
      toIsoDay(entry.contractSignedDate),
      entry.commissionCoefficientSetOverride,
      entry.neonCoefficientSetOverride
    );

    const managerResult = computeItemsForEntry(entry, manager.position, managerMode);
    const baselineResult = computeItemsForEntry(entry, childPosition, managerMode);
    if (!managerResult || !baselineResult) {
      childPosition = manager.position;
      continue;
    }

    const managerMap = new Map();
    stripTotalRows(managerResult.items).forEach((item) => {
      const key = itemDiffKey(item);
      const prev = managerMap.get(key);
      managerMap.set(key, {
        title: item.title || prev?.title || key,
        amount: (prev?.amount ?? 0) + toNumber(item.amount),
        code: item.code ?? prev?.code ?? null,
        note: item.note ?? prev?.note ?? null,
        excludeFromTotal: Boolean(prev?.excludeFromTotal || item.excludeFromTotal),
      });
    });

    const diffItems = [];
    stripTotalRows(baselineResult.items).forEach((item) => {
      const key = itemDiffKey(item);
      const managerValue = managerMap.get(key);
      const remaining = toNumber(managerValue?.amount) - toNumber(item.amount);
      if (remaining > 0) {
        diffItems.push({
          title: managerValue?.title ?? item.title,
          amount: remaining,
          code: managerValue?.code ?? item.code ?? null,
          ...(managerValue?.note || item.note ? { note: managerValue?.note ?? item.note } : {}),
          ...(managerValue?.excludeFromTotal || item.excludeFromTotal
            ? { excludeFromTotal: true }
            : {}),
        });
      }
      managerMap.delete(key);
    });

    managerMap.forEach((value) => {
      if (value.amount > 0) {
        diffItems.push({
          title: value.title,
          amount: value.amount,
          code: value.code ?? null,
          ...(value.note ? { note: value.note } : {}),
          ...(value.excludeFromTotal ? { excludeFromTotal: true } : {}),
        });
      }
    });

    const normalizedItems = normalizeItems(diffItems);
    const total = computeLegacyFrequencyOverrideTotal({
      productKey: entry.productKey,
      frequencyRaw: normalizeFrequency(entry.frequencyRaw),
      items: normalizedItems,
      fallbackTotal: totalWithMultipliers(normalizedItems),
    });
    if (normalizedItems.length > 0 && total > 0) {
      overrides.push({
        email: manager.email ?? null,
        position: manager.position,
        commissionMode: managerMode,
        items: normalizedItems,
        total,
      });
    }

    childPosition = manager.position;
  }

  return overrides;
}

const comparableItems = (items) =>
  normalizeItems(items).map((item) => ({
    title: item.title,
    amount: comparableNumber(item.amount),
    code: item.code ?? null,
    note: item.note ?? null,
    excludeFromTotal: Boolean(item.excludeFromTotal),
  }));

const comparableOverrides = (overrides) =>
  (Array.isArray(overrides) ? overrides : []).map((override) => ({
    email: normalizeEmail(override?.email),
    position: normalizePosition(override?.position),
    commissionMode: normalizeMode(override?.commissionMode),
    total: comparableNumber(override?.total),
    items: comparableItems(override?.items),
  }));

const overrideSummary = (overrides) =>
  comparableOverrides(overrides).map((override) => ({
    email: override.email,
    position: override.position,
    mode: override.commissionMode,
    total: roundMoney(override.total),
    items: override.items.map((item) => ({
      code: item.code,
      amount: roundMoney(item.amount),
    })),
  }));

const jsonChanged = (a, b) => JSON.stringify(a) !== JSON.stringify(b);

async function loadOwnerProfile(db, email) {
  const usersSnap = await db.collection("users").get();
  const candidates = usersSnap.docs
    .map((docSnap) => {
      const data = docSnap.data() || {};
      const normalizedEmail = normalizeEmail(data.email ?? docSnap.id);
      if (normalizedEmail !== email) return null;
      return {
        docId: docSnap.id,
        position: normalizePosition(data.position),
        positionTimeline: data.positionTimeline ?? null,
        parsedTimeline: parsePositionTimeline(data.positionTimeline),
      };
    })
    .filter(Boolean);
  if (candidates.length === 0) return null;
  const canonical = candidates.find((candidate) => candidate.docId.toLowerCase() === email);
  const withTimeline = candidates.find((candidate) => candidate.parsedTimeline.length > 0);
  return withTimeline ?? canonical ?? candidates[0];
}

function buildPatch(entry, expectedPosition) {
  const storedPosition = normalizePosition(entry.position);
  const storedMode = normalizeMode(entry.commissionMode) ?? "accelerated";
  const signedDateIso = toIsoDay(entry.contractSignedDate);
  const effectiveMode = effectiveCommissionModeForStoredProduct(
    entry.productKey,
    storedMode,
    signedDateIso,
    entry.commissionCoefficientSetOverride,
    entry.neonCoefficientSetOverride
  );
  const result = computeItemsForEntry(entry, expectedPosition, effectiveMode);
  if (!result) {
    return { skipped: true, reason: `unsupported_product:${entry.productKey ?? "null"}` };
  }

  const items = normalizeItems(result.items);
  const managerOverrides = computeManagerOverrides(entry, expectedPosition, effectiveMode);
  const patch = {};
  const updateKeys = [];

  if (storedPosition !== expectedPosition) {
    patch.position = expectedPosition;
    updateKeys.push("position");
  }
  if (entry.commissionMode !== effectiveMode) {
    patch.commissionMode = effectiveMode;
    updateKeys.push("commissionMode");
  }
  if (jsonChanged(comparableItems(entry.items), comparableItems(items))) {
    patch.items = items;
    updateKeys.push("items");
  }
  if (comparableNumber(entry.total) !== comparableNumber(result.total)) {
    patch.total = result.total;
    updateKeys.push("total");
  }
  const expectedResult = { items, total: result.total };
  if (
    jsonChanged(
      { items: comparableItems(entry.result?.items), total: comparableNumber(entry.result?.total) },
      { items: comparableItems(expectedResult.items), total: comparableNumber(expectedResult.total) }
    )
  ) {
    patch.result = expectedResult;
    updateKeys.push("result");
  }
  if (jsonChanged(comparableOverrides(entry.managerOverrides), comparableOverrides(managerOverrides))) {
    patch.managerOverrides = managerOverrides;
    updateKeys.push("managerOverrides");
  }

  return {
    skipped: false,
    hasChanges: updateKeys.length > 0,
    patch,
    updateKeys,
    oldPosition: storedPosition,
    newPosition: expectedPosition,
    oldTotal: roundMoney(entry.total),
    newTotal: roundMoney(result.total),
    oldOverrides: Array.isArray(entry.managerOverrides) ? entry.managerOverrides.length : 0,
    newOverrides: managerOverrides.length,
    oldOverrideSummary: overrideSummary(entry.managerOverrides),
    newOverrideSummary: overrideSummary(managerOverrides),
  };
}

async function main() {
  const apply = hasArg("--apply");
  const recalculateAll = hasArg("--recalculate-all");
  const email = normalizeEmail(parseArgValue("--email", DEFAULT_EMAIL));
  const fromDateIso = parseArgValue("--from", null);
  const onlyContractsRaw = parseArgValue("--contracts", null);
  const onlyContracts = onlyContractsRaw
    ? new Set(onlyContractsRaw.split(",").map(normalizeContractNumber).filter(Boolean))
    : null;
  if (!email) throw new Error("Missing --email.");
  if (fromDateIso && !isIsoDay(fromDateIso)) {
    throw new Error(`Invalid --from date: ${fromDateIso}. Expected YYYY-MM-DD.`);
  }

  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const profile = await loadOwnerProfile(db, email);
  if (!profile) throw new Error(`User profile not found for ${email}.`);

  const ownerDocIds = [profile.docId];
  const planned = [];
  const skippedRows = [];
  const counters = new Map();
  let scanned = 0;
  let mismatches = 0;

  for (const ownerDocId of ownerDocIds) {
    const entriesSnap = await db.collection("users").doc(ownerDocId).collection("entries").get();
    for (const entrySnap of entriesSnap.docs) {
      const entry = entrySnap.data() || {};
      if ((entry.entryType ?? "contract") !== "contract") continue;
      const contractNumber = normalizeContractNumber(entry.contractNumber);
      if (onlyContracts && !onlyContracts.has(contractNumber)) continue;

      const signedDateIso = toIsoDay(entry.contractSignedDate);
      if (fromDateIso && (!signedDateIso || signedDateIso < fromDateIso)) continue;
      scanned += 1;
      const match = resolvePositionTimelineMatch(signedDateIso, profile.parsedTimeline);
      if (!match?.position) {
        counters.set("timeline_unresolved", (counters.get("timeline_unresolved") ?? 0) + 1);
        continue;
      }
      const storedPosition = normalizePosition(entry.position);
      if (storedPosition !== match.position) mismatches += 1;
      if (!recalculateAll && storedPosition === match.position) continue;

      const update = buildPatch(entry, match.position);
      if (update.skipped) {
        counters.set(update.reason, (counters.get(update.reason) ?? 0) + 1);
        skippedRows.push({
          contractNumber,
          productKey: entry.productKey ?? null,
          signedDateIso,
          position: storedPosition,
          managerOverrides: overrideSummary(entry.managerOverrides),
          reason: update.reason,
          path: entrySnap.ref.path,
        });
        continue;
      }
      if (!update.hasChanges) continue;

      planned.push({
        ref: entrySnap.ref,
        path: entrySnap.ref.path,
        contractNumber,
        clientName: entry.clientName ?? null,
        productKey: entry.productKey ?? null,
        signedDateIso,
        ...update,
      });
    }
  }

  planned.sort((a, b) => {
    if (a.signedDateIso !== b.signedDateIso) return a.signedDateIso.localeCompare(b.signedDateIso);
    return a.contractNumber.localeCompare(b.contractNumber);
  });

  console.log(`owner=${email}`);
  console.log(`profile_doc=${profile.docId}`);
  console.log(`from_date=${fromDateIso ?? "all"}`);
  console.log(`recalculate_all=${recalculateAll}`);
  console.log(`timeline_rows=${profile.parsedTimeline.length}`);
  console.log(`scanned_contracts=${scanned}`);
  console.log(`position_mismatches=${mismatches}`);
  console.log(`contracts_to_update=${planned.length}`);
  if (counters.size > 0) {
    console.log(`skipped=${JSON.stringify(Object.fromEntries(counters.entries()))}`);
  }
  skippedRows.forEach((row) => {
    console.log(`skipped_row=${JSON.stringify(row)}`);
  });

  planned.forEach((row) => {
    console.log(
      [
        row.contractNumber || "bez_cisla",
        row.productKey || "bez_produktu",
        row.clientName || "bez_klienta",
        `signed=${row.signedDateIso}`,
        `pos=${row.oldPosition}->${row.newPosition}`,
        `total=${row.oldTotal}->${row.newTotal}`,
        `overrides=${row.oldOverrides}->${row.newOverrides}`,
        `keys=${row.updateKeys.join("+")}`,
        row.path,
      ].join(" | ")
    );
    if (row.updateKeys.includes("managerOverrides")) {
      console.log(`  overrides_before=${JSON.stringify(row.oldOverrideSummary)}`);
      console.log(`  overrides_after=${JSON.stringify(row.newOverrideSummary)}`);
    }
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

main().catch((err) => {
  console.error(`fix_failed=${err?.message ?? err}`);
  process.exit(1);
});
