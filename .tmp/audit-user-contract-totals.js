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
  return title
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
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
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const ownerDocIds = usersSnap.docs
    .filter((docSnap) => normalizeEmail(docSnap.data()?.email ?? docSnap.id) === email)
    .map((docSnap) => docSnap.id);

  if (ownerDocIds.length === 0) {
    console.log(`User profile not found for ${email}`);
    return;
  }

  let scannedContracts = 0;
  const contractTotalDiffs = [];
  const overrideTotalDiffs = [];

  for (const ownerDocId of ownerDocIds) {
    const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();
    for (const entryDoc of entriesSnap.docs) {
      const d = entryDoc.data() || {};
      const entryType = typeof d.entryType === 'string' ? d.entryType.trim().toLowerCase() : 'contract';
      if (entryType !== 'contract') continue;
      scannedContracts += 1;

      const contractNumber = typeof d.contractNumber === 'string' ? d.contractNumber.trim() : '—';
      const path = entryDoc.ref.path;
      const signed = toIso(d.contractSignedDate);

      const total = toNum(d.total);
      const computed = totalWithMultipliers(d.items);
      if (total != null && computed != null) {
        const delta = total - computed;
        if (Math.abs(delta) > 0.01) {
          contractTotalDiffs.push({
            path,
            contractNumber,
            signed,
            total,
            computed,
            delta,
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
        overrideTotalDiffs.push({
          path,
          contractNumber,
          signed,
          overrideEmail: typeof ov?.email === 'string' ? ov.email : '—',
          total: ovTotal,
          computed: ovComputed,
          delta,
        });
      });
    }
  }

  console.log(`User: ${email}`);
  console.log(`Profile docs: ${ownerDocIds.join(', ')}`);
  console.log(`Scanned contract entries: ${scannedContracts}`);
  console.log(`Contract total mismatches: ${contractTotalDiffs.length}`);
  console.log(`Override total mismatches: ${overrideTotalDiffs.length}`);

  if (contractTotalDiffs.length > 0) {
    console.log('\nContract total mismatches:');
    contractTotalDiffs.forEach((r) => {
      console.log(
        `- ${r.path} | c=${r.contractNumber} | signed=${r.signed ?? 'null'} | total=${r.total} | computed=${r.computed} | delta=${r.delta}`
      );
    });
  }

  if (overrideTotalDiffs.length > 0) {
    console.log('\nOverride total mismatches:');
    overrideTotalDiffs.forEach((r) => {
      console.log(
        `- ${r.path} | c=${r.contractNumber} | signed=${r.signed ?? 'null'} | override=${r.overrideEmail} | total=${r.total} | computed=${r.computed} | delta=${r.delta}`
      );
    });
  }
}

main().catch((err) => {
  console.error('Audit failed:', err?.message ?? err);
  process.exit(1);
});
