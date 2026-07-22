const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

loadEnvConfig(process.cwd());

const DEFAULT_CONTRACT_NUMBER = "791198682";

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

function normalizeCommissionCode(value) {
  return String(value ?? "").replace(/\s+/g, "").trim().toUpperCase();
}

function finiteMoneyOrNull(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function moneyKey(value) {
  const amount = finiteMoneyOrNull(value);
  return amount == null ? "" : String(Math.round(amount * 100));
}

function semanticPremiumHistoryKey(entry) {
  return [
    entry.premiumKind ?? "",
    entry.source ?? "",
    entry.statementId ||
      [entry.statementNumber ?? "", entry.statementPeriod ?? "", entry.statementDate ?? ""].join("|"),
    entry.rowId ?? "",
    entry.anniversaryNumber ?? "",
    entry.anniversaryDate ?? "",
    entry.productCode ?? "",
    normalizeCommissionCode(entry.commissionCode),
    moneyKey(entry.previousAnnualPremium ?? entry.previousPremium),
    moneyKey(entry.newAnnualPremium ?? entry.newPremium),
    moneyKey(entry.differenceAnnual ?? entry.difference),
  ].join("::");
}

function completenessScore(entry) {
  let score = 0;
  if (entry.basePremiumPeriod) score += 20;
  if (entry.previousAnnualPremium != null) score += 10;
  if (entry.newAnnualPremium != null) score += 10;
  if (entry.differenceAnnual != null) score += 10;
  if (entry.statementChronologyMs != null) score += 4;
  if (entry.payoutMonthKey) score += 2;
  return score + Number(entry.writtenAtMs ?? 0) / 1_000_000_000_000;
}

function dedupePremiumStatementHistory(history) {
  const rows = Array.isArray(history) ? history : [];
  const bySemanticKey = new Map();
  const order = [];
  const duplicates = [];

  for (const entry of rows) {
    if (!entry || typeof entry !== "object") continue;
    const key = semanticPremiumHistoryKey(entry);
    const existing = bySemanticKey.get(key);
    if (!existing) {
      bySemanticKey.set(key, entry);
      order.push(key);
      continue;
    }

    const winner =
      completenessScore(entry) > completenessScore(existing) ? entry : existing;
    const removed = winner === entry ? existing : entry;
    bySemanticKey.set(key, winner);
    duplicates.push({
      semanticKey: key,
      keptKey: winner.key ?? null,
      removedKey: removed.key ?? null,
      statementId: winner.statementId ?? removed.statementId ?? null,
      rowId: winner.rowId ?? removed.rowId ?? null,
      anniversaryNumber: winner.anniversaryNumber ?? removed.anniversaryNumber ?? null,
      anniversaryDate: winner.anniversaryDate ?? removed.anniversaryDate ?? null,
    });
  }

  return {
    history: order.map((key) => bySemanticKey.get(key)).filter(Boolean),
    duplicates,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const contractNumber =
    args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_CONTRACT_NUMBER;
  const normalizedTarget = normalizeContractNumber(contractNumber);
  if (!normalizedTarget) throw new Error("Missing contract number.");

  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const snap = await db.collectionGroup("entries").get();
  const hits = snap.docs.filter((docSnap) => {
    const data = docSnap.data() ?? {};
    return normalizeContractNumber(data.contractNumber) === normalizedTarget;
  });

  if (hits.length === 0) throw new Error(`Contract not found: ${normalizedTarget}`);
  if (hits.length > 1) throw new Error(`Ambiguous contract ${normalizedTarget}: hits=${hits.length}`);

  const docSnap = hits[0];
  const data = docSnap.data() ?? {};
  const currentHistory = Array.isArray(data.premiumStatementHistory)
    ? data.premiumStatementHistory
    : [];
  const result = dedupePremiumStatementHistory(currentHistory);

  console.log(`contract=${normalizedTarget}`);
  console.log(`path=${docSnap.ref.path}`);
  console.log(`history=${currentHistory.length}->${result.history.length}`);
  if (result.duplicates.length > 0) {
    console.log("duplicates=");
    for (const item of result.duplicates) {
      console.log(
        `- statement=${item.statementId ?? "-"} row=${item.rowId ?? "-"} výročí=${item.anniversaryNumber ?? "-"} datum=${item.anniversaryDate ?? "-"} kept=${item.keptKey ?? "-"} removed=${item.removedKey ?? "-"}`
      );
    }
  }

  if (currentHistory.length === result.history.length) {
    console.log("No duplicate premium history rows found.");
    return;
  }

  if (!apply) {
    console.log("DRY_RUN_ONLY");
    return;
  }

  await docSnap.ref.set(
    {
      premiumStatementHistory: result.history,
      updatedAt: new Date(),
    },
    { merge: true }
  );
  console.log("updated=1");
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
