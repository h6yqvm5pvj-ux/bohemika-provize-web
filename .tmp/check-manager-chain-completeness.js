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
      // fallback to split vars
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

function getDocOwnerEmail(docSnap, data) {
  const fromField = normalizeEmail(data?.userEmail);
  if (fromField) return fromField;
  return normalizeEmail(docSnap.ref.parent?.parent?.id ?? null);
}

function normalizeChain(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((node) => node && typeof node === 'object')
    .map((node) => ({
      email: normalizeEmail(node.email),
    }))
    .filter((node) => !!node.email);
}

function normalizeMode(value) {
  if (value === 'standard' || value === 'accelerated') return value;
  return null;
}

function normalizePosition(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length ? v : null;
}

function normalizeOverrides(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({ email: normalizeEmail(row.email) }))
    .filter((row) => !!row.email);
}

function normalizeAllowedEmails(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => normalizeEmail(value))
    .filter((value) => !!value);
}

function toContractNumber(value) {
  if (typeof value !== 'string') return '—';
  const t = value.trim();
  return t.length ? t : '—';
}

function toSignedDate(value) {
  if (!value) return '—';
  if (typeof value === 'string') {
    const t = value.trim();
    if (t) return t;
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

function chooseCandidate(existing, candidate) {
  if (!existing) {
    return {
      email: candidate.email,
      docIds: [candidate.docId],
      managerEmail: candidate.managerEmail,
    };
  }

  if (!existing.docIds.includes(candidate.docId)) {
    existing.docIds.push(candidate.docId);
  }

  const isCanonical = candidate.docId.toLowerCase() === candidate.email;
  if (isCanonical || !existing.managerEmail) {
    existing.managerEmail = candidate.managerEmail;
  }

  return existing;
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');
  }

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const usersByEmail = new Map();

  usersSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const email = normalizeEmail(data.email ?? docSnap.id);
    if (!email) return;

    const candidate = {
      email,
      docId: docSnap.id,
      managerEmail: normalizeEmail(data.managerEmail),
    };

    const existing = usersByEmail.get(email);
    usersByEmail.set(email, chooseCandidate(existing, candidate));
  });

  const entriesSnap = await db.collectionGroup('entries').get();

  let scannedAll = 0;
  let scannedContracts = 0;
  let expectedManager = 0;
  let expectedByOwner = 0;
  let expectedBySnapshot = 0;
  let missingManagerChain = 0;

  const missing = [];

  entriesSnap.docs.forEach((docSnap) => {
    scannedAll += 1;

    const data = docSnap.data() || {};
    const entryType = typeof data.entryType === 'string' ? data.entryType : 'contract';
    if (entryType !== 'contract') return;

    scannedContracts += 1;

    const ownerEmail = getDocOwnerEmail(docSnap, data);
    if (!ownerEmail) return;

    const owner = usersByEmail.get(ownerEmail) ?? null;
    const ownerManager = owner?.managerEmail ?? null;
    const snapshotManager = normalizeEmail(data.managerEmailSnapshot);

    const hasManagerByOwner = !!ownerManager;
    const hasManagerBySnapshot = !!snapshotManager;

    if (!hasManagerByOwner && !hasManagerBySnapshot) return;

    expectedManager += 1;
    if (hasManagerByOwner) expectedByOwner += 1;
    if (hasManagerBySnapshot) expectedBySnapshot += 1;

    const chain = normalizeChain(data.managerChain);
    if (chain.length > 0) return;

    missingManagerChain += 1;
    const overrides = normalizeOverrides(data.managerOverrides);
    const allowedEmails = normalizeAllowedEmails(data.allowedEmails);

    const ownerDocId = docSnap.ref.parent?.parent?.id ?? '—';
    missing.push({
      path: `users/${ownerDocId}/entries/${docSnap.id}`,
      ownerEmail,
      ownerManager: ownerManager ?? 'null',
      snapshotManager: snapshotManager ?? 'null',
      managerPositionSnapshot: normalizePosition(data.managerPositionSnapshot) ?? 'null',
      managerModeSnapshot: normalizeMode(data.managerModeSnapshot) ?? 'null',
      overridesCount: overrides.length,
      hasOverrideForSnapshotManager:
        snapshotManager != null &&
        overrides.some((item) => item.email === snapshotManager),
      allowedEmailsCount: allowedEmails.length,
      allowedContainsSnapshotManager:
        snapshotManager != null && allowedEmails.includes(snapshotManager),
      contract: toContractNumber(data.contractNumber),
      signed: toSignedDate(data.contractSignedDate),
    });
  });

  console.log(`Users scanned: ${usersSnap.size}`);
  console.log(`Entries scanned (all): ${scannedAll}`);
  console.log(`Contract entries scanned: ${scannedContracts}`);
  console.log(`Contracts where manager is expected: ${expectedManager}`);
  console.log(`  - by current owner manager: ${expectedByOwner}`);
  console.log(`  - by managerEmailSnapshot: ${expectedBySnapshot}`);
  console.log(`Contracts missing managerChain despite expected manager: ${missingManagerChain}`);

  if (missing.length > 0) {
    console.log('\nMissing managerChain sample (max 100):');
    missing.slice(0, 100).forEach((row) => {
      console.log(
        `- ${row.path} | owner=${row.ownerEmail} | ownerMgr=${row.ownerManager} | snapMgr=${row.snapshotManager} | snapPos=${row.managerPositionSnapshot} | snapMode=${row.managerModeSnapshot} | overrides=${row.overridesCount} | ovHasSnapMgr=${row.hasOverrideForSnapshotManager} | allowed=${row.allowedEmailsCount} | allowedHasSnapMgr=${row.allowedContainsSnapshotManager} | contract=${row.contract} | signed=${row.signed}`
      );
    });
  }
}

main().catch((err) => {
  console.error('Check failed:', err?.message ?? err);
  process.exit(1);
});
