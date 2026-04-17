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

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    }
    const out = {};
    Object.keys(value).sort().forEach((k) => { out[k] = normalize(value[k]); });
    return out;
  }
  return value;
}

async function main() {
  const paths = process.argv.slice(2);
  if (!paths.length) throw new Error('Pass Firestore doc path(s).');

  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  for (const path of paths) {
    const ref = db.doc(path);
    const snap = await ref.get();
    console.log(`\\n=== ${path} ===`);
    if (!snap.exists) {
      console.log('NOT_FOUND');
      continue;
    }
    const data = normalize(snap.data() || {});
    console.log(JSON.stringify(data, null, 2));
  }
}

main().catch((err) => {
  console.error('Inspect by path failed:', err?.message ?? err);
  process.exit(1);
});
