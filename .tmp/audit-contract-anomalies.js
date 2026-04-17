const { loadEnvConfig } = require('@next/env');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

loadEnvConfig(process.cwd());

const CONTRACT_PRODUCTS = new Set([
  'neon','flexi','maximaMaxEfekt','pillowInjury','zamex','domex','koopmajetekobcan','maxdomov','cppsimplex',
  'cppAuto','slaviaauto','allianzAuto','csobAuto','uniqaAuto','pillowAuto','kooperativaAuto','cppcestovko','axacestovko','comfortcc','cppPPRs','cppPPRbez'
]);

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
  return v.length ? v : null;
}

function normalizeMode(value) {
  return value === 'standard' || value === 'accelerated' ? value : null;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value && typeof value.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(value) {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeTitle(title) {
  if (typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function isTotalRow(title) {
  return normalizeTitle(title).includes('celkem');
}

function itemMultiplier(title) {
  const norm = normalizeTitle(title);
  if (norm.includes('2.–5.')) return 4;
  if (norm.includes('5.–10.')) return 6;
  return 1;
}

function totalWithMultipliers(items) {
  if (!Array.isArray(items)) return null;
  const cleaned = items.filter((it) => !isTotalRow(it?.title));
  const hasYearly = cleaned.some((it) => normalizeTitle(it?.title).includes('provize za rok'));
  const source = hasYearly
    ? cleaned.filter((it) => normalizeTitle(it?.title).includes('provize za rok'))
    : cleaned;
  let sum = 0;
  source.forEach((it) => {
    const amount = toNum(it?.amount) ?? 0;
    sum += amount * itemMultiplier(it?.title);
  });
  return sum;
}

function countFractionDigits(n) {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  const i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
}

function isContract(entryType) {
  if (typeof entryType !== 'string') return true;
  const t = entryType.trim().toLowerCase();
  return t === 'contract';
}

function classifyIssues(entry, usersByEmail) {
  const issues = [];
  const data = entry.data;
  const ownerEmail = normalizeEmail(data.userEmail) ?? normalizeEmail(entry.ownerDocId);
  const ownerManager = ownerEmail ? usersByEmail.get(ownerEmail)?.managerEmail ?? null : null;

  const entryType = typeof data.entryType === 'string' ? data.entryType.trim().toLowerCase() : 'contract';
  const contractNumber = typeof data.contractNumber === 'string' ? data.contractNumber.trim() : '';
  const productKey = typeof data.productKey === 'string' ? data.productKey : null;

  if (entryType !== 'contract' && entryType !== 'endorsement') {
    issues.push({ code: 'entry_type_unknown', detail: `entryType=${String(data.entryType)}` });
  }

  if (entryType === 'contract' && typeof data.entryType !== 'string') {
    issues.push({ code: 'entry_type_missing', detail: 'legacy contract without explicit entryType' });
  }

  if (entryType === 'contract' && !contractNumber) {
    issues.push({ code: 'missing_contract_number', detail: 'contractNumber missing/empty' });
  }

  if (productKey && !CONTRACT_PRODUCTS.has(productKey)) {
    issues.push({ code: 'unknown_product', detail: `productKey=${productKey}` });
  }

  const signed = toDate(data.contractSignedDate);
  const start = toDate(data.policyStartDate);
  if (entryType === 'contract' && !signed) {
    issues.push({ code: 'missing_signed_date', detail: 'contractSignedDate missing/invalid' });
  }
  if (entryType === 'contract' && !start) {
    issues.push({ code: 'missing_policy_start', detail: 'policyStartDate missing/invalid' });
  }

  if (signed) {
    const y = signed.getUTCFullYear();
    if (y < 2000 || y > 2100) {
      issues.push({ code: 'signed_year_out_of_range', detail: `signed=${toIso(signed)}` });
    }
  }
  if (start) {
    const y = start.getUTCFullYear();
    if (y < 2000 || y > 2100) {
      issues.push({ code: 'policy_start_year_out_of_range', detail: `start=${toIso(start)}` });
    }
  }

  if (signed && start) {
    const diffDays = Math.round((start.getTime() - signed.getTime()) / 86400000);
    if (diffDays < -60) {
      issues.push({ code: 'policy_start_far_before_signed', detail: `diffDays=${diffDays}` });
    }
    if (diffDays > 365) {
      issues.push({ code: 'policy_start_far_after_signed', detail: `diffDays=${diffDays}` });
    }
  }

  const chain = Array.isArray(data.managerChain)
    ? data.managerChain
        .filter((x) => x && typeof x === 'object')
        .map((x) => ({
          email: normalizeEmail(x.email),
          position: typeof x.position === 'string' ? x.position : null,
          commissionMode: normalizeMode(x.commissionMode),
        }))
        .filter((x) => !!x.email)
    : [];

  const managerEmailSnapshot = normalizeEmail(data.managerEmailSnapshot);

  if ((ownerManager || managerEmailSnapshot) && chain.length === 0) {
    issues.push({ code: 'manager_chain_missing', detail: `ownerMgr=${ownerManager ?? 'null'} snapMgr=${managerEmailSnapshot ?? 'null'}` });
  }

  if (chain.length > 0 && managerEmailSnapshot && chain[0].email !== managerEmailSnapshot) {
    issues.push({ code: 'manager_snapshot_chain_mismatch', detail: `snap=${managerEmailSnapshot} chainTop=${chain[0].email}` });
  }

  if (chain.length > 0 && !normalizeEmail(data.managerEmailSnapshot)) {
    issues.push({ code: 'manager_snapshot_missing', detail: `chainTop=${chain[0].email}` });
  }

  const allowed = Array.isArray(data.allowedEmails)
    ? Array.from(new Set(data.allowedEmails.map((x) => normalizeEmail(x)).filter(Boolean)))
    : [];

  if (ownerEmail && allowed.length > 0 && !allowed.includes(ownerEmail)) {
    issues.push({ code: 'allowed_missing_owner', detail: `owner=${ownerEmail}` });
  }
  if (managerEmailSnapshot && allowed.length > 0 && !allowed.includes(managerEmailSnapshot)) {
    issues.push({ code: 'allowed_missing_manager', detail: `manager=${managerEmailSnapshot}` });
  }

  const overrides = Array.isArray(data.managerOverrides)
    ? data.managerOverrides.filter((x) => x && typeof x === 'object')
    : [];

  for (const ov of overrides) {
    const ovEmail = normalizeEmail(ov.email);
    const ovTotal = toNum(ov.total);
    const ovComputed = totalWithMultipliers(ov.items);
    if (ovEmail && chain.length > 0 && !chain.some((node) => node.email === ovEmail)) {
      issues.push({ code: 'override_email_not_in_chain', detail: `override=${ovEmail}` });
    }
    if (ovTotal != null && ovComputed != null && Math.abs(ovTotal - ovComputed) > 0.01) {
      issues.push({ code: 'override_total_mismatch_items', detail: `override=${ovEmail ?? 'null'} total=${ovTotal} computed=${ovComputed}` });
    }
  }

  const total = toNum(data.total);
  const computedTotal = totalWithMultipliers(data.items);
  if (total != null && computedTotal != null && Math.abs(total - computedTotal) > 0.01) {
    issues.push({ code: 'total_mismatch_items', detail: `total=${total} computed=${computedTotal}` });
  }

  if (total != null && countFractionDigits(total) > 8) {
    issues.push({ code: 'total_high_precision', detail: `total=${total}` });
  }

  return issues;
}

async function main() {
  const args = process.argv.slice(2);
  const codesArg = args.find((arg) => arg.startsWith('--codes=')) ?? null;
  const codeFilter = codesArg
    ? new Set(
        codesArg
          .slice('--codes='.length)
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      )
    : null;
  const printAll = args.includes('--all');

  const credentials = loadCredentials();
  if (!credentials) throw new Error('Missing FIREBASE_ADMIN_* credentials in environment.');

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const usersSnap = await db.collection('users').get();
  const usersByEmail = new Map();

  usersSnap.docs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const email = normalizeEmail(d.email ?? docSnap.id);
    if (!email) return;
    const managerEmail = normalizeEmail(d.managerEmail);
    const existing = usersByEmail.get(email);
    if (!existing) {
      usersByEmail.set(email, { email, managerEmail, docId: docSnap.id });
      return;
    }
    const isCanonical = docSnap.id.toLowerCase() === email;
    if (isCanonical || !existing.managerEmail) existing.managerEmail = managerEmail;
  });

  const entriesSnap = await db.collectionGroup('entries').get();

  let scanned = 0;
  const anomalies = [];
  const byCode = new Map();

  entriesSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const entryType = typeof data.entryType === 'string' ? data.entryType.trim().toLowerCase() : 'contract';
    if (!isContract(entryType)) return;

    scanned += 1;
    const ownerDocId = docSnap.ref.parent?.parent?.id ?? null;
    const issues = classifyIssues({ data, ownerDocId }, usersByEmail);
    if (issues.length === 0) return;

    const contractNumber = typeof data.contractNumber === 'string' ? data.contractNumber.trim() : '—';
    const signed = toIso(data.contractSignedDate);

    issues.forEach((issue) => {
      byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1);
      anomalies.push({
        code: issue.code,
        detail: issue.detail,
        path: docSnap.ref.path,
        contractNumber: contractNumber || '—',
        signed: signed ?? 'null',
      });
    });
  });

  console.log(`Scanned contract-like entries: ${scanned}`);
  console.log(`Anomaly records: ${anomalies.length}`);
  console.log(`Entries with at least one anomaly: ${new Set(anomalies.map((x) => x.path)).size}`);

  const sortedCodes = Array.from(byCode.entries()).sort((a, b) => b[1] - a[1]);
  if (sortedCodes.length > 0) {
    console.log('\nCounts by anomaly code:');
    sortedCodes.forEach(([code, count]) => {
      console.log(`- ${code}: ${count}`);
    });
  }

  const filtered = codeFilter
    ? anomalies.filter((row) => codeFilter.has(row.code))
    : anomalies;
  const top = printAll ? filtered : filtered.slice(0, 120);
  if (top.length > 0) {
    console.log(printAll ? '\nAnomalies:' : '\nSample anomalies (max 120):');
    top.forEach((row) => {
      console.log(`- ${row.code} | ${row.path} | contract=${row.contractNumber} | signed=${row.signed} | ${row.detail}`);
    });
  }
}

main().catch((err) => {
  console.error('Audit failed:', err?.message ?? err);
  process.exit(1);
});
