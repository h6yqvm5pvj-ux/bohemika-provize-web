const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

loadEnvConfig(process.cwd());

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

function normalizeContractNumber(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function simplifyFirestoreValue(value) {
  if (!value) return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(simplifyFirestoreValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, simplifyFirestoreValue(item)])
    );
  }
  return value;
}

async function main() {
  const targets = new Set(process.argv.slice(2).map(normalizeContractNumber).filter(Boolean));
  if (targets.size === 0) throw new Error("Pass at least one contract number.");

  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const snap = await db.collectionGroup("entries").get();
  let hits = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const contractNumber = normalizeContractNumber(data.contractNumber);
    if (!targets.has(contractNumber)) continue;
    hits += 1;
    console.log(`\n${docSnap.ref.path}`);
    console.log(JSON.stringify(simplifyFirestoreValue(data), null, 2));
  }

  console.log(`\nhits=${hits}`);
}

main().catch((err) => {
  console.error("Inspect failed:", err?.message ?? err);
  process.exit(1);
});
