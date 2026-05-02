const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

loadEnvConfig(process.cwd());

const AUTO_PRODUCTS = new Set([
  'cppAuto',
  'slaviaauto',
  'allianzAuto',
  'csobAuto',
  'uniqaAuto',
  'uniqaflotila',
  'pillowAuto',
  'kooperativaAuto',
]);

const USED_EXACT = new Set([
  'TovarniZnacka','Znacka','ZnackaVozidla',
  'ObchodniOznaceni','Model','Typ',
  'VozidloKaroserieBarva','Barva','BarvaVozidla',
  'DatumPrvniRegistrace','PrvniRegistrace',
  'DatumPrvniRegistraceVCr','PrvniRegistraceVCr',
  'RokVyroby','VozidloRokVyroby',
  'StkDo','STKDo','DatumStkDo','TechnickaProhlidkaDo','PlatnostStkDo',
  'MotorMaxVykon','Vykon','MaxVykon',
  'MotorZdvihObjem','ZdvihovyObjem','ObjemMotoru',
  'HmotnostiProvozni','ProvozniHmotnost',
  'HmotnostiPripPov','HmotnostiPripPovJS','NejvetsiPovolenaHmotnost',
  'Delka','VozidloDelka','RozmeryDelka','DelkaVozidla',
  'Sirka','VozidloSirka','RozmerySirka','SirkaVozidla',
  'Vyska','VozidloVyska','RozmeryVyska','VyskaVozidla',
  'Rozvor','RozvorNaprav','VozidloRozvor',
  'Palivo','DruhPaliva',
  'EmisniNorma','EmisniLimit','EuroNorma',
  'Spotreba','SpotrebaKomb','SpotrebaKombinovana',
  'Kategorie','KategorieVozidla',
  'DruhVozidla',
  'VozidloKaroserieMist','PocetMist',
  'VozidloHybridni','Hybridni',
  'VozidloElektricke','Elektricke',
  'CisloTp','CisloTP',
  'CisloOrv','CisloORV',
  'TypMotoru','MotorTyp',
  'CisloMotoru','KodMotoru',
  'MotorVyrobce','VyrobceMotoru',
  'EmiseCo2Komb','Co2','CO2',
  'Hluk','HlukJizda',
  'PripojneBrzdene','PripojneBrzdeneKg',
  'PripojneNebrzd','PripojneNebrzdene','PripojneNebrzdeneKg',
  'VozidloStav','StavVozidla','StatusVozidla','Provozovane','VozidloProvozovane',
  'VozidloUcel','PocetVlastniku','PocetProvozovatelu'
]);

const PATTERN_KEYS = ['pneu', 'pneumatik'];

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

function normalizeVin(value) {
  if (typeof value !== 'string') return null;
  const vin = value.trim().toUpperCase().replace(/\s+/g, '');
  if (vin.length < 11 || vin.length > 25) return null;
  if (!/^[A-HJ-NPR-Z0-9]+$/.test(vin)) return null;
  return vin;
}

function hasVisibleValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return false;
    if (s === '-' || s === '/' || s === '/ /' || s === '/ ; / ;') return false;
    return true;
  }
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function summarizeValue(value) {
  if (value == null) return 'null';
  if (typeof value === 'string') {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') return `Object(${Object.keys(value).length})`;
  return String(value);
}

function isUiKey(key) {
  if (USED_EXACT.has(key)) return true;
  const lower = key.toLowerCase();
  return PATTERN_KEYS.some((p) => lower.includes(p));
}

async function createIdToken({ firebaseApiKey, adminAuth }) {
  const testEmail = process.env.RSV_DEBUG_EMAIL || 'jakub.rauscher@bohemika.eu';
  const customToken = await adminAuth.createCustomToken('codex-rsv-global-audit', {
    email: testEmail,
    email_verified: true,
  });

  const signInResp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  const signInJson = await signInResp.json().catch(() => ({}));
  if (!signInResp.ok || !signInJson.idToken) {
    throw new Error(`Failed signInWithCustomToken: HTTP ${signInResp.status} ${JSON.stringify(signInJson)}`);
  }
  return signInJson.idToken;
}

async function lookupRsv(rsvUrl, idToken, vin) {
  const resp = await fetch(`${rsvUrl}?vin=${encodeURIComponent(vin)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { ok: false, status: resp.status, error: json?.error || json?.message || json?.detail || 'lookup failed' };
  }
  return { ok: true, payload: json };
}

async function main() {
  const limitArg = Number(process.argv[2] || 120);
  const maxVin = Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : 120;

  const creds = loadCredentials();
  if (!creds) throw new Error('Missing FIREBASE_ADMIN credentials');
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!firebaseApiKey) throw new Error('Missing NEXT_PUBLIC_FIREBASE_API_KEY');
  const rsvUrl = process.env.NEXT_PUBLIC_RSV_LOOKUP_URL || 'https://europe-central2-bohemikasmlouvy.cloudfunctions.net/rsvVehicleLookup';

  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);
  const adminAuth = getAuth(app);

  const usersSnap = await db.collection('users').get();
  const userDocIds = usersSnap.docs.map((d) => d.id);

  const vins = new Set();
  let scannedEntries = 0;
  for (const userDocId of userDocIds) {
    const entriesSnap = await db.collection('users').doc(userDocId).collection('entries').get();
    for (const entrySnap of entriesSnap.docs) {
      scannedEntries += 1;
      const d = entrySnap.data() || {};
      const entryType = typeof d.entryType === 'string' ? d.entryType : 'contract';
      if (entryType !== 'contract') continue;
      if (!AUTO_PRODUCTS.has(d.productKey)) continue;
      const vin = normalizeVin(d.carVin);
      if (vin) vins.add(vin);
    }
  }

  const vinList = Array.from(vins).slice(0, maxVin);
  const idToken = await createIdToken({ firebaseApiKey, adminAuth });

  const stats = new Map();
  const failed = [];
  let okCount = 0;

  for (let i = 0; i < vinList.length; i += 1) {
    const vin = vinList[i];
    const out = await lookupRsv(rsvUrl, idToken, vin);
    if (!out.ok) {
      failed.push({ vin, status: out.status, error: out.error });
      continue;
    }

    const data = out.payload?.payload?.Data;
    if (!data || typeof data !== 'object') {
      failed.push({ vin, status: 200, error: 'missing payload.Data' });
      continue;
    }

    okCount += 1;

    for (const [key, value] of Object.entries(data)) {
      if (!stats.has(key)) {
        stats.set(key, {
          key,
          seenCount: 0,
          nonEmptyCount: 0,
          samples: [],
          uiUsed: isUiKey(key),
        });
      }
      const row = stats.get(key);
      row.seenCount += 1;
      if (hasVisibleValue(value)) {
        row.nonEmptyCount += 1;
        if (row.samples.length < 3) {
          const sample = summarizeValue(value);
          if (!row.samples.includes(sample)) row.samples.push(sample);
        }
      }
    }
  }

  const allKeys = Array.from(stats.values());
  const hidden = allKeys.filter((r) => !r.uiUsed);
  const hiddenNonEmpty = hidden.filter((r) => r.nonEmptyCount > 0);

  hiddenNonEmpty.sort((a, b) => {
    if (b.nonEmptyCount !== a.nonEmptyCount) return b.nonEmptyCount - a.nonEmptyCount;
    return a.key.localeCompare(b.key, 'cs');
  });

  console.log(`SCANNED_ENTRIES=${scannedEntries}`);
  console.log(`UNIQUE_AUTO_VINS_IN_PORTFOLIO=${vins.size}`);
  console.log(`AUDITED_VINS=${vinList.length}`);
  console.log(`RSV_SUCCESS=${okCount}`);
  console.log(`RSV_FAILED=${failed.length}`);
  console.log(`UNION_KEYS=${allKeys.length}`);
  console.log(`UI_USED_KEYS_IN_UNION=${allKeys.filter((r) => r.uiUsed).length}`);
  console.log(`HIDDEN_KEYS_IN_UNION=${hidden.length}`);
  console.log(`HIDDEN_KEYS_WITH_NON_EMPTY_VALUE=${hiddenNonEmpty.length}`);

  console.log('--- TOP HIDDEN KEYS (NON_EMPTY_COUNT DESC) ---');
  for (const row of hiddenNonEmpty) {
    const rate = okCount > 0 ? ((row.nonEmptyCount / okCount) * 100).toFixed(1) : '0.0';
    console.log(`${row.key} | nonEmpty=${row.nonEmptyCount}/${okCount} (${rate}%) | sample=${row.samples.join(' || ')}`);
  }

  if (failed.length) {
    console.log('--- FAILED VIN LOOKUPS (first 20) ---');
    failed.slice(0, 20).forEach((f) => {
      console.log(`${f.vin} | HTTP ${f.status} | ${f.error}`);
    });
  }
}

main().catch((err) => {
  console.error('ERROR', err?.message || err);
  process.exit(1);
});
