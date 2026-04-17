const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const formulas = require('./backfill-build/src/app/lib/productFormulas.js');
const { totalWithMultipliers } = require('./backfill-build/src/app/lib/commissionTotals.js');

loadEnvConfig(process.cwd());

const PETR = 'petr.rauscher@bohemika.eu';
const LIFE_PRODUCTS = new Set(['neon', 'flexi', 'maximaMaxEfekt', 'pillowInjury']);
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
  if (v === 'standard' || v === 'accelerated') return v;
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

function toNonNegativeNumber(v) {
  return Math.max(0, toNumber(v));
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

function normalizeItems(items = []) {
  return items.map((it) => ({
    title: String(it.title ?? '').trim(),
    amount: normalizeAmount(it.amount ?? 0),
  }));
}

function immediateFromItems(items = []) {
  return normalizeAmount(
    items.reduce((sum, it) => {
      const t = String(it.title ?? '').toLowerCase();
      if (!t.includes('okamžitá')) return sum;
      return sum + (it.amount ?? 0);
    }, 0)
  );
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
  const fallback = product === 'neon' ? 15 : product === 'flexi' ? 30 : product === 'maximaMaxEfekt' ? 20 : 1;
  const max = product === 'neon' ? 99 : product === 'flexi' ? 80 : product === 'maximaMaxEfekt' ? 20 : 1;
  const raw = typeof years === 'number' && Number.isFinite(years) ? years : fallback;
  const whole = Math.floor(raw);
  return Math.min(max, Math.max(1, whole));
}

function computeItemsForEntry(entry, pos, customMode, amountOverride) {
  if (!pos) return null;
  const product = entry.productKey;
  if (!LIFE_PRODUCTS.has(product)) return null;
  const mode = customMode ?? normalizeMode(entry.commissionMode) ?? 'standard';
  const val = amountOverride == null ? toNonNegativeNumber(entryCalculationAmount(entry)) : toNonNegativeNumber(amountOverride);

  switch (product) {
    case 'neon': {
      const y = Math.min(15, normalizedDurationYears('neon', entry.durationYears));
      return formulas.calculateNeon(val, pos, y, mode);
    }
    case 'flexi': {
      const y = normalizedDurationYears('flexi', entry.durationYears);
      return formulas.calculateFlexi(val, pos, mode, y);
    }
    case 'maximaMaxEfekt': {
      const y = normalizedDurationYears('maximaMaxEfekt', entry.durationYears);
      return formulas.calculateMaxEfekt(val, y, pos, mode);
    }
    case 'pillowInjury':
      return formulas.calculatePillowInjury(val, pos, mode);
    default:
      return null;
  }
}

function computeManagerDiff(entry, managerPos, childPos, managerMode) {
  const amount = entryCalculationAmount(entry);
  const mgrRes = computeItemsForEntry(entry, managerPos, managerMode, amount);
  const baselineRes = computeItemsForEntry(entry, childPos, managerMode, amount);
  if (!mgrRes || !baselineRes) {
    return { items: [], total: 0, immediate: 0 };
  }

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

  const normalized = normalizeItems(diffItems);
  const total = normalizeAmount(totalWithMultipliers(normalized));
  const immediate = immediateFromItems(normalized);

  return { items: normalized, total, immediate };
}

function normalizeOverrideForCompare(ov) {
  const items = [...(ov.items ?? [])]
    .map((it) => ({ title: String(it.title ?? '').trim(), amount: normalizeAmount(it.amount ?? 0) }))
    .sort((a, b) => {
      const byTitle = a.title.localeCompare(b.title, 'cs');
      if (byTitle !== 0) return byTitle;
      return a.amount - b.amount;
    });

  return {
    email: normalizeEmail(ov.email),
    position: normalizePosition(ov.position),
    commissionMode: normalizeMode(ov.commissionMode),
    items,
    total: normalizeAmount(ov.total ?? 0),
  };
}

function sortOverridesForCompare(arr) {
  return arr
    .map(normalizeOverrideForCompare)
    .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''));
}

function deepEqualViaJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply');

  const creds = loadCredentials();
  if (!creds) throw new Error('Missing FIREBASE_ADMIN_* credentials.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();

  const planned = [];
  const seen = new Set();
  let scanned = 0;
  let targets = 0;

  for (const userDoc of usersSnap.docs) {
    const ownerDocId = userDoc.id;
    const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();

    for (const entrySnap of entriesSnap.docs) {
      const path = `users/${ownerDocId}/entries/${entrySnap.id}`;
      if (seen.has(path)) continue;
      seen.add(path);
      scanned += 1;

      const entry = entrySnap.data() || {};
      const entryType = typeof entry.entryType === 'string' ? entry.entryType : 'contract';
      if (entryType !== 'contract') continue;
      if (!LIFE_PRODUCTS.has(entry.productKey)) continue;

      const chainRaw = Array.isArray(entry.managerChain) ? entry.managerChain : [];
      const chain = chainRaw
        .map((n) => ({
          email: normalizeEmail(n?.email),
          position: normalizePosition(n?.position),
        }))
        .filter((n) => !!n.email);

      const idx = chain.findIndex((n) => n.email === PETR);
      if (idx < 0) continue;
      targets += 1;

      const managerPos = chain[idx]?.position;
      const childPos = idx > 0 ? chain[idx - 1]?.position : normalizePosition(entry.position);
      if (!managerPos || !childPos) continue;

      const existingRaw = Array.isArray(entry.managerOverrides) ? entry.managerOverrides : [];
      const existing = existingRaw.map(normalizeOverrideForCompare);
      const currentPetr = existing.find((ov) => normalizeEmail(ov.email) === PETR) ?? null;
      const currentPetrMode = normalizeMode(currentPetr?.commissionMode);

      // Only rewrite contracts where Petr is not already in standard mode.
      if (currentPetrMode === 'standard') continue;

      const stdResult = computeManagerDiff(entry, managerPos, childPos, 'standard');

      const rebuilt = [];
      let hadPetr = false;
      let oldPetrImmediate = 0;

      existing.forEach((ov) => {
        const email = normalizeEmail(ov.email);
        if (email !== PETR) {
          rebuilt.push(ov);
          return;
        }

        hadPetr = true;
        oldPetrImmediate = immediateFromItems(ov.items);

        if (stdResult.total > 0 && stdResult.items.length > 0) {
          rebuilt.push({
            email: PETR,
            position: managerPos,
            commissionMode: 'standard',
            items: stdResult.items,
            total: stdResult.total,
          });
        }
      });

      if (!hadPetr && stdResult.total > 0 && stdResult.items.length > 0) {
        rebuilt.push({
          email: PETR,
          position: managerPos,
          commissionMode: 'standard',
          items: stdResult.items,
          total: stdResult.total,
        });
      }

      const beforeComparable = sortOverridesForCompare(existing);
      const afterComparable = sortOverridesForCompare(rebuilt);
      if (deepEqualViaJson(beforeComparable, afterComparable)) continue;

      planned.push({
        ref: entrySnap.ref,
        path,
        contractNumber: String(entry.contractNumber ?? '').trim() || '—',
        clientName: String(entry.clientName ?? '').trim() || '—',
        signed: toDate(entry.contractSignedDate)?.toISOString().slice(0, 10) ?? '—',
        product: entry.productKey,
        oldPetrImmediate,
        newPetrImmediate: stdResult.immediate,
        managerOverrides: rebuilt,
      });
    }
  }

  planned.sort((a, b) => a.contractNumber.localeCompare(b.contractNumber, 'cs'));

  const sumOld = normalizeAmount(planned.reduce((s, r) => s + r.oldPetrImmediate, 0));
  const sumNew = normalizeAmount(planned.reduce((s, r) => s + r.newPetrImmediate, 0));
  const sumDelta = normalizeAmount(sumNew - sumOld);

  console.log(`petr=${PETR}`);
  console.log(`scanned_entries=${scanned}`);
  console.log(`target_life_contracts_with_petr_chain=${targets}`);
  console.log(`contracts_to_update=${planned.length}`);
  console.log(`sum_old_petr_immediate=${sumOld}`);
  console.log(`sum_new_petr_immediate=${sumNew}`);
  console.log(`sum_delta_petr_immediate=${sumDelta}`);
  console.log('---');

  planned.slice(0, 100).forEach((row) => {
    console.log([
      row.contractNumber,
      row.clientName,
      row.product,
      row.signed,
      row.oldPetrImmediate,
      row.newPetrImmediate,
      normalizeAmount(row.newPetrImmediate - row.oldPetrImmediate),
      row.path,
    ].join(' | '));
  });

  if (!apply) {
    console.log('DRY_RUN_ONLY');
    return;
  }

  if (planned.length === 0) {
    console.log('NO_UPDATES_TO_APPLY');
    return;
  }

  let batch = db.batch();
  let ops = 0;
  let committed = 0;

  for (const row of planned) {
    batch.set(row.ref, { managerOverrides: row.managerOverrides }, { merge: true });
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      committed += ops;
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
    committed += ops;
  }

  console.log(`APPLIED=${committed}`);
}

main().catch((err) => {
  console.error('Rewrite failed:', err?.message ?? err);
  process.exit(1);
});
