const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const formulas = require('./backfill-build/src/app/lib/productFormulas.js');

loadEnvConfig(process.cwd());

const JAKUB_EMAIL = 'jakub.rauscher@bohemika.eu';
const TARGET_PRODUCTS = new Set(['neon', 'flexi']);
const POSITION_ORDER = [
  'poradce1','poradce2','poradce3','poradce4','poradce5','poradce6','poradce7','poradce8','poradce9','poradce10',
  'manazer4','manazer5','manazer6','manazer7','manazer8','manazer9','manazer10',
];
const POSITION_SET = new Set(POSITION_ORDER);

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
  if (v === 'accelerated' || v === 'standard') return v;
  return null;
}
function normalizePosition(v) {
  if (typeof v !== 'string') return null;
  return POSITION_SET.has(v) ? v : null;
}
function toNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n;
}
function normalizeAmount(v) {
  const n = toNumber(v);
  return Math.round(n * 1_000_000) / 1_000_000;
}
function toNonNegativeNumber(v) { return Math.max(0, toNumber(v)); }

function nameFromEmail(email) {
  if (!email) return 'Neznámý poradce';
  const local = String(email).split('@')[0] ?? '';
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((s) => (s.length ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s))
    .join(' ');
}

function normalizeTitleKey(title) {
  const t = String(title ?? '').toLowerCase();
  if (t.includes('z platby')) return `payment-${t}`;
  if (t.includes('za rok')) return `annual-${t}`;
  if (t.includes('okamžitá')) return 'immediate';
  if (t.includes('po 3')) return 'po3';
  if (t.includes('po 4')) return 'po4';
  if (t.includes('2.–5.')) return 'nasl25';
  if (t.includes('5.–10.')) return 'nasl510';
  if (t.includes('od 6.')) return 'nasl6plus';
  return t;
}

function stripTotalRows(items = []) {
  return items.filter((it) => !normalizeTitleKey(it.title ?? '').includes('celkem'));
}

function entryCalculationAmount(entry) {
  const fromCalculation = toNumber(entry.calculationInputAmount);
  if (fromCalculation > 0) return fromCalculation;
  const fromInput = toNumber(entry.inputAmount);
  if (fromInput > 0) return fromInput;
  const fromEffective = toNumber(entry.effectiveInputAmount);
  if (fromEffective > 0) return fromEffective;
  return 0;
}

function normalizedDurationYears(product, years) {
  const fallback = product === 'neon' ? 15 : product === 'flexi' ? 30 : 1;
  const max = product === 'neon' ? 99 : product === 'flexi' ? 80 : 1;
  const raw = typeof years === 'number' && Number.isFinite(years) ? years : fallback;
  const whole = Math.floor(raw);
  return Math.min(max, Math.max(1, whole));
}

function computeItemsForEntry(entry, pos, customMode, amountOverride) {
  if (!pos) return null;
  const product = entry.productKey;
  if (!TARGET_PRODUCTS.has(product)) return null;
  const mode = customMode ?? normalizeMode(entry.commissionMode) ?? 'standard';
  const val = amountOverride == null ? toNonNegativeNumber(entryCalculationAmount(entry)) : toNonNegativeNumber(amountOverride);

  if (product === 'neon') {
    const y = Math.min(15, normalizedDurationYears('neon', entry.durationYears));
    return formulas.calculateNeon(val, pos, y, mode);
  }
  if (product === 'flexi') {
    const y = normalizedDurationYears('flexi', entry.durationYears);
    return formulas.calculateFlexi(val, pos, mode, y);
  }
  return null;
}

function computeManagerDiffItems(entry, managerPos, childPos, managerMode) {
  const amount = entryCalculationAmount(entry);
  const mgrRes = computeItemsForEntry(entry, managerPos, managerMode, amount);
  const baselineRes = computeItemsForEntry(entry, childPos, managerMode, amount);
  if (!mgrRes || !baselineRes) return [];

  const mgrItems = stripTotalRows(mgrRes.items);
  const baselineItems = stripTotalRows(baselineRes.items);

  const mgrMap = new Map();
  mgrItems.forEach((it) => {
    const key = normalizeTitleKey(it.title ?? '');
    const prev = mgrMap.get(key);
    mgrMap.set(key, {
      title: it.title ?? prev?.title ?? key,
      amount: normalizeAmount((prev?.amount ?? 0) + (it.amount ?? 0)),
    });
  });

  const diffItems = [];
  baselineItems.forEach((it) => {
    const key = normalizeTitleKey(it.title ?? '');
    const mgrVal = mgrMap.get(key);
    const rem = normalizeAmount((mgrVal?.amount ?? 0) - (it.amount ?? 0));
    if (rem > 0) {
      diffItems.push({ title: mgrVal?.title ?? it.title, amount: rem });
    }
    mgrMap.delete(key);
  });

  mgrMap.forEach((val) => {
    if (val.amount > 0) diffItems.push({ title: val.title, amount: normalizeAmount(val.amount) });
  });

  return diffItems;
}

function immediateFromItems(items) {
  return normalizeAmount(
    (items ?? []).reduce((sum, it) => {
      const t = String(it.title ?? '').toLowerCase();
      if (!t.includes('okamžitá')) return sum;
      return sum + (it.amount ?? 0);
    }, 0)
  );
}

function collectSubordinates(managerEmail, childrenByManager) {
  const out = [];
  const visited = new Set();
  const queue = [...(childrenByManager.get(managerEmail) ?? [])];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || visited.has(cur)) continue;
    visited.add(cur);
    out.push(cur);
    const kids = childrenByManager.get(cur) ?? [];
    kids.forEach((k) => {
      if (!visited.has(k)) queue.push(k);
    });
  }
  return out;
}

async function main() {
  const creds = loadCredentials();
  if (!creds) throw new Error('Missing FIREBASE_ADMIN_* credentials.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const usersByEmail = new Map();

  usersSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const email = normalizeEmail(data.email ?? docSnap.id);
    if (!email) return;

    const existing = usersByEmail.get(email);
    const candidate = {
      email,
      docIds: [docSnap.id],
      managerEmail: normalizeEmail(data.managerEmail),
    };

    if (!existing) {
      usersByEmail.set(email, candidate);
      return;
    }

    if (!existing.docIds.includes(docSnap.id)) existing.docIds.push(docSnap.id);
    const canonical = docSnap.id.toLowerCase() === email;
    if (canonical || !existing.managerEmail) {
      existing.managerEmail = candidate.managerEmail;
    }
  });

  const childrenByManager = new Map();
  usersByEmail.forEach((u) => {
    if (!u.managerEmail) return;
    const arr = childrenByManager.get(u.managerEmail) ?? [];
    arr.push(u.email);
    childrenByManager.set(u.managerEmail, Array.from(new Set(arr)));
  });

  const subordinates = collectSubordinates(JAKUB_EMAIL, childrenByManager);
  const rows = [];
  const seenPaths = new Set();

  for (const ownerEmail of subordinates) {
    const ownerData = usersByEmail.get(ownerEmail);
    const ownerDocIds = ownerData?.docIds?.length ? ownerData.docIds : [ownerEmail];

    for (const ownerDocId of ownerDocIds) {
      const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();

      for (const entrySnap of entriesSnap.docs) {
        const path = `users/${ownerDocId}/entries/${entrySnap.id}`;
        if (seenPaths.has(path)) continue;
        seenPaths.add(path);

        const entry = entrySnap.data() || {};
        const entryType = typeof entry.entryType === 'string' ? entry.entryType : 'contract';
        if (entryType !== 'contract') continue;

        const product = entry.productKey;
        if (!TARGET_PRODUCTS.has(product)) continue;

        const advisorMode = normalizeMode(entry.commissionMode);
        if (advisorMode !== 'accelerated') continue;

        const chainRaw = Array.isArray(entry.managerChain) ? entry.managerChain : [];
        const chain = chainRaw
          .map((n) => ({
            email: normalizeEmail(n?.email),
            position: normalizePosition(n?.position),
          }))
          .filter((n) => !!n.email);

        const idx = chain.findIndex((n) => n.email === JAKUB_EMAIL);
        if (idx < 0) continue;

        const jakubNode = chain[idx];
        const childPos = idx > 0 ? chain[idx - 1]?.position : normalizePosition(entry.position);
        if (!jakubNode?.position || !childPos) continue;

        const stdDiffItems = computeManagerDiffItems(entry, jakubNode.position, childPos, 'standard');
        const accDiffItems = computeManagerDiffItems(entry, jakubNode.position, childPos, 'accelerated');
        const stdImmediate = immediateFromItems(stdDiffItems);
        const accImmediate = immediateFromItems(accDiffItems);
        const diff = normalizeAmount(accImmediate - stdImmediate);

        if (diff <= 0) continue;

        rows.push({
          contractNumber: String(entry.contractNumber ?? '').trim() || '—',
          clientName: String(entry.clientName ?? '').trim() || '—',
          advisorName: nameFromEmail(ownerEmail),
          advisorEmail: ownerEmail,
          product,
          stdImmediate,
          accImmediate,
          difference: diff,
          managerPosition: jakubNode.position,
          path,
        });
      }
    }
  }

  rows.sort((a, b) => {
    if (b.difference !== a.difference) return b.difference - a.difference;
    return a.contractNumber.localeCompare(b.contractNumber, 'cs');
  });

  const totalDiff = normalizeAmount(rows.reduce((sum, r) => sum + r.difference, 0));

  console.log(`manager=${JAKUB_EMAIL}`);
  console.log(`matches=${rows.length}`);
  console.log(`sum_difference_immediate=${totalDiff}`);
  console.log('---');
  rows.forEach((r) => {
    console.log([
      r.contractNumber,
      r.clientName,
      r.advisorName,
      r.product,
      r.stdImmediate,
      r.accImmediate,
      r.difference,
      r.path,
    ].join(' | '));
  });
}

main().catch((err) => {
  console.error('Report failed:', err?.message ?? err);
  process.exit(1);
});
