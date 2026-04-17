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

function norm(s) {
  return String(s || '').toLowerCase().trim();
}

async function main() {
  const target = process.argv.slice(2).join(' ').trim();
  if (!target) throw new Error('Pass client name.');

  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const snap = await db.collectionGroup('entries').get();
  const rows = [];
  const targetNorm = norm(target);

  snap.docs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const name = typeof d.clientName === 'string' ? d.clientName : '';
    if (norm(name) !== targetNorm) return;
    rows.push({
      path: docSnap.ref.path,
      contractNumber: typeof d.contractNumber === 'string' ? d.contractNumber : null,
      productKey: typeof d.productKey === 'string' ? d.productKey : null,
      userEmail: d.userEmail ?? null,
      signed: toIso(d.contractSignedDate),
      policyStart: toIso(d.policyStartDate),
      createdAt: toIso(d.createdAt),
      total: Number.isFinite(Number(d.total)) ? Number(d.total) : null,
      entryType: typeof d.entryType === 'string' ? d.entryType : null,
    });
  });

  rows.sort((a,b) => String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  console.log(`hits=${rows.length}`);
  rows.forEach((r, i) => {
    console.log(`- #${i+1} ${r.path} | contract=${r.contractNumber ?? 'null'} | product=${r.productKey ?? 'null'} | signed=${r.signed ?? 'null'} | createdAt=${r.createdAt ?? 'null'} | total=${r.total ?? 'null'} | user=${r.userEmail ?? 'null'}`);
  });
}

main().catch((err) => {
  console.error('Find by client failed:', err?.message ?? err);
  process.exit(1);
});
