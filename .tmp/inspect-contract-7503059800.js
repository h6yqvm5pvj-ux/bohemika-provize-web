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

(async () => {
  const creds = loadCredentials();
  if (!creds) throw new Error('Missing creds');
  const app = getApps()[0] ?? initializeApp({ credential: cert(creds) });
  const db = getFirestore(app);
  const ref = db.doc('users/valerij.zlatnik@bohemika.eu/entries/YadnTDheGElwX3GZky9q');
  const snap = await ref.get();
  if (!snap.exists) throw new Error('not found');
  const d = snap.data() || {};
  const toDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v?.toDate === 'function') return v.toDate();
    const dd = new Date(v);
    return Number.isNaN(dd.getTime()) ? null : dd;
  };
  const iso = (v) => {
    const d = toDate(v);
    if (!d) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2,'0');
    const day = String(d.getUTCDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  };

  const managerChain = Array.isArray(d.managerChain) ? d.managerChain : [];
  const managerOverrides = Array.isArray(d.managerOverrides) ? d.managerOverrides : [];

  console.log(JSON.stringify({
    path: ref.path,
    contractNumber: d.contractNumber,
    entryType: d.entryType,
    productKey: d.productKey,
    frequencyRaw: d.frequencyRaw,
    durationYears: d.durationYears,
    contractSignedDateIso: iso(d.contractSignedDate),
    position: d.position,
    commissionMode: d.commissionMode,
    inputAmount: d.inputAmount,
    calculationInputAmount: d.calculationInputAmount,
    effectiveInputAmount: d.effectiveInputAmount,
    total: d.total,
    itemsCount: Array.isArray(d.items) ? d.items.length : 0,
    managerEmailSnapshot: d.managerEmailSnapshot,
    managerPositionSnapshot: d.managerPositionSnapshot,
    managerChainCount: managerChain.length,
    managerOverridesCount: managerOverrides.length,
    managerChainTop3: managerChain.slice(0,3),
  }, null, 2));
})();
