const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

loadEnvConfig(process.cwd());

function loadCredentials() {
  const rawJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return { projectId: parsed.project_id, clientEmail: parsed.client_email, privateKey: parsed.private_key };
      }
    } catch {}
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (projectId && clientEmail && privateKeyRaw) {
    return { projectId, clientEmail, privateKey: privateKeyRaw.replace(/\\n/g, '\n') };
  }
  return null;
}

function toIso(value) {
  if (!value) return null;
  if (value && typeof value.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function main() {
  const numbers = new Set(process.argv.slice(2));
  if (numbers.size === 0) throw new Error('Pass contract numbers.');

  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const snap = await db.collectionGroup('entries').get();
  const hits = [];

  snap.docs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const contractNumber = typeof d.contractNumber === 'string' ? d.contractNumber.trim() : '';
    if (!numbers.has(contractNumber)) return;

    hits.push({
      path: docSnap.ref.path,
      entryType: typeof d.entryType === 'string' ? d.entryType : null,
      productKey: typeof d.productKey === 'string' ? d.productKey : null,
      userEmail: d.userEmail ?? null,
      managerEmailSnapshot: d.managerEmailSnapshot ?? null,
      managerPositionSnapshot: d.managerPositionSnapshot ?? null,
      managerModeSnapshot: d.managerModeSnapshot ?? null,
      managerChainLen: Array.isArray(d.managerChain) ? d.managerChain.length : null,
      managerOverridesLen: Array.isArray(d.managerOverrides) ? d.managerOverrides.length : null,
      allowedEmailsLen: Array.isArray(d.allowedEmails) ? d.allowedEmails.length : null,
      contractSignedDate: toIso(d.contractSignedDate),
      policyStartDate: toIso(d.policyStartDate),
      createdAt: toIso(d.createdAt),
      updatedAt: toIso(d.updatedAt),
      keys: Object.keys(d).sort(),
    });
  });

  console.log(`hits=${hits.length}`);
  hits.forEach((h, i) => {
    console.log(`\n#${i + 1}`);
    console.log(JSON.stringify(h, null, 2));
  });
}

main().catch((err) => {
  console.error('Inspect failed:', err?.message ?? err);
  process.exit(1);
});
