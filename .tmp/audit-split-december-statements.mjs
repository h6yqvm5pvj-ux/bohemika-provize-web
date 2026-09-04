#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function credentials() {
  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (raw) {
    const parsed = JSON.parse(raw);
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
  }
  return {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
}

const normalize = (value) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const identity = (row) => {
  const number = normalize(row.number);
  const period = normalize(row.period);
  const date = normalize(row.date);
  const advisor = normalize(row.advisor);
  return number && (period || date)
    ? `statement:${number}|${period}|${date}|${advisor}`
    : `id:${row.id}`;
};
const ownerFromPath = (path) => path.split("/")[1] ?? "";
const monthKey = (row) => String(row.payoutMonthKey ?? "").trim();

const app = getApps()[0] ?? initializeApp({ credential: cert(credentials()) });
const db = getFirestore(app);
const snap = await db.collectionGroup("commissionStatements").get();
const rows = snap.docs.map((doc) => {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    owner: ownerFromPath(doc.ref.path),
    number: data.statementNumber ?? null,
    period: data.period ?? null,
    date: data.statementDate ?? null,
    advisor: data.advisorNumber ?? null,
    payoutMonthKey: data.payoutMonthKey ?? null,
    payoutTotal: typeof data.payoutTotal === "number" ? data.payoutTotal : null,
  };
});

const exactIdentityCounts = new Map();
for (const row of rows) {
  const key = `${row.owner}::${identity(row)}`;
  exactIdentityCounts.set(key, (exactIdentityCounts.get(key) ?? 0) + 1);
}

const byOwnerMonth = new Map();
for (const row of rows) {
  const month = monthKey(row);
  if (!month) continue;
  const key = `${row.owner}::${month}`;
  byOwnerMonth.set(key, [...(byOwnerMonth.get(key) ?? []), row]);
}
const multiStatementMonths = [...byOwnerMonth.entries()]
  .filter(([, group]) => new Set(group.map(identity)).size > 1)
  .map(([key, group]) => ({
    key,
    count: new Set(group.map(identity)).size,
    statements: group.map(({ id, number, period, date, payoutMonthKey, payoutTotal }) => ({
      id,
      number,
      period,
      date,
      payoutMonthKey,
      payoutTotal,
    })),
  }))
  .sort((a, b) => a.key.localeCompare(b.key));

const splitDecember = rows
  .filter((row) => /\.\s*12\.\s*\d{4}\s*-\s*\d{1,2}\.\s*12\.\s*\d{4}/.test(String(row.period ?? "")))
  .sort((a, b) => `${a.owner}:${a.date}:${a.number}`.localeCompare(`${b.owner}:${b.date}:${b.number}`))
  .map(({ id, owner, number, period, date, payoutMonthKey, payoutTotal }) => ({
    id,
    owner,
    number,
    period,
    date,
    payoutMonthKey,
    payoutTotal,
  }));

console.log(JSON.stringify({
  statementDocuments: rows.length,
  duplicateBusinessIdentities: [...exactIdentityCounts.values()].filter((count) => count > 1).length,
  multiStatementPayoutMonths: multiStatementMonths.length,
  splitDecemberCount: splitDecember.length,
  splitDecember,
  sampleMultiStatementMonths: multiStatementMonths.slice(-20),
}, null, 2));
