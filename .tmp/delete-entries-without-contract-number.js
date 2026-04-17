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

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return v.length ? v : null;
}

function ownerFromDocSnap(docSnap, data) {
  return (
    normalizeEmail(data?.userEmail) ??
    normalizeEmail(docSnap.ref.parent?.parent?.id ?? null) ??
    'unknown'
  );
}

function toDateLabel(value) {
  if (!value) return '—';
  if (typeof value === 'string') {
    const t = value.trim();
    if (t.length > 0) return t;
  }

  if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    const d = value.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '—';
}

function hasContractNumber(value) {
  if (typeof value !== 'string') return false;
  return value.trim().length > 0;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');

  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');
  }

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const entriesSnap = await db.collectionGroup('entries').get();

  let scannedAll = 0;
  let scannedContracts = 0;
  const toDelete = [];

  entriesSnap.docs.forEach((docSnap) => {
    scannedAll += 1;
    const data = docSnap.data() || {};

    const entryTypeRaw =
      typeof data.entryType === 'string' ? data.entryType.trim().toLowerCase() : 'contract';
    if (entryTypeRaw !== 'contract') return;

    scannedContracts += 1;

    if (hasContractNumber(data.contractNumber)) return;

    const ownerDocId = docSnap.ref.parent?.parent?.id ?? 'unknown';
    toDelete.push({
      ref: docSnap.ref,
      path: `users/${ownerDocId}/entries/${docSnap.id}`,
      ownerEmail: ownerFromDocSnap(docSnap, data),
      signedDate: toDateLabel(data.contractSignedDate),
      createdDate: toDateLabel(data.createdAt),
      contractNumberRaw: data.contractNumber,
    });
  });

  console.log(`Entries scanned (all): ${scannedAll}`);
  console.log(`Contract entries scanned: ${scannedContracts}`);
  console.log(`Contracts without contractNumber: ${toDelete.length}`);

  if (toDelete.length > 0) {
    console.log('\nDelete sample (max 100):');
    toDelete.slice(0, 100).forEach((row) => {
      const rawType = typeof row.contractNumberRaw;
      console.log(
        `- ${row.path} | owner=${row.ownerEmail} | signed=${row.signedDate} | created=${row.createdDate} | contractRawType=${rawType}`
      );
    });
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to delete these documents.');
    return;
  }

  if (toDelete.length === 0) {
    console.log('No documents to delete.');
    return;
  }

  let batch = db.batch();
  let opsInBatch = 0;
  let deleted = 0;

  for (const item of toDelete) {
    batch.delete(item.ref);
    opsInBatch += 1;

    if (opsInBatch >= 400) {
      await batch.commit();
      deleted += opsInBatch;
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
    deleted += opsInBatch;
  }

  console.log(`Deleted documents: ${deleted}`);
}

main().catch((err) => {
  console.error('Delete check failed:', err?.message ?? err);
  process.exit(1);
});
