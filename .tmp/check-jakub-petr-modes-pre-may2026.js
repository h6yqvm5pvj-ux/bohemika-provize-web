const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

loadEnvConfig(process.cwd());

const MANAGER = 'jakub.rauscher@bohemika.eu';
const JAKUB = 'jakub.rauscher@bohemika.eu';
const PETR = 'petr.rauscher@bohemika.eu';
const CUTOFF = '2026-05-01';
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
  if (v === 'accelerated' || v === 'standard') return v;
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

function collectSubordinates(managerEmail, childrenByManager) {
  const out = [];
  const visited = new Set();
  const queue = [...(childrenByManager.get(managerEmail) ?? [])];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || visited.has(cur)) continue;
    visited.add(cur);
    out.push(cur);
    const kids = childrenByManager.get(cur) ?? [];
    kids.forEach((k) => {
      if (!visited.has(k)) queue.push(k);
    });
  }
  return out;
}

(async () => {
  const creds = loadCredentials();
  if (!creds) throw new Error('missing creds');
  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const users = new Map();

  usersSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const email = normalizeEmail(data.email ?? docSnap.id);
    if (!email) return;
    const existing = users.get(email);
    const mgr = normalizeEmail(data.managerEmail);
    if (!existing) {
      users.set(email, { email, managerEmail: mgr, docIds: [docSnap.id] });
    } else {
      if (!existing.docIds.includes(docSnap.id)) existing.docIds.push(docSnap.id);
      const canonical = docSnap.id.toLowerCase() === email;
      if (canonical || !existing.managerEmail) existing.managerEmail = mgr;
    }
  });

  const childrenByManager = new Map();
  users.forEach((u) => {
    if (!u.managerEmail) return;
    const arr = childrenByManager.get(u.managerEmail) ?? [];
    arr.push(u.email);
    childrenByManager.set(u.managerEmail, Array.from(new Set(arr)));
  });

  const subs = collectSubordinates(MANAGER, childrenByManager);
  const seen = new Set();

  const rows = [];

  for (const ownerEmail of subs) {
    const owner = users.get(ownerEmail);
    const docIds = owner?.docIds?.length ? owner.docIds : [ownerEmail];

    for (const ownerDocId of docIds) {
      const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();
      for (const entrySnap of entriesSnap.docs) {
        const path = `users/${ownerDocId}/entries/${entrySnap.id}`;
        if (seen.has(path)) continue;
        seen.add(path);

        const d = entrySnap.data() || {};
        const entryType = typeof d.entryType === 'string' ? d.entryType : 'contract';
        if (entryType !== 'contract') continue;
        if (!LIFE.has(d.productKey)) continue;
        const signed = toIso(d.contractSignedDate);
        if (!signed || signed >= CUTOFF) continue;
        const advisorMode = normalizeMode(d.commissionMode);
        if (advisorMode !== 'accelerated') continue;

        const chain = Array.isArray(d.managerChain) ? d.managerChain : [];
        const hasJakub = chain.some((n) => normalizeEmail(n?.email) === JAKUB);
        if (!hasJakub) continue;

        const overrides = Array.isArray(d.managerOverrides) ? d.managerOverrides : [];
        const jakubOv = overrides.find((o) => normalizeEmail(o?.email) === JAKUB) ?? null;
        const petrOv = overrides.find((o) => normalizeEmail(o?.email) === PETR) ?? null;

        rows.push({
          contractNumber: String(d.contractNumber ?? '').trim() || '—',
          path,
          signed,
          product: d.productKey,
          jakubMode: normalizeMode(jakubOv?.commissionMode),
          petrMode: normalizeMode(petrOv?.commissionMode),
        });
      }
    }
  }

  rows.sort((a,b)=>a.contractNumber.localeCompare(b.contractNumber,'cs'));

  const jakubStd = rows.filter((r) => r.jakubMode === 'standard').length;
  const jakubAcc = rows.filter((r) => r.jakubMode === 'accelerated').length;
  const petrStd = rows.filter((r) => r.petrMode === 'standard').length;
  const petrAcc = rows.filter((r) => r.petrMode === 'accelerated').length;

  console.log(`contracts=${rows.length}`);
  console.log(`jakub_standard=${jakubStd}`);
  console.log(`jakub_accelerated=${jakubAcc}`);
  console.log(`petr_standard=${petrStd}`);
  console.log(`petr_accelerated=${petrAcc}`);

  const mismatches = rows.filter((r) => r.jakubMode !== 'standard' || r.petrMode !== 'standard');
  console.log(`not_both_standard=${mismatches.length}`);
  if (mismatches.length) {
    console.log('---');
    mismatches.slice(0, 30).forEach((m) => {
      console.log([m.contractNumber, m.product, m.signed, m.jakubMode ?? 'null', m.petrMode ?? 'null', m.path].join(' | '));
    });
  }
})();
