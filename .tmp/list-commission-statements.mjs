#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const email = String(process.argv[2] ?? "").trim().toLowerCase();
const minNumber = Number(process.argv[3] ?? 132);
const maxNumber = Number(process.argv[4] ?? 140);

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

const app = getApps()[0] ?? initializeApp({ credential: cert(credentials()) });
const db = getFirestore(app);
const snap = await db
  .collection("usersPrivate")
  .doc(email)
  .collection("commissionStatements")
  .get();

const rows = snap.docs
  .map((doc) => {
    const data = doc.data() ?? {};
    return {
      id: doc.id,
      number: data.statementNumber ?? null,
      period: data.period ?? null,
      date: data.statementDate ?? null,
      chronology: Number(data.statementChronologyMs) || 0,
      hasHtml: Boolean(String(data.html ?? "").trim()),
    };
  })
  .filter((row) => {
    const number = Number(row.number);
    return Number.isFinite(number) && number >= minNumber && number <= maxNumber;
  })
  .sort((a, b) => Number(a.number) - Number(b.number));

console.log(JSON.stringify({ email, count: rows.length, rows }, null, 2));
