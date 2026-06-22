const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

loadEnvConfig(process.cwd());

const TARGETS = ["jakub pokorny", "manfred.totzauer", "martin brezina"];
const FROM_DAY = "2026-05-01";
const TO_DAY_EXCLUSIVE = "2026-06-01";
const LIFE_PRODUCTS = new Set(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"]);

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
  return normalized.includes("@") ? normalized : null;
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeMode(value) {
  return value === "standard" || value === "accelerated" ? value : null;
}

function searchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchText(value) {
  return searchText(value).replace(/[^a-z0-9]+/g, "");
}

function targetTokens(target) {
  return searchText(target)
    .split(/[ ._-]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchesTarget(target, values) {
  const needle = compactSearchText(target);
  const tokens = targetTokens(target);
  const compactHaystack = values.map(compactSearchText).join(" ");
  const textHaystack = values.map(searchText).join(" ");

  if (needle && compactHaystack.includes(needle)) return true;
  return tokens.length > 0 && tokens.every((token) => textHaystack.includes(token));
}

function dateFromUnknown(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split("-").map(Number);
      return new Date(year, month - 1, day);
    }
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function localIsoDay(value) {
  const d = dateFromUnknown(value);
  if (!d) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inMay2026(value) {
  const day = localIsoDay(value);
  return Boolean(day && day >= FROM_DAY && day < TO_DAY_EXCLUSIVE);
}

function parentDocId(docSnap) {
  return docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : null;
}

function profileName(data, privateData) {
  return (
    normalizeText(data.fullName) ||
    normalizeText(data.name) ||
    normalizeText(privateData.fullName) ||
    normalizeText(privateData.name) ||
    null
  );
}

async function loadProfiles(db) {
  const privateSnap = await db.collection("usersPrivate").get().catch(() => ({ docs: [] }));
  const privateByEmail = new Map();
  const privateByDocId = new Map();

  privateSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const email = normalizeEmail(data.email) || normalizeEmail(docSnap.id);
    if (email) privateByEmail.set(email, data);
    privateByDocId.set(docSnap.id, data);
  });

  const usersSnap = await db.collection("users").get();
  const byEmail = new Map();
  const byDocId = new Map();

  usersSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const email = normalizeEmail(data.email) || normalizeEmail(docSnap.id);
    const privateData =
      (email ? privateByEmail.get(email) : null) || privateByDocId.get(docSnap.id) || {};
    const profile = {
      docId: docSnap.id,
      email,
      name: profileName(data, privateData),
      managerEmail: normalizeEmail(data.managerEmail) || normalizeEmail(privateData.managerEmail),
      position: normalizeText(data.position) || normalizeText(privateData.position) || null,
      commissionMode: normalizeMode(data.commissionMode) || normalizeMode(privateData.commissionMode),
    };
    byDocId.set(docSnap.id, profile);
    if (email && !byEmail.has(email)) byEmail.set(email, profile);
  });

  return { byEmail, byDocId, all: Array.from(byDocId.values()) };
}

function resolveTargetForEntry({ targetsByKey, entryData, ownerProfile, ownerDocId }) {
  const values = [
    ownerDocId,
    ownerProfile?.email,
    ownerProfile?.name,
    entryData.userEmail,
    entryData.adviserEmail,
    entryData.ownerEmail,
  ];

  for (const [target, info] of targetsByKey.entries()) {
    if (ownerDocId && info.docIds.has(ownerDocId)) return target;
    const entryEmail =
      normalizeEmail(entryData.userEmail) ||
      normalizeEmail(entryData.adviserEmail) ||
      normalizeEmail(entryData.ownerEmail);
    if (entryEmail && info.emails.has(entryEmail)) return target;
    if (matchesTarget(target, values)) return target;
  }
  return null;
}

function modeLabel(mode) {
  if (mode === "standard") return "standard";
  if (mode === "accelerated") return "accelerated";
  return "missing";
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const profiles = await loadProfiles(db);

  const targetsByKey = new Map();
  TARGETS.forEach((target) => {
    const matches = profiles.all.filter((profile) =>
      matchesTarget(target, [profile.email, profile.name, profile.docId])
    );
    targetsByKey.set(target, {
      matches,
      emails: new Set(matches.map((profile) => profile.email).filter(Boolean)),
      docIds: new Set(matches.map((profile) => profile.docId).filter(Boolean)),
    });
  });

  console.log(`period=${FROM_DAY}..2026-05-31`);
  console.log("--- matched_profiles");
  for (const [target, info] of targetsByKey.entries()) {
    const profileList = info.matches.map((profile) =>
      `${profile.email || profile.docId}${profile.name ? ` (${profile.name})` : ""}`
    );
    console.log(`${target}: ${profileList.length ? profileList.join("; ") : "NO_MATCH"}`);
  }

  const entriesSnap = await db.collectionGroup("entries").get();
  const rows = [];
  const summary = new Map(
    TARGETS.map((target) => [
      target,
      {
        contracts: 0,
        withOverrides: 0,
        withoutOverrides: 0,
        standardOverrides: 0,
        acceleratedOverrides: 0,
        missingModeOverrides: 0,
        mixedContracts: 0,
        allStandardContracts: 0,
        allAcceleratedContracts: 0,
      },
    ])
  );

  entriesSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const entryType = normalizeText(data.entryType).toLowerCase() || "contract";
    if (entryType !== "contract") return;
    if (!LIFE_PRODUCTS.has(data.productKey)) return;
    if (!inMay2026(data.contractSignedDate)) return;

    const ownerDocId = parentDocId(docSnap);
    const ownerProfile = ownerDocId ? profiles.byDocId.get(ownerDocId) : null;
    const target = resolveTargetForEntry({
      targetsByKey,
      entryData: data,
      ownerProfile,
      ownerDocId,
    });
    if (!target) return;

    const overrides = Array.isArray(data.managerOverrides) ? data.managerOverrides : [];
    const normalizedOverrides = overrides.map((override) => ({
      email: normalizeEmail(override?.email),
      position: normalizeText(override?.position) || null,
      mode: normalizeMode(override?.commissionMode),
      total: Number.isFinite(Number(override?.total)) ? Number(override.total) : null,
      itemCount: Array.isArray(override?.items) ? override.items.length : 0,
    }));
    const chain = Array.isArray(data.managerChain) ? data.managerChain : [];
    const normalizedChain = chain.map((node) => ({
      email: normalizeEmail(node?.email),
      position: normalizeText(node?.position) || null,
      mode: normalizeMode(node?.commissionMode),
    }));
    const modes = new Set(normalizedOverrides.map((override) => modeLabel(override.mode)));
    const targetSummary = summary.get(target);
    targetSummary.contracts += 1;
    if (normalizedOverrides.length > 0) targetSummary.withOverrides += 1;
    else targetSummary.withoutOverrides += 1;

    normalizedOverrides.forEach((override) => {
      if (override.mode === "standard") targetSummary.standardOverrides += 1;
      else if (override.mode === "accelerated") targetSummary.acceleratedOverrides += 1;
      else targetSummary.missingModeOverrides += 1;
    });
    if (modes.has("standard") && modes.has("accelerated")) targetSummary.mixedContracts += 1;
    if (modes.size === 1 && modes.has("standard")) targetSummary.allStandardContracts += 1;
    if (modes.size === 1 && modes.has("accelerated")) targetSummary.allAcceleratedContracts += 1;

    rows.push({
      target,
      ownerEmail:
        normalizeEmail(data.userEmail) ||
        normalizeEmail(data.adviserEmail) ||
        ownerProfile?.email ||
        ownerDocId ||
        null,
      ownerName: ownerProfile?.name || null,
      path: docSnap.ref.path,
      contractNumber: normalizeText(data.contractNumber) || "NO_CONTRACT_NUMBER",
      clientName: normalizeText(data.clientName) || null,
      product: data.productKey,
      signed: localIsoDay(data.contractSignedDate),
      policyStart: localIsoDay(data.policyStartDate),
      advisorMode: normalizeMode(data.commissionMode),
      managerModeSnapshot: normalizeMode(data.managerModeSnapshot),
      managerEmailSnapshot: normalizeEmail(data.managerEmailSnapshot),
      chain: normalizedChain,
      overrides: normalizedOverrides,
    });
  });

  rows.sort((a, b) => {
    if (a.target !== b.target) return a.target.localeCompare(b.target, "cs");
    if (a.signed !== b.signed) return String(a.signed).localeCompare(String(b.signed), "cs");
    return a.contractNumber.localeCompare(b.contractNumber, "cs");
  });

  console.log("--- summary");
  TARGETS.forEach((target) => {
    const s = summary.get(target);
    console.log(
      [
        target,
        `contracts=${s.contracts}`,
        `with_overrides=${s.withOverrides}`,
        `without_overrides=${s.withoutOverrides}`,
        `override_standard=${s.standardOverrides}`,
        `override_accelerated=${s.acceleratedOverrides}`,
        `override_missing=${s.missingModeOverrides}`,
        `contracts_all_standard=${s.allStandardContracts}`,
        `contracts_all_accelerated=${s.allAcceleratedContracts}`,
        `contracts_mixed=${s.mixedContracts}`,
      ].join(" | ")
    );
  });

  console.log("--- rows");
  rows.forEach((row) => {
    const overridesText = row.overrides.length
      ? row.overrides
          .map((override) =>
            `${override.email || "unknown"}:${override.position || "?"}:${modeLabel(override.mode)}:total=${override.total ?? "null"}`
          )
          .join(",")
      : "NO_OVERRIDES";
    const chainText = row.chain.length
      ? row.chain
          .map((node) => `${node.email || "unknown"}:${node.position || "?"}:${modeLabel(node.mode)}`)
          .join(">")
      : "NO_CHAIN";

    console.log(
      [
        row.target,
        row.contractNumber,
        row.product,
        `signed=${row.signed || "null"}`,
        `start=${row.policyStart || "null"}`,
        `advisor=${row.advisorMode || "null"}`,
        `managerSnapshot=${row.managerEmailSnapshot || "null"}:${row.managerModeSnapshot || "null"}`,
        `overrides=${overridesText}`,
        `chain=${chainText}`,
        `owner=${row.ownerEmail || "null"}`,
        `client=${row.clientName || "null"}`,
        row.path,
      ].join(" | ")
    );
  });
}

main().catch((error) => {
  console.error(`audit_failed=${error?.message || error}`);
  process.exit(1);
});
