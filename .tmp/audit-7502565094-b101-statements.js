const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

loadEnvConfig(process.cwd());

const TARGET_EMAIL = "jakub.rauscher@bohemika.eu";
const TARGET_CONTRACT = "7502565094";
const TARGET_CLIENT_PATTERNS = [/marcel\s+va[sš]ko/i, /va[sš]ko/i];
const RANGE_START_MS = Date.UTC(2025, 10, 1); // 01.11.2025

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

function normalizeText(value) {
  return String(value ?? "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:td|th|tr|div|p|li|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function toMillis(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function statementSortMs(data) {
  return (
    toMillis(data.statementChronologyMs) ??
    toMillis(data.statementDateMs) ??
    toMillis(data.periodEndMs) ??
    toMillis(data.periodStartMs) ??
    0
  );
}

function rowTextsFromHtml(html) {
  const rows = String(html ?? "").match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  return rows.map(normalizeText).filter(Boolean);
}

function matchingRowsForStatement(data) {
  const html = String(data.html ?? "");
  const rows = rowTextsFromHtml(html);
  const contractRows = rows.filter((row) => row.includes(TARGET_CONTRACT));
  const clientRows = rows.filter((row) => TARGET_CLIENT_PATTERNS.some((pattern) => pattern.test(row)));
  const b101Rows = rows.filter((row) => /\bB101\b/i.test(row));
  const targetB101Rows = rows.filter(
    (row) => row.includes(TARGET_CONTRACT) && /\bB101\b/i.test(row)
  );
  const text = normalizeText(html);
  const targetIndex = text.indexOf(TARGET_CONTRACT);
  const nearbyTargetText =
    targetIndex >= 0
      ? text.slice(Math.max(0, targetIndex - 220), Math.min(text.length, targetIndex + 520))
      : null;

  return {
    contractRows,
    clientRows,
    b101Rows,
    targetB101Rows,
    textContainsContract: text.includes(TARGET_CONTRACT),
    textContainsClient: TARGET_CLIENT_PATTERNS.some((pattern) => pattern.test(text)),
    textContainsB101: /\bB101\b/i.test(text),
    nearbyTargetText,
  };
}

function statementLabel(doc) {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    statementNumber: data.statementNumber ?? null,
    period: data.period ?? null,
    statementDate: data.statementDate ?? null,
    payoutMonthKey: data.payoutMonthKey ?? null,
    sortMs: statementSortMs(data),
  };
}

function compactRow(row) {
  return row.length > 900 ? `${row.slice(0, 900)}...` : row;
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const snap = await db
    .collection("usersPrivate")
    .doc(TARGET_EMAIL)
    .collection("commissionStatements")
    .get();

  const statements = snap.docs
    .map((doc) => ({ doc, data: doc.data() ?? {}, label: statementLabel(doc) }))
    .sort((a, b) => a.label.sortMs - b.label.sortMs);

  const inRange = statements.filter((item) => item.label.sortMs >= RANGE_START_MS);
  const latest = statements[statements.length - 1]?.label ?? null;
  const hits = [];
  const b101Overview = [];

  for (const item of inRange) {
    const matches = matchingRowsForStatement(item.data);
    const hasAnyTarget =
      matches.contractRows.length > 0 ||
      matches.clientRows.length > 0 ||
      matches.textContainsContract ||
      matches.textContainsClient;
    const hasAnyB101 = matches.b101Rows.length > 0 || matches.textContainsB101;
    if (hasAnyB101) {
      b101Overview.push({
        ...item.label,
        b101Rows: matches.b101Rows.length,
        targetB101Rows: matches.targetB101Rows.length,
      });
    }
    if (!hasAnyTarget && matches.targetB101Rows.length === 0) continue;

    hits.push({
      ...item.label,
      contractRows: matches.contractRows.map(compactRow),
      clientRows: matches.clientRows.map(compactRow),
      targetB101Rows: matches.targetB101Rows.map(compactRow),
      nearbyTargetText: matches.nearbyTargetText,
    });
  }

  console.log(
    JSON.stringify(
      {
        targetEmail: TARGET_EMAIL,
        targetContract: TARGET_CONTRACT,
        rangeStart: "2025-11-01",
        totalStatements: statements.length,
        rangeStatements: inRange.length,
        latest,
        targetHits: hits,
        b101Overview,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("Audit failed:", err?.message ?? err);
  process.exit(1);
});
