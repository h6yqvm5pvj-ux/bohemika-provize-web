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

function toIsoDay(v) {
  const d = toDate(v);
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseArgValue(args, key, defaultValue = null) {
  const pref = `${key}=`;
  const inline = args.find((a) => a.startsWith(pref));
  if (inline) return inline.slice(pref.length);
  const idx = args.indexOf(key);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return defaultValue;
}

async function main() {
  const args = process.argv.slice(2);
  const email = normalizeEmail(parseArgValue(args, '--email', null));
  if (!email) throw new Error('Missing --email');

  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const ownerDocIds = usersSnap.docs
    .filter((docSnap) => normalizeEmail(docSnap.data()?.email ?? docSnap.id) === email)
    .map((docSnap) => docSnap.id);

  if (ownerDocIds.length === 0) {
    console.log(`user_not_found=${email}`);
    return;
  }

  const seenPaths = new Set();
  const contracts = [];

  for (const ownerDocId of ownerDocIds) {
    const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();
    for (const entrySnap of entriesSnap.docs) {
      const path = `users/${ownerDocId}/entries/${entrySnap.id}`;
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);

      const d = entrySnap.data() || {};
      const entryType = typeof d.entryType === 'string' ? d.entryType.trim().toLowerCase() : 'contract';
      if (entryType !== 'contract') continue;
      if (!LIFE_PRODUCTS.has(d.productKey)) continue;

      const overridesRaw = Array.isArray(d.managerOverrides) ? d.managerOverrides : [];
      const overrides = overridesRaw.map((ov) => ({
        email: normalizeEmail(ov?.email),
        mode: normalizeMode(ov?.commissionMode),
      }));

      contracts.push({
        path,
        contractNumber: typeof d.contractNumber === 'string' && d.contractNumber.trim() ? d.contractNumber.trim() : '—',
        product: d.productKey,
        signed: toIsoDay(d.contractSignedDate),
        policyStart: toIsoDay(d.policyStartDate),
        advisorMode: normalizeMode(d.commissionMode),
        overrides,
      });
    }
  }

  contracts.sort((a, b) => {
    const ad = a.signed ?? '0000-00-00';
    const bd = b.signed ?? '0000-00-00';
    if (ad !== bd) return ad.localeCompare(bd);
    return a.contractNumber.localeCompare(b.contractNumber, 'cs');
  });

  const modeCounts = { standard: 0, accelerated: 0, missing: 0 };
  const managerModeCounts = new Map();
  let contractsWithAnyOverride = 0;
  let contractsWithStandard = 0;
  let contractsWithAccelerated = 0;
  let contractsWithMixedModes = 0;

  for (const c of contracts) {
    const modesInContract = new Set();
    if (c.overrides.length > 0) contractsWithAnyOverride += 1;

    c.overrides.forEach((ov) => {
      const key = ov.email ?? 'unknown';
      if (!managerModeCounts.has(key)) {
        managerModeCounts.set(key, { standard: 0, accelerated: 0, missing: 0 });
      }
      const counts = managerModeCounts.get(key);
      if (ov.mode === 'standard') {
        modeCounts.standard += 1;
        counts.standard += 1;
        modesInContract.add('standard');
      } else if (ov.mode === 'accelerated') {
        modeCounts.accelerated += 1;
        counts.accelerated += 1;
        modesInContract.add('accelerated');
      } else {
        modeCounts.missing += 1;
        counts.missing += 1;
      }
    });

    if (modesInContract.has('standard')) contractsWithStandard += 1;
    if (modesInContract.has('accelerated')) contractsWithAccelerated += 1;
    if (modesInContract.has('standard') && modesInContract.has('accelerated')) {
      contractsWithMixedModes += 1;
    }
  }

  console.log(`user=${email}`);
  console.log(`profile_docs=${ownerDocIds.join(',')}`);
  console.log(`life_contracts=${contracts.length}`);
  console.log(`contracts_with_overrides=${contractsWithAnyOverride}`);
  console.log(`override_mode_standard=${modeCounts.standard}`);
  console.log(`override_mode_accelerated=${modeCounts.accelerated}`);
  console.log(`override_mode_missing=${modeCounts.missing}`);
  console.log(`contracts_with_standard=${contractsWithStandard}`);
  console.log(`contracts_with_accelerated=${contractsWithAccelerated}`);
  console.log(`contracts_with_mixed_modes=${contractsWithMixedModes}`);

  const nonStandardContracts = contracts.filter((c) =>
    c.overrides.some((ov) => ov.mode !== 'standard')
  );
  console.log(`contracts_not_all_standard=${nonStandardContracts.length}`);

  if (nonStandardContracts.length > 0) {
    console.log('--- non_standard_contracts');
    nonStandardContracts.forEach((c) => {
      const modeList = c.overrides
        .map((ov) => `${ov.email ?? 'unknown'}:${ov.mode ?? 'null'}`)
        .join(',');
      console.log(
        `${c.contractNumber} | ${c.product} | signed=${c.signed ?? '—'} | start=${c.policyStart ?? '—'} | advisor=${c.advisorMode ?? 'null'} | ${modeList} | ${c.path}`
      );
    });
  }

  const managerRows = Array.from(managerModeCounts.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], 'cs')
  );
  if (managerRows.length > 0) {
    console.log('--- manager_mode_counts');
    managerRows.forEach(([managerEmail, counts]) => {
      console.log(
        `${managerEmail} | standard=${counts.standard} | accelerated=${counts.accelerated} | missing=${counts.missing}`
      );
    });
  }
}

main().catch((err) => {
  console.error(`audit_failed=${err?.message ?? err}`);
  process.exit(1);
});
