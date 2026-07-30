const { createJiti } = require("jiti");
const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

loadEnvConfig(process.cwd());

const OWNER_EMAIL = "vojtech.mahr@bohemika.eu";
const ORIGINAL_ENTRY_ID = "idem_138636a0c680b380243518d87002ec2beb55a34c";
const REFRESH_ENTRY_ID = "idem_efe67e2652555709899a8b132e3c347e54044c57";
const ORIGINAL_NUMBER = "7500378696";
const REFRESH_NUMBER = "7503265051";
const ORIGINAL_SIGNED_ISO = "2020-10-14";
const ORIGINAL_START_ISO = "2020-12-01";
const ORIGINAL_MONTHLY_PREMIUM = 800;
const REFRESH_SIGNED_ISO = "2026-05-11";
const REFRESH_START_ISO = "2026-06-01";
const REFRESH_MONTHLY_PREMIUM = 1600;
const ORIGINAL_POSITION = "poradce6";
const REFRESH_POSITION = "manazer7";
const COMMISSION_MODE = "standard";

const jiti = createJiti(`${process.cwd()}/.tmp/fix-holomoj-neon-refresh.js`);
const formulas = jiti(`${process.cwd()}/src/app/lib/productFormulas.ts`);
const neonFormulas = jiti(`${process.cwd()}/src/app/lib/productFormulas/neon.ts`);
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

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;
const normalizeAmount = (value) => Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
const toDate = (isoDay) => new Date(`${isoDay}T00:00:00.000Z`);
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

function normalizeContractNumber(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function normalizeContractNumberLoose(value) {
  return String(value ?? "").replace(/\D+/g, "").replace(/^0+/, "").trim();
}

function contractRefDocId(ownerEmail, entryId) {
  return `${normalizeEmail(ownerEmail)}___${String(entryId).trim()}`;
}

function contractRefFromData({ ownerEmail, entryId, contractNumber, productKey }) {
  const owner = normalizeEmail(ownerEmail);
  const id = String(entryId || "").trim();
  const normalized = normalizeContractNumber(contractNumber);
  if (!owner || !id || !normalized) return null;
  return {
    ownerEmail: owner,
    entryId: id,
    entryPath: `users/${owner}/entries/${id}`,
    contractNumberRaw: String(contractNumber || "").trim(),
    contractNumberNormalized: normalized,
    contractNumberLoose: normalizeContractNumberLoose(contractNumber),
    productKey: productKey || null,
    updatedAt: new Date(),
  };
}

function stripTotalRows(items) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    const code = String(item?.code || "").toUpperCase();
    const title = String(item?.title || "").toLowerCase();
    return code !== "TOTAL" && !title.includes("celkem");
  });
}

function itemKey(item) {
  const code = String(item?.code || "").trim().toUpperCase();
  if (code) return code;
  const title = String(item?.title || "").toLowerCase();
  if (title.includes("a101") || title.includes("okamžit")) return "A101";
  if (title.includes("b0301")) return "B0301";
  if (title.includes("b3601")) return "B3601";
  if (title.includes("b4801")) return "B4801";
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

function calculateNeonEntry(entry, monthlyPremium, position, signedIso) {
  const years =
    typeof entry.durationYears === "number" && Number.isFinite(entry.durationYears)
      ? entry.durationYears
      : null;
  return formulas.calculateNeon(monthlyPremium, position, years, COMMISSION_MODE, signedIso);
}

function computeManagerDiff(entry, monthlyPremium, managerPosition, childPosition, signedIso) {
  const managerResult = calculateNeonEntry(entry, monthlyPremium, managerPosition, signedIso);
  const baselineResult = calculateNeonEntry(entry, monthlyPremium, childPosition, signedIso);

  const managerMap = new Map();
  for (const item of stripTotalRows(managerResult.items)) {
    const key = itemKey(item);
    const previous = managerMap.get(key);
    managerMap.set(key, {
      ...item,
      amount: normalizeAmount((previous?.amount || 0) + (item.amount || 0)),
    });
  }

  const diffItems = [];
  for (const item of stripTotalRows(baselineResult.items)) {
    const key = itemKey(item);
    const managerItem = managerMap.get(key);
    const remaining = normalizeAmount((managerItem?.amount || 0) - (item.amount || 0));
    if (remaining > 0) diffItems.push(copyItemWithAmount(managerItem ?? item, remaining));
    managerMap.delete(key);
  }

  for (const item of managerMap.values()) {
    if (Number(item.amount) > 0) diffItems.push(copyItemWithAmount(item, item.amount));
  }

  return {
    items: diffItems,
    total: normalizeAmount(totalWithMultipliers(diffItems)),
  };
}

function buildManagerOverrides(entry, monthlyPremium, basePosition, signedIso) {
  const chainRaw = Array.isArray(entry.managerChain) ? entry.managerChain : [];
  const managerChain = chainRaw.map((node) => ({
    ...node,
    commissionMode: normalizeEmail(node?.email) ? COMMISSION_MODE : node?.commissionMode ?? null,
  }));

  const managerOverrides = [];
  let childPosition = basePosition;
  for (const manager of managerChain) {
    const managerEmail = normalizeEmail(manager?.email);
    const managerPosition = typeof manager?.position === "string" ? manager.position : null;
    if (!managerEmail || !managerPosition) continue;
    const diff = computeManagerDiff(
      entry,
      monthlyPremium,
      managerPosition,
      childPosition,
      signedIso
    );
    if (diff.items.length > 0 && diff.total > 0) {
      managerOverrides.push({
        email: managerEmail,
        position: managerPosition,
        commissionMode: COMMISSION_MODE,
        items: diff.items,
        total: diff.total,
      });
    }
    childPosition = managerPosition;
  }
  return { managerChain, managerOverrides };
}

function calculateRefreshBase() {
  const result = neonFormulas.calculateNeonRefreshCommissionBase({
    newMonthlyPremium: REFRESH_MONTHLY_PREMIUM,
    originalMonthlyPremium: ORIGINAL_MONTHLY_PREMIUM,
    stornoBaseMonthlyPremium: ORIGINAL_MONTHLY_PREMIUM,
    originalStornoStartDateIso: ORIGINAL_START_ISO,
    refreshPolicyStartDateIso: REFRESH_START_ISO,
  });
  if (!result) throw new Error("Cannot calculate refresh base.");
  return result;
}

function totalFromResult(result) {
  return normalizeAmount(totalWithMultipliers(stripTotalRows(result.items)));
}

function buildOriginalPatch(original) {
  const result = calculateNeonEntry(
    { ...original, durationYears: original.durationYears },
    ORIGINAL_MONTHLY_PREMIUM,
    ORIGINAL_POSITION,
    ORIGINAL_SIGNED_ISO
  );
  const total = totalFromResult(result);
  const { managerChain, managerOverrides } = buildManagerOverrides(
    original,
    ORIGINAL_MONTHLY_PREMIUM,
    ORIGINAL_POSITION,
    ORIGINAL_SIGNED_ISO
  );
  return {
    contractSignedDate: toDate(ORIGINAL_SIGNED_ISO),
    policyStartDate: toDate(ORIGINAL_START_ISO),
    inputAmount: ORIGINAL_MONTHLY_PREMIUM,
    effectiveInputAmount: ORIGINAL_MONTHLY_PREMIUM,
    calculationInputAmount: null,
    position: ORIGINAL_POSITION,
    commissionMode: COMMISSION_MODE,
    managerModeSnapshot: COMMISSION_MODE,
    managerChain,
    managerOverrides,
    duplicateLookupKey: `neon___barbora holomoj___${ORIGINAL_SIGNED_ISO}`,
    items: result.items,
    result: { items: result.items, total },
    total,
    updatedAt: new Date(),
  };
}

function buildRefreshPatch(refresh) {
  const refreshBase = calculateRefreshBase();
  const result = calculateNeonEntry(
    { ...refresh, durationYears: refresh.durationYears },
    refreshBase.calculationMonthlyPremium,
    REFRESH_POSITION,
    REFRESH_SIGNED_ISO
  );
  const total = totalFromResult(result);
  const { managerChain, managerOverrides } = buildManagerOverrides(
    refresh,
    refreshBase.calculationMonthlyPremium,
    REFRESH_POSITION,
    REFRESH_SIGNED_ISO
  );
  return {
    calculationInputAmount: refreshBase.calculationMonthlyPremium,
    inputAmount: REFRESH_MONTHLY_PREMIUM,
    effectiveInputAmount: REFRESH_MONTHLY_PREMIUM,
    position: REFRESH_POSITION,
    commissionMode: COMMISSION_MODE,
    managerModeSnapshot: COMMISSION_MODE,
    managerChain,
    managerOverrides,
    refreshCommissionBase: {
      productKey: "neon",
      method: "cpp_neon_5y_storno",
      calculationMethod: refreshBase.calculationMethod,
      originalContractNumber: ORIGINAL_NUMBER,
      originalStornoStartDateIso: ORIGINAL_START_ISO,
      refreshPolicyStartDateIso: REFRESH_START_ISO,
      stornoMonths: 60,
      elapsedMonths: refreshBase.elapsedMonths,
      remainingMonths: refreshBase.remainingMonths,
      earnedRatio: refreshBase.earnedRatio,
      remainingRatio: refreshBase.remainingRatio,
      newMonthlyPremium: refreshBase.newMonthlyPremium,
      newAnnualPremium: roundMoney(refreshBase.newMonthlyPremium * 12),
      originalMonthlyPremium: refreshBase.originalMonthlyPremium,
      originalAnnualPremium: roundMoney(refreshBase.originalMonthlyPremium * 12),
      premiumIncreaseMonthly: refreshBase.premiumIncreaseMonthly,
      premiumIncreaseAnnual: refreshBase.premiumIncreaseAnnual,
      stornoBaseMonthlyPremium: refreshBase.stornoBaseMonthlyPremium,
      stornoBaseAnnualPremium: refreshBase.stornoBaseAnnualPremium,
      stornedOriginalMonthlyPremium: refreshBase.stornedOriginalMonthlyPremium,
      stornedOriginalAnnualPremium: refreshBase.stornedOriginalAnnualPremium,
      motivationalMonthlyPremium: refreshBase.motivationalMonthlyPremium,
      motivationalAnnualPremium: refreshBase.motivationalAnnualPremium,
      calculationMonthlyPremium: refreshBase.calculationMonthlyPremium,
      calculationAnnualPremium: refreshBase.calculationAnnualPremium,
    },
    items: result.items,
    result: { items: result.items, total },
    total,
    updatedAt: new Date(),
  };
}

async function readKnownContract(db, entryId, contractNumber) {
  const ref = db.collection("users").doc(OWNER_EMAIL).collection("entries").doc(entryId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Missing ${ref.path}.`);
  const data = snap.data() || {};
  if (normalizeContractNumber(data.contractNumber) !== contractNumber) {
    throw new Error(
      `Unexpected contract at ${ref.path}: ${data.contractNumber}, expected ${contractNumber}.`
    );
  }
  return snap;
}

function summarize(label, before, patch) {
  const beforeRefreshBase = before.refreshCommissionBase?.calculationAnnualPremium ?? null;
  const afterRefreshBase = patch.refreshCommissionBase?.calculationAnnualPremium ?? beforeRefreshBase;
  console.log(`\n${label}`);
  console.log(`  contract=${before.contractNumber}`);
  console.log(`  signed: ${before.contractSignedDate?.toDate?.().toISOString?.().slice(0, 10) ?? before.contractSignedDate} -> ${patch.contractSignedDate?.toISOString?.().slice(0, 10) ?? before.contractSignedDate?.toDate?.().toISOString?.().slice(0, 10) ?? "-"}`);
  console.log(`  start: ${before.policyStartDate?.toDate?.().toISOString?.().slice(0, 10) ?? before.policyStartDate} -> ${patch.policyStartDate?.toISOString?.().slice(0, 10) ?? before.policyStartDate?.toDate?.().toISOString?.().slice(0, 10) ?? "-"}`);
  console.log(`  premium: ${before.inputAmount} -> ${patch.inputAmount ?? before.inputAmount}`);
  console.log(`  calc monthly: ${before.calculationInputAmount ?? "-"} -> ${patch.calculationInputAmount ?? "-"}`);
  console.log(`  refresh annual base: ${beforeRefreshBase ?? "-"} -> ${afterRefreshBase ?? "-"}`);
  console.log(`  position: ${before.position ?? "-"} -> ${patch.position ?? before.position ?? "-"}`);
  console.log(`  total: ${normalizeAmount(before.total)} -> ${normalizeAmount(patch.total ?? before.total)}`);
  const a101 = (patch.items ?? before.items ?? []).find((item) => item.code === "A101");
  const b0301 = (patch.items ?? before.items ?? []).find((item) => item.code === "B0301");
  console.log(`  A101=${normalizeAmount(a101?.amount)} B0301=${normalizeAmount(b0301?.amount)}`);
}

async function main() {
  const dryRun = !process.argv.includes("--apply");
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const originalSnap = await readKnownContract(db, ORIGINAL_ENTRY_ID, ORIGINAL_NUMBER);
  const refreshSnap = await readKnownContract(db, REFRESH_ENTRY_ID, REFRESH_NUMBER);
  const original = originalSnap.data() || {};
  const refresh = refreshSnap.data() || {};

  const originalPatch = buildOriginalPatch(original);
  const refreshPatch = buildRefreshPatch(refresh);

  summarize("ORIGINAL", original, originalPatch);
  summarize("REFRESH", refresh, refreshPatch);

  const refreshBase = refreshPatch.refreshCommissionBase;
  console.log(
    `\ncheck: refresh base ${refreshBase.calculationAnnualPremium} Kč annual / ${refreshBase.calculationMonthlyPremium} Kč monthly`
  );
  console.log("expected statement: A101 6911.48, B0301 1719.88, base 14208");

  if (dryRun) {
    console.log("\nDry run only. Run with --apply to write changes.");
    return;
  }

  await db.runTransaction(async (tx) => {
    tx.set(originalSnap.ref, originalPatch, { merge: true });
    tx.set(refreshSnap.ref, refreshPatch, { merge: true });

    const originalRefPayload = contractRefFromData({
      ownerEmail: OWNER_EMAIL,
      entryId: originalSnap.id,
      contractNumber: ORIGINAL_NUMBER,
      productKey: "neon",
    });
    const refreshRefPayload = contractRefFromData({
      ownerEmail: OWNER_EMAIL,
      entryId: refreshSnap.id,
      contractNumber: REFRESH_NUMBER,
      productKey: "neon",
    });
    if (originalRefPayload) {
      tx.set(
        db.collection("contractRefs").doc(contractRefDocId(OWNER_EMAIL, originalSnap.id)),
        originalRefPayload,
        { merge: true }
      );
    }
    if (refreshRefPayload) {
      tx.set(
        db.collection("contractRefs").doc(contractRefDocId(OWNER_EMAIL, refreshSnap.id)),
        refreshRefPayload,
        { merge: true }
      );
    }
  });

  console.log("\nApplied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
