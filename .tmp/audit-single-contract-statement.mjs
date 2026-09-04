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

const email = (args.get("email") || "vojtech.mahr@bohemika.eu").trim().toLowerCase();
const contractNumber = normalizeContractNumber(args.get("contract") || "3239091313");
const reprocessStatementId = (args.get("reprocess-statement") || "").trim();
const baseUrl = (args.get("base-url") || "http://localhost:3000").replace(/\/+$/, "");
const fullResponse = flags.has("--full-response");
const contractOnly = flags.has("--contract-only");
const apiDetail = flags.has("--api-detail");
const apiStatementId = (args.get("api-statement") || "").trim();

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

function normalizeContractNumber(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function toMillis(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  return null;
}

function asString(value, fallback = null) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16))
    );
}

function cellText(html) {
  return decodeHtml(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function stripHtml(html) {
  return cellText(html);
}

function parseMoney(value) {
  const normalized = String(value ?? "")
    .replace(/Kč/gi, "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(ms) {
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toISOString().slice(0, 10);
}

function statementSortMs(item) {
  return (
    toMillis(item.data.statementChronologyMs) ??
    toMillis(item.data.periodEndMs) ??
    toMillis(item.data.periodStartMs) ??
    toMillis(item.data.createdAtMs) ??
    0
  );
}

function extractSectionById(html, id) {
  const marker = `id="${id}"`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return "";

  const start = html.lastIndexOf("<div", markerIndex);
  if (start === -1) return "";

  const nextSection = html.indexOf('<div class="vypis_sekce_toggle"', markerIndex);
  return html.slice(start, nextSection === -1 ? undefined : nextSection);
}

function parseRows(sectionHtml) {
  return [...sectionHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) =>
    [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cellMatch) =>
      cellText(cellMatch[1])
    )
  );
}

function parseCommissionRows(html) {
  const section = extractSectionById(html, "provize");
  return parseRows(section)
    .filter((cells) => /^\d+$/.test(cells[0] ?? ""))
    .map((cells) => ({
      rowId: cells[0] ?? "",
      contractNumber: normalizeContractNumber(cells[1] ?? ""),
      signedAt: cells[2] ?? "",
      validFrom: cells[3] ?? "",
      client: cells[4] ?? "",
      role: cells[5] ?? "",
      product: (cells[6] ?? "").trim(),
      code: (cells[7] ?? "").trim(),
      baseLabel: cells[8] ?? "",
      base: parseMoney(cells[8]),
      percent: cells[10] ?? "",
      commissionLabel: cells[12] ?? "",
      commission: parseMoney(cells[12]),
      reserveFundLabel: cells[13] ?? "",
      reserveFund: parseMoney(cells[13]),
    }));
}

function getContractHistory(data) {
  if (Array.isArray(data.premiumStatementHistory)) return data.premiumStatementHistory;
  if (Array.isArray(data.premiumHistory)) return data.premiumHistory;
  return [];
}

function summarizeContract(docSnap) {
  const data = docSnap.data() || {};
  const history = getContractHistory(data);
  const payouts = Array.isArray(data.commissionPayouts) ? data.commissionPayouts : [];
  return {
    path: docSnap.ref.path,
    clientName: data.clientName ?? null,
    productKey: data.productKey ?? null,
    contractNumber: data.contractNumber ?? null,
    inputAmount: data.inputAmount ?? null,
    paymentFrequency: data.paymentFrequency ?? null,
    signedDate: data.signedDate ?? null,
    policyStartDate: data.policyStartDate ?? null,
    premiumUpdatedFromStatementChronologyMs: data.premiumUpdatedFromStatementChronologyMs ?? null,
    premiumUpdatedFromStatementId: data.premiumUpdatedFromStatementId ?? null,
    createdFromCommissionStatement: data.createdFromCommissionStatement ?? null,
    createdFromCommissionStatementChronologyMs:
      data.createdFromCommissionStatementChronologyMs ?? null,
    createdFromCommissionStatementId: data.createdFromCommissionStatementId ?? null,
    calculationInputAmount: data.calculationInputAmount ?? null,
    total: data.total ?? null,
    commissionBaseSource: data.commissionBaseSource ?? null,
    commissionCalculationStatus: data.commissionCalculationStatus ?? null,
    initialCommissionBase: data.initialCommissionBase ?? null,
    payoutCount: payouts.length,
    payouts: payouts.map((entry) => ({
      code: entry.code ?? null,
      amount: entry.amount ?? null,
      expectedAmount: entry.expectedAmount ?? null,
      difference: entry.difference ?? null,
      status: entry.status ?? null,
      statementId: entry.statementId ?? null,
      statementNumber: entry.statementNumber ?? null,
      statementDate: entry.statementDate ?? null,
      chronology: entry.statementChronologyMs ?? null,
    })),
    historyCount: history.length,
    history: history.map((entry) => ({
      type: entry.premiumKind ?? entry.type ?? entry.kind ?? null,
      statementId: entry.statementId ?? entry.sourceStatementId ?? null,
      code: entry.commissionCode ?? entry.code ?? null,
      anniversaryDate: entry.anniversaryDate ?? entry.effectiveDate ?? null,
      previousAnnualPremium: entry.previousAnnualPremium ?? null,
      newAnnualPremium: entry.newAnnualPremium ?? null,
      differenceAnnual: entry.differenceAnnual ?? null,
      base: entry.statementBase ?? entry.base ?? null,
    })),
  };
}

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

async function reprocessOneStatement(auth) {
  const idToken = await createIdToken(auth);
  const response = await fetch(`${baseUrl}/api/commission-statements`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "reprocess-saved-statement",
      statementId: reprocessStatementId,
      contractNumber,
    }),
  });
  const json = await response.json().catch(() => ({}));
  console.log("\nREPROCESS");
  const body = fullResponse
    ? json
    : {
        ok: json.ok,
        item: json.item
          ? {
              id: json.item.id,
              statementNumber: json.item.statementNumber,
              period: json.item.period,
              statementDate: json.item.statementDate,
              processingResult: json.item.processingResult,
            }
          : undefined,
        processingResult: json.processingResult,
      };
  console.log(JSON.stringify({ ok: response.ok, status: response.status, body }, null, 2));
}

async function inspectApiDetail(auth, docSnap) {
  const idToken = await createIdToken(auth);
  const pathParts = docSnap.ref.path.split("/");
  const ownerEmail = pathParts[1] ?? "";
  const entryId = pathParts[3] ?? docSnap.id;
  const params = new URLSearchParams({ ownerEmail, entryId, includeTimeline: "0" });
  const response = await fetch(`${baseUrl}/api/contracts/detail?${params.toString()}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const json = await response.json().catch(() => ({}));
  const payouts = Array.isArray(json?.contract?.commissionPayouts)
    ? json.contract.commissionPayouts
    : [];
  console.log("\nAPI DETAIL");
  console.log(
    JSON.stringify(
      {
        ok: response.ok,
        status: response.status,
        viewerEmail: email,
        ownerEmail,
        entryId,
        payoutCount: payouts.length,
        payouts: payouts.map((payout) => ({
          code: payout.code ?? null,
          amount: payout.amount ?? null,
          status: payout.status ?? null,
          writtenBy: payout.writtenBy ?? null,
          statementNumber: payout.statementNumber ?? null,
        })),
      },
      null,
      2
    )
  );
}

async function inspectApiStatement(auth, targetEmail) {
  if (!apiStatementId) return;
  const idToken = await createIdToken(auth);
  const url = `${baseUrl}/api/commission-statements?id=${encodeURIComponent(apiStatementId)}&includeHtml=1`;
  const request = async (impersonate) => {
    const headers = { Authorization: `Bearer ${idToken}` };
    if (impersonate) headers["x-bohemika-impersonate-email"] = targetEmail;
    const response = await fetch(url, { headers });
    const json = await response.json().catch(() => ({}));
    return {
      impersonate,
      status: response.status,
      ok: response.ok,
      error: json.error ?? null,
      statementNumber: json.item?.statementNumber ?? null,
      period: json.item?.period ?? null,
      hasHtml: Boolean(json.item?.html),
    };
  };
  console.log("\nAPI STATEMENT");
  console.log(JSON.stringify({
    actorEmail: email,
    targetEmail,
    statementId: apiStatementId,
    withoutImpersonation: await request(false),
    withImpersonation: await request(true),
  }, null, 2));
}

async function main() {
  if (!contractNumber) throw new Error("Missing --contract.");

  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const auth = getAuth(app);

  const entriesSnap = await db.collection("users").doc(email).collection("entries").get();
  let matchingEntries = entriesSnap.docs.filter(
    (docSnap) => normalizeContractNumber(docSnap.data()?.contractNumber) === contractNumber
  );
  if (matchingEntries.length === 0) {
    const refSnap = await db
      .collection("contractRefs")
      .where("contractNumberNormalized", "==", contractNumber)
      .get();
    const paths = new Set(
      refSnap.docs
        .map((docSnap) => String(docSnap.data()?.entryPath ?? "").trim())
        .filter(Boolean)
    );
    for (const path of paths) {
      const docSnap = await db.doc(path).get();
      if (docSnap.exists) matchingEntries.push(docSnap);
    }
  }
  if (matchingEntries.length === 0) {
    const groupSnap = await db
      .collectionGroup("entries")
      .where("contractNumber", "==", contractNumber)
      .get();
    matchingEntries = groupSnap.docs;
  }

  console.log(`User: ${email}`);
  console.log(`Contract: ${contractNumber}`);
  console.log(`Matching saved contracts: ${matchingEntries.length}`);
  for (const docSnap of matchingEntries) {
    console.log(JSON.stringify(summarizeContract(docSnap), null, 2));
  }

  if (apiDetail && matchingEntries[0]) {
    await inspectApiDetail(auth, matchingEntries[0]);
  }
  if (apiStatementId && matchingEntries[0]) {
    const targetEmail = matchingEntries[0].ref.path.split("/")[1] ?? "";
    await inspectApiStatement(auth, targetEmail);
  }

  if (contractOnly) {
    return;
  }

  const statementsSnap = await db
    .collection("usersPrivate")
    .doc(email)
    .collection("commissionStatements")
    .get();

  const matchingStatements = statementsSnap.docs
    .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() || {} }))
    .filter((item) => normalizeContractNumber(item.data.html || "").includes(contractNumber))
    .sort((a, b) => statementSortMs(a) - statementSortMs(b));

  console.log(`\nMatching saved statements: ${matchingStatements.length}`);
  for (const item of matchingStatements) {
    const rows = parseCommissionRows(String(item.data.html || "")).filter(
      (row) => row.contractNumber === contractNumber
    );
    const text = stripHtml(item.data.html || "");
    const textIndex = text.indexOf(contractNumber);
    const snippet =
      textIndex >= 0
        ? text.slice(Math.max(0, textIndex - 180), Math.min(text.length, textIndex + 420))
        : "";

    console.log("\n" + "-".repeat(88));
    console.log(`id=${item.id}`);
    console.log(`number=${asString(item.data.statementNumber, "-")}`);
    console.log(`period=${asString(item.data.period, "-")}`);
    console.log(`statementDate=${asString(item.data.statementDate, "-")}`);
    console.log(`chronology=${statementSortMs(item)} (${formatDate(statementSortMs(item))})`);
    console.log(`rows=${rows.length}`);
    for (const row of rows) {
      console.log(
        [
          `row=${row.rowId}`,
          `code=${row.code}`,
          `product=${row.product}`,
          `signed=${row.signedAt}`,
          `valid=${row.validFrom}`,
          `client=${row.client}`,
          `base=${row.baseLabel}`,
          `percent=${row.percent}`,
          `commission=${row.commissionLabel}`,
          `reserve=${row.reserveFundLabel}`,
        ].join(" | ")
      );
    }
    if (rows.length === 0 && snippet) console.log(`snippet=${snippet}`);
  }

  if (reprocessStatementId) {
    await reprocessOneStatement(auth);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
