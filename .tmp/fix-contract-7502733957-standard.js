const { createJiti } = require("jiti");
const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

loadEnvConfig(process.cwd());

const DEFAULT_CONTRACT_NUMBER = "7502733957";
const TARGET_MODE = "standard";
const LIFE_PRODUCTS = new Set(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"]);

const jiti = createJiti(`${process.cwd()}/.tmp/fix-contract-7502733957-standard.js`);
const formulas = jiti(`${process.cwd()}/src/app/lib/productFormulas.ts`);
const { totalWithMultipliers } = jiti(`${process.cwd()}/src/app/lib/commissionTotals.ts`);

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

function normalizePosition(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeMode(value) {
  return value === "accelerated" || value === "standard" ? value : null;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function positiveNumber(value) {
  const n = toNumber(value);
  return n > 0 ? n : null;
}

function normalizeAmount(value) {
  return Math.round(toNumber(value) * 1_000_000) / 1_000_000;
}

function normalizeIsoDay(value) {
  if (!value) return null;
  if (typeof value === "object" && typeof value.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function entryCalculationAmount(entry) {
  return (
    positiveNumber(entry.calculationInputAmount) ??
    positiveNumber(entry.inputAmount) ??
    positiveNumber(entry.effectiveInputAmount) ??
    0
  );
}

function stripTotalRows(items) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    const title = String(item?.title ?? "").toLowerCase();
    const code = String(item?.code ?? "").toUpperCase();
    return !title.includes("celkem") && code !== "TOTAL";
  });
}

function itemKey(item) {
  const code = String(item?.code ?? "").trim().toUpperCase();
  if (code) return code;
  const title = String(item?.title ?? "").toLowerCase();
  if (title.includes("okamžit") || title.includes("a101")) return "A101";
  if (title.includes("b0301") || title.includes("po 3 měs")) return "B0301";
  if (title.includes("b3601") || title.includes("po 3 let")) return "B3601";
  if (title.includes("b4801") || title.includes("po 4 let")) return "B4801";
  if (title.includes("2.–5.") || title.includes("2.-5.")) return "B101-B104";
  if (title.includes("5.–10.") || title.includes("5.-10.")) return "B201-B206";
  return title.replace(/\s+/g, " ").trim();
}

function copyItemWithAmount(item, amount) {
  const out = {
    title: item.title ?? null,
    amount: normalizeAmount(amount),
  };
  if (item.code != null) out.code = item.code;
  if (item.note != null) out.note = item.note;
  if (item.excludeFromTotal != null) out.excludeFromTotal = item.excludeFromTotal;
  return out;
}

function calculateForEntry(entry, position, mode) {
  const amount = entryCalculationAmount(entry);
  const signedDateIso = normalizeIsoDay(entry.contractSignedDate);
  const years = Number.isFinite(Number(entry.durationYears)) ? Number(entry.durationYears) : null;
  switch (entry.productKey) {
    case "neon":
      return formulas.calculateNeon(amount, position, years, mode, signedDateIso);
    case "flexi":
      return formulas.calculateFlexi(amount, position, mode, years);
    case "maximaMaxEfekt":
      return formulas.calculateMaxEfekt(amount, years, position, mode, signedDateIso);
    case "pillowInjury":
      return formulas.calculatePillowInjury(amount, position, mode);
    default:
      return null;
  }
}

function computeManagerDiff(entry, managerPosition, childPosition) {
  const managerResult = calculateForEntry(entry, managerPosition, TARGET_MODE);
  const baselineResult = calculateForEntry(entry, childPosition, TARGET_MODE);
  if (!managerResult || !baselineResult) return null;

  const managerMap = new Map();
  for (const item of stripTotalRows(managerResult.items)) {
    const key = itemKey(item);
    const previous = managerMap.get(key);
    managerMap.set(key, {
      ...item,
      amount: normalizeAmount(toNumber(previous?.amount) + toNumber(item.amount)),
    });
  }

  const diffItems = [];
  for (const item of stripTotalRows(baselineResult.items)) {
    const key = itemKey(item);
    const managerItem = managerMap.get(key);
    const remaining = normalizeAmount(toNumber(managerItem?.amount) - toNumber(item.amount));
    if (remaining > 0) {
      diffItems.push(copyItemWithAmount(managerItem ?? item, remaining));
    }
    managerMap.delete(key);
  }

  for (const item of managerMap.values()) {
    if (toNumber(item.amount) > 0) diffItems.push(copyItemWithAmount(item, item.amount));
  }

  const total = normalizeAmount(totalWithMultipliers(diffItems));
  return { items: diffItems, total };
}

function buildStandardPayload(entry) {
  if (!LIFE_PRODUCTS.has(entry.productKey)) {
    throw new Error(`Unsupported productKey=${entry.productKey}`);
  }

  const position = normalizePosition(entry.position);
  if (!position) throw new Error("Missing entry.position.");

  const result = calculateForEntry(entry, position, TARGET_MODE);
  if (!result) throw new Error(`Cannot calculate productKey=${entry.productKey}.`);

  const chainRaw = Array.isArray(entry.managerChain) ? entry.managerChain : [];
  const managerChain = chainRaw.map((node) => ({
    ...node,
    commissionMode: normalizeEmail(node?.email)
      ? TARGET_MODE
      : normalizeMode(node?.commissionMode),
  }));

  const managerOverrides = [];
  let childPosition = position;
  for (const manager of managerChain) {
    const managerEmail = normalizeEmail(manager?.email);
    const managerPosition = normalizePosition(manager?.position);
    if (!managerEmail || !managerPosition) continue;
    const diff = computeManagerDiff(entry, managerPosition, childPosition);
    if (diff && diff.items.length > 0 && diff.total > 0) {
      managerOverrides.push({
        email: managerEmail,
        position: managerPosition,
        commissionMode: TARGET_MODE,
        items: diff.items,
        total: diff.total,
      });
    }
    childPosition = managerPosition;
  }

  return {
    commissionMode: TARGET_MODE,
    managerModeSnapshot: managerChain.some((node) => normalizeEmail(node?.email))
      ? TARGET_MODE
      : normalizeMode(entry.managerModeSnapshot),
    managerChain,
    managerOverrides,
    items: result.items,
    result: {
      items: result.items,
      total: result.total,
    },
    total: result.total,
  };
}

function summarizeItems(items) {
  return stripTotalRows(items)
    .map((item) => `${item.code ?? item.title}:${normalizeAmount(item.amount)}`)
    .join(" | ");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const contractNumber =
    process.argv
      .slice(2)
      .find((arg) => !arg.startsWith("--"))
      ?.replace(/\s+/g, "")
      .trim() || DEFAULT_CONTRACT_NUMBER;
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const snap = await db.collectionGroup("entries").get();
  const hits = snap.docs.filter((candidate) => {
    const number = String(candidate.data()?.contractNumber ?? "").replace(/\s+/g, "").trim();
    return number === contractNumber;
  });

  if (hits.length === 0) throw new Error(`Contract not found: ${contractNumber}`);
  if (hits.length > 1) throw new Error(`Ambiguous contractNumber=${contractNumber}, hits=${hits.length}`);

  const docSnap = hits[0];
  const entry = docSnap.data() || {};
  const payload = buildStandardPayload(entry);

  console.log(`path=${docSnap.ref.path}`);
  console.log(`contract=${entry.contractNumber}`);
  console.log(`product=${entry.productKey}`);
  console.log(`position=${entry.position}`);
  console.log(`before_mode=${entry.commissionMode ?? "null"}`);
  console.log(`after_mode=${payload.commissionMode}`);
  console.log(`before_total=${normalizeAmount(entry.total)}`);
  console.log(`after_total=${normalizeAmount(payload.total)}`);
  console.log(`before_items=${summarizeItems(entry.items)}`);
  console.log(`after_items=${summarizeItems(payload.items)}`);
  console.log(
    `manager_overrides=${payload.managerOverrides
      .map((override) => `${override.email}:${override.position}:${override.commissionMode}:${normalizeAmount(override.total)}`)
      .join(" | ")}`
  );

  if (!apply) {
    console.log("DRY_RUN_ONLY");
    return;
  }

  await docSnap.ref.set(
    {
      ...payload,
      updatedAt: new Date(),
    },
    { merge: true }
  );
  console.log("APPLIED=1");
}

main().catch((error) => {
  console.error(`fix_failed=${error?.message ?? error}`);
  process.exit(1);
});
