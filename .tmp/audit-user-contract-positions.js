const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

loadEnvConfig(process.cwd());

const POSITION_ORDER = [
  'poradce1','poradce2','poradce3','poradce4','poradce5','poradce6','poradce7','poradce8','poradce9','poradce10',
  'manazer4','manazer5','manazer6','manazer7','manazer8','manazer9','manazer10',
];
const POSITION_SET = new Set(POSITION_ORDER);
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

function normalizeEmail(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return s || null;
}

function normalizePosition(v) {
  if (typeof v !== 'string') return null;
  return POSITION_SET.has(v) ? v : null;
}

function isIsoDay(value) {
  if (!ISO_DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime());
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
  if (typeof value === 'string' && isIsoDay(value.trim())) return value.trim();
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
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const pos = normalizePosition(item.position);
    const validFrom = typeof item.validFrom === 'string' ? item.validFrom.trim() : '';
    const validToRaw = typeof item.validTo === 'string' ? item.validTo.trim() : '';
    const validTo = validToRaw || null;
    if (!pos) return;
    if (!isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;
    rows.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `timeline_${i}`,
      position: pos,
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

function resolvePositionTimelineMatch(signedDateIso, timeline) {
  if (!isIsoDay(signedDateIso) || timeline.length === 0) return null;
  const candidates = timeline.filter((row) => {
    if (row.validFrom > signedDateIso) return false;
    if (row.validTo && signedDateIso >= row.validTo) return false;
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

function parseArgValue(args, key, defaultValue = null) {
  const pref = `${key}=`;
  const inline = args.find((a) => a.startsWith(pref));
  if (inline) return inline.slice(pref.length);
  const idx = args.indexOf(key);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return defaultValue;
}

async function main() {
  const args = process.argv.slice(2);
  const email = normalizeEmail(parseArgValue(args, '--email', null));
  if (!email) throw new Error('Missing --email');

  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const candidateDocs = [];

  usersSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const normalized = normalizeEmail(data.email ?? docSnap.id);
    if (normalized !== email) return;
    candidateDocs.push({
      docId: docSnap.id,
      email: normalized,
      managerEmail: normalizeEmail(data.managerEmail),
      position: normalizePosition(data.position),
      parsedTimeline: parsePositionTimeline(data.positionTimeline),
      rawTimeline: data.positionTimeline,
    });
  });

  if (candidateDocs.length === 0) {
    console.log(`User profile not found for ${email}`);
    return;
  }

  const canonicalDoc = candidateDocs.find((d) => d.docId.toLowerCase() === email) ?? candidateDocs[0];
  let profile = canonicalDoc;
  const timelineCandidate = candidateDocs.find((d) => d.parsedTimeline.length > 0);
  if (timelineCandidate) {
    profile = {
      ...profile,
      parsedTimeline: timelineCandidate.parsedTimeline,
      rawTimeline: timelineCandidate.rawTimeline,
    };
  }

  const ownerDocIds = Array.from(new Set(candidateDocs.map((d) => d.docId)));

  let scannedContracts = 0;
  let missingSignedDate = 0;
  let unresolvedTimeline = 0;
  const mismatches = [];

  for (const ownerDocId of ownerDocIds) {
    const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();
    for (const entryDoc of entriesSnap.docs) {
      const entry = entryDoc.data() || {};
      const entryType = typeof entry.entryType === 'string' ? entry.entryType : 'contract';
      if (entryType !== 'contract') continue;

      scannedContracts += 1;
      const signedDateIso = toIsoDay(entry.contractSignedDate);
      if (!signedDateIso) {
        missingSignedDate += 1;
        continue;
      }

      const match = resolvePositionTimelineMatch(signedDateIso, profile.parsedTimeline);
      if (!match?.position) {
        unresolvedTimeline += 1;
        continue;
      }

      const storedPosition = normalizePosition(entry.position);
      if (storedPosition !== match.position) {
        mismatches.push({
          path: `users/${ownerDocId}/entries/${entryDoc.id}`,
          contractNumber:
            typeof entry.contractNumber === 'string' && entry.contractNumber.trim().length > 0
              ? entry.contractNumber.trim()
              : '—',
          signedDateIso,
          storedPosition,
          expectedPosition: match.position,
          timelineWindow: `${match.validFrom} -> ${match.validTo ?? 'open'}`,
        });
      }
    }
  }

  console.log(`User: ${email}`);
  console.log(`Profile docs: ${ownerDocIds.join(', ')}`);
  console.log(`Timeline rows used: ${profile.parsedTimeline.length}`);
  console.log(`Scanned contract entries: ${scannedContracts}`);
  console.log(`Missing contractSignedDate: ${missingSignedDate}`);
  console.log(`Timeline unresolved for signed date: ${unresolvedTimeline}`);
  console.log(`Position mismatches: ${mismatches.length}`);

  if (mismatches.length > 0) {
    console.log('\nMismatches (all):');
    mismatches.forEach((item) => {
      console.log(
        `- ${item.path} | c=${item.contractNumber} | signed=${item.signedDateIso} | stored=${item.storedPosition ?? 'null'} | expected=${item.expectedPosition} | timeline=${item.timelineWindow}`
      );
    });
  }
}

main().catch((err) => {
  console.error('Audit failed:', err?.message ?? err);
  process.exit(1);
});
