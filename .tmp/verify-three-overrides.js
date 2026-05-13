const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

loadEnvConfig(process.cwd());

function loadCredentials() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (projectId && clientEmail && privateKeyRaw) {
    return { projectId, clientEmail, privateKey: privateKeyRaw.replace(/\\n/g, '\n') };
  }
  return null;
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
  return source.reduce((sum, it) => sum + (Number(it?.amount) || 0) * itemMultiplier(it?.title), 0);
}

function plainSum(items) {
  if (!Array.isArray(items)) return null;
  return items.reduce((sum, it) => sum + (Number(it?.amount) || 0), 0);
}

async function main() {
  const creds = loadCredentials();
  if (!creds) throw new Error('missing creds');
  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);

  const paths = [
    'users/jindra.hajek@bohemika.eu/entries/1DmTDjlWmSw8aS2dguiC',
    'users/jindra.hajek@bohemika.eu/entries/2DLxvEcdHHfP0koEySgJ',
    'users/jindra.hajek@bohemika.eu/entries/4uQcTafs2YOFyzpVPLkJ',
  ];

  for (const path of paths) {
    const snap = await db.doc(path).get();
    if (!snap.exists) {
      console.log(`NOT_FOUND ${path}`);
      continue;
    }
    const d = snap.data() || {};
    const contractNumber = typeof d.contractNumber === 'string' ? d.contractNumber.trim() : '—';
    const ov = Array.isArray(d.managerOverrides) ? d.managerOverrides.find((x) => x?.email === 'petr.rauscher@bohemika.eu') : null;
    if (!ov) {
      console.log(`${contractNumber} ${path} => override missing`);
      continue;
    }
    const items = Array.isArray(ov.items) ? ov.items : [];
    const stored = Number(ov.total);
    const sum = plainSum(items);
    const computed = totalWithMultipliers(items);

    console.log(`\n${contractNumber} | ${path}`);
    console.log(`stored_total=${stored}`);
    console.log(`plain_sum_items=${sum}`);
    console.log(`computed_totalWithMultipliers=${computed}`);
    console.log(`delta(stored-computed)=${stored - computed}`);
    console.log('items:');
    items.forEach((it) => {
      console.log(`- ${it.title}: ${it.amount} (mult=${itemMultiplier(it.title)})`);
    });
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
