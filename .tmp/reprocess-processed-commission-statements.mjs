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
const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith("--") && !arg.includes("=")));

const email = (args.get("email") || "jakub.rauscher@bohemika.eu").trim().toLowerCase();
const baseUrl = (args.get("base-url") || "http://localhost:3000").replace(/\/+$/, "");
const dryRun = flags.has("--dry-run");
const delayMsArg = Number(args.get("delay-ms"));
const explicitDelayMs = Number.isFinite(delayMsArg) && delayMsArg >= 0 ? delayMsArg : null;
const onlyKooperativaAuto = flags.has("--only-kooperativa-auto");

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
      // fall back to split env vars
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

const toMillis = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  return null;
};

const asNumber = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const asString = (value, fallback = null) =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const statementSortMs = (item) =>
  toMillis(item.data.statementChronologyMs) ??
  toMillis(item.data.periodEndMs) ??
  toMillis(item.data.periodStartMs) ??
  toMillis(item.data.createdAtMs) ??
  0;

const statementLabel = (item) => {
  const number = asString(item.data.statementNumber, item.id.slice(0, 8));
  const period = asString(item.data.period, "no period");
  return `statement ${number} (${period})`;
};

const htmlLooksKooperativaAuto = (html) => {
  const normalized = String(html || "").toLowerCase();
  return (
    normalized.includes("koo_namiru") ||
    normalized.includes("kooperativa auto") ||
    normalized.includes("kooperativa pojištění majetku") ||
    normalized.includes("kooperativa pojisteni majetku")
  );
};

const buildPayload = (item) => {
  const data = item.data;
  return {
    html: String(data.html || ""),
    fileName: asString(data.fileName, "Provizni vypis.html"),
    header: {
      advisorNumber: asString(data.advisorNumber),
      period: asString(data.period),
      statementNumber: asString(data.statementNumber),
      statementDate: asString(data.statementDate),
    },
    summary: {
      commissionRowCount: asNumber(data.commissionRowCount),
      commissionTotal: asNumber(data.commissionTotal),
      reserveFundTotal: asNumber(data.reserveFundTotal),
      payoutTotal:
        typeof data.payoutTotal === "number" && Number.isFinite(data.payoutTotal)
          ? data.payoutTotal
          : null,
      otherPaymentsCount: asNumber(data.otherPaymentsCount),
      otherPaymentsTotal: asNumber(data.otherPaymentsTotal),
      managerAdvisorCount: asNumber(data.managerAdvisorCount),
      managerRowCount: asNumber(data.managerRowCount),
      managerCommissionTotal: asNumber(data.managerCommissionTotal),
      stornoRowCount: asNumber(data.stornoRowCount),
      stornoTotal: asNumber(data.stornoTotal),
    },
  };
};

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
    throw new Error(`Failed to create Firebase ID token: HTTP ${response.status} ${JSON.stringify(json)}`);
  }
  return json.idToken;
}

async function postStatement({ idToken, item }) {
  const payload = buildPayload(item);
  const response = await fetch(`${baseUrl}/api/commission-statements`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function postWithRetry({ idToken, item }) {
  let last = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = await postStatement({ idToken, item });
    if (result.response.status !== 429) return result;
    last = result;
    const waitMs = 15_000 * attempt;
    console.log(`Rate limited on ${statementLabel(item)}, waiting ${waitMs} ms.`);
    await sleep(waitMs);
  }
  return last;
}

const addResultStats = (totals, result) => {
  if (!result || typeof result !== "object") return;
  for (const key of [
    "payoutRows",
    "contractsMatched",
    "contractsUpdated",
    "payoutRecordsAdded",
    "payoutRecordsExisting",
    "payoutRecordsUpdated",
    "coefficientOverridesApplied",
    "duplicatePayoutRowsSkipped",
    "premiumUpdates",
    "olderPremiumUpdatesSkipped",
    "accountingRepairDrafts",
    "externalUpdateTasks",
    "touchedContracts",
  ]) {
    totals[key] = (totals[key] || 0) + asNumber(result[key]);
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

  const snap = await db
    .collection("usersPrivate")
    .doc(email)
    .collection("commissionStatements")
    .get();

  let items = snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() || {} }))
    .filter((item) => toMillis(item.data.processedAtMs) != null)
    .filter((item) => typeof item.data.html === "string" && item.data.html.trim());

  if (onlyKooperativaAuto) {
    items = items.filter((item) => htmlLooksKooperativaAuto(item.data.html));
  }

  items.sort((a, b) => statementSortMs(a) - statementSortMs(b));

  console.log(`User: ${email}`);
  console.log(`Processed statements found: ${items.length}`);
  if (onlyKooperativaAuto) console.log("Filter: Kooperativa Auto-looking HTML only");
  if (items.length === 0) return;

  for (const item of items) {
    console.log(`- ${statementLabel(item)} / ${item.id}`);
  }

  if (dryRun) {
    console.log("Dry run only. No statements were posted.");
    return;
  }

  const idToken = await createIdToken(auth);
  const delayMs = explicitDelayMs ?? (items.length > 70 ? 850 : 250);
  const totals = {
    processed: 0,
    failed: 0,
    notFoundContracts: 0,
    ambiguousContracts: 0,
    skippedContracts: 0,
    errors: 0,
  };

  for (const [index, item] of items.entries()) {
    const label = statementLabel(item);
    const result = await postWithRetry({ idToken, item });
    if (!result || !result.response.ok || !result.json?.ok) {
      totals.failed += 1;
      console.error(
        `[${index + 1}/${items.length}] FAILED ${label}: HTTP ${result?.response?.status ?? "?"} ${JSON.stringify(result?.json ?? {})}`
      );
    } else {
      totals.processed += 1;
      const processing = result.json.processingResult || {};
      addResultStats(totals, processing);
      console.log(
        `[${index + 1}/${items.length}] OK ${label}: updated=${asNumber(processing.payoutRecordsUpdated)}, added=${asNumber(processing.payoutRecordsAdded)}, contracts=${asNumber(processing.contractsUpdated)}, overrides=${asNumber(processing.coefficientOverridesApplied)}`
      );
    }
    if (delayMs > 0 && index < items.length - 1) await sleep(delayMs);
  }

  console.log("Summary:");
  console.log(JSON.stringify(totals, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
