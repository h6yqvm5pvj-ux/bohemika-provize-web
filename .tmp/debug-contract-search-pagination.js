const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

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

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const normalizeEmail = (email) => (email ?? '').trim().toLowerCase();
const contractSortDate = (data) => toDate(data.contractSignedDate) ?? toDate(data.createdAt);
const contractCursorKey = (ownerEmail, docId) => `${normalizeEmail(ownerEmail)}___${docId}`;

async function fetchContractsForOwner({ db, owner, cursor, pageSize }) {
  const pageLimit = pageSize + 1;
  const collected = [];
  const seen = new Set();
  const cursorTs = cursor?.ts ?? null;
  const cursorKey = cursor?.key ?? null;

  const shouldIncludeByCursor = (data, docId) => {
    if (!cursorTs) return true;
    const sortDate = contractSortDate(data);
    if (!sortDate) return false;
    const ts = sortDate.getTime();
    if (ts < cursorTs) return true;
    if (ts > cursorTs) return false;
    if (!cursorKey) return false;
    const itemKey = contractCursorKey(owner, docId);
    return itemKey < cursorKey;
  };

  const push = (docSnap) => {
    const data = docSnap.data();
    if (!shouldIncludeByCursor(data, docSnap.id)) return;
    const key = `${owner}___${docSnap.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    collected.push({ id: docSnap.id, ...data });
  };

  let qBySigned = db
    .collection('users')
    .doc(owner)
    .collection('entries')
    .orderBy('contractSignedDate', 'desc');
  const qByCreated = db
    .collection('users')
    .doc(owner)
    .collection('entries')
    .orderBy('createdAt', 'desc');

  if (cursor) {
    qBySigned = qBySigned.where('contractSignedDate', '<=', cursor.date);
  }

  const [signedSnap, createdSnap] = await Promise.all([
    qBySigned.limit(pageLimit).get(),
    qByCreated.limit(pageLimit).get(),
  ]);

  const debugFindByContract = (snap, contractNumber) =>
    snap.docs.find((docSnap) => String(docSnap.data()?.contractNumber || "").trim() === contractNumber);

  signedSnap.docs.forEach(push);
  createdSnap.docs.forEach(push);

  collected.sort((a, b) => {
    const da = contractSortDate(a);
    const dbd = contractSortDate(b);
    if (!da && !dbd) return 0;
    if (!da) return 1;
    if (!dbd) return -1;
    const diff = dbd.getTime() - da.getTime();
    if (diff !== 0) return diff;
    const keyA = contractCursorKey(owner, a.id);
    const keyB = contractCursorKey(owner, b.id);
    if (keyA === keyB) return 0;
    return keyA > keyB ? -1 : 1;
  });

  const page = collected.slice(0, pageSize);
  const hasMore = collected.length > pageSize;
  const oldest = page.length ? contractSortDate(page[page.length - 1]) : null;
  const oldestKey = page.length ? contractCursorKey(owner, page[page.length - 1].id) : null;

  return {
    list: page,
    hasMore,
    nextCursor: oldest && oldestKey ? { date: oldest, ts: oldest.getTime(), key: oldestKey } : null,
    signedSize: signedSnap.size,
    createdSize: createdSnap.size,
    collectedSize: collected.length,
    _debugFindByContract: debugFindByContract,
    _signedSnap: signedSnap,
    _createdSnap: createdSnap,
  };
}

async function main() {
  const owner = (process.argv[2] || '').trim().toLowerCase();
  const targetContract = (process.argv[3] || '').trim();
  const maxPages = Number(process.argv[4] || 20);
  if (!owner || !targetContract) {
    throw new Error('Usage: node .tmp/debug-contract-search-pagination.js <ownerEmail> <contractNumber> [maxPages]');
  }

  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');
  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  let cursor = null;
  let page = 0;
  let found = false;
  while (page < maxPages) {
    page += 1;
    const res = await fetchContractsForOwner({ db, owner, cursor, pageSize: 30 });

    const idx = res.list.findIndex((x) => String(x.contractNumber || '').trim() === targetContract);
    const signedHitSnap = res._debugFindByContract(res._signedSnap, targetContract);
    const createdHitSnap = res._debugFindByContract(res._createdSnap, targetContract);
    const signedHitIncluded =
      signedHitSnap &&
      res.list.some((x) => x.id === signedHitSnap.id);
    const createdHitIncluded =
      createdHitSnap &&
      res.list.some((x) => x.id === createdHitSnap.id);
    const first = res.list[0];
    const last = res.list[res.list.length - 1];
    console.log(
      `page=${page} size=${res.list.length} signedSnap=${res.signedSize} createdSnap=${res.createdSize} collected=${res.collectedSize} hasMore=${res.hasMore} ` +
      `first=${first ? `${first.contractNumber || '?'}@${(contractSortDate(first) || new Date(0)).toISOString()}` : '-'} ` +
      `last=${last ? `${last.contractNumber || '?'}@${(contractSortDate(last) || new Date(0)).toISOString()}` : '-'} ` +
      `found=${idx >= 0 ? 'YES' : 'no'} ` +
      `targetInSignedSnap=${signedHitSnap ? 'yes' : 'no'} targetInCreatedSnap=${createdHitSnap ? 'yes' : 'no'} ` +
      `targetIncludedFromSigned=${signedHitIncluded ? 'yes' : 'no'} targetIncludedFromCreated=${createdHitIncluded ? 'yes' : 'no'}`
    );

    if (idx >= 0) {
      const hit = res.list[idx];
      console.log(`FOUND on page ${page}: id=${hit.id} contract=${hit.contractNumber} sortDate=${(contractSortDate(hit) || new Date(0)).toISOString()} createdAt=${toDate(hit.createdAt)?.toISOString() || 'null'}`);
      found = true;
      break;
    }

    if (!res.hasMore || !res.nextCursor) {
      break;
    }
    cursor = res.nextCursor;
  }

  console.log(`result: ${found ? 'FOUND' : 'NOT_FOUND'}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
