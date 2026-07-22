#!/usr/bin/env node

import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const jiti = createJiti(import.meta.url);
const { calculatePillowMajetek } = jiti("../src/app/lib/productFormulas.ts");
const { totalWithMultipliers } = jiti("../src/app/lib/commissionTotals.ts");
const { computeLegacyFrequencyOverrideTotal } = jiti(
  "../src/app/lib/managerOverrideTotals.ts"
);

const TARGET_PATH =
  "users/jakub.rauscher@bohemika.eu/entries/slHEHKTAqEZHxKDqNuay";
const TARGET_CONTRACT_NUMBER = "24361920";
const TARGET_OWNER = "jakub.rauscher@bohemika.eu";
const TARGET_MANAGER = "petr.rauscher@bohemika.eu";
const TARGET_PRODUCT = "pillowmajetek";
const TEAM_OVERVIEW_TOTALS_COLLECTION = "teamOverviewTotals";
const TEAM_OVERVIEW_MONTHLY_COLLECTION = "teamOverviewMonthly";

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

const hasArg = (name) => process.argv.includes(name);

const normalizeEmail = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const normalizeContractNumber = (value) =>
  String(value ?? "").replace(/\s+/g, "").trim();

const normalizePosition = (value) =>
  typeof value === "string" && POSITION_SET.has(value) ? value : null;

const normalizeMode = (value) =>
  value === "accelerated" || value === "standard" ? value : null;

const normalizeFrequency = (value) =>
  typeof value === "string" && FREQUENCY_SET.has(value) ? value : "annual";

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

const comparableNumber = (value) => Math.round(toNumber(value) * 1e8) / 1e8;

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
  if (typeof value === "string" && ISO_DAY_RE.test(value.trim())) {
    return value.trim();
  }
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
    if (!position || !ISO_DAY_RE.test(validFrom)) return;
    if (validTo && !ISO_DAY_RE.test(validTo)) return;
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
  if (!signedDateIso || !ISO_DAY_RE.test(signedDateIso)) return null;
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

function resolvePositionForSignedDate(userData, signedDateIso, fallbackPosition = null) {
  const match = resolvePositionTimelineMatch(
    signedDateIso,
    parsePositionTimeline(userData?.positionTimeline)
  );
  return match?.position ?? normalizePosition(userData?.position) ?? fallbackPosition;
}

function chooseUserRecord(existing, candidate) {
  if (!existing) return candidate;
  const candidateIsCanonical = candidate.docId.toLowerCase() === candidate.email;
  const existingTimeline = parsePositionTimeline(existing.positionTimeline);
  const candidateTimeline = parsePositionTimeline(candidate.positionTimeline);
  return {
    ...existing,
    docId: candidateIsCanonical ? candidate.docId : existing.docId,
    managerEmail: candidateIsCanonical || !existing.managerEmail ? candidate.managerEmail : existing.managerEmail,
    position: candidateIsCanonical || !existing.position ? candidate.position : existing.position,
    commissionMode:
      candidateIsCanonical || !existing.commissionMode
        ? candidate.commissionMode
        : existing.commissionMode,
    positionTimeline:
      candidateTimeline.length > 0 && (candidateIsCanonical || existingTimeline.length === 0)
        ? candidate.positionTimeline
        : existing.positionTimeline,
  };
}

async function loadUsersByEmail(db) {
  const snap = await db.collection("users").get();
  const users = new Map();
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const email = normalizeEmail(data.email ?? docSnap.id);
    if (!email) return;
    const candidate = {
      email,
      docId: docSnap.id,
      managerEmail: normalizeEmail(data.managerEmail),
      position: normalizePosition(data.position),
      commissionMode: normalizeMode(data.commissionMode),
      positionTimeline: data.positionTimeline ?? null,
    };
    users.set(email, chooseUserRecord(users.get(email), candidate));
  });
  return users;
}

function amountForCalculation(entry) {
  const calculation = toNumber(entry?.calculationInputAmount);
  if (calculation > 0) return calculation;
  const effective = toNumber(entry?.effectiveInputAmount);
  if (effective > 0) return effective;
  const input = toNumber(entry?.inputAmount);
  return input > 0 ? input : 0;
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

function computePillowMajetekResult(entry, position) {
  if (!position) return null;
  return calculatePillowMajetek(
    Math.max(0, amountForCalculation(entry)),
    normalizeFrequency(entry.frequencyRaw),
    position
  );
}

function computeManagerOverrides(entry, managerChain) {
  const adviserPosition = normalizePosition(entry.position);
  const adviserMode = normalizeMode(entry.commissionMode) ?? "accelerated";
  if (!adviserPosition) return [];

  const overrides = [];
  let childPosition = adviserPosition;

  managerChain.forEach((manager) => {
    const managerPosition = normalizePosition(manager.position);
    if (!managerPosition || !childPosition) {
      childPosition = managerPosition ?? childPosition;
      return;
    }

    const managerResult = computePillowMajetekResult(entry, managerPosition);
    const baselineResult = computePillowMajetekResult(entry, childPosition);
    if (!managerResult || !baselineResult) {
      childPosition = managerPosition;
      return;
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
      if (toNumber(value.amount) <= 0) return;
      diffItems.push({
        title: value.title,
        amount: value.amount,
        code: value.code ?? null,
        ...(value.note ? { note: value.note } : {}),
        ...(value.excludeFromTotal ? { excludeFromTotal: true } : {}),
      });
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
        email: normalizeEmail(manager.email),
        position: managerPosition,
        commissionMode: normalizeMode(manager.commissionMode) ?? adviserMode,
        items: normalizedItems,
        total,
      });
    }

    childPosition = managerPosition;
  });

  return overrides;
}

function buildAllowedEmails(existingAllowed, ownerEmail, managerChain, managerOverrides) {
  const emails = new Set();
  const push = (value) => {
    const email = normalizeEmail(value);
    if (email) emails.add(email);
  };
  if (Array.isArray(existingAllowed)) existingAllowed.forEach(push);
  push(ownerEmail);
  managerChain.forEach((row) => push(row.email));
  managerOverrides.forEach((row) => push(row.email));
  return Array.from(emails).sort();
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

const jsonChanged = (a, b) => JSON.stringify(a) !== JSON.stringify(b);

const currentYearMonth = (now) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const teamOverviewMonthDocId = (ownerEmail, yearMonth) =>
  `${normalizeEmail(ownerEmail)}___${yearMonth}`;

async function markTeamOverviewOwnersDirty(db, ownerEmails) {
  const owners = Array.from(
    new Set(ownerEmails.map(normalizeEmail).filter(Boolean))
  );
  if (owners.length === 0) return 0;

  const yearMonth = currentYearMonth(new Date());
  const batch = db.batch();
  let ops = 0;
  owners.forEach((ownerEmail) => {
    batch.delete(db.collection(TEAM_OVERVIEW_TOTALS_COLLECTION).doc(ownerEmail));
    batch.delete(
      db
        .collection(TEAM_OVERVIEW_MONTHLY_COLLECTION)
        .doc(teamOverviewMonthDocId(ownerEmail, yearMonth))
    );
    ops += 2;
  });
  await batch.commit();
  return ops;
}

function buildPatch(entry, usersByEmail) {
  const ownerEmail = normalizeEmail(entry.userEmail) ?? TARGET_OWNER;
  const managerEmail = normalizeEmail(entry.managerEmailSnapshot) ?? TARGET_MANAGER;
  const signedDateIso = toIsoDay(entry.contractSignedDate);
  const managerProfile = usersByEmail.get(managerEmail);
  const managerPosition = resolvePositionForSignedDate(
    managerProfile,
    signedDateIso,
    normalizePosition(entry.managerPositionSnapshot)
  );
  const managerMode =
    normalizeMode(managerProfile?.commissionMode) ??
    normalizeMode(entry.managerModeSnapshot) ??
    normalizeMode(entry.commissionMode) ??
    "accelerated";

  if (!managerProfile) throw new Error(`Manager profile not found: ${managerEmail}`);
  if (!managerPosition) {
    throw new Error(`Manager position unresolved for ${managerEmail} at ${signedDateIso}`);
  }

  const managerChain = [
    {
      email: managerEmail,
      position: managerPosition,
      commissionMode: managerMode,
    },
  ];
  const managerOverrides = computeManagerOverrides(entry, managerChain);
  const allowedEmails = buildAllowedEmails(
    entry.allowedEmails,
    ownerEmail,
    managerChain,
    managerOverrides
  );

  const patch = {};
  const updateKeys = [];
  const setIfChanged = (key, value, comparable = null) => {
    const currentComparable = comparable ? comparable(entry[key]) : entry[key];
    const nextComparable = comparable ? comparable(value) : value;
    if (JSON.stringify(currentComparable) === JSON.stringify(nextComparable)) return;
    patch[key] = value;
    updateKeys.push(key);
  };

  setIfChanged("managerEmailSnapshot", managerEmail);
  setIfChanged("managerPositionSnapshot", managerPosition);
  setIfChanged("managerModeSnapshot", managerMode);
  setIfChanged("managerChain", managerChain, (value) =>
    (Array.isArray(value) ? value : []).map((row) => ({
      email: normalizeEmail(row?.email),
      position: normalizePosition(row?.position),
      commissionMode: normalizeMode(row?.commissionMode),
    }))
  );
  setIfChanged("managerOverrides", managerOverrides, comparableOverrides);
  setIfChanged("allowedEmails", allowedEmails, (value) =>
    (Array.isArray(value) ? value : []).map(normalizeEmail).filter(Boolean).sort()
  );

  return {
    ownerEmail,
    managerEmail,
    signedDateIso,
    managerProfile,
    managerPosition,
    managerMode,
    managerChain,
    managerOverrides,
    allowedEmails,
    patch,
    updateKeys,
  };
}

async function main() {
  const apply = hasArg("--apply");
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const ref = db.doc(TARGET_PATH);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Target document not found: ${TARGET_PATH}`);
  const entry = snap.data() || {};

  if (normalizeContractNumber(entry.contractNumber) !== TARGET_CONTRACT_NUMBER) {
    throw new Error(`Unexpected contract number: ${entry.contractNumber}`);
  }
  if (normalizeEmail(entry.userEmail) !== TARGET_OWNER) {
    throw new Error(`Unexpected owner: ${entry.userEmail}`);
  }
  if (entry.productKey !== TARGET_PRODUCT) {
    throw new Error(`Unexpected product: ${entry.productKey}`);
  }
  if (normalizeEmail(entry.managerEmailSnapshot) !== TARGET_MANAGER) {
    throw new Error(`Unexpected manager: ${entry.managerEmailSnapshot}`);
  }

  const usersByEmail = await loadUsersByEmail(db);
  const result = buildPatch(entry, usersByEmail);

  console.log(`mode=${apply ? "APPLY" : "DRY_RUN"}`);
  console.log(`path=${TARGET_PATH}`);
  console.log(`contract=${TARGET_CONTRACT_NUMBER}`);
  console.log(`signed=${result.signedDateIso}`);
  console.log(`owner=${result.ownerEmail}`);
  console.log(`manager=${result.managerEmail}`);
  console.log(`manager_position=${result.managerPosition}`);
  console.log(`manager_mode=${result.managerMode}`);
  console.log(`old_manager_chain=${JSON.stringify(entry.managerChain ?? null)}`);
  console.log(`new_manager_chain=${JSON.stringify(result.managerChain)}`);
  console.log(`old_overrides=${JSON.stringify(comparableOverrides(entry.managerOverrides))}`);
  console.log(`new_overrides=${JSON.stringify(comparableOverrides(result.managerOverrides))}`);
  console.log(`update_keys=${result.updateKeys.join(",") || "none"}`);

  if (!apply) {
    console.log("DRY_RUN_ONLY");
    return;
  }

  if (result.updateKeys.length === 0) {
    console.log("No contract changes to write.");
  } else {
    await ref.set({ ...result.patch, updatedAt: new Date() }, { merge: true });
    console.log(`Updated ${TARGET_PATH}`);
  }

  const dirtyOps = await markTeamOverviewOwnersDirty(db, [
    result.ownerEmail,
    result.managerEmail,
  ]);
  console.log(`Invalidated team overview read models: ${dirtyOps} delete ops`);
}

main().catch((error) => {
  console.error("Fix failed:", error?.stack ?? error?.message ?? error);
  process.exit(1);
});
