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

function normalize(value) {
  if (Array.isArray(value)) return value.map((x) => normalize(x));
  if (value && typeof value === 'object') {
    const d = toDate(value);
    if (d) return d.toISOString();
    const out = {};
    Object.keys(value)
      .sort()
      .forEach((k) => {
        out[k] = normalize(value[k]);
      });
    return out;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(normalize(value));
}

function collectDiffs(a, b, basePath = '') {
  if (stableStringify(a) === stableStringify(b)) return [];

  const aIsObj = a && typeof a === 'object' && !Array.isArray(a);
  const bIsObj = b && typeof b === 'object' && !Array.isArray(b);

  if (aIsObj && bIsObj) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const diffs = [];
    Array.from(keys)
      .sort()
      .forEach((key) => {
        const nextPath = basePath ? `${basePath}.${key}` : key;
        diffs.push(...collectDiffs(a[key], b[key], nextPath));
      });
    return diffs;
  }

  return [{
    path: basePath || '(root)',
    a,
    b,
  }];
}

function summarizeMaterialDiffs(diffs) {
  const ignoredPrefixes = ['createdAt', 'updatedAt'];
  return diffs.filter((d) => !ignoredPrefixes.some((p) => d.path === p || d.path.startsWith(`${p}.`)));
}

async function main() {
  const numbers = process.argv.slice(2).map((x) => String(x).trim()).filter(Boolean);
  if (numbers.length === 0) throw new Error('Pass at least one contract number.');

  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const snap = await db.collectionGroup('entries').get();
  const byNumber = new Map();

  snap.docs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const entryType = typeof d.entryType === 'string' ? d.entryType.trim().toLowerCase() : 'contract';
    if (entryType !== 'contract') return;

    const num = typeof d.contractNumber === 'string' ? d.contractNumber.trim() : '';
    if (!numbers.includes(num)) return;

    const list = byNumber.get(num) || [];
    list.push({
      path: docSnap.ref.path,
      data: normalize(d),
    });
    byNumber.set(num, list);
  });

  numbers.forEach((num) => {
    const rows = byNumber.get(num) || [];
    console.log(`\n=== contract ${num} ===`);
    console.log(`variants=${rows.length}`);

    rows.forEach((row, idx) => {
      const d = row.data;
      console.log(`- #${idx + 1} ${row.path}`);
      console.log(`  productKey=${d.productKey ?? 'null'} userEmail=${d.userEmail ?? 'null'}`);
      console.log(`  signed=${d.contractSignedDate ?? 'null'} policyStart=${d.policyStartDate ?? 'null'} createdAt=${d.createdAt ?? 'null'}`);
      console.log(`  total=${d.total ?? 'null'} items=${Array.isArray(d.items) ? d.items.length : 'null'} overrides=${Array.isArray(d.managerOverrides) ? d.managerOverrides.length : 'null'}`);
    });

    if (rows.length < 2) return;

    const a = rows[0];
    const b = rows[1];
    const diffs = collectDiffs(a.data, b.data);
    const material = summarizeMaterialDiffs(diffs);

    console.log(`all_field_differences=${diffs.length}`);
    console.log(`material_differences_excluding_created_updated=${material.length}`);

    const top = material.slice(0, 120);
    if (top.length > 0) {
      console.log('material_diff_sample:');
      top.forEach((d) => {
        console.log(`- ${d.path} | A=${JSON.stringify(d.a)} | B=${JSON.stringify(d.b)}`);
      });
    }
  });
}

main().catch((err) => {
  console.error('Compare failed:', err?.message ?? err);
  process.exit(1);
});
