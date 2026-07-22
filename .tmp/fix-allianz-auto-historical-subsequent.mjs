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
  isAllianzAutoHistoricalPeriod,
  ALLIANZ_AUTO_HISTORICAL_VALID_FROM,
  ALLIANZ_AUTO_CURRENT_VALID_FROM,
} = jiti("../src/app/lib/productFormulas/allianzAuto.ts");
const {
  normalizeCommissionCoefficientSet,
  signedDateForCoefficientSetOverride,
} = jiti("../src/app/lib/productFormulas/coefficientSets.ts");

const BATCH_LIMIT = 350;
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

const amountsDiffer = (a, b) => Math.abs(toNumber(a) - toNumber(b)) > 0.000001;

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

const effectiveSignedDate = (entry, signedIso) =>
  signedDateForCoefficientSetOverride({
    product: "allianzAuto",
    contractSignedDateIso: signedIso,
    coefficientSetOverride: normalizeCommissionCoefficientSet(
      entry?.commissionCoefficientSetOverride
    ),
  });

const calculateStoredAllianzAuto = ({ entry, amount, frequencyRaw, position, signedIso }) => {
  const result = calculateAllianzAuto(
    amount,
    normalizeFrequency(frequencyRaw),
    position,
    effectiveSignedDate(entry, signedIso)
  );
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

const computeManagerOverrides = ({ entry, amount, frequencyRaw, signedIso, adviserPosition }) => {
  const managerChain = normalizeManagerChain(entry);
  if (managerChain.length === 0) return [];

  const overrides = [];
  let childPositionForBaseline = adviserPosition;

  for (const manager of managerChain) {
    if (!manager.position || !childPositionForBaseline) continue;
    const managerResult = calculateStoredAllianzAuto({
      entry,
      amount,
      frequencyRaw,
      position: manager.position,
      signedIso,
    });
    const baselineResult = calculateStoredAllianzAuto({
      entry,
      amount,
      frequencyRaw,
      position: childPositionForBaseline,
      signedIso,
    });

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

const firstAmountByPredicate = (items, predicate) => {
  if (!Array.isArray(items)) return null;
  const item = items.find(predicate);
  const amount = toNumber(item?.amount);
  return Number.isFinite(amount) && item ? amount : null;
};

const immediateAmount = (items) =>
  firstAmountByPredicate(items, (item) => {
    const title = normalizeTextKey(item?.title);
    const code = normalizeCommissionCode(item?.code);
    return code === "A101" || title.includes("okamzita") || title.includes("ziskatelska");
  });

const subsequentAmount = (items) =>
  firstAmountByPredicate(items, (item) => {
    const title = normalizeTextKey(item?.title);
    const code = normalizeCommissionCode(item?.code);
    return code === "B101" || title.includes("nasledna");
  });

const isImmediateItem = (item) => {
  const title = normalizeTextKey(item?.title);
  const code = normalizeCommissionCode(item?.code);
  return code === "A101" || title.includes("okamzita") || title.includes("ziskatelska");
};

const isSubsequentItem = (item) => {
  const title = normalizeTextKey(item?.title);
  const code = normalizeCommissionCode(item?.code);
  return code === "B101" || title.includes("nasledna");
};

const subsequentItemForAmount = (amount, existing = null) => ({
  ...(existing ? normalizeItemForStore(existing) : { title: "🔁 Následná provize" }),
  title: existing?.title ? String(existing.title) : "🔁 Následná provize",
  amount,
  code: "B101",
  excludeFromTotal: true,
});

const ensureSubsequentMatchesImmediate = (items, fallbackImmediate = null) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, reason: "missing-items" };
  }

  const normalizedItems = items.map(normalizeItemForStore);
  const immediateIndex = normalizedItems.findIndex(isImmediateItem);
  const immediate =
    immediateIndex >= 0 ? toNumber(normalizedItems[immediateIndex]?.amount) : fallbackImmediate;
  if (!(immediate > 0)) {
    return { ok: false, reason: "missing-immediate" };
  }

  const subsequentIndex = normalizedItems.findIndex(isSubsequentItem);
  const nextItems = normalizedItems.slice();
  if (subsequentIndex >= 0) {
    nextItems[subsequentIndex] = subsequentItemForAmount(
      immediate,
      normalizedItems[subsequentIndex]
    );
  } else {
    const insertIndex = immediateIndex >= 0 ? immediateIndex + 1 : nextItems.length;
    nextItems.splice(insertIndex, 0, subsequentItemForAmount(immediate));
  }

  return {
    ok: true,
    changed:
      JSON.stringify(comparableItems(normalizedItems)) !==
      JSON.stringify(comparableItems(nextItems)),
    items: nextItems,
    oldImmediate: immediateIndex >= 0 ? toNumber(normalizedItems[immediateIndex]?.amount) : null,
    oldSubsequent: subsequentIndex >= 0 ? toNumber(normalizedItems[subsequentIndex]?.amount) : null,
    newImmediate: immediate,
    newSubsequent: immediate,
  };
};

const buildUpdate = (docSnap) => {
  const entry = docSnap.data() ?? {};
  if (String(entry.entryType ?? "contract").trim().toLowerCase() !== "contract") {
    return { skipped: true, reason: "non-contract" };
  }

  const signedIso = toIsoDay(entry.contractSignedDate);
  if (!isAllianzAutoHistoricalPeriod(signedIso)) {
    return { skipped: true, reason: signedIso ? "outside-period" : "missing-date" };
  }

  const position = normalizePosition(entry.position);
  if (!position) return { skipped: true, reason: "missing-position", signedIso };

  const amount = amountForCalculation(entry);
  if (amount <= 0) return { skipped: true, reason: "missing-amount", signedIso };

  const rootItemsResult = ensureSubsequentMatchesImmediate(entry.items);
  if (!rootItemsResult.ok) {
    return { skipped: true, reason: rootItemsResult.reason, signedIso };
  }

  const patch = {};
  const updateKeys = [];

  if (rootItemsResult.changed) {
    patch.items = rootItemsResult.items;
    updateKeys.push("items");
  }

  if (entry.result && typeof entry.result === "object" && !Array.isArray(entry.result)) {
    const nextResult = { ...entry.result };
    const resultItemsResult = ensureSubsequentMatchesImmediate(
      entry.result.items,
      rootItemsResult.newImmediate
    );
    if (resultItemsResult.ok && resultItemsResult.changed) {
      nextResult.items = resultItemsResult.items;
      patch.result = nextResult;
      updateKeys.push("result");
    }
  } else {
    patch.result = {
      items: rootItemsResult.items,
      total: toNumber(entry.total),
    };
    updateKeys.push("result");
  }

  if (Array.isArray(entry.managerOverrides)) {
    let managerOverridesChanged = false;
    const managerOverrides = entry.managerOverrides.map((override) => {
      const overrideResult = ensureSubsequentMatchesImmediate(override?.items);
      if (!overrideResult.ok || !overrideResult.changed) return override;
      managerOverridesChanged = true;
      return {
        ...override,
        items: overrideResult.items,
      };
    });
    if (managerOverridesChanged) {
      patch.managerOverrides = managerOverrides;
      updateKeys.push("managerOverrides");
    }
  }

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
      signedIso,
      position,
      amount,
      frequencyRaw: normalizeFrequency(entry.frequencyRaw),
      oldImmediate: rootItemsResult.oldImmediate,
      oldSubsequent: rootItemsResult.oldSubsequent,
      newImmediate: rootItemsResult.newImmediate,
      newSubsequent: rootItemsResult.newSubsequent,
      oldTotal: toNumber(entry.total),
      newTotal: toNumber(entry.total),
      oldOverrides: Array.isArray(entry.managerOverrides) ? entry.managerOverrides.length : 0,
      newOverrides: Array.isArray(patch.managerOverrides)
        ? patch.managerOverrides.length
        : Array.isArray(entry.managerOverrides)
          ? entry.managerOverrides.length
          : 0,
    },
  };
};

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

  const snap = await db
    .collectionGroup("entries")
    .where("productKey", "==", "allianzAuto")
    .get();

  const stats = {
    scannedAllianzAuto: snap.size,
    historicalCandidates: 0,
    plannedChanges: 0,
    alreadyOk: 0,
    updateKeyCounts: {},
    skipped: {},
  };
  const updates = [];

  for (const docSnap of snap.docs) {
    if (limit != null && updates.length >= limit) break;
    const entry = docSnap.data() ?? {};
    if (targetEmail && normalizeEmail(entry.userEmail) !== targetEmail) continue;
    const built = buildUpdate(docSnap);
    if (built.skipped) {
      stats.skipped[built.reason] = (stats.skipped[built.reason] ?? 0) + 1;
      continue;
    }

    stats.historicalCandidates += 1;
    if (!built.hasChanges) {
      stats.alreadyOk += 1;
      continue;
    }

    stats.plannedChanges += 1;
    built.updateKeys.forEach((key) => {
      stats.updateKeyCounts[key] = (stats.updateKeyCounts[key] ?? 0) + 1;
    });
    updates.push({
      ref: docSnap.ref,
      patch: built.patch,
      meta: built.meta,
      updateKeys: built.updateKeys,
    });

    if (verbose || updates.length <= 40) {
      const meta = built.meta;
      console.log(
        `${apply ? "UPDATE" : "PLAN"} ${meta.path} | signed=${meta.signedIso} | contract=${meta.contractNumber || "-"} | client=${meta.clientName} | pos=${meta.position} | subsequent ${roundMoney(meta.oldSubsequent ?? 0)} -> ${roundMoney(meta.newSubsequent ?? 0)} | immediate ${roundMoney(meta.oldImmediate ?? 0)} -> ${roundMoney(meta.newImmediate ?? 0)} | keys=${built.updateKeys.join(",")}`
      );
    }
  }

  let committed = 0;
  if (apply && updates.length > 0) {
    let batch = db.batch();
    let pending = 0;
    const now = new Date();
    for (const update of updates) {
      batch.update(update.ref, {
        ...update.patch,
        updatedAt: now,
      });
      pending += 1;
      if (pending >= BATCH_LIMIT) {
        await batch.commit();
        committed += pending;
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending > 0) {
      await batch.commit();
      committed += pending;
    }
  }

  console.log("\nsummary");
  console.log(`mode=${apply ? "APPLY" : "DRY_RUN"}`);
  console.log(
    `historical_period=${ALLIANZ_AUTO_HISTORICAL_VALID_FROM} <= contractSignedDate < ${ALLIANZ_AUTO_CURRENT_VALID_FROM}`
  );
  console.log(`scanned_allianz_auto=${stats.scannedAllianzAuto}`);
  console.log(`historical_candidates=${stats.historicalCandidates}`);
  console.log(`planned_changes=${stats.plannedChanges}`);
  console.log(`already_ok=${stats.alreadyOk}`);
  console.log(`update_key_counts=${JSON.stringify(stats.updateKeyCounts)}`);
  console.log(`skipped=${JSON.stringify(stats.skipped)}`);
  console.log(`committed=${committed}`);

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write changes.");
  }
}

main().catch((error) => {
  console.error("Allianz Auto historical subsequent fix failed:", error?.stack ?? error);
  process.exit(1);
});
