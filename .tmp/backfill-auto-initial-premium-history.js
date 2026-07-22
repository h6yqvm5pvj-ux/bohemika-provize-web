const crypto = require("crypto");
const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

loadEnvConfig(process.cwd());

const AUTO_PRODUCTS = new Set([
  "cppAuto",
  "slaviaauto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowAuto",
  "kooperativaAuto",
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
      privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    };
  }
  return null;
}

function compactHash(value, length = 32) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, length);
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDay(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function parseCzechDate(value) {
  const match = String(value ?? "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function normalizeContractNumber(value) {
  return String(value ?? "").replace(/\D+/g, "").trim();
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function historyDateMs(entry) {
  const iso = String(entry?.anniversaryDate ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const ms = Date.parse(`${iso}T00:00:00.000Z`);
    if (Number.isFinite(ms)) return ms;
  }
  const chronology = Number(entry?.statementChronologyMs);
  return Number.isFinite(chronology) ? chronology : Number.MAX_SAFE_INTEGER;
}

function buildInitialEntry(data, change) {
  const initialPremium = money(change.previousPremium);
  if (initialPremium == null || initialPremium <= 0) return null;

  const productCode = String(change.productCode ?? "AUTO").trim() || "AUTO";
  const policyStartIso =
    parseCzechDate(change.validFrom) ??
    isoDay(data.policyStartDate) ??
    String(change.anniversaryDate ?? "").trim() ??
    isoDay(data.contractSignedDate);
  if (!policyStartIso) return null;

  const contractNumber = normalizeContractNumber(data.contractNumber);
  const key = compactHash(
    [
      "auto-initial",
      contractNumber,
      productCode,
      policyStartIso,
      initialPremium,
    ].join(":"),
    32
  );

  return {
    key,
    premiumKind: "auto_initial",
    statementId: change.statementId ?? null,
    statementNumber: change.statementNumber ?? null,
    statementPeriod: change.statementPeriod ?? null,
    statementDate: change.statementDate ?? null,
    statementChronologyMs:
      typeof change.statementChronologyMs === "number" ? change.statementChronologyMs : null,
    payoutMonthKey: change.payoutMonthKey ?? null,
    anniversaryNumber: 0,
    anniversaryDate: policyStartIso,
    previousPremium: null,
    newPremium: initialPremium,
    difference: 0,
    previousAnnualPremium: null,
    newAnnualPremium: initialPremium,
    differenceAnnual: null,
    productCode,
    commissionCode: null,
    rowId: `initial:${change.rowId ?? change.key ?? productCode}`,
    validFrom: change.validFrom ?? null,
    source: change.source === "manager" ? "manager" : "own",
    writtenAtMs:
      typeof change.writtenAtMs === "number" && Number.isFinite(change.writtenAtMs)
        ? change.writtenAtMs
        : Date.now(),
    writtenBy: change.writtenBy ?? "system",
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const snap = await db.collectionGroup("entries").get();

  const planned = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (!AUTO_PRODUCTS.has(data.productKey)) continue;
    const history = Array.isArray(data.premiumStatementHistory)
      ? data.premiumStatementHistory
      : [];
    const changes = history
      .filter(
        (entry) =>
          (entry?.premiumKind ?? "auto_change") === "auto_change" &&
          money(entry.previousPremium) > 0
      )
      .sort((a, b) => historyDateMs(a) - historyDateMs(b));
    if (changes.length === 0) continue;

    const initial = buildInitialEntry(data, changes[0]);
    if (!initial) continue;
    if (history.some((entry) => entry?.premiumKind === "auto_initial" && entry.key === initial.key)) {
      continue;
    }

    planned.push({
      ref: docSnap.ref,
      path: docSnap.ref.path,
      contractNumber: data.contractNumber ?? "—",
      clientName: data.clientName ?? "—",
      initial,
      history: [initial, ...history],
    });
  }

  console.log(`contracts_to_backfill=${planned.length}`);
  planned.forEach((row) => {
    console.log(
      `${row.contractNumber} | ${row.clientName} | initial=${row.initial.newPremium} | ${row.path}`
    );
  });

  if (!apply) {
    console.log("DRY_RUN_ONLY");
    return;
  }

  let batch = db.batch();
  let ops = 0;
  for (const row of planned) {
    batch.set(
      row.ref,
      {
        premiumStatementHistory: row.history,
        updatedAt: new Date(),
      },
      { merge: true }
    );
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log(`APPLIED=${planned.length}`);
}

main().catch((error) => {
  console.error(`backfill_failed=${error?.message ?? error}`);
  process.exit(1);
});
