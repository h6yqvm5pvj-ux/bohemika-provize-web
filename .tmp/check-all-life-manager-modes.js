const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

loadEnvConfig(process.cwd());

const LIFE_PRODUCTS = new Set(['neon', 'flexi', 'maximaMaxEfekt', 'pillowInjury']);

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

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeMode(value) {
  if (value === 'standard' || value === 'accelerated') return value;
  return null;
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
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function main() {
  const creds = loadCredentials();
  if (!creds) throw new Error('Missing FIREBASE_ADMIN_* credentials.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const ownerDocIds = usersSnap.docs.map((docSnap) => docSnap.id);

  const seenPaths = new Set();
  const contractsNotAllStandard = [];
  let scannedContracts = 0;
  let lifeContracts = 0;
  let lifeContractsWithOverrides = 0;
  let lifeContractsWithoutOverrides = 0;
  let overrideStandard = 0;
  let overrideAccelerated = 0;
  let overrideMissing = 0;

  for (const ownerDocId of ownerDocIds) {
    const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();
    for (const entrySnap of entriesSnap.docs) {
      const path = `users/${ownerDocId}/entries/${entrySnap.id}`;
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);

      const d = entrySnap.data() || {};
      const entryType = typeof d.entryType === 'string' ? d.entryType.trim().toLowerCase() : 'contract';
      if (entryType !== 'contract') continue;
      scannedContracts += 1;

      if (!LIFE_PRODUCTS.has(d.productKey)) continue;
      lifeContracts += 1;

      const overrides = Array.isArray(d.managerOverrides) ? d.managerOverrides : [];
      if (overrides.length === 0) {
        lifeContractsWithoutOverrides += 1;
        continue;
      }
      lifeContractsWithOverrides += 1;

      const modesInContract = new Set();
      const modeByManager = [];

      overrides.forEach((ov) => {
        const managerEmail = normalizeEmail(ov?.email) ?? 'unknown';
        const mode = normalizeMode(ov?.commissionMode);
        if (mode === 'standard') {
          overrideStandard += 1;
          modesInContract.add('standard');
        } else if (mode === 'accelerated') {
          overrideAccelerated += 1;
          modesInContract.add('accelerated');
        } else {
          overrideMissing += 1;
          modesInContract.add('missing');
        }
        modeByManager.push(`${managerEmail}:${mode ?? 'null'}`);
      });

      const allStandard =
        !modesInContract.has('accelerated') &&
        !modesInContract.has('missing') &&
        modesInContract.has('standard');

      if (!allStandard) {
        contractsNotAllStandard.push({
          ownerEmail: normalizeEmail(d.userEmail) ?? normalizeEmail(ownerDocId) ?? ownerDocId,
          contractNumber: typeof d.contractNumber === 'string' && d.contractNumber.trim()
            ? d.contractNumber.trim()
            : '—',
          product: d.productKey,
          signed: toIsoDay(d.contractSignedDate),
          start: toIsoDay(d.policyStartDate),
          advisorMode: normalizeMode(d.commissionMode),
          modeByManager: modeByManager.sort((a, b) => a.localeCompare(b, 'cs')),
          path,
        });
      }
    }
  }

  contractsNotAllStandard.sort((a, b) => {
    const ad = a.signed ?? '0000-00-00';
    const bd = b.signed ?? '0000-00-00';
    if (ad !== bd) return ad.localeCompare(bd);
    return a.contractNumber.localeCompare(b.contractNumber, 'cs');
  });

  console.log(`scanned_contracts=${scannedContracts}`);
  console.log(`life_contracts=${lifeContracts}`);
  console.log(`life_contracts_with_overrides=${lifeContractsWithOverrides}`);
  console.log(`life_contracts_without_overrides=${lifeContractsWithoutOverrides}`);
  console.log(`override_mode_standard=${overrideStandard}`);
  console.log(`override_mode_accelerated=${overrideAccelerated}`);
  console.log(`override_mode_missing=${overrideMissing}`);
  console.log(`contracts_not_all_standard=${contractsNotAllStandard.length}`);

  if (contractsNotAllStandard.length > 0) {
    console.log('--- contracts_not_all_standard_list');
    contractsNotAllStandard.forEach((row) => {
      console.log(
        [
          row.contractNumber,
          row.product,
          `signed=${row.signed ?? '—'}`,
          `start=${row.start ?? '—'}`,
          `owner=${row.ownerEmail}`,
          `advisor=${row.advisorMode ?? 'null'}`,
          row.modeByManager.join(','),
          row.path,
        ].join(' | ')
      );
    });
  }
}

main().catch((err) => {
  console.error(`audit_failed=${err?.message ?? err}`);
  process.exit(1);
});

