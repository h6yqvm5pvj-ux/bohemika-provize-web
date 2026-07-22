const { createJiti } = require("jiti");
const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

loadEnvConfig(process.cwd());

const TARGET_CONTRACT_NUMBER = "8160175805";
const TARGET_OWNER_EMAIL = "jakub.rauscher@bohemika.eu";

const jiti = createJiti(`${process.cwd()}/.tmp/fix-contract-8160175805-not-tip.js`);
const {
  calculateMaxCizinKomplex,
} = jiti(`${process.cwd()}/src/app/lib/productFormulas/maxcizinkomplex.ts`);

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

function normalizeContractNumber(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function normalizeEmail(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

function roundMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatCzk(value) {
  return `${roundMoney(value).toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Kč`;
}

function resultFor(entry, position) {
  const amount =
    finitePositive(entry.calculationInputAmount) ??
    finitePositive(entry.inputAmount) ??
    finitePositive(entry.effectiveInputAmount) ??
    0;
  const variant = entry.maxCizinKomplexVariant ?? "exclusiveStandard";
  return calculateMaxCizinKomplex(amount, position, variant);
}

function managerOverridesFor(entry, ownerResult) {
  const chain = Array.isArray(entry.managerChain) ? entry.managerChain : [];
  const overrides = [];
  let previousTotal = roundMoney(ownerResult.total);

  for (const manager of chain) {
    const email = normalizeEmail(manager?.email);
    const position = typeof manager?.position === "string" ? manager.position : null;
    if (!email || !position) continue;

    const managerResult = resultFor(entry, position);
    const diff = roundMoney(managerResult.total - previousTotal);
    if (diff > 0) {
      const baseItem = managerResult.items?.[0] ?? {
        title: "💸 Okamžitá provize",
        code: "A501",
      };
      overrides.push({
        email,
        position,
        commissionMode: manager?.commissionMode ?? "standard",
        items: [
          {
            title: baseItem.title ?? "💸 Okamžitá provize",
            amount: diff,
            code: baseItem.code ?? "A501",
            note: baseItem.note ?? undefined,
          },
        ],
        total: diff,
      });
    }
    previousTotal = roundMoney(managerResult.total);
  }

  return overrides;
}

function payoutDetail(payout, expectedAmount, entry) {
  const career = payout.career ? ` Kar. ${payout.career}` : "";
  const positionLabel = entry.position === "manazer8" ? "Manažer 8" : entry.position ?? "pozice";
  return [
    `${payout.code}: vyplaceno ${formatCzk(payout.amount)}, systém ${formatCzk(expectedAmount)}, rozdíl ${formatCzk(0)}.`,
    career
      ? `Kariérní stupeň sedí: výpis${career} (${positionLabel}), smlouva ${positionLabel}.`
      : null,
    `Základna výpisu ${formatCzk(entry.inputAmount ?? entry.effectiveInputAmount ?? 0)}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildPayload(entry) {
  if (entry.productKey !== "maxcizinkomplex") {
    throw new Error(`Unexpected productKey=${entry.productKey}`);
  }
  const position = typeof entry.position === "string" ? entry.position : null;
  if (!position) throw new Error("Missing position.");

  const result = resultFor(entry, position);
  const normalizedItems = (result.items ?? []).map((item) => ({
    ...item,
    amount: roundMoney(item.amount),
  }));
  const total = roundMoney(result.total);
  const nextPayouts = (Array.isArray(entry.commissionPayouts) ? entry.commissionPayouts : []).map(
    (payout) => {
      if (String(payout?.code ?? "").trim().toUpperCase() !== "A501") return payout;
      return {
        ...payout,
        status: "paid",
        expectedAmount: total,
        difference: 0,
        differenceReason: null,
        detail: payoutDetail(payout, total, entry),
      };
    }
  );

  return {
    items: normalizedItems,
    result: {
      items: normalizedItems,
      total,
    },
    total,
    managerOverrides: managerOverridesFor(entry, result),
    tipContractTipsterEmail: null,
    tipContractTipsterName: null,
    tipContractTipsterPercent: null,
    tipContractImmediateFirstYearGross: null,
    tipContractImmediateFirstYearNet: null,
    tipContractTipsterAmountFirstYear: null,
    tipContractSourceTipId: null,
    tipContractSourceTipTitle: null,
    tipContractSourceTipProductLabel: null,
    tipContractSourceTipClientName: null,
    tipContractSourceTipCreatedAtMs: null,
    commissionPayouts: nextPayouts,
    updatedAt: new Date().toISOString(),
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const snap = await db.collectionGroup("entries").get();
  const hits = snap.docs.filter((docSnap) => {
    const data = docSnap.data() ?? {};
    return (
      normalizeContractNumber(data.contractNumber) === TARGET_CONTRACT_NUMBER &&
      normalizeEmail(data.userEmail) === TARGET_OWNER_EMAIL
    );
  });

  if (hits.length !== 1) {
    throw new Error(`Expected one hit for ${TARGET_CONTRACT_NUMBER}, found ${hits.length}.`);
  }

  const docSnap = hits[0];
  const entry = docSnap.data() ?? {};
  const payload = buildPayload(entry);

  console.log(`contract=${TARGET_CONTRACT_NUMBER}`);
  console.log(`path=${docSnap.ref.path}`);
  console.log(`apply=${apply}`);
  console.log(
    JSON.stringify(
      {
        previousTotal: entry.total ?? null,
        nextTotal: payload.total,
        previousTipsterEmail: entry.tipContractTipsterEmail ?? null,
        nextTipsterEmail: payload.tipContractTipsterEmail,
        previousPayout: entry.commissionPayouts?.[0] ?? null,
        nextPayout: payload.commissionPayouts?.[0] ?? null,
        items: payload.items,
        managerOverrides: payload.managerOverrides,
      },
      null,
      2
    )
  );

  if (!apply) return;
  await docSnap.ref.update(payload);
  console.log("Updated.");
}

main().catch((err) => {
  console.error("Fix failed:", err?.message ?? err);
  process.exit(1);
});
