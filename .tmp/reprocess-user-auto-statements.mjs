#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--") && arg.includes("="))
    .map((arg) => {
      const index = arg.indexOf("=");
      return [arg.slice(2, index), arg.slice(index + 1)];
    })
);
const flags = new Set(
  process.argv.slice(2).filter((arg) => arg.startsWith("--") && !arg.includes("="))
);

const AUTO_PRODUCTS = new Set([
  "cppAuto",
  "slaviaauto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowAuto",
  "kooperativaAuto",
  "koopflotila",
]);

const email = (args.get("email") || "vojtech.mahr@bohemika.eu").trim().toLowerCase();
const baseUrl = (args.get("base-url") || "http://localhost:3000").replace(/\/+$/, "");
const dryRun = flags.has("--dry-run") || !flags.has("--apply");
const delayMsArg = Number(args.get("delay-ms"));
const delayMs = Number.isFinite(delayMsArg) && delayMsArg >= 0 ? delayMsArg : 900;
const limitArg = Number(args.get("limit"));
const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : null;

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
    } catch {
      // fall through to split env vars
    }
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeContractNumber = (value) =>
  String(value ?? "").replace(/\s+/g, "").trim();

const normalizeContractSearchText = (value) =>
  String(value ?? "").replace(/\s+/g, "");

const toMillis = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  if (value && typeof value.seconds === "number") return value.seconds * 1000;
  return null;
};

const asString = (value, fallback = null) =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const statementSortMs = (item) =>
  toMillis(item.data.statementChronologyMs) ??
  toMillis(item.data.statementDateMs) ??
  toMillis(item.data.periodEndMs) ??
  toMillis(item.data.periodStartMs) ??
  toMillis(item.data.createdAtMs) ??
  0;

const statementLabel = (item) => {
  const number = asString(item.data.statementNumber, item.id.slice(0, 8));
  const period = asString(item.data.period, "bez období");
  return `výpis ${number} (${period})`;
};

const contractLabel = (contract) =>
  [
    contract.contractNumber,
    contract.clientName || "-",
    contract.productKey || "-",
    contract.createdFromStatement ? "z výpisu" : "ručně/jiné",
  ].join(" · ");

async function createIdToken(auth) {
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  if (!firebaseApiKey) throw new Error("Missing NEXT_PUBLIC_FIREBASE_API_KEY.");

  const user = await auth.getUserByEmail(email);
  const customToken = await auth.createCustomToken(user.uid);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.idToken) {
    throw new Error(
      `Failed to create Firebase ID token: HTTP ${response.status} ${JSON.stringify(json)}`
    );
  }
  return json.idToken;
}

async function postReprocess({ idToken, statementId, contractNumbers }) {
  const response = await fetch(`${baseUrl}/api/commission-statements`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "reprocess-saved-statement",
      statementId,
      contractNumbers,
    }),
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function postWithRetry(params) {
  let last = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await postReprocess(params);
    if (result.response.status !== 429) return result;
    last = result;
    const waitMs = 15_000 * attempt;
    console.log(`Rate limit, cekam ${waitMs} ms.`);
    await sleep(waitMs);
  }
  return last;
}

const addResultStats = (totals, result) => {
  if (!result || typeof result !== "object") return;
  for (const key of [
    "contractsMatched",
    "contractsUpdated",
    "contractsWithPayoutChanges",
    "payoutRecordsAdded",
    "payoutRecordsExisting",
    "payoutRecordsUpdated",
    "coefficientOverridesApplied",
    "duplicatePayoutRowsSkipped",
    "premiumUpdates",
    "premiumHistoryBackfills",
    "olderPremiumUpdatesSkipped",
    "touchedContracts",
  ]) {
    totals[key] = (totals[key] || 0) + (Number(result[key]) || 0);
  }
  totals.notFoundContracts += Array.isArray(result.notFoundContracts)
    ? result.notFoundContracts.length
    : 0;
  totals.ambiguousContracts += Array.isArray(result.ambiguousContracts)
    ? result.ambiguousContracts.length
    : 0;
  totals.skippedContracts += Array.isArray(result.skippedContracts)
    ? result.skippedContracts.length
    : 0;
  totals.errors += Array.isArray(result.errors) ? result.errors.length : 0;
};

async function main() {
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert(credentials),
    });
  const db = getFirestore(app);
  const auth = getAuth(app);

  const entriesSnap = await db.collection("users").doc(email).collection("entries").get();
  const contractsByNumber = new Map();
  for (const doc of entriesSnap.docs) {
    const data = doc.data() || {};
    if (String(data.entryType ?? "contract").trim().toLowerCase() !== "contract") continue;
    if (!AUTO_PRODUCTS.has(data.productKey)) continue;
    const contractNumber = normalizeContractNumber(data.contractNumber);
    if (!contractNumber) continue;
    contractsByNumber.set(contractNumber, {
      path: doc.ref.path,
      contractNumber,
      clientName: asString(data.clientName),
      productKey: data.productKey,
      createdFromStatement:
        data.createdFromCommissionStatement === true ||
        Boolean(asString(data.createdFromCommissionStatementId)) ||
        data.commissionBaseSource === "commission_statement_auto_initial",
    });
  }

  const statementsSnap = await db
    .collection("usersPrivate")
    .doc(email)
    .collection("commissionStatements")
    .get();

  const statements = statementsSnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() || {} }))
    .filter((item) => typeof item.data.html === "string" && item.data.html.trim())
    .sort((a, b) => statementSortMs(a) - statementSortMs(b));

  const statementPlan = [];
  let pairCount = 0;
  for (const statement of statements) {
    const html = normalizeContractSearchText(statement.data.html);
    const statementContracts = [];
    for (const [contractNumber, contract] of contractsByNumber) {
      if (html.includes(contractNumber)) statementContracts.push(contract);
    }
    statementContracts.sort((a, b) =>
      a.contractNumber.localeCompare(b.contractNumber, "cs")
    );
    const limitedContracts = [];
    for (const contract of statementContracts) {
      if (limit && pairCount >= limit) break;
      limitedContracts.push(contract);
      pairCount += 1;
    }
    if (limitedContracts.length > 0) {
      statementPlan.push({ statement, contracts: limitedContracts });
    }
    if (limit && pairCount >= limit) break;
  }

  const flatPlan = statementPlan.flatMap((item) =>
    item.contracts.map((contract) => ({ statement: item.statement, contract }))
  );
  const uniqueContracts = new Set(flatPlan.map((item) => item.contract.contractNumber));
  const createdFromStatementContracts = new Set(
    flatPlan
      .filter((item) => item.contract.createdFromStatement)
      .map((item) => item.contract.contractNumber)
  );

  console.log(`User: ${email}`);
  console.log(`Auto smlouvy v databazi: ${contractsByNumber.size}`);
  console.log(`Ulozene vypisy s HTML: ${statements.length}`);
  console.log(`Vypisy k projeti: ${statementPlan.length}`);
  console.log(`Dvojice vypis x auto smlouva k projeti: ${flatPlan.length}`);
  console.log(`Unikatni auto smlouvy v planu: ${uniqueContracts.size}`);
  console.log(`Z toho pridane z vypisu: ${createdFromStatementContracts.size}`);

  for (const { statement, contract } of flatPlan.slice(0, 80)) {
    console.log(`${statementLabel(statement)} | ${contractLabel(contract)}`);
  }
  if (flatPlan.length > 80) console.log(`... dalsich ${flatPlan.length - 80} dvojic`);

  if (dryRun) {
    console.log("DRY_RUN_ONLY");
    return;
  }

  const idToken = await createIdToken(auth);
  const totals = {
    processedStatements: 0,
    failedStatements: 0,
    processedPairs: 0,
    notFoundContracts: 0,
    ambiguousContracts: 0,
    skippedContracts: 0,
    errors: 0,
  };

  for (const [index, { statement, contracts }] of statementPlan.entries()) {
    const result = await postWithRetry({
      idToken,
      statementId: statement.id,
      contractNumbers: contracts.map((contract) => contract.contractNumber),
    });
    const label = `${statementLabel(statement)} | ${contracts.length} auto smluv`;
    if (!result || !result.response.ok || !result.json?.ok) {
      totals.failedStatements += 1;
      console.error(
        `[${index + 1}/${statementPlan.length}] FAIL ${label}: HTTP ${
          result?.response?.status ?? "?"
        } ${JSON.stringify(result?.json ?? {})}`
      );
    } else {
      totals.processedStatements += 1;
      totals.processedPairs += contracts.length;
      const processing = result.json.processingResult || {};
      addResultStats(totals, processing);
      console.log(
        `[${index + 1}/${statementPlan.length}] OK ${label}: contracts=${Number(
          processing.contractsUpdated
        ) || 0}, premium=${Number(processing.premiumUpdates) || 0}, backfill=${
          Number(processing.premiumHistoryBackfills) || 0
        }, payouts+${Number(processing.payoutRecordsAdded) || 0}/~${
          Number(processing.payoutRecordsUpdated) || 0
        }`
      );
    }
    if (delayMs > 0 && index < statementPlan.length - 1) await sleep(delayMs);
  }

  console.log("Summary:");
  console.log(JSON.stringify(totals, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
