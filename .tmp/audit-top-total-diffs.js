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

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value && typeof value.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(value) {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeTitle(title) {
  if (typeof title !== 'string') return '';
  return title.toLowerCase().replace(/\s+/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

function isTotalRow(title) {
  return normalizeTitle(title).includes('celkem');
}

function itemMultiplier(title) {
  const norm = normalizeTitle(title);
  if (norm.includes('2.–5.')) return 4;
  if (norm.includes('5.–10.')) return 6;
  return 1;
}

function totalWithMultipliers(items) {
  if (!Array.isArray(items)) return null;
  const cleaned = items.filter((it) => !isTotalRow(it?.title));
  const hasYearly = cleaned.some((it) => normalizeTitle(it?.title).includes('provize za rok'));
  const source = hasYearly
    ? cleaned.filter((it) => normalizeTitle(it?.title).includes('provize za rok'))
    : cleaned;
  let sum = 0;
  source.forEach((it) => {
    const amount = toNum(it?.amount) ?? 0;
    sum += amount * itemMultiplier(it?.title);
  });
  return sum;
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const entriesSnap = await db.collectionGroup('entries').get();
  const contractDiffs = [];
  const overrideDiffs = [];

  entriesSnap.docs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const entryType = typeof d.entryType === 'string' ? d.entryType.trim().toLowerCase() : 'contract';
    if (entryType !== 'contract') return;

    const contractNumber = typeof d.contractNumber === 'string' ? d.contractNumber.trim() : '—';
    const total = toNum(d.total);
    const computed = totalWithMultipliers(d.items);
    if (total != null && computed != null) {
      const delta = total - computed;
      if (Math.abs(delta) > 0.01) {
        contractDiffs.push({
          path: docSnap.ref.path,
          contractNumber,
          signed: toIso(d.contractSignedDate),
          total,
          computed,
          delta,
          absDelta: Math.abs(delta),
        });
      }
    }

    const overrides = Array.isArray(d.managerOverrides) ? d.managerOverrides : [];
    overrides.forEach((ov) => {
      const ovTotal = toNum(ov?.total);
      const ovComputed = totalWithMultipliers(ov?.items);
      if (ovTotal == null || ovComputed == null) return;
      const delta = ovTotal - ovComputed;
      if (Math.abs(delta) <= 0.01) return;
      overrideDiffs.push({
        path: docSnap.ref.path,
        contractNumber,
        signed: toIso(d.contractSignedDate),
        overrideEmail: typeof ov?.email === 'string' ? ov.email : '—',
        total: ovTotal,
        computed: ovComputed,
        delta,
        absDelta: Math.abs(delta),
      });
    });
  });

  contractDiffs.sort((a, b) => b.absDelta - a.absDelta);
  overrideDiffs.sort((a, b) => b.absDelta - a.absDelta);

  console.log(`contract_total_mismatch_count=${contractDiffs.length}`);
  console.log(`override_total_mismatch_count=${overrideDiffs.length}`);

  console.log('\nTop contract total mismatches (max 20):');
  contractDiffs.slice(0, 20).forEach((r) => {
    console.log(`- ${r.path} | contract=${r.contractNumber} | signed=${r.signed ?? 'null'} | total=${r.total} | computed=${r.computed} | delta=${r.delta}`);
  });

  console.log('\nTop override total mismatches (max 20):');
  overrideDiffs.slice(0, 20).forEach((r) => {
    console.log(`- ${r.path} | contract=${r.contractNumber} | signed=${r.signed ?? 'null'} | override=${r.overrideEmail} | total=${r.total} | computed=${r.computed} | delta=${r.delta}`);
  });
}

main().catch((err) => {
  console.error('Top diff audit failed:', err?.message ?? err);
  process.exit(1);
});
