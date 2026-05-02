const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

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

function summarizeValue(value) {
  if (value == null) return 'null';
  if (typeof value === 'string') {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') return `Object(${Object.keys(value).length})`;
  return String(value);
}

async function main() {
  const vin = String(process.argv[2] || '').trim().toUpperCase();
  if (vin.length < 11) {
    throw new Error('Usage: node .tmp/inspect-rsv-extra-fields.js <VIN>');
  }

  const creds = loadCredentials();
  if (!creds) throw new Error('Missing FIREBASE_ADMIN credentials in .env.local');

  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!firebaseApiKey) throw new Error('Missing NEXT_PUBLIC_FIREBASE_API_KEY in .env.local');

  const rsvUrl =
    process.env.NEXT_PUBLIC_RSV_LOOKUP_URL ||
    'https://europe-central2-bohemikasmlouvy.cloudfunctions.net/rsvVehicleLookup';

  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const adminAuth = getAuth(app);
  const testEmail = process.env.RSV_DEBUG_EMAIL || 'jakub.rauscher@bohemika.eu';
  const customToken = await adminAuth.createCustomToken('codex-rsv-audit', {
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

  const idToken = signInJson.idToken;

  const lookupResp = await fetch(`${rsvUrl}?vin=${encodeURIComponent(vin)}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const lookupJson = await lookupResp.json().catch(() => ({}));
  if (!lookupResp.ok) {
    throw new Error(`RSV lookup failed: HTTP ${lookupResp.status} ${JSON.stringify(lookupJson)}`);
  }

  const payload = lookupJson?.payload ?? null;
  const data = payload?.Data && typeof payload.Data === 'object' ? payload.Data : null;
  if (!data) {
    throw new Error('No payload.Data in response');
  }

  const usedExact = new Set([
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
    'VyrobceMotoru',
    'EmiseCo2Komb','Co2','CO2',
    'Hluk','HlukJizda',
    'PripojneBrzdene','PripojneBrzdeneKg',
    'PripojneNebrzd','PripojneNebrzdene','PripojneNebrzdeneKg',
    'VozidloStav','StavVozidla','StatusVozidla','Provozovane','VozidloProvozovane'
  ]);

  const patternKeys = ['pneu', 'pneumatik'];

  const allEntries = Object.entries(data);
  const hidden = allEntries
    .filter(([key]) => {
      const lower = key.toLowerCase();
      if (usedExact.has(key)) return false;
      if (patternKeys.some((p) => lower.includes(p))) return false;
      return true;
    })
    .sort((a, b) => a[0].localeCompare(b[0], 'cs'));
  const hiddenNonNull = hidden.filter(([, value]) => value != null && String(value).trim() !== '');
  const hiddenNull = hidden.filter(([, value]) => value == null || String(value).trim() === '');

  console.log(`VIN=${vin}`);
  console.log(`RSV_URL=${rsvUrl}`);
  console.log(`TOTAL_KEYS_IN_DATA=${allEntries.length}`);
  console.log(`USED_OR_PATTERN_KEYS=${allEntries.length - hidden.length}`);
  console.log(`HIDDEN_KEYS=${hidden.length}`);
  console.log(`HIDDEN_NON_NULL=${hiddenNonNull.length}`);
  console.log(`HIDDEN_EMPTY_OR_NULL=${hiddenNull.length}`);
  console.log('--- HIDDEN ---');
  hidden.forEach(([key, value]) => {
    console.log(`${key} | ${summarizeValue(value)}`);
  });
}

main().catch((err) => {
  console.error('ERROR', err?.message || err);
  process.exit(1);
});
