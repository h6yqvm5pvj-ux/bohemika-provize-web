const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

loadEnvConfig(process.cwd());

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
    } catch {
      // fallback
    }
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
  if (value === 'standard' || value === 'accelerated') return value;
  return null;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value !== null && typeof value.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDay(value) {
  if (typeof value === 'string') {
    const s = value.trim();
    if (ISO_DAY_RE.test(s)) return s;
  }
  const d = toDate(value);
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
    const validFrom = typeof item.validFrom === 'string' ? item.validFrom.trim() : '';
    const validToRaw = typeof item.validTo === 'string' ? item.validTo.trim() : '';
    const validTo = validToRaw || null;
    const position = typeof item.position === 'string' ? item.position.trim() : '';
    if (!position || !ISO_DAY_RE.test(validFrom)) return;
    if (validTo && !ISO_DAY_RE.test(validTo)) return;
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
  if (!signedDate || !ISO_DAY_RE.test(signedDate) || timeline.length === 0) return null;

  const matches = timeline.filter((row) => {
    if (row.validFrom > signedDate) return false;
    if (row.validTo && signedDate >= row.validTo) return false;
    return true;
  });

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return b.validFrom.localeCompare(a.validFrom);
    const aTo = a.validTo ?? '9999-12-31';
    const bTo = b.validTo ?? '9999-12-31';
    return bTo.localeCompare(aTo);
  });

  return matches[0] ?? null;
}

function resolvePositionForSignedDate(userData, signedDateIso, fallbackPosition) {
  const timeline = parsePositionTimeline(userData?.positionTimeline);
  const match = resolvePositionTimelineMatch(signedDateIso, timeline);
  return match?.position ?? userData?.position ?? fallbackPosition ?? null;
}

function chooseUserRecord(existing, candidate) {
  if (!existing) {
    return {
      email: candidate.email,
      docIds: [candidate.docId],
      managerEmail: candidate.managerEmail,
      position: candidate.position,
      commissionMode: candidate.commissionMode,
      positionTimeline: candidate.positionTimeline,
    };
  }

  if (!existing.docIds.includes(candidate.docId)) {
    existing.docIds.push(candidate.docId);
  }

  const isCanonical = candidate.docId.toLowerCase() === candidate.email;
  if (isCanonical || !existing.managerEmail) existing.managerEmail = candidate.managerEmail;
  if (isCanonical || !existing.position) existing.position = candidate.position;
  if (isCanonical || !existing.commissionMode) existing.commissionMode = candidate.commissionMode;

  const existingTimeline = parsePositionTimeline(existing.positionTimeline);
  const candidateTimeline = parsePositionTimeline(candidate.positionTimeline);
  if (candidateTimeline.length > 0 && (isCanonical || existingTimeline.length === 0)) {
    existing.positionTimeline = candidate.positionTimeline;
  }

  return existing;
}

function buildChain({
  directManagerEmail,
  signedDateIso,
  usersByEmail,
  firstPositionFallback,
  firstModeFallback,
}) {
  const chain = [];
  const visited = new Set();
  let current = normalizeEmail(directManagerEmail);
  let depth = 0;

  while (current && depth < 9 && !visited.has(current)) {
    visited.add(current);
    const userData = usersByEmail.get(current) ?? null;

    const resolvedPositionFromUser = resolvePositionForSignedDate(
      userData,
      signedDateIso,
      null
    );
    const resolvedPosition =
      (depth === 0 ? firstPositionFallback : null) ??
      resolvedPositionFromUser ??
      null;

    const resolvedMode =
      (depth === 0 ? firstModeFallback : null) ??
      (userData?.commissionMode ?? null) ??
      null;

    chain.push({
      email: current,
      position: resolvedPosition,
      commissionMode: resolvedMode,
    });

    current = userData?.managerEmail ?? null;
    depth += 1;
  }

  return chain;
}

function normalizeChain(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      email: normalizeEmail(row.email),
      position: typeof row.position === 'string' ? row.position : null,
      commissionMode: normalizeMode(row.commissionMode),
    }))
    .filter((row) => !!row.email);
}

function buildAllowedEmails(existingAllowed, ownerEmail, managerChain) {
  const set = new Set();
  const push = (value) => {
    const email = normalizeEmail(value);
    if (email) set.add(email);
  };

  if (Array.isArray(existingAllowed)) {
    existingAllowed.forEach((item) => push(item));
  }
  push(ownerEmail);
  managerChain.forEach((row) => push(row.email));

  return Array.from(set).sort();
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const contractNumbers = args.filter((arg) => arg !== '--apply');

  if (contractNumbers.length === 0) {
    throw new Error('Pass contract numbers, e.g. node script.js 3952970377 5519379662 [--apply]');
  }

  const targetSet = new Set(contractNumbers.map((v) => String(v).trim()).filter(Boolean));
  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const usersByEmail = new Map();

  usersSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const email = normalizeEmail(data.email ?? docSnap.id);
    if (!email) return;

    const candidate = {
      email,
      docId: docSnap.id,
      managerEmail: normalizeEmail(data.managerEmail),
      position: typeof data.position === 'string' ? data.position : null,
      commissionMode: normalizeMode(data.commissionMode),
      positionTimeline: data.positionTimeline,
    };

    const existing = usersByEmail.get(email);
    usersByEmail.set(email, chooseUserRecord(existing, candidate));
  });

  const entriesSnap = await db.collectionGroup('entries').get();

  const fixes = [];

  entriesSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const contractNumber = typeof data.contractNumber === 'string' ? data.contractNumber.trim() : '';
    if (!targetSet.has(contractNumber)) return;

    const currentChain = normalizeChain(data.managerChain);
    const ownerEmail = normalizeEmail(data.userEmail) ?? normalizeEmail(docSnap.ref.parent?.parent?.id);
    const owner = ownerEmail ? usersByEmail.get(ownerEmail) ?? null : null;

    const directManagerEmail =
      normalizeEmail(data.managerEmailSnapshot) ?? owner?.managerEmail ?? null;

    if (!directManagerEmail) {
      fixes.push({
        path: docSnap.ref.path,
        contractNumber,
        status: 'skip_no_manager',
      });
      return;
    }

    const signedDateIso = toIsoDay(data.contractSignedDate);

    let nextChain = currentChain;
    if (currentChain.length === 0) {
      nextChain = buildChain({
        directManagerEmail,
        signedDateIso,
        usersByEmail,
        firstPositionFallback: typeof data.managerPositionSnapshot === 'string' ? data.managerPositionSnapshot : null,
        firstModeFallback: normalizeMode(data.managerModeSnapshot),
      });
    }

    if (nextChain.length === 0) {
      nextChain = [
        {
          email: directManagerEmail,
          position:
            typeof data.managerPositionSnapshot === 'string'
              ? data.managerPositionSnapshot
              : null,
          commissionMode: normalizeMode(data.managerModeSnapshot),
        },
      ];
    }

    const first = nextChain[0] ?? null;
    const nextManagerEmailSnapshot = first?.email ?? directManagerEmail;
    const nextManagerPositionSnapshot =
      first?.position ??
      (typeof data.managerPositionSnapshot === 'string' ? data.managerPositionSnapshot : null);
    const nextManagerModeSnapshot =
      first?.commissionMode ?? normalizeMode(data.managerModeSnapshot) ?? null;

    const nextAllowedEmails = buildAllowedEmails(data.allowedEmails, ownerEmail, nextChain);

    const needsUpdate =
      currentChain.length === 0 ||
      normalizeEmail(data.managerEmailSnapshot) !== nextManagerEmailSnapshot ||
      (typeof data.managerPositionSnapshot === 'string' ? data.managerPositionSnapshot : null) !==
        nextManagerPositionSnapshot ||
      normalizeMode(data.managerModeSnapshot) !== nextManagerModeSnapshot;

    if (!needsUpdate) {
      fixes.push({
        path: docSnap.ref.path,
        contractNumber,
        status: 'ok_already_consistent',
      });
      return;
    }

    fixes.push({
      path: docSnap.ref.path,
      ref: docSnap.ref,
      contractNumber,
      status: 'update',
      previousChainLen: currentChain.length,
      nextChainLen: nextChain.length,
      nextManagerEmailSnapshot,
      nextManagerPositionSnapshot,
      nextManagerModeSnapshot,
      nextAllowedEmailsLen: nextAllowedEmails.length,
      payload: {
        managerEmailSnapshot: nextManagerEmailSnapshot,
        managerPositionSnapshot: nextManagerPositionSnapshot,
        managerModeSnapshot: nextManagerModeSnapshot,
        managerChain: nextChain,
        allowedEmails: nextAllowedEmails,
      },
    });
  });

  const found = fixes.length;
  const updates = fixes.filter((f) => f.status === 'update');

  console.log(`Target contracts: ${Array.from(targetSet).join(', ')}`);
  console.log(`Matched docs: ${found}`);
  console.log(`Docs to update: ${updates.length}`);

  fixes.forEach((row) => {
    if (row.status === 'update') {
      console.log(
        `- UPDATE ${row.path} | contract=${row.contractNumber} | chain ${row.previousChainLen} -> ${row.nextChainLen} | manager=${row.nextManagerEmailSnapshot} (${row.nextManagerPositionSnapshot ?? 'null'}, ${row.nextManagerModeSnapshot ?? 'null'}) | allowed=${row.nextAllowedEmailsLen}`
      );
      return;
    }

    console.log(`- ${row.status.toUpperCase()} ${row.path} | contract=${row.contractNumber}`);
  });

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write updates.');
    return;
  }

  if (updates.length === 0) {
    console.log('No updates to apply.');
    return;
  }

  let batch = db.batch();
  let opsInBatch = 0;

  updates.forEach((item) => {
    batch.set(item.ref, item.payload, { merge: true });
    opsInBatch += 1;

    if (opsInBatch >= 400) {
      throw new Error('Unexpectedly high update count for targeted fix.');
    }
  });

  if (opsInBatch > 0) {
    await batch.commit();
    console.log(`Applied updates: ${opsInBatch}`);
  }
}

main().catch((err) => {
  console.error('Fix failed:', err?.message ?? err);
  process.exit(1);
});
