const { createHash } = require("node:crypto");
const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

loadEnvConfig(process.cwd());

const OWNER_EMAIL = "jakub.rauscher@bohemika.eu";
const CONTRACT_NUMBER = "7502565094";
const KEEP_ENTRY_ID = "jd3EoWyXF1v0OmUP24Tl";
const DELETE_ENTRY_ID = "HWjEgDi7VtGtSjyLyyrl";
const STATEMENT_ID = "2d5fd62212b1cfaa4855e4c85c44c73e";

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

function compactHash(value, length = 24) {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function contractRefDocId(ownerEmail, entryId) {
  return `${normalizeEmail(ownerEmail)}___${String(entryId ?? "").trim()}`;
}

function roundMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function formatMoney(value) {
  return `${roundMoney(value).toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Kč`;
}

function buildB101Payout(nowMs) {
  const rowId = "424780";
  const productCode = "CPP_N_LIFE";
  const commissionCode = "B101";
  const baseAmount = 21948;
  const amount = 86.91;
  const career = "6";
  const rowKey = compactHash(
    ["own", "commission", rowId, CONTRACT_NUMBER, productCode, commissionCode, baseAmount, amount, "paid"].join(":")
  );
  const key = compactHash(`${STATEMENT_ID}:${rowKey}:${CONTRACT_NUMBER}:${commissionCode}`, 32);

  return {
    key,
    code: commissionCode,
    title: `${productCode} · ${commissionCode}`,
    amount,
    expectedAmount: amount,
    difference: 0,
    differenceReason: null,
    career,
    detail: [
      `${commissionCode}: vyplaceno ${formatMoney(amount)}, systém ${formatMoney(amount)}, rozdíl ${formatMoney(0)}.`,
      "Kariérní stupeň sedí: výpis Kar. 6 (Poradce 6), smlouva Poradce 6.",
      `Základna výpisu ${formatMoney(baseAmount)}.`,
    ].join(" "),
    status: "paid",
    statementId: STATEMENT_ID,
    statementNumber: "71",
    statementPeriod: "01.02.2026 - 28.02.2026",
    statementDate: "23.03.2026",
    statementChronologyMs: 1774224000000,
    payoutMonthKey: "2026-3",
    writtenAtMs: nowMs,
    writtenBy: OWNER_EMAIL,
  };
}

function mergePayout(payouts, payout) {
  const current = Array.isArray(payouts) ? payouts : [];
  const next = [];
  let replaced = false;
  for (const item of current) {
    const sameKey = item?.key && item.key === payout.key;
    const sameStatementCode =
      item?.statementId === payout.statementId &&
      String(item?.code ?? "").trim().toUpperCase() === payout.code;
    if (sameKey || sameStatementCode) {
      next.push({
        ...payout,
        writtenAtMs: item.writtenAtMs ?? payout.writtenAtMs,
        writtenBy: item.writtenBy ?? payout.writtenBy,
      });
      replaced = true;
    } else {
      next.push(item);
    }
  }
  if (!replaced) next.push(payout);
  return {
    payouts: next.sort((a, b) => Number(a?.writtenAtMs ?? 0) - Number(b?.writtenAtMs ?? 0)),
    replaced,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const keepRef = db.collection("users").doc(OWNER_EMAIL).collection("entries").doc(KEEP_ENTRY_ID);
  const deleteRef = db.collection("users").doc(OWNER_EMAIL).collection("entries").doc(DELETE_ENTRY_ID);
  const keepSnap = await keepRef.get();
  const deleteSnap = await deleteRef.get();
  const statementSnap = await db
    .collection("usersPrivate")
    .doc(OWNER_EMAIL)
    .collection("commissionStatements")
    .doc(STATEMENT_ID)
    .get();

  if (!keepSnap.exists) throw new Error(`Keep entry not found: ${KEEP_ENTRY_ID}`);
  if (!deleteSnap.exists) throw new Error(`Duplicate entry not found: ${DELETE_ENTRY_ID}`);
  if (!statementSnap.exists) throw new Error(`Statement not found: ${STATEMENT_ID}`);

  const keepData = keepSnap.data() ?? {};
  const deleteData = deleteSnap.data() ?? {};
  if (String(keepData.contractNumber ?? "").trim() !== CONTRACT_NUMBER) {
    throw new Error(`Keep entry has unexpected contractNumber=${keepData.contractNumber}`);
  }
  if (String(deleteData.contractNumber ?? "").trim() !== CONTRACT_NUMBER) {
    throw new Error(`Delete entry has unexpected contractNumber=${deleteData.contractNumber}`);
  }

  const nowMs = Date.now();
  const payout = buildB101Payout(nowMs);
  const merge = mergePayout(keepData.commissionPayouts, payout);

  const updatePayload = {
    commissionPayouts: merge.payouts,
    commissionStatementProcessedAtMs: nowMs,
    updatedAt: new Date(nowMs).toISOString(),
  };
  const deleteContractRef = db.collection("contractRefs").doc(contractRefDocId(OWNER_EMAIL, DELETE_ENTRY_ID));

  console.log(
    JSON.stringify(
      {
        apply,
        keepPath: keepRef.path,
        deletePath: deleteRef.path,
        deleteContractRefPath: deleteContractRef.path,
        previousPayoutCodes: (keepData.commissionPayouts ?? []).map((item) => item?.code),
        nextPayoutCodes: merge.payouts.map((item) => item?.code),
        b101Replaced: merge.replaced,
        b101Payout: payout,
        duplicateSummary: {
          clientName: deleteData.clientName ?? null,
          createdAt: deleteData.createdAt ?? null,
          updatedAt: deleteData.updatedAt ?? null,
          durationYears: deleteData.durationYears ?? null,
          hasCommissionPayouts: Array.isArray(deleteData.commissionPayouts),
        },
      },
      null,
      2
    )
  );

  if (!apply) return;

  const batch = db.batch();
  batch.update(keepRef, updatePayload);
  batch.delete(deleteRef);
  batch.delete(deleteContractRef);
  await batch.commit();
  console.log("Updated keep entry and deleted duplicate.");
}

main().catch((err) => {
  console.error("Fix failed:", err?.message ?? err);
  process.exit(1);
});
