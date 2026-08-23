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

function resolvePositionForSignedDate(userData, signedDateIso) {
  if (!userData || !signedDateIso) return { position: null, source: 'missing-user-or-date' };
  const timeline = userData.parsedTimeline ?? [];
  const match = resolvePositionTimelineMatch(signedDateIso, timeline);
  if (match?.position) return { position: match.position, source: 'timeline' };
  if (timeline.length > 0) return { position: null, source: 'timeline-gap' };
  return { position: null, source: 'no-timeline' };
}

function parseArgValue(args, key, defaultValue = null) {
  const pref = `${key}=`;
  const inline = args.find((a) => a.startsWith(pref));
  if (inline) return inline.slice(pref.length);
  const idx = args.indexOf(key);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return defaultValue;
}

function collectSubordinates(managerEmail, childrenByManager) {
  const out = [];
  const visited = new Set();
  const queue = [...(childrenByManager.get(managerEmail) ?? [])];
  while (queue.length) {
    const e = queue.shift();
    if (!e || visited.has(e)) continue;
    visited.add(e);
    out.push(e);
    const kids = childrenByManager.get(e) ?? [];
    kids.forEach((k) => {
      if (!visited.has(k)) queue.push(k);
    });
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const owner = normalizeEmail(parseArgValue(args, '--owner', null));
  const manager = normalizeEmail(parseArgValue(args, '--manager', 'jakub.rauscher@bohemika.eu'));
  if (!owner && !manager) throw new Error('Missing --owner or --manager');

  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const usersByEmail = new Map();

  usersSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const normalized = normalizeEmail(data.email ?? docSnap.id);
    if (!normalized) return;

    const parsedTimeline = parsePositionTimeline(data.positionTimeline);
    const candidate = {
      email: normalized,
      docId: docSnap.id,
      managerEmail: normalizeEmail(data.managerEmail),
      position: normalizePosition(data.position),
      parsedTimeline,
      rawTimeline: data.positionTimeline,
    };

    const existing = usersByEmail.get(normalized);
    if (!existing) {
      usersByEmail.set(normalized, {
        ...candidate,
        docIds: [docSnap.id],
      });
      return;
    }

    if (!existing.docIds.includes(docSnap.id)) existing.docIds.push(docSnap.id);

    const candidateCanonical = docSnap.id.toLowerCase() === normalized;
    const existingTimelineLen = existing.parsedTimeline?.length ?? 0;
    const candidateTimelineLen = candidate.parsedTimeline.length;

    if (candidateCanonical || !existing.managerEmail) existing.managerEmail = candidate.managerEmail;
    if (candidateCanonical || !existing.position) existing.position = candidate.position;
    if (candidateTimelineLen > 0 && (candidateCanonical || existingTimelineLen === 0)) {
      existing.parsedTimeline = candidate.parsedTimeline;
      existing.rawTimeline = candidate.rawTimeline;
    }
  });

  const childrenByManager = new Map();
  usersByEmail.forEach((u) => {
    if (!u.managerEmail) return;
    const arr = childrenByManager.get(u.managerEmail) ?? [];
    arr.push(u.email);
    childrenByManager.set(u.managerEmail, Array.from(new Set(arr)));
  });

  const subordinateEmails = owner ? [owner] : collectSubordinates(manager, childrenByManager);
  if (subordinateEmails.length === 0) {
    console.log(`No subordinates for ${manager}.`);
    return;
  }

  let scannedContracts = 0;
  let missingSignedDate = 0;
  let unresolvedOwnerTimeline = 0;
  let unresolvedManagerNodeTimeline = 0;

  const ownerMismatches = [];
  const managerNodeMismatches = [];
  const managerSnapshotMismatches = [];

  for (const ownerEmail of subordinateEmails) {
    const ownerData = usersByEmail.get(ownerEmail) ?? null;
    const ownerDocIds = ownerData?.docIds?.length ? ownerData.docIds : [ownerEmail];

    for (const ownerDocId of ownerDocIds) {
      const entriesSnap = await db.collection('users').doc(ownerDocId).collection('entries').get();

      for (const entrySnap of entriesSnap.docs) {
        const entry = entrySnap.data() || {};
        const entryType = typeof entry.entryType === 'string' ? entry.entryType : 'contract';
        if (entryType !== 'contract') continue;

        scannedContracts += 1;

        const signedDateIso = toIsoDay(entry.contractSignedDate);
        if (!signedDateIso) {
          missingSignedDate += 1;
          continue;
        }

        const ownerExpected = resolvePositionForSignedDate(ownerData, signedDateIso);
        const storedOwnerPos = normalizePosition(entry.position);

        if (!ownerExpected.position) {
          unresolvedOwnerTimeline += 1;
        } else if (storedOwnerPos !== ownerExpected.position) {
          ownerMismatches.push({
            path: `users/${ownerDocId}/entries/${entrySnap.id}`,
            contract: typeof entry.contractNumber === 'string' ? entry.contractNumber : '—',
            signedDateIso,
            stored: storedOwnerPos,
            expected: ownerExpected.position,
          });
        }

        const chainRaw = Array.isArray(entry.managerChain) ? entry.managerChain : [];
        const chain = chainRaw
          .filter((n) => n && typeof n === 'object')
          .map((n) => ({
            email: normalizeEmail(n.email),
            position: normalizePosition(n.position),
          }))
          .filter((n) => !!n.email);

        chain.forEach((node, idx) => {
          const mgrData = usersByEmail.get(node.email);
          const expected = resolvePositionForSignedDate(mgrData, signedDateIso);
          if (!expected.position) {
            unresolvedManagerNodeTimeline += 1;
            return;
          }

          if (node.position !== expected.position) {
            managerNodeMismatches.push({
              path: `users/${ownerDocId}/entries/${entrySnap.id}`,
              contract: typeof entry.contractNumber === 'string' ? entry.contractNumber : '—',
              signedDateIso,
              nodeEmail: node.email,
              stored: node.position,
              expected: expected.position,
              idx,
            });
          }

          if (idx === 0) {
            const snapPos = normalizePosition(entry.managerPositionSnapshot);
            if (snapPos !== expected.position) {
              managerSnapshotMismatches.push({
                path: `users/${ownerDocId}/entries/${entrySnap.id}`,
                contract: typeof entry.contractNumber === 'string' ? entry.contractNumber : '—',
                signedDateIso,
                managerEmail: node.email,
                storedSnapshot: snapPos,
                expected: expected.position,
              });
            }
          }
        });
      }
    }
  }

  console.log(owner ? `Owner: ${owner}` : `Manager: ${manager}`);
  console.log(`Subordinates: ${subordinateEmails.length}`);
  console.log(`Scanned contract entries: ${scannedContracts}`);
  console.log(`Missing contractSignedDate: ${missingSignedDate}`);
  console.log(`Owner timeline unresolved (no/gap timeline): ${unresolvedOwnerTimeline}`);
  console.log(`Manager node timeline unresolved (no/gap timeline): ${unresolvedManagerNodeTimeline}`);
  console.log(`Owner position mismatches: ${ownerMismatches.length}`);
  console.log(`Manager chain node mismatches: ${managerNodeMismatches.length}`);
  console.log(`Manager snapshot mismatches: ${managerSnapshotMismatches.length}`);

  const printSample = (title, arr, mapLine) => {
    if (!arr.length) return;
    console.log(`\n${title} (sample up to 20):`);
    arr.slice(0, 20).forEach((item) => console.log(mapLine(item)));
  };

  printSample(
    'Owner mismatches',
    ownerMismatches,
    (x) => `- ${x.path} | c=${x.contract} | signed=${x.signedDateIso} | stored=${x.stored ?? 'null'} | expected=${x.expected}`
  );

  printSample(
    'Manager chain mismatches',
    managerNodeMismatches,
    (x) => `- ${x.path} | c=${x.contract} | signed=${x.signedDateIso} | node=${x.nodeEmail} [${x.idx}] | stored=${x.stored ?? 'null'} | expected=${x.expected}`
  );

  printSample(
    'Manager snapshot mismatches',
    managerSnapshotMismatches,
    (x) => `- ${x.path} | c=${x.contract} | signed=${x.signedDateIso} | manager=${x.managerEmail} | storedSnap=${x.storedSnapshot ?? 'null'} | expected=${x.expected}`
  );
}

main().catch((err) => {
  console.error('Verification failed:', err?.message ?? err);
  process.exit(1);
});
