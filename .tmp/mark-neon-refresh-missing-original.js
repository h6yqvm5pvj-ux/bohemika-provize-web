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

async function main() {
  const apply = process.argv.includes("--apply");
  const numbers = process.argv
    .slice(2)
    .filter((arg) => arg !== "--apply")
    .map((arg) => arg.trim())
    .filter(Boolean);

  if (numbers.length === 0) {
    throw new Error("Usage: node .tmp/mark-neon-refresh-missing-original.js <contractNumber> [...] [--apply]");
  }

  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error("Missing FIREBASE_ADMIN_* credentials in environment.");
  }

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const wanted = new Set(numbers);
  const snap = await db.collectionGroup("entries").get();
  const matches = [];

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const contractNumber =
      typeof data.contractNumber === "string" ? data.contractNumber.trim() : "";
    if (!wanted.has(contractNumber)) return;
    matches.push({ ref: docSnap.ref, data, contractNumber });
  });

  console.log(`apply=${apply}`);
  console.log(`matches=${matches.length}`);

  for (const match of matches) {
    const productKey =
      typeof match.data.productKey === "string" ? match.data.productKey.trim() : "";
    if (productKey !== "neon") {
      console.log(`SKIP ${match.ref.path} | ${match.contractNumber} | product=${productKey}`);
      continue;
    }

    const updates = {
      isRefresh: true,
      refreshOriginalContractNumber: null,
      refreshOriginalMissingInSystem: true,
      requiresStatementRefresh: true,
      commissionCalculationStatus: "provisional_refresh_missing_original",
      commissionBaseSource: "calculator_provisional",
      refreshCommissionBase: null,
      updatedAt: new Date(),
    };

    console.log(`UPDATE ${match.ref.path} | ${match.contractNumber}`);
    console.log(JSON.stringify(updates, null, 2));

    if (apply) {
      await match.ref.update(updates);
    }
  }
}

main().catch((err) => {
  console.error("Update failed:", err?.message ?? err);
  process.exit(1);
});
