const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

loadEnvConfig(process.cwd());

const PETR = 'petr.rauscher@bohemika.eu';
const LIFE = new Set(['neon', 'flexi', 'maximaMaxEfekt', 'pillowInjury']);

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

function normalizeEmail(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return s || null;
}

function normalizeMode(v) {
  if (v === 'standard' || v === 'accelerated') return v;
  return null;
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'object' && v && typeof v.toDate === 'function') {
    const d = v.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toIso(v) {
  const d = toDate(v);
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

(async () => {
  const creds = loadCredentials();
  if (!creds) throw new Error('Missing FIREBASE_ADMIN_* credentials.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();

  const rows = [];
  const seen = new Set();

  for (const userDoc of usersSnap.docs) {
    const ownerDocId = userDoc.id;
    const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();

    for (const entrySnap of entriesSnap.docs) {
      const path = `users/${ownerDocId}/entries/${entrySnap.id}`;
      if (seen.has(path)) continue;
      seen.add(path);

      const d = entrySnap.data() || {};
      const entryType = typeof d.entryType === 'string' ? d.entryType : 'contract';
      if (entryType !== 'contract') continue;
      if (!LIFE.has(d.productKey)) continue;

      const chain = Array.isArray(d.managerChain) ? d.managerChain : [];
      const hasPetr = chain.some((n) => normalizeEmail(n?.email) === PETR);
      if (!hasPetr) continue;

      const overrides = Array.isArray(d.managerOverrides) ? d.managerOverrides : [];
      const petrOverride = overrides.find((o) => normalizeEmail(o?.email) === PETR) ?? null;

      rows.push({
        contractNumber: String(d.contractNumber ?? '').trim() || '—',
        product: d.productKey,
        signed: toIso(d.contractSignedDate),
        ownerEmail: normalizeEmail(d.userEmail) ?? ownerDocId.toLowerCase(),
        petrMode: normalizeMode(petrOverride?.commissionMode),
        path,
      });
    }
  }

  rows.sort((a, b) => {
    const aDate = a.signed ?? '0000-00-00';
    const bDate = b.signed ?? '0000-00-00';
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.contractNumber.localeCompare(b.contractNumber, 'cs');
  });

  const counts = {
    total: rows.length,
    standard: rows.filter((r) => r.petrMode === 'standard').length,
    accelerated: rows.filter((r) => r.petrMode === 'accelerated').length,
    missing: rows.filter((r) => !r.petrMode).length,
  };

  console.log(`contracts=${counts.total}`);
  console.log(`petr_standard=${counts.standard}`);
  console.log(`petr_accelerated=${counts.accelerated}`);
  console.log(`petr_mode_missing=${counts.missing}`);

  const notStandard = rows.filter((r) => r.petrMode !== 'standard');
  console.log(`not_standard=${notStandard.length}`);

  if (notStandard.length > 0) {
    console.log('---');
    notStandard.slice(0, 200).forEach((r) => {
      console.log([
        r.contractNumber,
        r.product,
        r.signed ?? '—',
        r.ownerEmail,
        r.petrMode ?? 'null',
        r.path,
      ].join(' | '));
    });
  }
})();
