const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

loadEnvConfig(process.cwd());

const HISTORICAL_FROM = '2019-10-01';
const HISTORICAL_TO_EXCLUSIVE = '2024-07-01';

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

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value && typeof value.toDate === 'function') {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toIsoDay(value) {
  const d = toDate(value);
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function inHistoricalWindow(isoDay) {
  if (!isoDay) return false;
  return isoDay >= HISTORICAL_FROM && isoDay < HISTORICAL_TO_EXCLUSIVE;
}

async function main() {
  const creds = loadCredentials();
  if (!creds) {
    throw new Error('Missing FIREBASE_ADMIN_* credentials.');
  }

  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const usersByEmail = new Map();

  usersSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const email = normalizeEmail(data.email ?? docSnap.id);
    if (!email) return;

    const existing = usersByEmail.get(email);
    if (!existing) {
      usersByEmail.set(email, { email, docIds: [docSnap.id] });
      return;
    }
    if (!existing.docIds.includes(docSnap.id)) {
      existing.docIds.push(docSnap.id);
    }
  });

  const seenPaths = new Set();
  const rows = [];
  let neonContractsTotal = 0;
  let neonContractsMissingSignedDate = 0;

  for (const { email, docIds } of usersByEmail.values()) {
    for (const ownerDocId of docIds) {
      const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();
      for (const entrySnap of entriesSnap.docs) {
        const path = `users/${ownerDocId}/entries/${entrySnap.id}`;
        if (seenPaths.has(path)) continue;
        seenPaths.add(path);

        const d = entrySnap.data() || {};
        const entryType = typeof d.entryType === 'string' ? d.entryType : 'contract';
        if (entryType !== 'contract') continue;
        if (d.productKey !== 'neon') continue;

        neonContractsTotal += 1;

        const signedIso = toIsoDay(d.contractSignedDate);
        if (!signedIso) {
          neonContractsMissingSignedDate += 1;
          continue;
        }
        if (!inHistoricalWindow(signedIso)) continue;

        rows.push({
          ownerEmail: email,
          ownerDocId,
          entryId: entrySnap.id,
          contractNumber: String(d.contractNumber ?? '').trim() || '—',
          clientName: String(d.clientName ?? '').trim() || '—',
          signedIso,
          policyStartIso: toIsoDay(d.policyStartDate),
          mode: typeof d.commissionMode === 'string' ? d.commissionMode : null,
          position: typeof d.position === 'string' ? d.position : null,
        });
      }
    }
  }

  rows.sort((a, b) => {
    if (a.signedIso !== b.signedIso) return a.signedIso.localeCompare(b.signedIso);
    if (a.contractNumber !== b.contractNumber) return a.contractNumber.localeCompare(b.contractNumber, 'cs');
    return a.ownerEmail.localeCompare(b.ownerEmail, 'cs');
  });

  console.log(`NEON_CONTRACTS_TOTAL=${neonContractsTotal}`);
  console.log(`NEON_MISSING_SIGNED_DATE=${neonContractsMissingSignedDate}`);
  console.log(`HISTORICAL_WINDOW=${HISTORICAL_FROM}..${new Date(new Date(HISTORICAL_TO_EXCLUSIVE).getTime()-86400000).toISOString().slice(0,10)}`);
  console.log(`HISTORICAL_NEON_COUNT=${rows.length}`);

  const modeCounts = rows.reduce((acc, row) => {
    const key = row.mode || 'null';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  console.log(`HISTORICAL_MODES=${JSON.stringify(modeCounts)}`);

  console.log('--- HISTORICAL_NEON_ROWS ---');
  for (const row of rows) {
    const detailPath = `/smlouvy/${encodeURIComponent(`${row.ownerDocId}___${row.entryId}`)}?from=list`;
    console.log([
      row.signedIso,
      row.contractNumber,
      row.clientName,
      row.ownerEmail,
      row.mode || 'null',
      row.position || 'null',
      detailPath,
    ].join(' | '));
  }
}

main().catch((err) => {
  console.error('ERROR', err?.message || err);
  process.exit(1);
});
