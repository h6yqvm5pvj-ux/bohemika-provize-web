#!/usr/bin/env node

import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const jiti = createJiti(import.meta.url);
const { isAllianzAutoHistoricalPeriod } = jiti(
  "../src/app/lib/productFormulas/allianzAuto.ts"
);

const PROCESSED_BY = "jakub.rauscher@bohemika.eu";

const normalizeEmail = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const normalizeCode = (value) =>
  String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");

const normalizeContractNumber = (value) =>
  String(value ?? "").replace(/\s+/g, "").trim();

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

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
    const date = new Date(
      trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : trimmed
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

const toIsoDay = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  }
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
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

const isAutoSubsequentCode = (code) => {
  const normalized = normalizeCode(code);
  if (!normalized) return false;
  if (/^(?:B30|B70|B03|B36|B42)\d*$/.test(normalized)) return false;
  return /^BC\d+/.test(normalized) || /^B\d+/.test(normalized);
};

const normalizedTitle = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const isSubsequentItem = (item) =>
  normalizeCode(item?.code) === "B101" || normalizedTitle(item?.title).includes("nasledna");

const isImmediateItem = (item) =>
  normalizeCode(item?.code) === "A101" ||
  normalizedTitle(item?.title).includes("okamzita") ||
  normalizedTitle(item?.title).includes("ziskatelska");

const amountFromItems = (items, predicate) => {
  if (!Array.isArray(items)) return null;
  const item = items.find(predicate);
  if (!item) return null;
  const amount = toNumber(item.amount);
  return Number.isFinite(amount) ? amount : null;
};

async function main() {
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials in environment.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const statementsSnap = await db
    .collection("usersPrivate")
    .doc(PROCESSED_BY)
    .collection("commissionStatements")
    .get();
  const processedStatements = statementsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((doc) => doc.processedAtMs != null || doc.processedBy != null);
  const processedStatementIds = new Set(processedStatements.map((doc) => doc.id));

  const contractsSnap = await db
    .collectionGroup("entries")
    .where("productKey", "==", "allianzAuto")
    .get();

  const rows = [];
  const historicalContracts = [];
  const contractsWithAnyPayout = [];
  const contractsWithSubsequentPayout = [];

  for (const docSnap of contractsSnap.docs) {
    const data = docSnap.data() ?? {};
    const signedIso = toIsoDay(data.contractSignedDate);
    if (!isAllianzAutoHistoricalPeriod(signedIso)) continue;

    historicalContracts.push(docSnap.ref.path);
    const payouts = Array.isArray(data.commissionPayouts) ? data.commissionPayouts : [];
    const jakubPayouts = payouts.filter((payout) => {
      if (normalizeEmail(payout?.writtenBy) !== PROCESSED_BY) return false;
      if (payout?.statementId && processedStatementIds.size > 0) {
        return processedStatementIds.has(String(payout.statementId));
      }
      return true;
    });
    if (jakubPayouts.length > 0) contractsWithAnyPayout.push(docSnap.ref.path);

    const subsequentPayouts = jakubPayouts.filter((payout) =>
      isAutoSubsequentCode(payout?.code)
    );
    if (subsequentPayouts.length === 0) continue;

    contractsWithSubsequentPayout.push(docSnap.ref.path);
    const currentSubsequent = amountFromItems(data.items, isSubsequentItem);
    const currentImmediate = amountFromItems(data.items, isImmediateItem);
    const currentExpected = currentSubsequent ?? currentImmediate;

    for (const payout of subsequentPayouts) {
      const paid = roundMoney(Math.abs(toNumber(payout.amount)));
      const oldExpected =
        payout.expectedAmount == null ? null : roundMoney(toNumber(payout.expectedAmount));
      const newExpected = currentExpected == null ? null : roundMoney(currentExpected);
      const oldDifference =
        payout.difference == null ? null : roundMoney(toNumber(payout.difference));
      const newDifference =
        newExpected == null ? null : roundMoney(paid - newExpected);
      const oldStatus = String(payout.status ?? "");
      const newStatus =
        newDifference != null && Math.abs(newDifference) > 1 ? "difference" : oldStatus;

      rows.push({
        path: docSnap.ref.path,
        contractNumber: normalizeContractNumber(data.contractNumber),
        clientName:
          typeof data.clientName === "string" && data.clientName.trim()
            ? data.clientName.trim()
            : "-",
        ownerEmail: normalizeEmail(data.userEmail),
        signedIso,
        statementNumber: payout.statementNumber ?? null,
        statementPeriod: payout.statementPeriod ?? null,
        statementDate: payout.statementDate ?? null,
        code: payout.code ?? null,
        paid,
        oldExpected,
        newExpected,
        oldDifference,
        newDifference,
        oldStatus,
        newStatus,
      });
    }
  }

  rows.sort((a, b) =>
    `${a.statementPeriod ?? ""}${a.contractNumber}`.localeCompare(
      `${b.statementPeriod ?? ""}${b.contractNumber}`,
      "cs"
    )
  );

  for (const row of rows) {
    console.log(
      `IMPACT ${row.contractNumber || "-"} | ${row.clientName} | owner=${row.ownerEmail ?? "-"} | signed=${row.signedIso} | statement=${row.statementNumber ?? "-"} ${row.statementPeriod ?? ""} | ${row.code ?? "-"} | paid=${row.paid} | expected ${row.oldExpected ?? "-"} -> ${row.newExpected ?? "-"} | diff ${row.oldDifference ?? "-"} -> ${row.newDifference ?? "-"} | status ${row.oldStatus || "-"} -> ${row.newStatus || "-"}`
    );
  }

  console.log("\nsummary");
  console.log(`processed_by=${PROCESSED_BY}`);
  console.log(`processed_statement_docs=${processedStatements.length}`);
  console.log(`allianz_auto_historical_contracts=${historicalContracts.length}`);
  console.log(`historical_contracts_with_any_processed_payout=${contractsWithAnyPayout.length}`);
  console.log(
    `historical_contracts_with_subsequent_processed_payout=${contractsWithSubsequentPayout.length}`
  );
  console.log(`subsequent_payout_rows=${rows.length}`);
  console.log(
    `rows_with_expected_change=${rows.filter((row) => row.oldExpected !== row.newExpected).length}`
  );
  console.log(
    `rows_that_would_be_difference=${rows.filter((row) => row.newStatus === "difference").length}`
  );
}

main().catch((error) => {
  console.error("Audit failed:", error?.stack ?? error);
  process.exit(1);
});
