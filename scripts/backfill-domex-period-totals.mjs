#!/usr/bin/env node

import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const jiti = createJiti(import.meta.url);
const { calculateDomex } = jiti("../src/app/lib/productFormulas/domex.ts");

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

const normalizeTextKey = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const itemKey = (item) => normalizeTextKey(item?.title);

const isPaymentRow = (item) =>
  String(item?.title ?? "").toLowerCase().includes("(z platby)");

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

const paymentBasedTotals = (items, multiplier) => {
  let immediate = 0;
  let subsequent = 0;
  items.forEach((item) => {
    const title = normalizeTextKey(item?.title);
    if (title.includes("okamzita provize")) {
      immediate += toNumber(item?.amount);
    } else if (title.includes("nasledna provize")) {
      subsequent += toNumber(item?.amount);
    }
  });
  return {
    immediate: roundMoney(immediate * multiplier),
    subsequent: roundMoney(subsequent * multiplier),
  };
};

const totalForDomexItems = (items, frequency) => {
  const multiplier = paymentsPerYear(frequency);
  return paymentBasedTotals(items, multiplier).immediate;
};

const calculateDomexStoredResult = ({ amount, frequency, position }) => {
  const dto = calculateDomex(amount, frequency, position);
  const items = dto.items.filter(isPaymentRow).map(normalizeItemForStore);
  return {
    items,
    total: totalForDomexItems(items, frequency),
  };
};

const diffItemsByTitle = (upperItems, lowerItems) => {
  const upperMap = new Map();
  upperItems.forEach((item) => {
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
  lowerItems.forEach((item) => {
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

const computeManagerOverrides = ({ entry, amount, frequency }) => {
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

    const managerResult = calculateDomexStoredResult({
      amount,
      frequency,
      position: managerPosition,
    });
    const baselineResult = calculateDomexStoredResult({
      amount,
      frequency,
      position: childPositionForBaseline,
    });

    const diffItems = diffItemsByTitle(managerResult.items, baselineResult.items);
    const total = totalForDomexItems(diffItems, frequency);
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

const buildNextCalculation = (entry) => {
  const position = normalizePosition(entry?.position);
  if (!position) return { ok: false, reason: "missing-position" };

  const amount = amountForCalculation(entry);
  if (amount <= 0) return { ok: false, reason: "missing-amount" };

  const frequency = normalizeFrequency(entry.frequencyRaw);
  const result = calculateDomexStoredResult({ amount, frequency, position });
  const managerOverrides = computeManagerOverrides({ entry, amount, frequency });

  return {
    ok: true,
    items: result.items,
    total: result.total,
    managerOverrides,
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
    domexContracts: 0,
    planned: 0,
    alreadyOk: 0,
    totalChanged: 0,
    updateKeyCounts: {},
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
    if (entry.productKey !== "domex") continue;
    if (targetEmail && normalizeEmail(entry.userEmail) !== targetEmail) continue;
    const contractNumber = normalizeContractNumber(entry.contractNumber);
    if (targetContracts.size > 0 && !targetContracts.has(contractNumber)) continue;

    stats.domexContracts += 1;
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
    updateKeys.forEach((key) => {
      stats.updateKeyCounts[key] = (stats.updateKeyCounts[key] ?? 0) + 1;
    });
    if (updateKeys.includes("total")) {
      stats.totalChanged += 1;
    }

    if (verbose || stats.planned <= 30) {
      console.log(
        `${apply ? "UPDATE" : "PLAN"} ${docSnap.ref.path} | ${contractNumber || "bez-cisla"} | keys=${updateKeys.join(",")} | items ${(Array.isArray(entry.items) ? entry.items.length : 0)}->${calculation.items.length} | total ${roundMoney(toNumber(entry.total))}->${roundMoney(calculation.total)}`
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
  console.log(`domex_contracts=${stats.domexContracts}`);
  console.log(`planned_changes=${stats.planned}`);
  console.log(`total_changed=${stats.totalChanged}`);
  console.log(`update_key_counts=${JSON.stringify(stats.updateKeyCounts)}`);
  console.log(`already_ok=${stats.alreadyOk}`);
  console.log(`skipped=${JSON.stringify(stats.skipped)}`);
  console.log(`committed=${committed}`);
  if (!apply) console.log("\nRun with --apply to write changes.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
