const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const formulas = require("./backfill-build/src/app/lib/productFormulas.js");
const { totalWithMultipliers } = require("./backfill-build/src/app/lib/commissionTotals.js");

loadEnvConfig(process.cwd());

const ENTRY_PATH =
  "users/jakub.pokorny@bohemika.eu/entries/idem_b0d5e6635b3e606a1ada0cfb5f9e842a0ebc0713";
const LIFE_PRODUCTS = new Set(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"]);

function parseArgValue(args, key, defaultValue = null) {
  const prefix = `${key}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(key);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return defaultValue;
}

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
  return value === "standard" || value === "accelerated" ? value : null;
}

function normalizePosition(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeAmount(value) {
  return Math.round(toNumber(value) * 1_000_000) / 1_000_000;
}

function normalizeTitleKey(title) {
  const normalized = String(title ?? "").toLowerCase();
  if (normalized.includes("okamžit")) return "immediate";
  if (normalized.includes("po 3")) return "po3";
  if (normalized.includes("po 4")) return "po4";
  if (normalized.includes("2.–5.")) return "subsequent25";
  if (normalized.includes("5.–10.")) return "subsequent510";
  if (normalized.includes("od 6.")) return "subsequent6plus";
  return normalized;
}

function stripTotalRows(items) {
  return (Array.isArray(items) ? items : []).filter(
    (item) => !String(item?.title ?? "").toLowerCase().includes("celkem")
  );
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

function normalizedDurationYears(product, years) {
  const fallback =
    product === "neon" ? 15 : product === "flexi" ? 30 : product === "maximaMaxEfekt" ? 20 : 1;
  const max =
    product === "neon" ? 15 : product === "flexi" ? 80 : product === "maximaMaxEfekt" ? 20 : 1;
  const raw = Number.isFinite(Number(years)) ? Number(years) : fallback;
  return Math.min(max, Math.max(1, Math.floor(raw)));
}

function computeItemsForEntry(entry, position, mode) {
  const product = entry.productKey;
  const amount = Math.max(0, entryCalculationAmount(entry));
  switch (product) {
    case "neon":
      return formulas.calculateNeon(
        amount,
        position,
        normalizedDurationYears("neon", entry.durationYears),
        mode
      );
    case "flexi":
      return formulas.calculateFlexi(
        amount,
        position,
        mode,
        normalizedDurationYears("flexi", entry.durationYears)
      );
    case "maximaMaxEfekt":
      return formulas.calculateMaxEfekt(
        amount,
        normalizedDurationYears("maximaMaxEfekt", entry.durationYears),
        position,
        mode
      );
    case "pillowInjury":
      return formulas.calculatePillowInjury(amount, position, mode);
    default:
      return null;
  }
}

function computeManagerDiff(entry, managerPosition, childPosition) {
  const managerResult = computeItemsForEntry(entry, managerPosition, "standard");
  const baselineResult = computeItemsForEntry(entry, childPosition, "standard");
  if (!managerResult || !baselineResult) return null;

  const managerMap = new Map();
  stripTotalRows(managerResult.items).forEach((item) => {
    const key = normalizeTitleKey(item.title);
    const previous = managerMap.get(key);
    managerMap.set(key, {
      title: item.title ?? previous?.title ?? key,
      amount: normalizeAmount((previous?.amount ?? 0) + toNumber(item.amount)),
    });
  });

  const diffItems = [];
  stripTotalRows(baselineResult.items).forEach((item) => {
    const key = normalizeTitleKey(item.title);
    const managerValue = managerMap.get(key);
    const remaining = normalizeAmount((managerValue?.amount ?? 0) - toNumber(item.amount));
    if (remaining > 0) {
      diffItems.push({
        title: managerValue?.title ?? item.title,
        amount: remaining,
      });
    }
    managerMap.delete(key);
  });

  managerMap.forEach((value) => {
    if (value.amount > 0) {
      diffItems.push({
        title: value.title,
        amount: normalizeAmount(value.amount),
      });
    }
  });

  const total = normalizeAmount(totalWithMultipliers(diffItems));
  return { items: diffItems, total };
}

function buildStandardPayload(entry) {
  if (!LIFE_PRODUCTS.has(entry.productKey)) {
    throw new Error(`Unsupported productKey=${entry.productKey}`);
  }

  const chainRaw = Array.isArray(entry.managerChain) ? entry.managerChain : [];
  const chain = chainRaw
    .map((node) => ({
      ...node,
      email: normalizeEmail(node?.email),
      position: normalizePosition(node?.position),
      commissionMode: "standard",
    }))
    .filter((node) => node.email && node.position);

  if (chain.length === 0) throw new Error("managerChain is empty.");

  let childPosition = normalizePosition(entry.position);
  if (!childPosition) throw new Error("Missing entry.position.");

  const managerOverrides = [];
  chain.forEach((manager) => {
    const result = computeManagerDiff(entry, manager.position, childPosition);
    if (result && result.items.length > 0 && result.total > 0) {
      managerOverrides.push({
        email: manager.email,
        position: manager.position,
        commissionMode: "standard",
        items: result.items,
        total: result.total,
      });
    }
    childPosition = manager.position;
  });

  return {
    managerChain: chainRaw.map((node) => ({
      ...node,
      commissionMode: normalizeEmail(node?.email) ? "standard" : normalizeMode(node?.commissionMode),
    })),
    managerModeSnapshot: "standard",
    managerOverrides,
  };
}

function summarizeOverrides(overrides) {
  return overrides
    .map((override) => {
      const immediate = stripTotalRows(override.items)
        .filter((item) => normalizeTitleKey(item.title) === "immediate")
        .reduce((sum, item) => sum + toNumber(item.amount), 0);
      return `${override.email}:${override.commissionMode}:ok=${normalizeAmount(immediate)}:total=${override.total}`;
    })
    .join(" | ");
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const entryPath = parseArgValue(args, "--path", ENTRY_PATH);
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const ref = db.doc(entryPath);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Entry not found: ${entryPath}`);

  const entry = snap.data() || {};
  const payload = buildStandardPayload(entry);

  console.log(`entry=${entryPath}`);
  console.log(`contract=${entry.contractNumber || "null"}`);
  console.log(`entryType=${entry.entryType || "contract"}`);
  console.log(`inputAmount=${entry.inputAmount ?? "null"}`);
  console.log(`calculationInputAmount=${entry.calculationInputAmount ?? "null"}`);
  console.log(`before_managerModeSnapshot=${entry.managerModeSnapshot || "null"}`);
  console.log(`before=${summarizeOverrides(Array.isArray(entry.managerOverrides) ? entry.managerOverrides : [])}`);
  console.log(`after_managerModeSnapshot=${payload.managerModeSnapshot}`);
  console.log(`after=${summarizeOverrides(payload.managerOverrides)}`);

  if (!apply) {
    console.log("DRY_RUN_ONLY");
    return;
  }

  await ref.set(
    {
      ...payload,
      updatedAt: new Date(),
    },
    { merge: true }
  );
  console.log("APPLIED=1");
}

main().catch((error) => {
  console.error(`fix_failed=${error?.message || error}`);
  process.exit(1);
});
