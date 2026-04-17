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
      privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
    };
  }
  return null;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value && typeof value.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(value) {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const snap = await db.collectionGroup('entries').get();
  const byNumber = new Map();

  snap.docs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const entryType = typeof d.entryType === 'string' ? d.entryType.trim().toLowerCase() : 'contract';
    if (entryType !== 'contract') return;

    const contractNumber = typeof d.contractNumber === 'string' ? d.contractNumber.trim() : '';
    if (!contractNumber) return;

    const list = byNumber.get(contractNumber) || [];
    list.push({
      path: docSnap.ref.path,
      userEmail: d.userEmail || null,
      signed: toIso(d.contractSignedDate),
      createdAt: toIso(d.createdAt),
      productKey: d.productKey || null,
      total: Number.isFinite(Number(d.total)) ? Number(d.total) : null,
    });
    byNumber.set(contractNumber, list);
  });

  const duplicates = Array.from(byNumber.entries())
    .filter(([, rows]) => rows.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`unique_contract_numbers=${byNumber.size}`);
  console.log(`duplicate_numbers=${duplicates.length}`);

  duplicates.slice(0, 80).forEach(([num, rows]) => {
    console.log(`\ncontract=${num} count=${rows.length}`);
    rows.forEach((r) => {
      console.log(`- ${r.path} | user=${r.userEmail ?? 'null'} | signed=${r.signed ?? 'null'} | createdAt=${r.createdAt ?? 'null'} | product=${r.productKey ?? 'null'} | total=${r.total ?? 'null'}`);
    });
  });
}

main().catch((err) => {
  console.error('Duplicate check failed:', err?.message ?? err);
  process.exit(1);
});
