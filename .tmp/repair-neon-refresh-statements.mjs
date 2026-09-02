#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const baseUrl = "http://localhost:3000";

const operations = [
  {
    kind: "convert",
    statementOwner: "vojtech.mahr@bohemika.eu",
    statementId: "1c5db04819cea101d0cc577a50e0320f",
    contractOwner: "vojtech.mahr@bohemika.eu",
    entryId: "idem_0e6192653fc4d9cc5f65c7470abdf348f5941817",
    contractNumber: "7500413092",
    expectedBase: 5593,
  },
  {
    kind: "convert",
    statementOwner: "vojtech.mahr@bohemika.eu",
    statementId: "981b750bec61d8fb220acb63c23e6a98",
    contractOwner: "vojtech.mahr@bohemika.eu",
    entryId: "idem_38eda8a03767511fd5391cfd9166aa100b4a69a4",
    contractNumber: "7500566301",
    expectedBase: 3600,
  },
  {
    kind: "reprocess",
    statementOwner: "vojtech.mahr@bohemika.eu",
    statementId: "8b40366bab240e69fa7d7a1bda97c753",
    contractOwner: "vojtech.mahr@bohemika.eu",
    entryId: "idem_b3affbfd8c32b92b874dc911f28b6de5ae8ea480",
    contractNumber: "7500583486",
    expectedBase: 8483,
  },
  {
    kind: "reprocess",
    statementOwner: "vojtech.mahr@bohemika.eu",
    statementId: "515159942d2deb2d289cd8dc9f107401",
    contractOwner: "vojtech.mahr@bohemika.eu",
    entryId: "idem_b3affbfd8c32b92b874dc911f28b6de5ae8ea480",
    contractNumber: "7500583486",
    expectedBase: 8483,
  },
  {
    kind: "convert",
    statementOwner: "vojtech.mahr@bohemika.eu",
    statementId: "91ac3e73d6cbc9f01f1de34b0a1c47bf",
    contractOwner: "vojtech.mahr@bohemika.eu",
    entryId: "idem_7336d84d1c9c4c24cbfb829ab4448dc3bc97ad6a",
    contractNumber: "7500720823",
    expectedBase: 3504,
  },
  {
    kind: "convert",
    statementOwner: "vojtech.mahr@bohemika.eu",
    statementId: "d78398c579bc2e5753bf07b96c941e1a",
    contractOwner: "vojtech.mahr@bohemika.eu",
    entryId: "idem_61a06dfae6dd26553d20bd336dc79130c3114a63",
    contractNumber: "7500831455",
    expectedBase: 19438,
  },
  {
    kind: "convert",
    statementOwner: "vojtech.mahr@bohemika.eu",
    statementId: "d9c6ff49dd327d06e05dbc3045809dac",
    contractOwner: "vojtech.mahr@bohemika.eu",
    entryId: "idem_952133f3c71b521c6808695cfc39832c96470c1f",
    contractNumber: "7500852991",
    expectedBase: 3600,
  },
  {
    kind: "reprocess",
    statementOwner: "vojtech.mahr@bohemika.eu",
    statementId: "9b083fadb314f75d9bd0341a867ac751",
    contractOwner: "vojtech.mahr@bohemika.eu",
    entryId: "idem_62ecbbe3d60bc779d0d5a2b9e7fe37dec6fd3bf3",
    contractNumber: "7501512426",
    expectedBase: 5858,
  },
  {
    kind: "reprocess",
    statementOwner: "jakub.rauscher@bohemika.eu",
    statementId: "e95e894d423f7d8340c4b813d9bf66d9",
    contractOwner: "jakub.rauscher@bohemika.eu",
    entryId: "idem_011ec17439a71508cf6a03acad09f89f84afdf14",
    contractNumber: "7502712313",
    expectedBase: 12562,
  },
  {
    kind: "reprocess",
    statementOwner: "jakub.rauscher@bohemika.eu",
    statementId: "f6702980d835b5197916278b37da6785",
    contractOwner: "jakub.rauscher@bohemika.eu",
    entryId: "idem_ea31080e1893afcc94d4e40166f7e961d024043b",
    contractNumber: "7502834265",
    expectedBase: 12264,
  },
  {
    kind: "reprocess",
    statementOwner: "jakub.rauscher@bohemika.eu",
    statementId: "5147778f517b6fb3ff4e9c012567b2cc",
    contractOwner: "jakub.rauscher@bohemika.eu",
    entryId: "idem_70172bc1947ad9d2aeff42ee86aadc21363cf54a",
    contractNumber: "7503222875",
    expectedBase: 14118,
  },
  {
    kind: "reprocess",
    statementOwner: "jakub.rauscher@bohemika.eu",
    statementId: "f87558df06295ee16f2381c2480ea924",
    contractOwner: "jakub.rauscher@bohemika.eu",
    entryId: "idem_8657f74f1a3738bf78a3a8380c7c3b6aec2d7aa3",
    contractNumber: "7503301821",
    expectedBase: 35076,
  },
];

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
  throw new Error("Missing Firebase Admin credentials.");
}

const normalizeContractNumber = (value) => String(value ?? "").replace(/\s+/g, "").trim();

async function createIdToken(auth, email) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  if (!apiKey) throw new Error("Missing Firebase API key.");
  const user = await auth.getUserByEmail(email);
  const customToken = await auth.createCustomToken(user.uid);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.idToken) {
    throw new Error(`Cannot authenticate ${email}: HTTP ${response.status}`);
  }
  return json.idToken;
}

async function preflight(db, operation) {
  const [statement, contract] = await Promise.all([
    db
      .collection("usersPrivate")
      .doc(operation.statementOwner)
      .collection("commissionStatements")
      .doc(operation.statementId)
      .get(),
    db
      .collection("users")
      .doc(operation.contractOwner)
      .collection("entries")
      .doc(operation.entryId)
      .get(),
  ]);
  if (!statement.exists) throw new Error(`Missing statement ${operation.statementId}.`);
  if (!contract.exists) throw new Error(`Missing contract ${operation.contractNumber}.`);
  const data = contract.data() ?? {};
  if (normalizeContractNumber(data.contractNumber) !== operation.contractNumber) {
    throw new Error(`Contract number mismatch at ${contract.ref.path}.`);
  }
  if (data.productKey !== "neon") throw new Error(`${operation.contractNumber} is not NEON.`);
  if (!String(statement.data()?.html ?? "").includes(operation.contractNumber)) {
    throw new Error(`Statement ${operation.statementId} does not contain ${operation.contractNumber}.`);
  }
  if (operation.kind === "convert" && data.isRefresh === true) {
    throw new Error(`${operation.contractNumber} is already marked as refresh.`);
  }
  if (operation.kind === "reprocess" && data.isRefresh !== true) {
    throw new Error(`${operation.contractNumber} is not marked as refresh.`);
  }
}

async function postOperation(idToken, operation) {
  const body =
    operation.kind === "convert"
      ? {
          action: "convert-neon-refresh-from-statement",
          statementId: operation.statementId,
          ownerEmail: operation.contractOwner,
          entryId: operation.entryId,
          contractNumber: operation.contractNumber,
        }
      : {
          action: "reprocess-saved-statement",
          statementId: operation.statementId,
          contractNumber: operation.contractNumber,
        };
  const response = await fetch(`${baseUrl}/api/commission-statements`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok !== true) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

const credentials = loadCredentials();
const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
const db = getFirestore(app);
const auth = getAuth(app);

for (const operation of operations) await preflight(db, operation);
console.log(`Preflight OK for ${operations.length} operations / ${new Set(operations.map((item) => item.contractNumber)).size} contracts.`);
for (const operation of operations) {
  console.log(
    `${operation.kind} contract=${operation.contractNumber} statement=${operation.statementId} expectedBase=${operation.expectedBase}`
  );
}

if (!apply) {
  console.log("Dry run only. Use --apply to write through the application API.");
  process.exit(0);
}

const tokens = new Map();
for (const email of new Set(operations.map((item) => item.statementOwner))) {
  tokens.set(email, await createIdToken(auth, email));
}

for (const [index, operation] of operations.entries()) {
  const json = await postOperation(tokens.get(operation.statementOwner), operation);
  const result = json.processingResult ?? null;
  console.log(
    `[${index + 1}/${operations.length}] OK ${operation.kind} ${operation.contractNumber}` +
      (result
        ? ` contractsUpdated=${result.contractsUpdated ?? 0} payoutsUpdated=${result.payoutRecordsUpdated ?? 0}`
        : "")
  );
}
