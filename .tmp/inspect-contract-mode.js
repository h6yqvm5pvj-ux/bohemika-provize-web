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

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeItem(item) {
  return {
    title: item?.title ?? null,
    code: item?.code ?? null,
    amount: item?.amount ?? null,
    note: item?.note ?? null,
  };
}

function normalizeOverride(override) {
  return {
    email: override?.email ?? null,
    position: override?.position ?? null,
    commissionMode: override?.commissionMode ?? null,
    total: override?.total ?? null,
    items: Array.isArray(override?.items) ? override.items.map(normalizeItem) : [],
  };
}

async function main() {
  const numbers = process.argv.slice(2).filter((value) => !value.startsWith("--"));
  if (numbers.length === 0) {
    throw new Error("Usage: node .tmp/inspect-contract-mode.js <contractNumber> [...]");
  }
  const wanted = new Set(numbers);
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const snap = await db.collectionGroup("entries").get();
  const hits = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const contractNumber =
      typeof data.contractNumber === "string" ? data.contractNumber.trim() : "";
    if (!wanted.has(contractNumber)) continue;

    hits.push({
      path: docSnap.ref.path,
      contractNumber,
      clientName: data.clientName ?? null,
      entryType: data.entryType ?? null,
      productKey: data.productKey ?? null,
      position: data.position ?? null,
      commissionMode: data.commissionMode ?? null,
      managerModeSnapshot: data.managerModeSnapshot ?? null,
      managerEmailSnapshot: data.managerEmailSnapshot ?? null,
      contractSignedDate: normalizeDate(data.contractSignedDate),
      policyStartDate: normalizeDate(data.policyStartDate),
      inputAmount: data.inputAmount ?? null,
      calculationInputAmount: data.calculationInputAmount ?? null,
      effectiveInputAmount: data.effectiveInputAmount ?? null,
      frequencyRaw: data.frequencyRaw ?? null,
      durationYears: data.durationYears ?? null,
      total: data.total ?? null,
      items: Array.isArray(data.items) ? data.items.map(normalizeItem) : [],
      managerChain: Array.isArray(data.managerChain)
        ? data.managerChain.map((node) => ({
            email: node?.email ?? null,
            position: node?.position ?? null,
            commissionMode: node?.commissionMode ?? null,
          }))
        : [],
      managerOverrides: Array.isArray(data.managerOverrides)
        ? data.managerOverrides.map(normalizeOverride)
        : [],
    });
  }

  console.log(`hits=${hits.length}`);
  console.log(JSON.stringify(hits, null, 2));
}

main().catch((error) => {
  console.error(`inspect_failed=${error?.message ?? error}`);
  process.exit(1);
});
