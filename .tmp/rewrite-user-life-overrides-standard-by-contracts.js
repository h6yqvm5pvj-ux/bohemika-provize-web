const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const formulas = require('./backfill-build/src/app/lib/productFormulas.js');
const { totalWithMultipliers } = require('./backfill-build/src/app/lib/commissionTotals.js');

loadEnvConfig(process.cwd());

const DEFAULT_OWNER_EMAIL = 'jakub.pokorny@bohemika.eu';
const DEFAULT_CONTRACT_NUMBERS = [
  '7503217987',
  '7503218444',
  '7503226099',
  '7503229268',
  '7503255404',
  '7503264276',
];
const LIFE_PRODUCTS = new Set(['neon', 'flexi', 'maximaMaxEfekt', 'pillowInjury']);
const POSITION_ORDER = [
  'poradce1',
  'poradce2',
  'poradce3',
  'poradce4',
  'poradce5',
  'poradce6',
  'poradce7',
  'poradce8',
  'poradce9',
  'poradce10',
  'manazer4',
  'manazer5',
  'manazer6',
  'manazer7',
  'manazer8',
  'manazer9',
  'manazer10',
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
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
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
  return Number.isFinite(n) ? n : 0;
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

function normalizedDurationYears(product, years) {
  const fallback =
    product === 'neon' ? 15 : product === 'flexi' ? 30 : product === 'maximaMaxEfekt' ? 20 : 1;
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

function computeManagerDiff(entry, managerPos, childPos) {
  const amount = entryCalculationAmount(entry);
  const mgrRes = computeItemsForEntry(entry, managerPos, 'standard', amount);
  const baselineRes = computeItemsForEntry(entry, childPos, 'standard', amount);
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
    if (rem > 0) diffItems.push({ title: mgrVal?.title ?? it.title, amount: rem });
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
  const sortedItems = [...(ov.items ?? [])]
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
    items: sortedItems,
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

function parseArgValue(args, key, defaultValue = null) {
  const pref = `${key}=`;
  const inline = args.find((a) => a.startsWith(pref));
  if (inline) return inline.slice(pref.length);
  const idx = args.indexOf(key);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return defaultValue;
}

function parseContractNumbers(raw) {
  if (typeof raw !== 'string') return null;
  const numbers = raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  if (numbers.length === 0) return null;
  return new Set(numbers);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const ownerEmail = normalizeEmail(
    parseArgValue(args, '--email', DEFAULT_OWNER_EMAIL)
  );
  if (!ownerEmail) throw new Error('Missing --email.');
  const contractNumbers =
    parseContractNumbers(parseArgValue(args, '--contracts', null)) ??
    new Set(DEFAULT_CONTRACT_NUMBERS);
  if (contractNumbers.size === 0) {
    throw new Error('No contract numbers provided.');
  }

  const creds = loadCredentials();
  if (!creds) throw new Error('Missing FIREBASE_ADMIN_* credentials.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const ownerDocIds = usersSnap.docs
    .filter((docSnap) => normalizeEmail(docSnap.data()?.email ?? docSnap.id) === ownerEmail)
    .map((docSnap) => docSnap.id);

  if (ownerDocIds.length === 0) {
    console.log(`owner_not_found=${ownerEmail}`);
    return;
  }

  const planned = [];
  const seenPaths = new Set();
  let scannedContracts = 0;
  let matchedByNumber = 0;

  for (const ownerDocId of ownerDocIds) {
    const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();
    for (const entrySnap of entriesSnap.docs) {
      const path = `users/${ownerDocId}/entries/${entrySnap.id}`;
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);

      const entry = entrySnap.data() || {};
      const entryType = typeof entry.entryType === 'string' ? entry.entryType.trim().toLowerCase() : 'contract';
      if (entryType !== 'contract') continue;
      scannedContracts += 1;

      const product = entry.productKey;
      if (!LIFE_PRODUCTS.has(product)) continue;

      const contractNumber =
        typeof entry.contractNumber === 'string' && entry.contractNumber.trim().length > 0
          ? entry.contractNumber.trim()
          : '';
      if (!contractNumbers.has(contractNumber)) continue;
      matchedByNumber += 1;

      const chainRaw = Array.isArray(entry.managerChain) ? entry.managerChain : [];
      const chain = chainRaw
        .map((n, idx) => ({
          index: idx,
          email: normalizeEmail(n?.email),
          position: normalizePosition(n?.position),
        }))
        .filter((n) => !!n.email);

      if (chain.length === 0) continue;

      const ownerPosition = normalizePosition(entry.position);
      const standardByManager = new Map();

      for (let i = 0; i < chain.length; i += 1) {
        const mgr = chain[i];
        const managerPos = mgr.position;
        const childPos = i > 0 ? chain[i - 1]?.position : ownerPosition;
        if (!managerPos || !childPos) continue;

        const stdResult = computeManagerDiff(entry, managerPos, childPos);
        if (stdResult.items.length === 0 || stdResult.total <= 0) continue;
        standardByManager.set(mgr.email, {
          position: managerPos,
          result: stdResult,
        });
      }

      const existingOverridesRaw = Array.isArray(entry.managerOverrides) ? entry.managerOverrides : [];
      const existingOverrides = existingOverridesRaw.map(normalizeOverrideForCompare);
      const existingByEmail = new Map(existingOverrides.map((ov) => [normalizeEmail(ov.email), ov]));

      const rebuilt = [];
      existingOverrides.forEach((ov) => {
        const email = normalizeEmail(ov.email);
        if (!email || standardByManager.has(email)) return;
        rebuilt.push(ov);
      });

      const managerSummaries = [];
      standardByManager.forEach((payload, email) => {
        const prev = existingByEmail.get(email) ?? null;
        const prevMode = prev?.commissionMode ?? null;
        const prevImmediate = immediateFromItems(prev?.items ?? []);
        const nextImmediate = payload.result.immediate;
        rebuilt.push({
          email,
          position: payload.position,
          commissionMode: 'standard',
          items: payload.result.items,
          total: payload.result.total,
        });
        managerSummaries.push({
          email,
          prevMode,
          nextMode: 'standard',
          prevImmediate,
          nextImmediate,
          deltaImmediate: normalizeAmount(nextImmediate - prevImmediate),
        });
      });

      const patchedManagerChain = chainRaw.map((node) => {
        const email = normalizeEmail(node?.email);
        if (!email || !standardByManager.has(email)) return node;
        return {
          ...node,
          commissionMode: 'standard',
        };
      });

      const beforeComparable = sortOverridesForCompare(existingOverrides);
      const afterComparable = sortOverridesForCompare(rebuilt);
      const chainBefore = JSON.stringify(chainRaw);
      const chainAfter = JSON.stringify(patchedManagerChain);
      const topManagerEmail = normalizeEmail(patchedManagerChain[0]?.email);
      const managerModeSnapshotNext =
        topManagerEmail && standardByManager.has(topManagerEmail)
          ? 'standard'
          : entry.managerModeSnapshot;

      const overridesChanged = !deepEqualViaJson(beforeComparable, afterComparable);
      const chainChanged = chainBefore !== chainAfter;
      const snapshotChanged = managerModeSnapshotNext !== entry.managerModeSnapshot;

      if (!overridesChanged && !chainChanged && !snapshotChanged) continue;

      planned.push({
        ref: entrySnap.ref,
        path,
        contractNumber,
        signedIso: toIsoDay(entry.contractSignedDate),
        policyStartIso: toIsoDay(entry.policyStartDate),
        product,
        managerSummaries: managerSummaries.sort((a, b) => a.email.localeCompare(b.email, 'cs')),
        managerOverrides: rebuilt,
        managerChain: patchedManagerChain,
        managerModeSnapshot: managerModeSnapshotNext,
      });
    }
  }

  planned.sort((a, b) => a.contractNumber.localeCompare(b.contractNumber, 'cs'));

  console.log(`owner=${ownerEmail}`);
  console.log(`profile_docs=${ownerDocIds.join(',')}`);
  console.log(`scanned_contracts=${scannedContracts}`);
  console.log(`matched_contract_numbers=${matchedByNumber}`);
  console.log(`contracts_to_update=${planned.length}`);
  console.log('---');
  planned.forEach((row) => {
    const managerSummary = row.managerSummaries
      .map((s) => `${s.email}:${s.prevMode ?? 'null'}->${s.nextMode},Δok=${s.deltaImmediate}`)
      .join(' ; ');
    console.log(
      `${row.contractNumber} | ${row.product} | signed=${row.signedIso ?? '—'} | start=${row.policyStartIso ?? '—'} | ${managerSummary} | ${row.path}`
    );
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
        managerChain: row.managerChain,
        managerModeSnapshot: row.managerModeSnapshot,
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
  console.error(`rewrite_failed=${err?.message ?? err}`);
  process.exit(1);
});
