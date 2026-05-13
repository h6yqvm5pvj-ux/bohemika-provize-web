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
    const amount = Number(it?.amount);
    sum += (Number.isFinite(amount) ? amount : 0) * itemMultiplier(it?.title);
  });
  return sum;
}

function normalizeAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e10) / 1e10;
}

const parseArgValue = (args, key, defaultValue = null) => {
  const pref = `${key}=`;
  const inline = args.find((a) => a.startsWith(pref));
  if (inline) return inline.slice(pref.length);
  const idx = args.indexOf(key);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return defaultValue;
};

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const targetEmail = normalizeEmail(parseArgValue(args, '--email', 'jindra.hajek@bohemika.eu'));
  const overrideEmail = normalizeEmail(parseArgValue(args, '--override-email', 'petr.rauscher@bohemika.eu'));
  const targetContractsArg = parseArgValue(args, '--contracts', '7503097744,3273668628,3273668113');
  const targetContracts = new Set(
    String(targetContractsArg)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  );

  if (!targetEmail) throw new Error('Missing --email');
  if (!overrideEmail) throw new Error('Missing --override-email');
  if (targetContracts.size === 0) throw new Error('Missing --contracts');

  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const ownerDocIds = usersSnap.docs
    .filter((docSnap) => normalizeEmail(docSnap.data()?.email ?? docSnap.id) === targetEmail)
    .map((docSnap) => docSnap.id);

  if (ownerDocIds.length === 0) {
    throw new Error(`User profile not found for ${targetEmail}`);
  }

  const planned = [];

  for (const ownerDocId of ownerDocIds) {
    const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();
    for (const entryDoc of entriesSnap.docs) {
      const data = entryDoc.data() || {};
      const entryType = typeof data.entryType === 'string' ? data.entryType.trim().toLowerCase() : 'contract';
      if (entryType !== 'contract') continue;

      const contractNumber = typeof data.contractNumber === 'string' ? data.contractNumber.trim() : '';
      if (!targetContracts.has(contractNumber)) continue;

      const rawOverrides = Array.isArray(data.managerOverrides) ? data.managerOverrides : [];
      let changed = false;
      const nextOverrides = rawOverrides.map((ov) => {
        const ovEmail = normalizeEmail(ov?.email);
        if (ovEmail !== overrideEmail) return ov;

        const computed = totalWithMultipliers(ov?.items);
        if (computed == null) return ov;

        const oldTotal = Number(ov?.total);
        const nextTotal = normalizeAmount(computed);
        if (Number.isFinite(oldTotal) && Math.abs(oldTotal - nextTotal) <= 0.01) return ov;

        changed = true;
        planned.push({
          path: entryDoc.ref.path,
          contractNumber,
          oldTotal: Number.isFinite(oldTotal) ? oldTotal : null,
          newTotal: nextTotal,
        });

        return {
          ...ov,
          total: nextTotal,
        };
      });

      if (changed && apply) {
        await entryDoc.ref.set({ managerOverrides: nextOverrides }, { merge: true });
      }
    }
  }

  console.log(`target_email=${targetEmail}`);
  console.log(`override_email=${overrideEmail}`);
  console.log(`target_contracts=${Array.from(targetContracts).join(',')}`);
  console.log(`owner_docs=${ownerDocIds.join(',')}`);
  console.log(`planned_changes=${planned.length}`);
  planned.forEach((row) => {
    console.log(`- ${row.path} | c=${row.contractNumber} | old=${row.oldTotal} | new=${row.newTotal}`);
  });

  if (!apply) {
    console.log('dry_run=true');
    return;
  }

  console.log('applied=true');
}

main().catch((err) => {
  console.error('Fix failed:', err?.message ?? err);
  process.exit(1);
});
