#!/usr/bin/env node

import nextEnv from "@next/env";
import { createSign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

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

const planPath = String(args.get("plan") ?? "").trim();
const uid = String(args.get("uid") ?? "").trim();
const baseUrl = String(args.get("base-url") ?? "http://localhost:3000").replace(/\/+$/, "");
const offset = Math.max(0, Math.floor(Number(args.get("offset")) || 0));
const limit = Math.max(1, Math.floor(Number(args.get("limit")) || 1));
const delayMs = Math.max(0, Math.floor(Number(args.get("delay-ms")) || 900));
const contractChunkOffset = Math.max(0, Math.floor(Number(args.get("contract-chunk-offset")) || 0));
const contractChunkLimit = Math.max(1, Math.floor(Number(args.get("contract-chunk-limit")) || Number.MAX_SAFE_INTEGER));
const apply = flags.has("--apply");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const loadCredentials = () => {
  const rawJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.client_email && parsed.private_key) {
        return { clientEmail: parsed.client_email, privateKey: parsed.private_key };
      }
    } catch {
      // Fall through to split environment variables.
    }
  }
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  return clientEmail && privateKey
    ? { clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }
    : null;
};

const curlJsonPost = ({ url, headers = {}, body }) => {
  const curlArgs = [
    "-sS",
    "--max-time",
    "90",
    "-X",
    "POST",
    url,
    "-H",
    "Content-Type: application/json",
  ];
  for (const [name, value] of Object.entries(headers)) curlArgs.push("-H", `${name}: ${value}`);
  curlArgs.push("--data-binary", JSON.stringify(body), "-w", "\n%{http_code}");

  const curl = spawnSync("curl", curlArgs, { encoding: "utf8" });
  if (curl.error) throw curl.error;
  if (curl.status !== 0) throw new Error((curl.stderr || "curl request selhal.").trim());
  const output = String(curl.stdout ?? "");
  const separator = output.lastIndexOf("\n");
  const status = Number(output.slice(separator + 1).trim());
  const rawBody = output.slice(0, Math.max(0, separator)).trim();
  let json = null;
  try {
    json = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // The status code is still useful when an upstream response is not JSON.
  }
  return { status, ok: status >= 200 && status < 300, json };
};

const firebaseCustomToken = ({ clientEmail, privateKey }) => {
  const now = Math.floor(Date.now() / 1_000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signed = [
    encode({ alg: "RS256", typ: "JWT" }),
    encode({
      iss: clientEmail,
      sub: clientEmail,
      aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
      iat: now,
      exp: now + 3_600,
      uid,
    }),
  ].join(".");
  const signer = createSign("RSA-SHA256");
  signer.update(signed);
  signer.end();
  return `${signed}.${signer.sign(privateKey, "base64url")}`;
};

const createIdToken = (credentials) => {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  if (!apiKey) throw new Error("Chybí NEXT_PUBLIC_FIREBASE_API_KEY.");
  const response = curlJsonPost({
    url: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    body: { token: firebaseCustomToken(credentials), returnSecureToken: true },
  });
  const idToken = typeof response.json?.idToken === "string" ? response.json.idToken : "";
  if (!response.ok || !idToken) throw new Error(`Nelze získat Firebase ID token (HTTP ${response.status}).`);
  return idToken;
};

const chunksOf = (values, size) => {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
};

async function main() {
  if (!apply) throw new Error("Pro zápis použij --apply.");
  if (!planPath || !uid) throw new Error("Použij --plan=/cesta/k/planu --uid=FirebaseUID.");
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const statements = Array.isArray(plan.statements) ? plan.statements : [];
  const selected = statements.slice(offset, offset + limit);
  if (selected.length === 0) throw new Error("V plánu už nejsou další výpisy.");

  const credentials = loadCredentials();
  if (!credentials) throw new Error("Chybí Firebase Admin přihlašovací údaje.");
  const idToken = createIdToken(credentials);
  const totals = { statements: 0, failed: 0, contractsUpdated: 0, payoutsAdded: 0, payoutsUpdated: 0 };

  console.log(`Zpracovávám ${selected.length} výpisů, pořadí ${offset + 1}–${offset + selected.length}.`);
  for (const [statementIndex, statement] of selected.entries()) {
    const contractNumbers = Array.isArray(statement.contractNumbers)
      ? statement.contractNumbers.filter((value) => typeof value === "string" && value.trim())
      : [];
    const allChunks = chunksOf(contractNumbers, 50);
    const chunks = allChunks.slice(contractChunkOffset, contractChunkOffset + contractChunkLimit);
    if (chunks.length === 0) {
      throw new Error(`Výpis ${statement.label} nemá požadovanou část smluv.`);
    }
    let failed = false;
    for (const [chunkIndex, contractChunk] of chunks.entries()) {
      const response = curlJsonPost({
        url: `${baseUrl}/api/commission-statements`,
        headers: { Authorization: `Bearer ${idToken}` },
        body: {
          action: "reprocess-saved-statement",
          statementId: statement.id,
          contractNumbers: contractChunk,
        },
      });
      const processing = response.json?.processingResult ?? {};
      if (!response.ok || response.json?.ok !== true) {
        failed = true;
        console.error(
          `[${offset + statementIndex + 1}/${statements.length}] CHYBA ${statement.label} · část ${
            contractChunkOffset + chunkIndex + 1
          }/${allChunks.length}: ${response.json?.error || `HTTP ${response.status}`}`
        );
      } else {
        totals.contractsUpdated += Number(processing.contractsUpdated) || 0;
        totals.payoutsAdded += Number(processing.payoutRecordsAdded) || 0;
        totals.payoutsUpdated += Number(processing.payoutRecordsUpdated) || 0;
      }
      if (delayMs > 0 && chunkIndex < chunks.length - 1) await sleep(delayMs);
    }
    totals.statements += 1;
    if (failed) totals.failed += 1;
    console.log(
      `[${offset + statementIndex + 1}/${statements.length}] ${failed ? "DOKONČENO S CHYBOU" : "OK"} ${
        statement.label
      } · ${contractNumbers.length} smluv`
    );
    if (delayMs > 0 && statementIndex < selected.length - 1) await sleep(delayMs);
  }
  console.log(JSON.stringify(totals));
  if (totals.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
