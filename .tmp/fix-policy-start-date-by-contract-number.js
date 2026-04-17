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
    } catch {
      // fallback to split env vars
    }
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

function toIso(value) {
  if (!value) return null;
  if (value && typeof value.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isContractEntryType(value) {
  if (typeof value !== 'string') return true;
  return value.trim().toLowerCase() === 'contract';
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const cleaned = args.filter((arg) => arg !== '--apply');

  const contractNumber = cleaned[0];
  const targetIsoDay = cleaned[1];

  if (!contractNumber || !targetIsoDay) {
    throw new Error('Usage: node .tmp/fix-policy-start-date-by-contract-number.js <contractNumber> <YYYY-MM-DD> [--apply]');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetIsoDay)) {
    throw new Error('Date must be in YYYY-MM-DD format.');
  }

  const targetDate = new Date(`${targetIsoDay}T00:00:00.000Z`);
  if (Number.isNaN(targetDate.getTime())) {
    throw new Error('Invalid target date.');
  }

  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const snap = await db.collectionGroup('entries').get();
  const matches = [];

  snap.docs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const number = typeof d.contractNumber === 'string' ? d.contractNumber.trim() : '';
    if (number !== contractNumber) return;
    if (!isContractEntryType(d.entryType)) return;

    matches.push({
      ref: docSnap.ref,
      path: docSnap.ref.path,
      oldPolicyStartDateIso: toIso(d.policyStartDate),
      entryType: typeof d.entryType === 'string' ? d.entryType : null,
    });
  });

  console.log(`Matched contract documents: ${matches.length}`);
  matches.forEach((m) => {
    console.log(`- ${m.path} | entryType=${m.entryType ?? 'null'} | oldPolicyStartDate=${m.oldPolicyStartDateIso ?? 'null'} | newPolicyStartDate=${targetDate.toISOString()}`);
  });

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write updates.');
    return;
  }

  if (matches.length === 0) {
    console.log('No matching documents found.');
    return;
  }

  let batch = db.batch();
  let ops = 0;

  matches.forEach((m) => {
    batch.set(m.ref, { policyStartDate: targetDate }, { merge: true });
    ops += 1;
  });

  await batch.commit();
  console.log(`Applied updates: ${ops}`);
}

main().catch((err) => {
  console.error('Fix failed:', err?.message ?? err);
  process.exit(1);
});
