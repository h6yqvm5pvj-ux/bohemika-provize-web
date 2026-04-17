const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const formulas = require('./backfill-build/src/app/lib/productFormulas.js');
const { totalWithMultipliers } = require('./backfill-build/src/app/lib/commissionTotals.js');

loadEnvConfig(process.cwd());

const JAKUB_EMAIL = 'jakub.rauscher@bohemika.eu';
const CUTOFF_ISO = '2026-05-01'; // od tohoto data (včetně) může zůstat accelerated
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

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return v.length > 0 ? v : null;
}

function normalizeMode(value) {
  if (value === 'accelerated' || value === 'standard') return value;
  return null;
}

function normalizePosition(value) {
  if (typeof value !== 'string') return null;
  return POSITION_SET.has(value) ? value : null;
}

function toNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function normalizeAmount(value) {
  const n = toNumber(value);
  return Math.round(n * 1_000_000) / 1_000_000;
}

function toNonNegativeNumber(value) {
  return Math.max(0, toNumber(value));
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'object' && value !== null && typeof value.toDate === 'function') {
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

function normalizedDurationYears(product, years) {
  const fallback = product === 'neon' ? 15 : product === 'flexi' ? 30 : product === 'maximaMaxEfekt' ? 20 : 1;
  const max = product === 'neon' ? 99 : product === 'flexi' ? 80 : product === 'maximaMaxEfekt' ? 20 : 1;
  const raw = typeof years === 'number' && Number.isFinite(years) ? years : fallback;
  const whole = Math.floor(raw);
  return Math.min(max, Math.max(1, whole));
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

function entryCalculationAmount(entry) {
  const fromCalculation = toNumber(entry.calculationInputAmount);
  if (fromCalculation > 0) return fromCalculation;
  const fromInput = toNumber(entry.inputAmount);
  if (fromInput > 0) return fromInput;
  const fromEffective = toNumber(entry.effectiveInputAmount);
  if (fromEffective > 0) return fromEffective;
  return 0;
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
  const immediate = normalizeAmount(
    normalized.reduce((sum, it) => {
      const t = String(it.title ?? '').toLowerCase();
      if (!t.includes('okamžitá')) return sum;
      return sum + (it.amount ?? 0);
    }, 0)
  );

  return { items: normalized, total, immediate };
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

function deepEqualViaJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');

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
      managerEmail: normalizeEmail(data.managerEmail),
      docIds: [docSnap.id],
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

  const planned = [];
  const seenPath = new Set();
  let scannedEntries = 0;
  let targetEntries = 0;

  for (const ownerEmail of subordinates) {
    const ownerData = usersByEmail.get(ownerEmail);
    const ownerDocIds = ownerData?.docIds?.length ? ownerData.docIds : [ownerEmail];

    for (const ownerDocId of ownerDocIds) {
      const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();

      for (const entrySnap of entriesSnap.docs) {
        const path = `users/${ownerDocId}/entries/${entrySnap.id}`;
        if (seenPath.has(path)) continue;
        seenPath.add(path);
        scannedEntries += 1;

        const entry = entrySnap.data() || {};
        const entryType = typeof entry.entryType === 'string' ? entry.entryType : 'contract';
        if (entryType !== 'contract') continue;

        if (!LIFE_PRODUCTS.has(entry.productKey)) continue;

        const signedIso = toIsoDay(entry.contractSignedDate);
        if (!signedIso || signedIso >= CUTOFF_ISO) continue;

        const chainRaw = Array.isArray(entry.managerChain) ? entry.managerChain : [];
        const chain = chainRaw
          .map((n) => ({
            email: normalizeEmail(n?.email),
            position: normalizePosition(n?.position),
            commissionMode: normalizeMode(n?.commissionMode),
          }))
          .filter((n) => !!n.email);

        const idx = chain.findIndex((n) => n.email === JAKUB_EMAIL);
        if (idx < 0) continue;

        const jakubNode = chain[idx];
        const childPos = idx > 0 ? chain[idx - 1]?.position : normalizePosition(entry.position);
        if (!jakubNode?.position || !childPos) continue;

        targetEntries += 1;

        const stdResult = computeManagerDiff(entry, jakubNode.position, childPos, 'standard');
        const existingOverrides = Array.isArray(entry.managerOverrides) ? entry.managerOverrides : [];

        const normalizedExisting = existingOverrides.map((ov) => ({
          email: normalizeEmail(ov?.email),
          position: normalizePosition(ov?.position),
          commissionMode: normalizeMode(ov?.commissionMode),
          items: normalizeItems(Array.isArray(ov?.items) ? ov.items : []),
          total: normalizeAmount(ov?.total ?? 0),
        }));

        const rebuilt = [];
        let replaced = false;
        let oldJakubImmediate = 0;
        let newJakubImmediate = stdResult.immediate;

        const immediateFromItems = (items = []) => normalizeAmount(
          items.reduce((sum, it) => {
            const t = String(it.title ?? '').toLowerCase();
            if (!t.includes('okamžitá')) return sum;
            return sum + (it.amount ?? 0);
          }, 0)
        );

        normalizedExisting.forEach((ov) => {
          if (ov.email !== JAKUB_EMAIL) {
            rebuilt.push(ov);
            return;
          }

          replaced = true;
          oldJakubImmediate = immediateFromItems(ov.items);

          if (stdResult.total > 0 && stdResult.items.length > 0) {
            rebuilt.push({
              email: JAKUB_EMAIL,
              position: jakubNode.position,
              commissionMode: 'standard',
              items: stdResult.items,
              total: stdResult.total,
            });
          }
        });

        if (!replaced && stdResult.total > 0 && stdResult.items.length > 0) {
          rebuilt.push({
            email: JAKUB_EMAIL,
            position: jakubNode.position,
            commissionMode: 'standard',
            items: stdResult.items,
            total: stdResult.total,
          });
        }

        const sortByEmail = (arr) => [...arr].sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''));
        const beforeComparable = sortByEmail(normalizedExisting);
        const afterComparable = sortByEmail(rebuilt);

        if (deepEqualViaJson(beforeComparable, afterComparable)) continue;

        planned.push({
          ref: entrySnap.ref,
          path,
          contractNumber: String(entry.contractNumber ?? '').trim() || '—',
          clientName: String(entry.clientName ?? '').trim() || '—',
          advisorEmail: normalizeEmail(entry.userEmail) ?? ownerEmail,
          signedIso,
          product: entry.productKey,
          oldJakubImmediate,
          newJakubImmediate,
          deltaImmediate: normalizeAmount(newJakubImmediate - oldJakubImmediate),
          managerOverrides: rebuilt,
        });
      }
    }
  }

  planned.sort((a, b) => a.contractNumber.localeCompare(b.contractNumber, 'cs'));

  const sumOldImmediate = normalizeAmount(planned.reduce((s, r) => s + r.oldJakubImmediate, 0));
  const sumNewImmediate = normalizeAmount(planned.reduce((s, r) => s + r.newJakubImmediate, 0));
  const sumDeltaImmediate = normalizeAmount(sumNewImmediate - sumOldImmediate);

  console.log(`manager=${JAKUB_EMAIL}`);
  console.log(`cutoff=${CUTOFF_ISO}`);
  console.log(`subordinates=${subordinates.length}`);
  console.log(`scanned_entries=${scannedEntries}`);
  console.log(`target_life_contracts_before_cutoff=${targetEntries}`);
  console.log(`contracts_to_update=${planned.length}`);
  console.log(`sum_old_immediate=${sumOldImmediate}`);
  console.log(`sum_new_immediate=${sumNewImmediate}`);
  console.log(`sum_delta_immediate=${sumDeltaImmediate}`);
  console.log('---');
  planned.slice(0, 50).forEach((row) => {
    console.log([
      row.contractNumber,
      row.clientName,
      row.advisorEmail,
      row.product,
      row.signedIso,
      row.oldJakubImmediate,
      row.newJakubImmediate,
      row.deltaImmediate,
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
    batch.set(
      row.ref,
      {
        managerOverrides: row.managerOverrides,
      },
      { merge: true }
    );

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
