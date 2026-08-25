#!/usr/bin/env node

import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const jiti = createJiti(import.meta.url);
const { calculateNeon, normalizeNeonDurationYears } = jiti(
  "../src/app/lib/productFormulas/neon.ts"
);
const { totalWithMultipliers } = jiti("../src/app/lib/commissionTotals.ts");

const TARGET_PATH =
  "users/jakub.pokorny@bohemika.eu/entries/idem_b0d5e6635b3e606a1ada0cfb5f9e842a0ebc0713";
const TARGET_CONTRACT_NUMBER = "7503217987";
const TARGET_SIGNED_DATE = "2026-06-09";
const OLD_POSITION = "poradce5";
const NEW_POSITION = "poradce4";

const hasArg = (name) => process.argv.includes(name);

const normalizeEmail = (value) =>
  typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;

const normalizePosition = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const normalizeMode = (value, fallback = "standard") =>
  value === "accelerated" || value === "standard" ? value : fallback;

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) => Math.round(toNumber(value) * 100) / 100;

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toIsoDay = (value) => toDate(value)?.toISOString().slice(0, 10) ?? null;

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
  return projectId && clientEmail && privateKeyRaw
    ? {
        projectId,
        clientEmail,
        privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
      }
    : null;
};

const calculationAmount = (entry) => {
  const calculation = toNumber(entry.calculationInputAmount);
  if (calculation > 0) return calculation;
  const input = toNumber(entry.inputAmount);
  if (input > 0) return input;
  return toNumber(entry.effectiveInputAmount);
};

const normalizeCode = (value) =>
  typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "") : "";

const normalizeTitle = (value) => String(value ?? "").trim().toLowerCase();

const isTotalItem = (item) =>
  normalizeCode(item?.code) === "TOTAL" || normalizeTitle(item?.title).includes("celkem");

const itemKey = (item) => {
  const code = normalizeCode(item?.code);
  if (code) return `code:${code}`;
  const title = normalizeTitle(item?.title);
  if (title.includes("okamžit")) return "title:immediate";
  if (title.includes("po 3")) return "title:after3";
  if (title.includes("po 4")) return "title:after4";
  if (title.includes("2.–5.")) return "title:subsequent25";
  if (title.includes("5.–10.")) return "title:subsequent510";
  return `title:${title}`;
};

const storeItem = (item, amount = item?.amount) => ({
  title: String(item?.title ?? ""),
  amount: roundMoney(amount),
  ...(item?.code ? { code: String(item.code) } : {}),
  ...(item?.note ? { note: String(item.note) } : {}),
  ...(item?.excludeFromTotal ? { excludeFromTotal: true } : {}),
});

const cleanItems = (items) =>
  (Array.isArray(items) ? items : []).filter((item) => !isTotalItem(item));

const diffItems = (upperItems, lowerItems) => {
  const upper = new Map();
  cleanItems(upperItems).forEach((item) => {
    const key = itemKey(item);
    const previous = upper.get(key);
    upper.set(key, {
      ...item,
      amount: toNumber(previous?.amount) + toNumber(item?.amount),
    });
  });

  const result = [];
  cleanItems(lowerItems).forEach((item) => {
    const key = itemKey(item);
    const upperItem = upper.get(key);
    const remaining = toNumber(upperItem?.amount) - toNumber(item?.amount);
    if (remaining > 0.004) result.push(storeItem(upperItem ?? item, remaining));
    upper.delete(key);
  });
  upper.forEach((item) => {
    if (toNumber(item?.amount) > 0.004) result.push(storeItem(item));
  });
  return result;
};

const calculateForPosition = ({ entry, position, commissionMode, amount, signedDate }) => {
  const directOverride = entry.neonCoefficientSetOverride;
  const genericOverride = entry.commissionCoefficientSetOverride;
  const coefficientSetOverride =
    directOverride === "historical" || directOverride === "current"
      ? directOverride
      : genericOverride === "historical" || genericOverride === "current"
        ? genericOverride
        : null;
  const years = normalizeNeonDurationYears(
    Number.isFinite(Number(entry.durationYears)) ? Number(entry.durationYears) : null,
    signedDate,
    coefficientSetOverride
  );
  return calculateNeon(
    amount,
    position,
    years,
    commissionMode,
    signedDate,
    coefficientSetOverride
  );
};

const buildManagerOverrides = ({ entry, amount, signedDate }) => {
  const chain = Array.isArray(entry.managerChain) ? entry.managerChain : [];
  const overrides = [];
  let childPosition = NEW_POSITION;

  for (const manager of chain) {
    const managerPosition = normalizePosition(manager?.position);
    if (!managerPosition) continue;
    const managerMode = normalizeMode(manager?.commissionMode, "standard");
    const upper = calculateForPosition({
      entry,
      position: managerPosition,
      commissionMode: managerMode,
      amount,
      signedDate,
    });
    const lower = calculateForPosition({
      entry,
      position: childPosition,
      commissionMode: managerMode,
      amount,
      signedDate,
    });
    if (!upper || !lower) throw new Error(`Manager calculation failed for ${managerPosition}.`);

    const items = diffItems(upper.items, lower.items);
    const total = roundMoney(totalWithMultipliers(items));
    if (items.length > 0 && total > 0) {
      overrides.push({
        email: normalizeEmail(manager?.email),
        position: managerPosition,
        commissionMode: managerMode,
        items,
        total,
      });
    }
    childPosition = managerPosition;
  }
  return overrides;
};

const itemAmount = (items, code) =>
  roundMoney(
    cleanItems(items)
      .filter((item) => normalizeCode(item?.code) === code)
      .reduce((sum, item) => sum + toNumber(item?.amount), 0)
  );

const summarizeOverride = (override) => ({
  email: override.email,
  position: override.position,
  A101: itemAmount(override.items, "A101"),
  B0301: itemAmount(override.items, "B0301"),
  total: roundMoney(override.total),
});

async function main() {
  const apply = hasArg("--apply");
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing Firebase admin credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const ref = db.doc(TARGET_PATH);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Target not found: ${TARGET_PATH}`);

  const entry = snap.data() ?? {};
  if (String(entry.contractNumber ?? "").trim() !== TARGET_CONTRACT_NUMBER) {
    throw new Error(`Unexpected contract number ${entry.contractNumber}.`);
  }
  if (entry.entryType !== "endorsement") {
    throw new Error(`Unexpected entry type ${entry.entryType}.`);
  }
  if (entry.productKey !== "neon") throw new Error(`Unexpected product ${entry.productKey}.`);
  const signedDate = toIsoDay(entry.contractSignedDate);
  if (signedDate !== TARGET_SIGNED_DATE) {
    throw new Error(`Unexpected signed date ${signedDate}.`);
  }
  const currentPosition = normalizePosition(entry.position);
  if (currentPosition !== OLD_POSITION && currentPosition !== NEW_POSITION) {
    throw new Error(`Unexpected current position ${currentPosition}.`);
  }

  const amount = calculationAmount(entry);
  if (amount <= 0) throw new Error("Missing calculation amount.");
  const adviserMode = normalizeMode(entry.commissionMode, "accelerated");
  const adviserResult = calculateForPosition({
    entry,
    position: NEW_POSITION,
    commissionMode: adviserMode,
    amount,
    signedDate,
  });
  if (!adviserResult) throw new Error("Adviser calculation failed.");

  const adviserItems = adviserResult.items.map((item) => storeItem(item));
  const adviserTotal = roundMoney(adviserResult.total);
  const managerOverrides = buildManagerOverrides({ entry, amount, signedDate });
  const patch = {
    position: NEW_POSITION,
    items: adviserItems,
    total: adviserTotal,
    managerOverrides,
  };
  if (entry.result && typeof entry.result === "object" && !Array.isArray(entry.result)) {
    patch.result = { ...entry.result, items: adviserItems, total: adviserTotal };
  }

  console.log(`mode=${apply ? "APPLY" : "DRY_RUN"}`);
  console.log(`path=${TARGET_PATH}`);
  console.log(`position=${currentPosition} -> ${NEW_POSITION}`);
  console.log(`signed=${signedDate}`);
  console.log(`calculationAmount=${amount}`);
  console.log(`adviserTotal=${roundMoney(entry.total)} -> ${adviserTotal}`);
  console.log(`adviserA101=${itemAmount(adviserItems, "A101")}`);
  console.log(`adviserB0301=${itemAmount(adviserItems, "B0301")}`);
  console.log(`managerOverrides=${JSON.stringify(managerOverrides.map(summarizeOverride))}`);

  if (!apply) {
    console.log("DRY_RUN_ONLY");
    return;
  }

  await ref.update({ ...patch, updatedAt: new Date() });
  console.log("APPLIED=1");
}

main().catch((error) => {
  console.error(`fix_failed=${error?.stack ?? error?.message ?? error}`);
  process.exit(1);
});
