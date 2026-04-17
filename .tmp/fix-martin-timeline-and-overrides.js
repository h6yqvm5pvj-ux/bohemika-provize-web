const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const formulas = require('./backfill-build/src/app/lib/productFormulas.js');
const { totalWithMultipliers } = require('./backfill-build/src/app/lib/commissionTotals.js');

loadEnvConfig(process.cwd());

const TARGET_OWNER_DEFAULT = 'martin.brezina@bohemika.eu';

const POSITION_ORDER = [
  'poradce1','poradce2','poradce3','poradce4','poradce5','poradce6','poradce7','poradce8','poradce9','poradce10',
  'manazer4','manazer5','manazer6','manazer7','manazer8','manazer9','manazer10',
];
const POSITION_SET = new Set(POSITION_ORDER);
const LIFE_PRODUCTS = new Set(['neon', 'flexi', 'maximaMaxEfekt', 'pillowInjury']);
const PRODUCT_SET = new Set([
  'neon', 'flexi', 'maximaMaxEfekt', 'pillowInjury',
  'zamex', 'domex', 'koopmajetekobcan', 'maxdomov',
  'cppsimplex', 'cppAuto', 'slaviaauto', 'allianzAuto', 'csobAuto', 'uniqaAuto', 'pillowAuto', 'kooperativaAuto',
  'cppcestovko', 'axacestovko', 'comfortcc', 'cppPPRs', 'cppPPRbez',
]);

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function parseArgValue(args, key) {
  const pref = `${key}=`;
  const inline = args.find((arg) => arg.startsWith(pref));
  if (inline) return inline.slice(pref.length);
  const idx = args.indexOf(key);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
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

function normalizeProduct(v) {
  if (typeof v !== 'string') return null;
  return PRODUCT_SET.has(v) ? v : null;
}

function toNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function toNonNegativeNumber(v) {
  return Math.max(0, toNumber(v));
}

function normalizeAmount(v) {
  return Math.round(toNumber(v) * 1_000_000) / 1_000_000;
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

function isIsoDay(value) {
  if (!ISO_DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function toIsoDay(v) {
  if (typeof v === 'string') {
    const s = v.trim();
    if (isIsoDay(s)) return s;
  }
  const d = toDate(v);
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parsePositionTimeline(raw) {
  if (!Array.isArray(raw)) return [];
  const rows = [];

  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const position = normalizePosition(item.position);
    if (!position) return;

    const validFrom = typeof item.validFrom === 'string' ? item.validFrom.trim() : '';
    const validToRaw = typeof item.validTo === 'string' ? item.validTo.trim() : '';
    const validTo = validToRaw || null;

    if (!isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;

    rows.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `timeline_${index}`,
      position,
      validFrom,
      validTo,
    });
  });

  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    const aTo = a.validTo ?? '9999-12-31';
    const bTo = b.validTo ?? '9999-12-31';
    return aTo.localeCompare(bTo);
  });

  return rows;
}

function resolvePositionTimelineMatch(signedDate, timeline) {
  if (!isIsoDay(signedDate) || timeline.length === 0) return null;

  const candidates = timeline.filter((row) => {
    if (row.validFrom > signedDate) return false;
    if (row.validTo && signedDate >= row.validTo) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return b.validFrom.localeCompare(a.validFrom);
    const aTo = a.validTo ?? '9999-12-31';
    const bTo = b.validTo ?? '9999-12-31';
    return bTo.localeCompare(aTo);
  });

  return candidates[0] ?? null;
}

function resolvePositionForSignedDate(userData, signedDateIso, fallbackPosition) {
  const timeline = parsePositionTimeline(userData?.positionTimeline);
  const timelineMatch =
    signedDateIso && isIsoDay(signedDateIso)
      ? resolvePositionTimelineMatch(signedDateIso, timeline)
      : null;

  return timelineMatch?.position ?? userData?.position ?? fallbackPosition ?? null;
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

function normalizeResultItems(items = []) {
  return items.map((it) => ({
    title: String(it.title ?? '').trim(),
    amount: normalizeAmount(it.amount ?? 0),
  }));
}

function normalizeManagerChain(raw) {
  if (!Array.isArray(raw)) return [];
  const out = raw
    .filter((x) => x && typeof x === 'object')
    .map((row) => ({
      email: normalizeEmail(row.email),
      position: normalizePosition(row.position),
      commissionMode: normalizeMode(row.commissionMode),
    }))
    .filter((row) => !!row.email);
  return out;
}

function normalizeManagerOverrides(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];

  raw.forEach((item) => {
    if (!item || typeof item !== 'object') return;

    const rawItems = Array.isArray(item.items) ? item.items : [];
    const items = rawItems
      .filter((it) => it && typeof it === 'object')
      .map((it) => ({
        title: String(it.title ?? '').trim(),
        amount: normalizeAmount(it.amount ?? 0),
      }));

    const cleaned = normalizeResultItems(stripTotalRows(items));
    out.push({
      email: normalizeEmail(item.email),
      position: normalizePosition(item.position),
      commissionMode: normalizeMode(item.commissionMode),
      items: cleaned,
      total: normalizeAmount(totalWithMultipliers(cleaned)),
    });
  });

  return out.filter((row) => !!row.email);
}

function normalizeAllowedEmails(raw) {
  if (!Array.isArray(raw)) return [];
  const set = new Set();
  raw.forEach((x) => {
    const email = normalizeEmail(x);
    if (email) set.add(email);
  });
  return Array.from(set).sort();
}

function deepEqualViaJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function durationRange(product) {
  switch (product) {
    case 'neon':
      return [1, 99];
    case 'flexi':
      return [1, 80];
    case 'maximaMaxEfekt':
      return [1, 20];
    default:
      return [1, 1];
  }
}

function durationFallback(product) {
  switch (product) {
    case 'neon':
      return 15;
    case 'flexi':
      return 30;
    case 'maximaMaxEfekt':
      return 20;
    default:
      return 1;
  }
}

function normalizedDurationYears(product, years) {
  const [min, max] = durationRange(product);
  const raw = typeof years === 'number' && Number.isFinite(years) ? years : durationFallback(product);
  const whole = Math.floor(raw);
  return Math.min(max, Math.max(min, whole));
}

function paymentsPerYear(freq) {
  if (freq === 'monthly') return 12;
  if (freq === 'quarterly') return 4;
  if (freq === 'semiannual') return 2;
  return 1;
}

function paymentBasedTotals(items, multiplier) {
  let immediate = 0;
  let subsequent = 0;

  items.forEach((it) => {
    const t = String(it.title ?? '').toLowerCase();
    if (t.includes('okamžitá')) immediate += it.amount ?? 0;
    else if (t.includes('následná')) subsequent += it.amount ?? 0;
  });

  return {
    immediate: immediate * multiplier,
    subsequent: subsequent * multiplier,
  };
}

function allowedFrequencies(product) {
  switch (product) {
    case 'neon':
    case 'flexi':
    case 'pillowInjury':
    case 'maximaMaxEfekt':
      return ['monthly'];
    case 'domex':
      return ['quarterly', 'semiannual', 'annual'];
    case 'koopmajetekobcan':
      return ['monthly', 'quarterly', 'semiannual', 'annual'];
    case 'pillowAuto':
    case 'maxdomov':
    case 'kooperativaAuto':
    case 'allianzAuto':
      return ['monthly', 'quarterly', 'semiannual', 'annual'];
    case 'cppAuto':
    case 'slaviaauto':
    case 'csobAuto':
    case 'uniqaAuto':
    case 'zamex':
    case 'cppsimplex':
    case 'cppPPRbez':
    case 'cppPPRs':
      return ['quarterly', 'semiannual', 'annual'];
    case 'cppcestovko':
    case 'axacestovko':
    case 'comfortcc':
      return ['annual'];
    default:
      return ['annual'];
  }
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
  const product = normalizeProduct(entry.productKey);
  if (!product) return null;

  const allowed = allowedFrequencies(product);
  const rawFreq = entry.frequencyRaw;
  const freq = typeof rawFreq === 'string' && allowed.includes(rawFreq) ? rawFreq : allowed[0];
  const years = typeof entry.durationYears === 'number' && Number.isFinite(entry.durationYears) ? entry.durationYears : null;

  const mode = customMode ?? normalizeMode(entry.commissionMode) ?? 'standard';
  const val = amountOverride == null ? toNonNegativeNumber(entryCalculationAmount(entry)) : toNonNegativeNumber(amountOverride);

  switch (product) {
    case 'neon': {
      const y = Math.min(15, normalizedDurationYears('neon', years));
      return formulas.calculateNeon(val, pos, y, mode);
    }
    case 'flexi': {
      const y = normalizedDurationYears('flexi', years);
      return formulas.calculateFlexi(val, pos, mode, y);
    }
    case 'maximaMaxEfekt': {
      const y = normalizedDurationYears('maximaMaxEfekt', years);
      return formulas.calculateMaxEfekt(val, y, pos, mode);
    }
    case 'pillowInjury':
      return formulas.calculatePillowInjury(val, pos, mode);
    case 'domex':
    case 'koopmajetekobcan': {
      const dto =
        product === 'domex'
          ? formulas.calculateDomex(val, freq, pos)
          : formulas.calculateKoopMajetekObcan(val, freq, pos);
      const filtered = dto.items.filter((i) => String(i.title ?? '').toLowerCase().includes('(z platby)'));
      const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
      return { items: filtered, total: totals.immediate + totals.subsequent };
    }
    case 'maxdomov': {
      const dto = formulas.calculateMaxdomov(val, freq, pos);
      const filtered = dto.items.filter((i) => String(i.title ?? '').toLowerCase().includes('(z platby)'));
      const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
      return { items: filtered, total: totals.immediate + totals.subsequent };
    }
    case 'cppAuto':
      return formulas.calculateCppAuto(val, freq, pos);
    case 'slaviaauto':
      return formulas.calculateSlaviaAuto(val, freq, pos);
    case 'cppPPRbez': {
      const dto = formulas.calculateCppPPRbez(val, freq, pos);
      const filtered = dto.items.filter((i) => String(i.title ?? '').toLowerCase().includes('(z platby)'));
      const sum = filtered.reduce((s, i) => s + (i.amount ?? 0), 0);
      return { items: filtered, total: sum };
    }
    case 'cppPPRs':
      return formulas.calculateCppPPRs(val, freq, pos);
    case 'cppsimplex':
      return formulas.calculateCppSimplex(val, freq, pos);
    case 'allianzAuto':
      return formulas.calculateAllianzAuto(val, freq, pos);
    case 'csobAuto':
      return formulas.calculateCsobAuto(val, freq, pos);
    case 'uniqaAuto':
      return formulas.calculateUniqaAuto(val, freq, pos);
    case 'pillowAuto':
      return formulas.calculatePillowAuto(val, freq, pos);
    case 'kooperativaAuto':
      return formulas.calculateKooperativaAuto(val, freq, pos);
    case 'zamex':
      return formulas.calculateZamex(val, freq, pos);
    case 'cppcestovko':
      return formulas.calculateCppCestovko(val, pos);
    case 'axacestovko':
      return formulas.calculateAxaCestovko(val, pos);
    case 'comfortcc':
      return formulas.calculateComfortCC({
        fee: val,
        payment: toNonNegativeNumber(entry.comfortPayment),
        targetAmount: entry.comfortGradual === true ? toNonNegativeNumber(entry.comfortTargetAmount) : 0,
        isSavings: entry.comfortGradual === true,
        isGradualFee: entry.comfortGradual === true,
        position: pos,
      });
    default:
      return null;
  }
}

function collectChainEmailsFromUsers(firstManagerEmail, usersByEmail) {
  const emails = [];
  let current = firstManagerEmail;
  let depth = 0;
  const visited = new Set();

  while (current && depth < 9 && !visited.has(current)) {
    visited.add(current);
    emails.push(current);
    const user = usersByEmail.get(current);
    current = user?.managerEmail ?? null;
    depth += 1;
  }

  return emails;
}

function resolveChainEmailsForEntry(entry, ownerEmail, usersByEmail) {
  const chainFromEntry = normalizeManagerChain(entry.managerChain).map((row) => row.email);
  if (chainFromEntry.length > 0) return chainFromEntry;

  const snapshotManager = normalizeEmail(entry.managerEmailSnapshot);
  if (snapshotManager) return collectChainEmailsFromUsers(snapshotManager, usersByEmail);

  const owner = usersByEmail.get(ownerEmail);
  if (owner?.managerEmail) return collectChainEmailsFromUsers(owner.managerEmail, usersByEmail);

  return [];
}

function buildManagerChainForEntry(entry, ownerEmail, usersByEmail, signedDateIso, product) {
  const existingChain = normalizeManagerChain(entry.managerChain);
  const chainEmails = resolveChainEmailsForEntry(entry, ownerEmail, usersByEmail);
  const isLife = LIFE_PRODUCTS.has(product);

  return chainEmails.map((email, idx) => {
    const existingNode = existingChain.find((node) => node.email === email) ?? existingChain[idx] ?? null;
    const userData = usersByEmail.get(email);
    const resolvedPosition = resolvePositionForSignedDate(userData, signedDateIso, existingNode?.position ?? null);

    const inheritedMode =
      existingNode?.commissionMode ??
      (idx === 0 ? normalizeMode(entry.managerModeSnapshot) : null) ??
      userData?.commissionMode ??
      null;

    const resolvedMode = isLife ? 'standard' : inheritedMode;

    return {
      email,
      position: resolvedPosition,
      commissionMode: resolvedMode,
    };
  });
}

function computeManagerOverridesForEntry(entry, managerChain, product) {
  const calculationAmount = entryCalculationAmount(entry);
  const diffs = [];
  let childPositionForBaseline = normalizePosition(entry.position);
  const ownerMode = normalizeMode(entry.commissionMode);
  const isLife = LIFE_PRODUCTS.has(product);

  managerChain.forEach((mgr) => {
    if (!mgr.position) return;

    const mgrMode = isLife ? 'standard' : (mgr.commissionMode ?? ownerMode ?? 'standard');

    const mgrRes = computeItemsForEntry(entry, mgr.position, mgrMode, calculationAmount);
    const baselineRes = childPositionForBaseline
      ? computeItemsForEntry(entry, childPositionForBaseline, mgrMode, calculationAmount)
      : null;

    if (!mgrRes || !baselineRes) {
      childPositionForBaseline = mgr.position;
      return;
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

    const normalizedItems = normalizeResultItems(diffItems);
    const diffTotal = normalizeAmount(totalWithMultipliers(normalizedItems));

    if (normalizedItems.length > 0 && diffTotal > 0) {
      diffs.push({
        email: mgr.email ?? null,
        position: mgr.position,
        commissionMode: mgrMode,
        items: normalizedItems,
        total: diffTotal,
      });
    }

    childPositionForBaseline = mgr.position;
  });

  return diffs;
}

function buildAllowedEmails(ownerEmail, managerEmail, chain, overrides) {
  const set = new Set();
  const push = (v) => {
    const e = normalizeEmail(v);
    if (e) set.add(e);
  };

  push(ownerEmail);
  push(managerEmail);
  chain.forEach((node) => push(node.email));
  overrides.forEach((ov) => push(ov.email));

  return Array.from(set).sort();
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const targetOwner = normalizeEmail(parseArgValue(args, '--owner') ?? TARGET_OWNER_DEFAULT);
  if (!targetOwner) throw new Error('Missing --owner');

  const creds = loadCredentials();
  if (!creds) throw new Error('Missing FIREBASE_ADMIN_* credentials.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const usersByEmail = new Map();

  usersSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const email = normalizeEmail(data.email ?? docSnap.id);
    if (!email) return;

    const existing = usersByEmail.get(email);
    const candidate = {
      email,
      managerEmail: normalizeEmail(data.managerEmail),
      position: normalizePosition(data.position),
      commissionMode: normalizeMode(data.commissionMode),
      positionTimeline: data.positionTimeline,
      docId: docSnap.id,
    };

    if (!existing) {
      usersByEmail.set(email, {
        email,
        managerEmail: candidate.managerEmail,
        position: candidate.position,
        commissionMode: candidate.commissionMode,
        positionTimeline: candidate.positionTimeline,
        docIds: [candidate.docId],
      });
      return;
    }

    if (!existing.docIds.includes(candidate.docId)) existing.docIds.push(candidate.docId);

    const isCanonicalDoc = candidate.docId.toLowerCase() === email;
    const existingHasTimeline = parsePositionTimeline(existing.positionTimeline).length > 0;
    const candidateHasTimeline = parsePositionTimeline(candidate.positionTimeline).length > 0;

    if (isCanonicalDoc || (!existing.managerEmail && candidate.managerEmail)) {
      existing.managerEmail = candidate.managerEmail;
    }
    if (isCanonicalDoc || (!existing.position && candidate.position)) {
      existing.position = candidate.position;
    }
    if (isCanonicalDoc || (!existing.commissionMode && candidate.commissionMode)) {
      existing.commissionMode = candidate.commissionMode;
    }
    if (candidateHasTimeline && (isCanonicalDoc || !existingHasTimeline)) {
      existing.positionTimeline = candidate.positionTimeline;
    }
  });

  const ownerRecord = usersByEmail.get(targetOwner);
  if (!ownerRecord) {
    throw new Error(`User ${targetOwner} not found in users collection.`);
  }

  const ownerDocIds = ownerRecord.docIds?.length ? ownerRecord.docIds : [targetOwner];

  let scannedEntries = 0;
  let skippedUnsupported = 0;
  let skippedMissingSigned = 0;
  let ownerPositionFixes = 0;
  let lifeForcedStandardCount = 0;

  const planned = [];
  const seenPath = new Set();

  for (const ownerDocId of ownerDocIds) {
    const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();

    for (const entrySnap of entriesSnap.docs) {
      const path = `users/${ownerDocId}/entries/${entrySnap.id}`;
      if (seenPath.has(path)) continue;
      seenPath.add(path);
      scannedEntries += 1;

      const entry = entrySnap.data() || {};
      const product = normalizeProduct(entry.productKey);
      if (!product) {
        skippedUnsupported += 1;
        continue;
      }

      const signedDateIso = toIsoDay(entry.contractSignedDate);
      if (!signedDateIso) {
        skippedMissingSigned += 1;
        continue;
      }

      const expectedOwnerPosition = resolvePositionForSignedDate(ownerRecord, signedDateIso, normalizePosition(entry.position));
      const ownerPositionChanged = normalizePosition(entry.position) !== expectedOwnerPosition;
      if (ownerPositionChanged) ownerPositionFixes += 1;

      const managerChain = buildManagerChainForEntry(entry, targetOwner, usersByEmail, signedDateIso, product);
      if (LIFE_PRODUCTS.has(product)) {
        lifeForcedStandardCount += managerChain.filter((n) => n.commissionMode === 'standard').length;
      }

      const managerOverrides = computeManagerOverridesForEntry(
        { ...entry, position: expectedOwnerPosition },
        managerChain,
        product
      );

      const managerEmailSnapshot = managerChain[0]?.email ?? null;
      const managerPositionSnapshot = managerChain[0]?.position ?? null;
      const managerModeSnapshot = managerChain[0]?.commissionMode ?? null;
      const allowedEmails = buildAllowedEmails(targetOwner, managerEmailSnapshot, managerChain, managerOverrides);

      const previousComparable = {
        position: normalizePosition(entry.position),
        managerEmailSnapshot: normalizeEmail(entry.managerEmailSnapshot),
        managerPositionSnapshot: normalizePosition(entry.managerPositionSnapshot),
        managerModeSnapshot: normalizeMode(entry.managerModeSnapshot),
        managerChain: normalizeManagerChain(entry.managerChain),
        managerOverrides: normalizeManagerOverrides(entry.managerOverrides),
        allowedEmails: normalizeAllowedEmails(entry.allowedEmails),
      };

      const nextComparable = {
        position: expectedOwnerPosition,
        managerEmailSnapshot,
        managerPositionSnapshot,
        managerModeSnapshot,
        managerChain,
        managerOverrides,
        allowedEmails,
      };

      if (!deepEqualViaJson(previousComparable, nextComparable)) {
        const existingOverrides = normalizeManagerOverrides(entry.managerOverrides);
        const lifeNonStandardOverrides = LIFE_PRODUCTS.has(product)
          ? existingOverrides.filter((ov) => normalizeMode(ov.commissionMode) !== 'standard').length
          : 0;

        planned.push({
          ref: entrySnap.ref,
          path,
          contractNumber: typeof entry.contractNumber === 'string' ? entry.contractNumber.trim() : '',
          product,
          signedDateIso,
          entryType: typeof entry.entryType === 'string' ? entry.entryType : 'contract',
          ownerPositionBefore: normalizePosition(entry.position),
          ownerPositionAfter: expectedOwnerPosition,
          lifeNonStandardOverrides,
          next: nextComparable,
        });
      }
    }
  }

  planned.sort((a, b) => {
    if (a.signedDateIso !== b.signedDateIso) return a.signedDateIso.localeCompare(b.signedDateIso);
    return (a.contractNumber || '').localeCompare(b.contractNumber || '', 'cs');
  });

  console.log(`owner=${targetOwner}`);
  console.log(`owner_doc_ids=${ownerDocIds.join(',')}`);
  console.log(`scanned_entries=${scannedEntries}`);
  console.log(`updates_needed=${planned.length}`);
  console.log(`owner_position_fixes_detected=${ownerPositionFixes}`);
  console.log(`skipped_unsupported_product=${skippedUnsupported}`);
  console.log(`skipped_missing_signed_date=${skippedMissingSigned}`);
  console.log(`life_chain_nodes_forced_standard=${lifeForcedStandardCount}`);

  if (planned.length > 0) {
    console.log('--- sample (max 40) ---');
    planned.slice(0, 40).forEach((row) => {
      console.log([
        row.contractNumber || '—',
        row.product,
        row.signedDateIso,
        row.entryType,
        row.ownerPositionBefore ?? 'null',
        row.ownerPositionAfter ?? 'null',
        `lifeNonStdOv=${row.lifeNonStandardOverrides}`,
        row.path,
      ].join(' | '));
    });
  }

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
        position: row.next.position,
        managerEmailSnapshot: row.next.managerEmailSnapshot,
        managerPositionSnapshot: row.next.managerPositionSnapshot,
        managerModeSnapshot: row.next.managerModeSnapshot,
        managerChain: row.next.managerChain,
        managerOverrides: row.next.managerOverrides,
        allowedEmails: row.next.allowedEmails,
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
  console.error('Fix failed:', err?.message ?? err);
  process.exit(1);
});
