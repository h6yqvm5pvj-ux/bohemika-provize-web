const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { createJiti } = require("jiti");

loadEnvConfig(process.cwd());

const jiti = createJiti(`${process.cwd()}/`);
const formulas = jiti("./src/app/lib/productFormulas.ts");
const { totalWithMultipliers } = jiti("./src/app/lib/commissionTotals.ts");
const { computeLegacyFrequencyOverrideTotal } = jiti(
  "./src/app/lib/managerOverrideTotals.ts"
);

const CUTOFF_EXCLUSIVE_ISO = "2025-04-01";
const LIFE_PRODUCTS = new Set(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"]);
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

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizeMode(value) {
  return value === "accelerated" || value === "standard" ? value : null;
}

function normalizePosition(value) {
  if (typeof value !== "string") return null;
  return POSITION_SET.has(value) ? value : null;
}

function normalizeFrequency(value) {
  return value === "monthly" ||
    value === "quarterly" ||
    value === "semiannual" ||
    value === "annual"
    ? value
    : "annual";
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  const n = toNumber(value);
  return Math.round(n * 100) / 100;
}

function normalizeAmount(value) {
  const n = toNumber(value);
  return Math.round(n * 1_000_000) / 1_000_000;
}

function toNonNegativeNumber(value) {
  return Math.max(0, toNumber(value));
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDay(value) {
  const d = toDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeContractNumber(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
}

function normalizedDurationYears(product, years, signedIso) {
  if (product === "neon") {
    return formulas.normalizeNeonDurationYears(years, signedIso);
  }
  const fallback = product === "flexi" ? 30 : product === "maximaMaxEfekt" ? 20 : 1;
  const max = product === "flexi" ? 80 : product === "maximaMaxEfekt" ? 20 : 1;
  const raw = typeof years === "number" && Number.isFinite(years) ? years : fallback;
  return Math.min(max, Math.max(1, Math.floor(raw)));
}

function entryCalculationAmount(entry) {
  const calculation = toNumber(entry.calculationInputAmount);
  if (calculation > 0) return calculation;
  const input = toNumber(entry.inputAmount);
  if (input > 0) return input;
  const effective = toNumber(entry.effectiveInputAmount);
  if (effective > 0) return effective;
  return 0;
}

function computeItemsForEntry(entry, position, mode, amountOverride = null) {
  if (!position || !LIFE_PRODUCTS.has(entry.productKey)) return null;
  const amount =
    amountOverride == null
      ? toNonNegativeNumber(entryCalculationAmount(entry))
      : toNonNegativeNumber(amountOverride);
  const signedIso = toIsoDay(entry.contractSignedDate);

  switch (entry.productKey) {
    case "neon":
      return formulas.calculateNeon(
        amount,
        position,
        normalizedDurationYears("neon", entry.durationYears, signedIso),
        mode,
        signedIso
      );
    case "flexi":
      return formulas.calculateFlexi(
        amount,
        position,
        mode,
        normalizedDurationYears("flexi", entry.durationYears, signedIso)
      );
    case "maximaMaxEfekt":
      return formulas.calculateMaxEfekt(
        amount,
        normalizedDurationYears("maximaMaxEfekt", entry.durationYears, signedIso),
        position,
        mode
      );
    case "pillowInjury":
      return formulas.calculatePillowInjury(amount, position, mode);
    default:
      return null;
  }
}

function normalizeTitleKey(title) {
  const normalized = String(title ?? "").toLowerCase();
  if (normalized.includes("z platby")) return `payment-${normalized}`;
  if (normalized.includes("za rok")) return `annual-${normalized}`;
  if (normalized.includes("okamžitá")) return "immediate";
  if (normalized.includes("po 3")) return "po3";
  if (normalized.includes("po 4")) return "po4";
  if (normalized.includes("2.–5.")) return "nasl25";
  if (normalized.includes("5.–10.")) return "nasl510";
  if (normalized.includes("od 6.")) return "nasl6plus";
  return normalized;
}

function normalizeCommissionCodeKey(code) {
  return typeof code === "string" ? code.trim().toUpperCase().replace(/\s+/g, "") : "";
}

function commissionItemDiffKey(item) {
  const code = normalizeCommissionCodeKey(item?.code);
  return code ? `code:${code}` : normalizeTitleKey(item?.title);
}

function stripTotalRows(items = []) {
  return items.filter((item) => {
    const code = normalizeCommissionCodeKey(item?.code);
    return code !== "TOTAL" && !normalizeTitleKey(item?.title).includes("celkem");
  });
}

function normalizeItems(items = []) {
  return items.map((item) => ({
    title: String(item.title ?? "").trim(),
    amount: normalizeAmount(item.amount ?? 0),
    ...(item.code ? { code: item.code } : {}),
    ...(item.note ? { note: item.note } : {}),
  }));
}

function immediateFromItems(items = []) {
  return normalizeAmount(
    items.reduce((sum, item) => {
      const title = String(item.title ?? "").toLowerCase();
      if (
        !title.includes("okamžitá") &&
        !title.includes("provize a101") &&
        !title.includes("provize b0301") &&
        !title.includes("50% z b3601") &&
        !title.includes("50% z b36")
      ) {
        return sum;
      }
      return sum + toNumber(item.amount);
    }, 0)
  );
}

function normalizeTipTitle(title) {
  return String(title ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isTipImmediateBaseTitle(title) {
  const normalized = normalizeTipTitle(title);
  return (
    normalized.includes("okamzita provize") ||
    normalized.includes("ziskatelska provize") ||
    normalized.includes("provize a101") ||
    normalized.includes("provize b0301") ||
    normalized.includes("50% z b3601") ||
    normalized.includes("50% z b36")
  );
}

function isTipImmediateAnnualTitle(title) {
  const normalized = normalizeTipTitle(title);
  return normalized.includes("za rok") && !normalized.includes("nasledna");
}

function sumTipImmediateFirstYear(items) {
  const annualImmediate = items.reduce(
    (sum, item) => sum + (isTipImmediateAnnualTitle(item.title) ? toNumber(item.amount) : 0),
    0
  );
  if (annualImmediate > 0) return annualImmediate;
  return items.reduce(
    (sum, item) => sum + (isTipImmediateBaseTitle(item.title) ? toNumber(item.amount) : 0),
    0
  );
}

function applyTipAdjustment(items, tipsterPercent) {
  const ratio = 1 - tipsterPercent / 100;
  const adjustedItems = items.map((item) => {
    if (!isTipImmediateBaseTitle(item.title) && !isTipImmediateAnnualTitle(item.title)) {
      return item;
    }
    return {
      ...item,
      amount: roundMoney(toNumber(item.amount) * ratio),
    };
  });
  const immediateGross = roundMoney(sumTipImmediateFirstYear(items));
  const tipsterAmount = roundMoney(immediateGross * (tipsterPercent / 100));
  const immediateNet = roundMoney(immediateGross - tipsterAmount);
  return { items: adjustedItems, immediateGross, tipsterAmount, immediateNet };
}

function computeManagerDiff(entry, managerPosition, childPosition) {
  const amount = entryCalculationAmount(entry);
  const managerResult = computeItemsForEntry(entry, managerPosition, "standard", amount);
  const baselineResult = computeItemsForEntry(entry, childPosition, "standard", amount);
  if (!managerResult || !baselineResult) return { items: [], total: 0, immediate: 0 };

  const managerMap = new Map();
  stripTotalRows(managerResult.items).forEach((item) => {
    const key = commissionItemDiffKey(item);
    const previous = managerMap.get(key);
    managerMap.set(key, {
      title: item.title ?? previous?.title ?? key,
      amount: toNumber(previous?.amount) + toNumber(item.amount),
      code: item.code ?? previous?.code ?? null,
      note: item.note ?? previous?.note ?? null,
    });
  });

  const diffItems = [];
  stripTotalRows(baselineResult.items).forEach((item) => {
    const key = commissionItemDiffKey(item);
    const managerValue = managerMap.get(key);
    const remaining = toNumber(managerValue?.amount) - toNumber(item.amount);
    if (remaining > 0) {
      diffItems.push({
        title: managerValue?.title ?? item.title,
        amount: remaining,
        code: managerValue?.code ?? item.code ?? null,
        ...(managerValue?.note || item.note ? { note: managerValue?.note ?? item.note } : {}),
      });
    }
    managerMap.delete(key);
  });

  managerMap.forEach((value) => {
    if (toNumber(value.amount) > 0) {
      diffItems.push({
        title: value.title,
        amount: value.amount,
        code: value.code ?? null,
        ...(value.note ? { note: value.note } : {}),
      });
    }
  });

  const normalizedItems = normalizeItems(diffItems);
  const total = normalizeAmount(
    computeLegacyFrequencyOverrideTotal({
      productKey: entry.productKey,
      frequencyRaw: normalizeFrequency(entry.frequencyRaw),
      items: normalizedItems,
      fallbackTotal: totalWithMultipliers(normalizedItems),
    })
  );
  return {
    items: normalizedItems,
    total,
    immediate: immediateFromItems(normalizedItems),
  };
}

function normalizedManagerChain(entry) {
  const raw = Array.isArray(entry.managerChain) ? entry.managerChain : [];
  return raw
    .map((node) => ({
      original: node,
      email: normalizeEmail(node?.email),
      position: normalizePosition(node?.position),
    }))
    .filter((node) => Boolean(node.email));
}

function buildManagerOverrides(entry, adviserPosition) {
  const overrides = [];
  let childPosition = adviserPosition;

  for (const manager of normalizedManagerChain(entry)) {
    if (!manager.position || !childPosition) {
      childPosition = manager.position ?? childPosition;
      continue;
    }

    const diff = computeManagerDiff(entry, manager.position, childPosition);
    if (diff.items.length > 0 && diff.total > 0) {
      overrides.push({
        email: manager.email,
        position: manager.position,
        commissionMode: "standard",
        items: diff.items,
        total: diff.total,
      });
    }
    childPosition = manager.position;
  }

  return overrides;
}

function buildStandardManagerChain(entry) {
  const raw = Array.isArray(entry.managerChain) ? entry.managerChain : [];
  return raw.map((node) => {
    const email = normalizeEmail(node?.email);
    if (!email) return node;
    return {
      ...node,
      email,
      commissionMode: "standard",
    };
  });
}

function buildAllowedEmails(ownerEmail, managerEmailSnapshot, managerChain, managerOverrides) {
  const out = new Set();
  const push = (value) => {
    const email = normalizeEmail(value);
    if (email) out.add(email);
  };
  push(ownerEmail);
  push(managerEmailSnapshot);
  managerChain.forEach((node) => push(node?.email));
  managerOverrides.forEach((override) => push(override?.email));
  return [...out];
}

function comparableItems(items = []) {
  return normalizeItems(items).sort((a, b) => {
    const title = a.title.localeCompare(b.title, "cs");
    if (title !== 0) return title;
    return a.amount - b.amount;
  });
}

function comparableOverrides(overrides = []) {
  return overrides
    .map((override) => ({
      email: normalizeEmail(override.email),
      position: normalizePosition(override.position),
      commissionMode: normalizeMode(override.commissionMode),
      total: normalizeAmount(override.total),
      items: comparableItems(override.items ?? []),
    }))
    .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "", "cs"));
}

function hasAcceleratedSignal(entry) {
  if (normalizeMode(entry.commissionMode) === "accelerated") return true;
  if (normalizeMode(entry.managerModeSnapshot) === "accelerated") return true;
  if (
    Array.isArray(entry.managerChain) &&
    entry.managerChain.some((node) => normalizeMode(node?.commissionMode) === "accelerated")
  ) {
    return true;
  }
  if (
    Array.isArray(entry.managerOverrides) &&
    entry.managerOverrides.some((override) => normalizeMode(override?.commissionMode) === "accelerated")
  ) {
    return true;
  }

  const hasAcceleratedItem = (items) =>
    Array.isArray(items) &&
    items.some((item) => {
      const code = normalizeCommissionCodeKey(item?.code);
      const title = normalizeTitleKey(item?.title);
      return (
        code === "B3601_HALF" ||
        code === "B36_HALF" ||
        title.includes("50% z b3601") ||
        title.includes("50% z b36")
      );
    });

  if (hasAcceleratedItem(entry.items)) return true;
  if (hasAcceleratedItem(entry.result?.items)) return true;
  return (
    Array.isArray(entry.managerOverrides) &&
    entry.managerOverrides.some((override) => hasAcceleratedItem(override?.items))
  );
}

function isDifferent(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function buildPatch(entry, ownerEmail) {
  const adviserPosition = normalizePosition(entry.position);
  if (!adviserPosition) {
    return { ok: false, reason: "missing_adviser_position" };
  }

  const standardResult = computeItemsForEntry(entry, adviserPosition, "standard");
  if (!standardResult) {
    return { ok: false, reason: "formula_failed" };
  }

  let nextItems = normalizeItems(standardResult.items);
  let nextTotal = normalizeAmount(standardResult.total);
  const tipsterPercent =
    typeof entry.tipContractTipsterPercent === "number" &&
    Number.isFinite(entry.tipContractTipsterPercent)
      ? entry.tipContractTipsterPercent
      : null;
  const tipPatch = {};

  if (tipsterPercent != null) {
    const tipAdjusted = applyTipAdjustment(nextItems, tipsterPercent);
    nextItems = normalizeItems(tipAdjusted.items);
    nextTotal = roundMoney(Math.max(0, nextTotal - tipAdjusted.tipsterAmount));
    tipPatch.tipContractImmediateFirstYearGross = tipAdjusted.immediateGross;
    tipPatch.tipContractImmediateFirstYearNet = tipAdjusted.immediateNet;
    tipPatch.tipContractTipsterAmountFirstYear = tipAdjusted.tipsterAmount;
  }

  const managerChain = buildStandardManagerChain(entry);
  const managerOverrides = buildManagerOverrides(entry, adviserPosition);
  const topManagerEmail = normalizeEmail(managerChain[0]?.email);
  const managerModeSnapshot = topManagerEmail ? "standard" : entry.managerModeSnapshot ?? null;
  const allowedEmails = buildAllowedEmails(
    ownerEmail,
    entry.managerEmailSnapshot,
    managerChain,
    managerOverrides
  );

  const patch = {
    commissionMode: "standard",
    items: nextItems,
    total: nextTotal,
    result: {
      items: nextItems,
      total: nextTotal,
    },
    managerChain,
    managerOverrides,
    managerModeSnapshot,
    allowedEmails,
    ...tipPatch,
  };

  return { ok: true, patch };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const snap = await db.collectionGroup("entries").get();

  const planned = [];
  const skipped = new Map();
  let scannedEntries = 0;
  let lifeContracts = 0;
  let lifeContractsBeforeCutoff = 0;
  let acceleratedSignalBeforeCutoff = 0;

  for (const docSnap of snap.docs) {
    scannedEntries += 1;
    const entry = docSnap.data() || {};
    const entryType =
      typeof entry.entryType === "string" && entry.entryType.trim()
        ? entry.entryType.trim().toLowerCase()
        : "contract";
    if (entryType !== "contract") continue;
    if (!LIFE_PRODUCTS.has(entry.productKey)) continue;
    lifeContracts += 1;

    const signedIso = toIsoDay(entry.contractSignedDate);
    if (!signedIso || signedIso >= CUTOFF_EXCLUSIVE_ISO) continue;
    lifeContractsBeforeCutoff += 1;
    const acceleratedSignal = hasAcceleratedSignal(entry);
    if (acceleratedSignal) acceleratedSignalBeforeCutoff += 1;
    if (!acceleratedSignal) continue;

    const ownerEmail =
      normalizeEmail(entry.userEmail) ??
      normalizeEmail(docSnap.ref.parent.parent?.id) ??
      "unknown";
    const built = buildPatch(entry, ownerEmail);
    if (!built.ok) {
      skipped.set(built.reason, (skipped.get(built.reason) ?? 0) + 1);
      continue;
    }

    const beforeImmediate = immediateFromItems(entry.items ?? []);
    const afterImmediate = immediateFromItems(built.patch.items ?? []);
    const beforeOverrides = comparableOverrides(entry.managerOverrides ?? []);
    const afterOverrides = comparableOverrides(built.patch.managerOverrides ?? []);
    const beforeChain = JSON.stringify(entry.managerChain ?? []);
    const afterChain = JSON.stringify(built.patch.managerChain ?? []);
    const changed =
      normalizeMode(entry.commissionMode) !== "standard" ||
      isDifferent(comparableItems(entry.items ?? []), comparableItems(built.patch.items)) ||
      normalizeAmount(entry.total) !== normalizeAmount(built.patch.total) ||
      isDifferent(beforeOverrides, afterOverrides) ||
      beforeChain !== afterChain ||
      normalizeMode(entry.managerModeSnapshot) !== normalizeMode(built.patch.managerModeSnapshot);

    if (!changed) continue;

    planned.push({
      ref: docSnap.ref,
      path: docSnap.ref.path,
      contractNumber: normalizeContractNumber(entry.contractNumber),
      clientName: typeof entry.clientName === "string" && entry.clientName.trim()
        ? entry.clientName.trim()
        : "—",
      ownerEmail,
      productKey: entry.productKey,
      signedIso,
      beforeImmediate,
      afterImmediate,
      beforeTotal: normalizeAmount(entry.total),
      afterTotal: normalizeAmount(built.patch.total),
      beforeOverrideCount: beforeOverrides.length,
      afterOverrideCount: afterOverrides.length,
      acceleratedSignal,
      patch: built.patch,
    });
  }

  planned.sort((a, b) => {
    if (a.signedIso !== b.signedIso) return a.signedIso.localeCompare(b.signedIso);
    return a.contractNumber.localeCompare(b.contractNumber, "cs");
  });

  const sums = planned.reduce(
    (acc, row) => {
      acc.beforeImmediate += row.beforeImmediate;
      acc.afterImmediate += row.afterImmediate;
      acc.beforeTotal += row.beforeTotal;
      acc.afterTotal += row.afterTotal;
      return acc;
    },
    { beforeImmediate: 0, afterImmediate: 0, beforeTotal: 0, afterTotal: 0 }
  );

  console.log(`cutoff_exclusive=${CUTOFF_EXCLUSIVE_ISO}`);
  console.log(`scanned_entries=${scannedEntries}`);
  console.log(`life_contracts=${lifeContracts}`);
  console.log(`life_contracts_before_cutoff=${lifeContractsBeforeCutoff}`);
  console.log(`accelerated_signal_before_cutoff=${acceleratedSignalBeforeCutoff}`);
  console.log(`contracts_to_update=${planned.length}`);
  console.log(`sum_before_immediate=${roundMoney(sums.beforeImmediate)}`);
  console.log(`sum_after_immediate=${roundMoney(sums.afterImmediate)}`);
  console.log(`sum_delta_immediate=${roundMoney(sums.afterImmediate - sums.beforeImmediate)}`);
  console.log(`sum_before_total=${roundMoney(sums.beforeTotal)}`);
  console.log(`sum_after_total=${roundMoney(sums.afterTotal)}`);
  console.log(`sum_delta_total=${roundMoney(sums.afterTotal - sums.beforeTotal)}`);
  if (skipped.size > 0) {
    console.log(
      `skipped=${[...skipped.entries()].map(([key, count]) => `${key}:${count}`).join(",")}`
    );
  }
  console.log("--- contracts");
  planned.forEach((row) => {
    console.log(
      [
        row.contractNumber,
        row.clientName,
        row.ownerEmail,
        row.productKey,
        `signed=${row.signedIso}`,
        `imm=${roundMoney(row.beforeImmediate)}->${roundMoney(row.afterImmediate)}`,
        `total=${roundMoney(row.beforeTotal)}->${roundMoney(row.afterTotal)}`,
        `overrides=${row.beforeOverrideCount}->${row.afterOverrideCount}`,
        `acceleratedSignal=${row.acceleratedSignal ? "yes" : "no"}`,
        row.path,
      ].join(" | ")
    );
  });

  if (!apply) {
    console.log("DRY_RUN_ONLY");
    return;
  }

  if (planned.length === 0) {
    console.log("NO_UPDATES_TO_APPLY");
    return;
  }

  let batch = db.batch();
  let ops = 0;
  let committed = 0;
  const now = new Date();

  for (const row of planned) {
    batch.set(
      row.ref,
      {
        ...row.patch,
        updatedAt: now,
      },
      { merge: true }
    );
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      committed += ops;
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
    committed += ops;
  }

  console.log(`APPLIED=${committed}`);
}

main().catch((error) => {
  console.error(`rewrite_failed=${error?.message ?? error}`);
  process.exit(1);
});
