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
  let totalContracts = 0;
  const nonDigits = [];
  const shortNums = [];

  snap.docs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const entryType = typeof d.entryType === 'string' ? d.entryType.trim().toLowerCase() : 'contract';
    if (entryType !== 'contract') return;

    totalContracts += 1;

    const contractNumber = typeof d.contractNumber === 'string' ? d.contractNumber.trim() : '';
    if (!contractNumber) return;

    const row = {
      path: docSnap.ref.path,
      contractNumber,
      userEmail: d.userEmail || null,
      signed: toIso(d.contractSignedDate),
      createdAt: toIso(d.createdAt),
      productKey: d.productKey || null,
    };

    if (!/^\d+$/.test(contractNumber)) nonDigits.push(row);
    if (/^\d+$/.test(contractNumber) && contractNumber.length < 10) shortNums.push(row);
  });

  console.log(`contracts_scanned=${totalContracts}`);
  console.log(`non_digit_contract_numbers=${nonDigits.length}`);
  console.log(`short_numeric_contract_numbers_lt10=${shortNums.length}`);

  if (nonDigits.length) {
    console.log('\nNon-digit contract numbers:');
    nonDigits.slice(0, 80).forEach((r) => {
      console.log(`- ${r.path} | contract=${r.contractNumber} | user=${r.userEmail ?? 'null'} | signed=${r.signed ?? 'null'} | createdAt=${r.createdAt ?? 'null'} | product=${r.productKey ?? 'null'}`);
    });
  }

  if (shortNums.length) {
    console.log('\nShort numeric contract numbers (<10 chars):');
    shortNums.slice(0, 80).forEach((r) => {
      console.log(`- ${r.path} | contract=${r.contractNumber} | user=${r.userEmail ?? 'null'} | signed=${r.signed ?? 'null'} | createdAt=${r.createdAt ?? 'null'} | product=${r.productKey ?? 'null'}`);
    });
  }
}

main().catch((err) => {
  console.error('Format check failed:', err?.message ?? err);
  process.exit(1);
});
