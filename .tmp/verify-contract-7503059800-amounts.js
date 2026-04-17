const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const formulas = require('./backfill-build/src/app/lib/productFormulas.js');
const { totalWithMultipliers } = require('./backfill-build/src/app/lib/commissionTotals.js');

loadEnvConfig(process.cwd());

const POSITION_ORDER = [
  'poradce1','poradce2','poradce3','poradce4','poradce5','poradce6','poradce7','poradce8','poradce9','poradce10',
  'manazer4','manazer5','manazer6','manazer7','manazer8','manazer9','manazer10',
];
const POSITION_SET = new Set(POSITION_ORDER);
const PRODUCT_SET = new Set([
  'neon','flexi','maximaMaxEfekt','pillowInjury','zamex','domex','koopmajetekobcan','maxdomov','cppsimplex',
  'cppAuto','slaviaauto','allianzAuto','csobAuto','uniqaAuto','pillowAuto','kooperativaAuto','cppcestovko','axacestovko','comfortcc','cppPPRs','cppPPRbez'
]);
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TARGET_PATH = 'users/valerij.zlatnik@bohemika.eu/entries/YadnTDheGElwX3GZky9q';
const VIEWER_EMAIL = 'jakub.rauscher@bohemika.eu';

function loadCredentials() {
  const rawJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return { projectId: parsed.project_id, clientEmail: parsed.client_email, privateKey: parsed.private_key };
      }
    } catch {}
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (projectId && clientEmail && privateKeyRaw) {
    return { projectId, clientEmail, privateKey: privateKeyRaw.replace(/\\n/g, '\n') };
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
function normalizeProduct(v) {
  if (typeof v !== 'string') return null;
  return PRODUCT_SET.has(v) ? v : null;
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
function isIsoDay(value) {
  if (!ISO_DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime());
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
function toIsoDay(v) {
  if (typeof v === 'string') {
    const t = v.trim();
    if (isIsoDay(t)) return t;
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
  raw.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const pos = normalizePosition(item.position);
    const validFrom = typeof item.validFrom === 'string' ? item.validFrom.trim() : '';
    const validToRaw = typeof item.validTo === 'string' ? item.validTo.trim() : '';
    const validTo = validToRaw || null;
    if (!pos) return;
    if (!isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;
    rows.push({ id: (typeof item.id === 'string' && item.id.trim()) ? item.id.trim() : `timeline_${idx}`, position: pos, validFrom, validTo });
  });
  rows.sort((a,b)=>{
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
  if (!candidates.length) return null;
  candidates.sort((a,b)=>{
    if (a.validFrom !== b.validFrom) return b.validFrom.localeCompare(a.validFrom);
    const aTo = a.validTo ?? '9999-12-31';
    const bTo = b.validTo ?? '9999-12-31';
    return bTo.localeCompare(aTo);
  });
  return candidates[0] ?? null;
}
function resolvePositionForSignedDate(userData, signedDateIso, fallbackPosition) {
  const timeline = parsePositionTimeline(userData?.positionTimeline);
  const match = signedDateIso && isIsoDay(signedDateIso) ? resolvePositionTimelineMatch(signedDateIso, timeline) : null;
  return match?.position ?? userData?.position ?? fallbackPosition ?? null;
}
function durationRange(product) {
  switch (product) {
    case 'neon': return [1,99];
    case 'flexi': return [1,80];
    case 'maximaMaxEfekt': return [1,20];
    default: return [1,1];
  }
}
function durationFallback(product) {
  switch (product) {
    case 'neon': return 15;
    case 'flexi': return 30;
    case 'maximaMaxEfekt': return 20;
    default: return 1;
  }
}
function normalizedDurationYears(product, years) {
  const [min,max] = durationRange(product);
  const raw = (typeof years === 'number' && Number.isFinite(years)) ? years : durationFallback(product);
  const whole = Math.floor(raw);
  return Math.min(max, Math.max(min, whole));
}
function paymentsPerYear(f){ if (f==='monthly') return 12; if (f==='quarterly') return 4; if (f==='semiannual') return 2; return 1; }
function paymentBasedTotals(items, multiplier) {
  let immediate = 0, subsequent = 0;
  items.forEach((it)=>{
    const t = String(it.title ?? '').toLowerCase();
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
    case 'maximaMaxEfekt': return ['monthly'];
    case 'domex': return ['quarterly','semiannual','annual'];
    case 'koopmajetekobcan': return ['monthly','quarterly','semiannual','annual'];
    case 'pillowAuto':
    case 'maxdomov':
    case 'kooperativaAuto':
    case 'allianzAuto': return ['monthly','quarterly','semiannual','annual'];
    case 'cppAuto':
    case 'slaviaauto':
    case 'csobAuto':
    case 'uniqaAuto':
    case 'zamex':
    case 'cppsimplex':
    case 'cppPPRbez':
    case 'cppPPRs': return ['quarterly','semiannual','annual'];
    case 'cppcestovko':
    case 'axacestovko':
    case 'comfortcc': return ['annual'];
    default: return ['annual'];
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
  return items.map((it)=>({ title: String(it.title ?? '').trim(), amount: normalizeAmount(it.amount ?? 0) }));
}
function entryCalculationAmount(entry) {
  const fromCalc = toNumber(entry.calculationInputAmount); if (fromCalc > 0) return fromCalc;
  const fromInput = toNumber(entry.inputAmount); if (fromInput > 0) return fromInput;
  const fromEff = toNumber(entry.effectiveInputAmount); if (fromEff > 0) return fromEff;
  return 0;
}
function computeItemsForEntry(entry, pos, customMode, amountOverride) {
  if (!pos) return null;
  const product = normalizeProduct(entry.productKey);
  if (!product) return null;
  const allowed = allowedFrequencies(product);
  const rawFreq = entry.frequencyRaw;
  const freq = (typeof rawFreq === 'string' && allowed.includes(rawFreq)) ? rawFreq : allowed[0];
  const years = (typeof entry.durationYears === 'number' && Number.isFinite(entry.durationYears)) ? entry.durationYears : null;
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
    case 'pillowInjury': return formulas.calculatePillowInjury(val, pos, usedMode);
    case 'domex':
    case 'koopmajetekobcan': {
      const dto = product === 'domex' ? formulas.calculateDomex(val, freq, pos) : formulas.calculateKoopMajetekObcan(val, freq, pos);
      const filtered = dto.items.filter((i)=>String(i.title ?? '').toLowerCase().includes('(z platby)'));
      const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
      return { items: filtered, total: totals.immediate + totals.subsequent };
    }
    case 'maxdomov': {
      const dto = formulas.calculateMaxdomov(val, freq, pos);
      const filtered = dto.items.filter((i)=>String(i.title ?? '').toLowerCase().includes('(z platby)'));
      const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
      return { items: filtered, total: totals.immediate + totals.subsequent };
    }
    case 'cppAuto': return formulas.calculateCppAuto(val, freq, pos);
    case 'slaviaauto': return formulas.calculateSlaviaAuto(val, freq, pos);
    case 'cppPPRbez': {
      const dto = formulas.calculateCppPPRbez(val, freq, pos);
      const filtered = dto.items.filter((i)=>String(i.title ?? '').toLowerCase().includes('(z platby)'));
      const sum = filtered.reduce((s,i)=>s + (i.amount ?? 0), 0);
      return { items: filtered, total: sum };
    }
    case 'cppPPRs': return formulas.calculateCppPPRs(val, freq, pos);
    case 'cppsimplex': return formulas.calculateCppSimplex(val, freq, pos);
    case 'allianzAuto': return formulas.calculateAllianzAuto(val, freq, pos);
    case 'csobAuto': return formulas.calculateCsobAuto(val, freq, pos);
    case 'uniqaAuto': return formulas.calculateUniqaAuto(val, freq, pos);
    case 'pillowAuto': return formulas.calculatePillowAuto(val, freq, pos);
    case 'kooperativaAuto': return formulas.calculateKooperativaAuto(val, freq, pos);
    case 'zamex': return formulas.calculateZamex(val, freq, pos);
    case 'cppcestovko': return formulas.calculateCppCestovko(val, pos);
    case 'axacestovko': return formulas.calculateAxaCestovko(val, pos);
    case 'comfortcc': return formulas.calculateComfortCC({
      fee: val,
      payment: toNonNegativeNumber(entry.comfortPayment),
      targetAmount: entry.comfortGradual === true ? toNonNegativeNumber(entry.comfortTargetAmount) : 0,
      isSavings: entry.comfortGradual === true,
      isGradualFee: entry.comfortGradual === true,
      position: pos,
    });
    default: return null;
  }
}
function buildManagerChain(entry, usersByEmail, signedDateIso) {
  const chainRaw = Array.isArray(entry.managerChain) ? entry.managerChain : [];
  const chainEmails = chainRaw.map((n)=>normalizeEmail(n?.email)).filter(Boolean);
  return chainEmails.map((email, idx)=>{
    const fallback = chainRaw[idx] ?? {};
    const userData = usersByEmail.get(email);
    const position = resolvePositionForSignedDate(userData, signedDateIso, normalizePosition(fallback.position));
    const mode = normalizeMode(fallback.commissionMode) ?? (idx===0 ? normalizeMode(entry.managerModeSnapshot) : null) ?? normalizeMode(userData?.commissionMode) ?? null;
    return { email, position, commissionMode: mode };
  });
}
function computeManagerOverrides(entry, managerChain, ownerPositionOverride) {
  const calculationAmount = entryCalculationAmount(entry);
  const ownerMode = normalizeMode(entry.commissionMode) ?? 'standard';
  const diffs = [];
  let childPositionForBaseline = ownerPositionOverride ?? normalizePosition(entry.position);

  managerChain.forEach((mgr)=>{
    if (!mgr.position) return;
    const mgrMode = mgr.commissionMode ?? ownerMode;

    const mgrRes = computeItemsForEntry(entry, mgr.position, mgrMode, calculationAmount);
    const baselineRes = childPositionForBaseline ? computeItemsForEntry(entry, childPositionForBaseline, mgrMode, calculationAmount) : null;
    if (!mgrRes || !baselineRes) {
      childPositionForBaseline = mgr.position;
      return;
    }

    const mgrItems = stripTotalRows(mgrRes.items);
    const baselineItems = stripTotalRows(baselineRes.items);

    const mgrMap = new Map();
    mgrItems.forEach((it)=>{
      const key = normalizeTitleKey(it.title ?? '');
      const prev = mgrMap.get(key);
      mgrMap.set(key, { title: it.title ?? prev?.title ?? key, amount: normalizeAmount((prev?.amount ?? 0) + (it.amount ?? 0)) });
    });

    const diffItems = [];
    baselineItems.forEach((it)=>{
      const key = normalizeTitleKey(it.title ?? '');
      const mgrVal = mgrMap.get(key);
      const rem = normalizeAmount((mgrVal?.amount ?? 0) - (it.amount ?? 0));
      if (rem > 0) diffItems.push({ title: mgrVal?.title ?? it.title, amount: rem });
      mgrMap.delete(key);
    });
    mgrMap.forEach((val)=>{ if (val.amount > 0) diffItems.push({ title: val.title, amount: normalizeAmount(val.amount) }); });

    const normalizedItems = normalizeItems(diffItems);
    const diffTotal = normalizeAmount(totalWithMultipliers(normalizedItems));
    if (normalizedItems.length > 0 && diffTotal > 0) {
      diffs.push({ email: mgr.email ?? null, position: mgr.position, commissionMode: mgrMode, items: normalizedItems, total: diffTotal });
    }

    childPositionForBaseline = mgr.position;
  });

  return diffs;
}

function itemsToMap(items = []) {
  const m = new Map();
  items.forEach((it)=>{
    const title = String(it.title ?? '').trim();
    m.set(title, normalizeAmount(it.amount ?? 0));
  });
  return m;
}

(async () => {
  const creds = loadCredentials();
  if (!creds) throw new Error('Missing FIREBASE_ADMIN_* credentials.');
  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const usersByEmail = new Map();
  usersSnap.docs.forEach((docSnap)=>{
    const data = docSnap.data() || {};
    const email = normalizeEmail(data.email ?? docSnap.id);
    if (!email) return;
    const existing = usersByEmail.get(email);
    const candidate = {
      email,
      position: normalizePosition(data.position),
      managerEmail: normalizeEmail(data.managerEmail),
      commissionMode: normalizeMode(data.commissionMode),
      positionTimeline: data.positionTimeline,
      docId: docSnap.id,
    };
    if (!existing) {
      usersByEmail.set(email, candidate);
      return;
    }
    const canonical = docSnap.id.toLowerCase() === email;
    const existingTl = parsePositionTimeline(existing.positionTimeline).length;
    const candTl = parsePositionTimeline(candidate.positionTimeline).length;
    if (canonical || !existing.position) existing.position = candidate.position;
    if (canonical || !existing.managerEmail) existing.managerEmail = candidate.managerEmail;
    if (canonical || !existing.commissionMode) existing.commissionMode = candidate.commissionMode;
    if (candTl > 0 && (canonical || existingTl === 0)) existing.positionTimeline = candidate.positionTimeline;
  });

  const ref = db.doc(TARGET_PATH);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Target contract not found');
  const entry = snap.data() || {};

  const signedDateIso = toIsoDay(entry.contractSignedDate);
  const ownerEmail = normalizeEmail(entry.userEmail);
  if (!signedDateIso || !ownerEmail) throw new Error('Missing signed date or owner email');

  const ownerData = usersByEmail.get(ownerEmail);
  const ownerPosExpected = resolvePositionForSignedDate(ownerData, signedDateIso, normalizePosition(entry.position));
  const ownerResExpected = computeItemsForEntry(entry, ownerPosExpected, normalizeMode(entry.commissionMode), entryCalculationAmount(entry));
  const ownerItemsExpected = normalizeItems(ownerResExpected?.items ?? []);
  const ownerTotalExpected = normalizeAmount(ownerResExpected?.total ?? 0);

  const chainExpected = buildManagerChain(entry, usersByEmail, signedDateIso);
  const overridesExpected = computeManagerOverrides(entry, chainExpected, ownerPosExpected);

  const storedItems = normalizeItems(Array.isArray(entry.items) ? entry.items : []);
  const storedTotal = normalizeAmount(entry.total ?? 0);

  const viewer = normalizeEmail(VIEWER_EMAIL);
  const storedOverrides = Array.isArray(entry.managerOverrides) ? entry.managerOverrides : [];
  const storedViewerOverride = storedOverrides.find((o)=>normalizeEmail(o.email) === viewer) ?? null;
  const expectedViewerOverride = overridesExpected.find((o)=>normalizeEmail(o.email) === viewer) ?? null;

  const storedViewerItems = normalizeItems(storedViewerOverride?.items ?? []);
  const expectedViewerItems = normalizeItems(expectedViewerOverride?.items ?? []);
  const storedViewerTotal = normalizeAmount(storedViewerOverride?.total ?? 0);
  const expectedViewerTotal = normalizeAmount(expectedViewerOverride?.total ?? 0);

  const diffItems = (aItems, bItems) => {
    const a = itemsToMap(aItems);
    const b = itemsToMap(bItems);
    const keys = new Set([...a.keys(), ...b.keys()]);
    const out = [];
    for (const k of keys) {
      const av = a.get(k) ?? 0;
      const bv = b.get(k) ?? 0;
      if (Math.abs(av - bv) > 0.000001) {
        out.push({ title: k, stored: av, expected: bv });
      }
    }
    return out;
  };

  const ownerItemDiffs = diffItems(storedItems, ownerItemsExpected);
  const viewerItemDiffs = diffItems(storedViewerItems, expectedViewerItems);

  console.log(JSON.stringify({
    contractNumber: entry.contractNumber,
    path: TARGET_PATH,
    signedDateIso,
    owner: {
      storedPosition: normalizePosition(entry.position),
      expectedPosition: ownerPosExpected,
      storedTotal,
      expectedTotal: ownerTotalExpected,
      totalsMatch: Math.abs(storedTotal - ownerTotalExpected) <= 0.000001,
      itemsMatch: ownerItemDiffs.length === 0,
      itemDiffs: ownerItemDiffs,
    },
    viewerOverride: {
      viewerEmail: viewer,
      storedPosition: normalizePosition(storedViewerOverride?.position),
      expectedPosition: normalizePosition(expectedViewerOverride?.position),
      storedTotal: storedViewerTotal,
      expectedTotal: expectedViewerTotal,
      totalsMatch: Math.abs(storedViewerTotal - expectedViewerTotal) <= 0.000001,
      itemsMatch: viewerItemDiffs.length === 0,
      itemDiffs: viewerItemDiffs,
    },
    storedHeaderPosition: normalizePosition(entry.managerPositionSnapshot),
    expectedHeaderPosition: normalizePosition(chainExpected[0]?.position),
  }, null, 2));
})();
