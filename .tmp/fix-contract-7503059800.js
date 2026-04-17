const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const formulas = require('./backfill-build/src/app/lib/productFormulas.js');
const { totalWithMultipliers } = require('./backfill-build/src/app/lib/commissionTotals.js');

loadEnvConfig(process.cwd());

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
const PRODUCT_SET = new Set([
  'neon',
  'flexi',
  'maximaMaxEfekt',
  'pillowInjury',
  'zamex',
  'domex',
  'koopmajetekobcan',
  'maxdomov',
  'cppsimplex',
  'cppAuto',
  'slaviaauto',
  'allianzAuto',
  'csobAuto',
  'uniqaAuto',
  'pillowAuto',
  'kooperativaAuto',
  'cppcestovko',
  'axacestovko',
  'comfortcc',
  'cppPPRs',
  'cppPPRbez',
]);
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const TARGET_PATH = 'users/valerij.zlatnik@bohemika.eu/entries/YadnTDheGElwX3GZky9q';

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

function normalizeProduct(value) {
  if (typeof value !== 'string') return null;
  return PRODUCT_SET.has(value) ? value : null;
}

function toNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function toNonNegativeNumber(value) {
  return Math.max(0, toNumber(value));
}

function normalizeAmount(value) {
  const n = toNumber(value);
  return Math.round(n * 1_000_000) / 1_000_000;
}

function isIsoDay(value) {
  if (!ISO_DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime());
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
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isIsoDay(trimmed)) return trimmed;
  }
  const d = toDate(value);
  if (!d) return null;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
      id: typeof item.id === 'string' && item.id.trim().length > 0 ? item.id.trim() : `timeline_${index}`,
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
  const wholeYears = Math.floor(raw);
  return Math.min(max, Math.max(min, wholeYears));
}

function paymentsPerYear(f) {
  if (f === 'monthly') return 12;
  if (f === 'quarterly') return 4;
  if (f === 'semiannual') return 2;
  return 1;
}

function paymentBasedTotals(items, multiplier) {
  let immediate = 0;
  let subsequent = 0;

  items.forEach((it) => {
    const t = (it.title ?? '').toLowerCase();
    if (t.includes('okamžitá')) immediate += it.amount ?? 0;
    else if (t.includes('následná')) subsequent += it.amount ?? 0;
  });

  return { immediate: immediate * multiplier, subsequent: subsequent * multiplier };
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
  const product = normalizeProduct(entry.productKey);
  if (!product) return null;

  const allowed = allowedFrequencies(product);
  const rawFreq = entry.frequencyRaw;
  const freq = typeof rawFreq === 'string' && allowed.includes(rawFreq) ? rawFreq : allowed[0];
  const years = typeof entry.durationYears === 'number' && Number.isFinite(entry.durationYears) ? entry.durationYears : null;
  const usedMode = customMode ?? normalizeMode(entry.commissionMode) ?? 'standard';
  const val = amountOverride == null ? toNonNegativeNumber(entryCalculationAmount(entry)) : toNonNegativeNumber(amountOverride);

  switch (product) {
    case 'neon': {
      const y = Math.min(15, normalizedDurationYears('neon', years));
      return formulas.calculateNeon(val, pos, y, usedMode);
    }
    case 'flexi': {
      const y = normalizedDurationYears('flexi', years);
      return formulas.calculateFlexi(val, pos, usedMode, y);
    }
    case 'maximaMaxEfekt': {
      const y = normalizedDurationYears('maximaMaxEfekt', years);
      return formulas.calculateMaxEfekt(val, y, pos, usedMode);
    }
    case 'pillowInjury':
      return formulas.calculatePillowInjury(val, pos, usedMode);
    case 'domex':
    case 'koopmajetekobcan': {
      const dto = product === 'domex' ? formulas.calculateDomex(val, freq, pos) : formulas.calculateKoopMajetekObcan(val, freq, pos);
      const filtered = dto.items.filter((i) => (i.title ?? '').toLowerCase().includes('(z platby)'));
      const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
      return { items: filtered, total: totals.immediate + totals.subsequent };
    }
    case 'maxdomov': {
      const dto = formulas.calculateMaxdomov(val, freq, pos);
      const filtered = dto.items.filter((i) => (i.title ?? '').toLowerCase().includes('(z platby)'));
      const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
      return { items: filtered, total: totals.immediate + totals.subsequent };
    }
    case 'cppAuto':
      return formulas.calculateCppAuto(val, freq, pos);
    case 'slaviaauto':
      return formulas.calculateSlaviaAuto(val, freq, pos);
    case 'cppPPRbez': {
      const dto = formulas.calculateCppPPRbez(val, freq, pos);
      const filtered = dto.items.filter((i) => (i.title ?? '').toLowerCase().includes('(z platby)'));
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

function buildManagerChain(entry, usersByEmail, signedDateIso) {
  const chainRaw = Array.isArray(entry.managerChain) ? entry.managerChain : [];
  const chainEmails = chainRaw
    .map((node) => normalizeEmail(node?.email))
    .filter(Boolean);

  const ownerEmail = normalizeEmail(entry.userEmail);
  if (chainEmails.length === 0 && ownerEmail) {
    const ownerData = usersByEmail.get(ownerEmail);
    const mgr = normalizeEmail(ownerData?.managerEmail);
    if (mgr) chainEmails.push(mgr);
  }

  if (chainEmails.length === 0) {
    const first = normalizeEmail(entry.managerEmailSnapshot);
    if (first) chainEmails.push(first);
  }

  return chainEmails.map((email, idx) => {
    const nodeFallback = chainRaw[idx] ?? {};
    const userData = usersByEmail.get(email);
    const position = resolvePositionForSignedDate(
      userData,
      signedDateIso,
      normalizePosition(nodeFallback.position)
    );
    const commissionMode =
      normalizeMode(nodeFallback.commissionMode) ??
      (idx === 0 ? normalizeMode(entry.managerModeSnapshot) : null) ??
      normalizeMode(userData?.commissionMode) ??
      null;

    return { email, position, commissionMode };
  });
}

function computeManagerOverrides(entry, managerChain, ownerPositionOverride) {
  const calculationAmount = entryCalculationAmount(entry);
  const ownerMode = normalizeMode(entry.commissionMode) ?? 'standard';
  const diffs = [];
  let childPositionForBaseline = ownerPositionOverride ?? normalizePosition(entry.position);

  managerChain.forEach((mgr) => {
    if (!mgr.position) return;
    const mgrMode = mgr.commissionMode ?? ownerMode;

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
      const mgrAmt = mgrVal?.amount ?? 0;
      const subAmt = it.amount ?? 0;
      const rem = normalizeAmount(mgrAmt - subAmt);
      if (rem > 0) diffItems.push({ title: mgrVal?.title ?? it.title, amount: rem });
      mgrMap.delete(key);
    });

    mgrMap.forEach((val) => {
      if (val.amount > 0) diffItems.push({ title: val.title, amount: normalizeAmount(val.amount) });
    });

    const normalizedItems = normalizeItems(diffItems);
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

function buildAllowedEmails(ownerEmail, managerEmail, managerChain, managerOverrides) {
  const set = new Set();
  const push = (value) => {
    const email = normalizeEmail(value);
    if (email) set.add(email);
  };

  push(ownerEmail);
  push(managerEmail);
  managerChain.forEach((node) => push(node.email));
  managerOverrides.forEach((ov) => push(ov.email));

  return Array.from(set).sort();
}

(async () => {
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

    const candidate = {
      email,
      managerEmail: normalizeEmail(data.managerEmail),
      position: normalizePosition(data.position),
      commissionMode: normalizeMode(data.commissionMode),
      positionTimeline: data.positionTimeline,
      docId: docSnap.id,
    };

    const existing = usersByEmail.get(email);
    if (!existing) {
      usersByEmail.set(email, candidate);
      return;
    }

    const canonical = docSnap.id.toLowerCase() === email;
    const existingTimelineLen = parsePositionTimeline(existing.positionTimeline).length;
    const candidateTimelineLen = parsePositionTimeline(candidate.positionTimeline).length;

    if (canonical || !existing.managerEmail) existing.managerEmail = candidate.managerEmail;
    if (canonical || !existing.position) existing.position = candidate.position;
    if (canonical || !existing.commissionMode) existing.commissionMode = candidate.commissionMode;
    if (candidateTimelineLen > 0 && (canonical || existingTimelineLen === 0)) {
      existing.positionTimeline = candidate.positionTimeline;
    }
  });

  const entryRef = db.doc(TARGET_PATH);
  const snap = await entryRef.get();
  if (!snap.exists) throw new Error(`Contract not found: ${TARGET_PATH}`);

  const entry = snap.data() || {};
  if (String(entry.contractNumber ?? '') !== '7503059800') {
    throw new Error(`Target doc has unexpected contractNumber=${entry.contractNumber}`);
  }

  const ownerEmail = normalizeEmail(entry.userEmail ?? 'valerij.zlatnik@bohemika.eu');
  const signedDateIso = toIsoDay(entry.contractSignedDate);
  if (!ownerEmail) throw new Error('Owner email is missing.');
  if (!signedDateIso) throw new Error('contractSignedDate missing/invalid.');

  const ownerData = usersByEmail.get(ownerEmail);
  const expectedOwnerPosition = resolvePositionForSignedDate(
    ownerData,
    signedDateIso,
    normalizePosition(entry.position)
  );
  if (!expectedOwnerPosition) {
    throw new Error(`Owner position cannot be resolved from timeline for ${signedDateIso}`);
  }

  const ownerResult = computeItemsForEntry(entry, expectedOwnerPosition, normalizeMode(entry.commissionMode), entryCalculationAmount(entry));
  if (!ownerResult) {
    throw new Error('Failed to recompute owner commission result.');
  }

  const ownerItems = normalizeItems(ownerResult.items ?? []);
  const ownerTotal = normalizeAmount(ownerResult.total ?? 0);

  const managerChain = buildManagerChain(entry, usersByEmail, signedDateIso);
  const managerOverrides = computeManagerOverrides(entry, managerChain, expectedOwnerPosition);
  const managerEmailSnapshot = managerChain[0]?.email ?? null;
  const managerPositionSnapshot = managerChain[0]?.position ?? null;
  const managerModeSnapshot = managerChain[0]?.commissionMode ?? null;
  const allowedEmails = buildAllowedEmails(ownerEmail, managerEmailSnapshot, managerChain, managerOverrides);

  const before = {
    position: normalizePosition(entry.position),
    total: normalizeAmount(entry.total ?? 0),
    managerPositionSnapshot: normalizePosition(entry.managerPositionSnapshot),
    managerOverridesCount: Array.isArray(entry.managerOverrides) ? entry.managerOverrides.length : 0,
  };

  await entryRef.set(
    {
      position: expectedOwnerPosition,
      items: ownerItems,
      total: ownerTotal,
      result: {
        items: ownerItems,
        total: ownerTotal,
      },
      managerEmailSnapshot,
      managerPositionSnapshot,
      managerModeSnapshot,
      managerChain,
      managerOverrides,
      allowedEmails,
    },
    { merge: true }
  );

  const after = {
    position: expectedOwnerPosition,
    total: ownerTotal,
    managerPositionSnapshot,
    managerOverridesCount: managerOverrides.length,
  };

  console.log(JSON.stringify({
    ok: true,
    path: TARGET_PATH,
    contractNumber: '7503059800',
    signedDateIso,
    before,
    after,
  }, null, 2));
})();
