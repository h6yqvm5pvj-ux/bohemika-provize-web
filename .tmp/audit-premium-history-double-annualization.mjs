#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const AUTO_PRODUCTS = new Set([
  "cppAuto",
  "slaviaauto",
  "slaviaflotila",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowAuto",
  "kooperativaAuto",
  "koopflotila",
]);
const ANNUAL_BASE_PRODUCTS = new Set(["allianzAuto", "pillowAuto"]);
const TOLERANCE = 12;

function credentials() {
  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      return {
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      };
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

function money(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function paymentsPerYear(value) {
  if (value === "monthly") return 12;
  if (value === "quarterly") return 4;
  if (value === "semiannual") return 2;
  return 1;
}

function uniqueContractCount(rows) {
  return new Set(rows.map((row) => row.contractNumber)).size;
}

function countBy(rows, key) {
  return Object.fromEntries(
    [...rows.reduce((counts, row) => {
      const value = String(row[key] ?? "unknown");
      counts.set(value, (counts.get(value) ?? 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right))
  );
}

function normalizedPrevious(entry, productKey, frequencyRaw) {
  const annual = money(entry?.previousAnnualPremium);
  const premium = money(entry?.previousPremium);
  if (annual == null) return null;

  const count = paymentsPerYear(frequencyRaw);
  const statementBaseIsPayment =
    AUTO_PRODUCTS.has(productKey) && !ANNUAL_BASE_PRODUCTS.has(productKey);
  const oldWouldAnnualize =
    statementBaseIsPayment &&
    count > 1 &&
    premium != null &&
    Math.abs(annual - premium) <= TOLERANCE;
  if (!oldWouldAnnualize) {
    return { annual, oldValue: annual, newValue: annual, action: "unchanged" };
  }

  const annualized = Math.round(annual * count * 100) / 100;
  const nextAnnual = money(entry?.newAnnualPremium);
  const annualizedFitsBetter =
    entry?.basePremiumPeriod === "payment" &&
    nextAnnual != null &&
    Math.abs(nextAnnual - annualized) + TOLERANCE <
      Math.abs(nextAnnual - annual);
  const shouldKeepLegacyAnnualization =
    entry?.basePremiumPeriod == null || annualizedFitsBetter;

  return {
    annual,
    oldValue: annualized,
    newValue: shouldKeepLegacyAnnualization ? annualized : annual,
    action: shouldKeepLegacyAnnualization ? "legacy-annualized" : "double-fixed",
  };
}

async function main() {
  const serviceAccount = credentials();
  if (!serviceAccount) throw new Error("Missing Firebase Admin credentials.");
  const app =
    getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore(app);
  const snapshot = await db.collectionGroup("entries").get();

  let historyEntries = 0;
  let oldAnnualizationCandidates = 0;
  const corrected = [];
  const legacyAnnualized = [];
  const suspiciousAfterFix = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() ?? {};
    const productKey = String(data.productKey ?? "");
    if (!AUTO_PRODUCTS.has(productKey)) continue;
    const history = Array.isArray(data.premiumStatementHistory)
      ? data.premiumStatementHistory
      : [];

    for (const entry of history) {
      if (entry?.premiumKind !== "auto_change") continue;
      historyEntries += 1;
      const normalized = normalizedPrevious(
        entry,
        productKey,
        data.frequencyRaw
      );
      if (!normalized || normalized.action === "unchanged") continue;
      oldAnnualizationCandidates += 1;

      const nextAnnual = money(entry.newAnnualPremium);
      const record = {
        contractNumber: String(data.contractNumber ?? "—"),
        productKey,
        frequencyRaw: data.frequencyRaw ?? null,
        statementNumber: entry.statementNumber ?? null,
        commissionCode: entry.commissionCode ?? null,
        storedPreviousAnnual: normalized.annual,
        oldDisplayedPreviousAnnual: normalized.oldValue,
        newDisplayedPreviousAnnual: normalized.newValue,
        newAnnualPremium: nextAnnual,
        oldDisplayedDifference:
          nextAnnual == null
            ? null
            : Math.round((nextAnnual - normalized.oldValue) * 100) / 100,
        newDisplayedDifference:
          nextAnnual == null
            ? null
            : Math.round((nextAnnual - normalized.newValue) * 100) / 100,
      };

      if (normalized.action === "double-fixed") corrected.push(record);
      else legacyAnnualized.push(record);

      if (
        nextAnnual != null &&
        normalized.newValue > 0 &&
        Math.abs(nextAnnual - normalized.newValue) / normalized.newValue > 0.5
      ) {
        suspiciousAfterFix.push(record);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        contractsScanned: snapshot.size,
        autoChangeHistoryEntries: historyEntries,
        oldAnnualizationCandidates,
        correctedEverywhereByNewGuard: corrected.length,
        correctedContracts: uniqueContractCount(corrected),
        correctedByFrequency: countBy(corrected, "frequencyRaw"),
        intentionallyKeptLegacyAnnualization: legacyAnnualized.length,
        legacyContracts: uniqueContractCount(legacyAnnualized),
        suspiciousAfterFix: suspiciousAfterFix.length,
        suspiciousContracts: uniqueContractCount(suspiciousAfterFix),
        corrected,
        legacyAnnualized,
        suspiciousAfterFixRecords: suspiciousAfterFix,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
