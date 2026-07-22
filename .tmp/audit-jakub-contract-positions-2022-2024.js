const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

loadEnvConfig(process.cwd());

const DEFAULT_EMAIL = "jakub.rauscher@bohemika.eu";
const DEFAULT_FROM = "2022-01-01";
const DEFAULT_TO = "2024-12-31";
const POSITION_ORDER = [
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
  "poradce7",
  "poradce8",
  "poradce9",
  "poradce10",
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
  "manazer10",
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
      privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    };
  }
  return null;
}

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePosition(value) {
  if (typeof value !== "string") return null;
  return POSITION_SET.has(value) ? value : null;
}

function isIsoDay(value) {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && value && typeof value.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function toIsoDay(value) {
  if (typeof value === "string" && isIsoDay(value.trim())) return value.trim();
  const date = toDate(value);
  if (!date) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsePositionTimeline(raw) {
  if (!Array.isArray(raw)) return [];
  const rows = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const position = normalizePosition(item.position);
    const validFrom = normalizeText(item.validFrom);
    const validToRaw = normalizeText(item.validTo);
    const validTo = validToRaw || null;
    if (!position || !isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;
    rows.push({
      id: normalizeText(item.id) || `timeline_${index}`,
      position,
      validFrom,
      validTo,
    });
  });
  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
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
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
    return bTo.localeCompare(aTo);
  });
  return candidates[0] ?? null;
}

function parseArgValue(args, key, fallback = null) {
  const inlinePrefix = `${key}=`;
  const inline = args.find((arg) => arg.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = args.indexOf(key);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
}

function contractLabel(entry) {
  return (
    normalizeText(entry.contractNumber) ||
    normalizeText(entry.contractNumberRaw) ||
    normalizeText(entry.policyNumber) ||
    "-"
  );
}

async function main() {
  const args = process.argv.slice(2);
  const email = normalizeEmail(parseArgValue(args, "--email", DEFAULT_EMAIL));
  const from = parseArgValue(args, "--from", DEFAULT_FROM);
  const to = parseArgValue(args, "--to", DEFAULT_TO);

  if (!email) throw new Error("Missing --email");
  if (!isIsoDay(from) || !isIsoDay(to) || from > to) {
    throw new Error("Invalid --from/--to ISO date range.");
  }

  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const usersSnap = await db.collection("users").get();
  const candidateDocs = [];

  usersSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const normalized = normalizeEmail(data.email ?? docSnap.id);
    if (normalized !== email) return;
    candidateDocs.push({
      docId: docSnap.id,
      email: normalized,
      position: normalizePosition(data.position),
      parsedTimeline: parsePositionTimeline(data.positionTimeline),
      rawTimeline: data.positionTimeline,
    });
  });

  if (candidateDocs.length === 0) {
    console.log(`User profile not found for ${email}`);
    return;
  }

  const canonicalDoc = candidateDocs.find((doc) => doc.docId.toLowerCase() === email) ?? candidateDocs[0];
  const timelineCandidate = candidateDocs.find((doc) => doc.parsedTimeline.length > 0);
  const profile = timelineCandidate
    ? {
        ...canonicalDoc,
        parsedTimeline: timelineCandidate.parsedTimeline,
        rawTimeline: timelineCandidate.rawTimeline,
      }
    : canonicalDoc;

  const ownerDocIds = Array.from(new Set(candidateDocs.map((doc) => doc.docId)));
  let scannedContractEntries = 0;
  let checkedInRange = 0;
  let outsideRange = 0;
  let missingSignedDate = 0;
  let unresolvedTimeline = 0;
  let ok = 0;
  const mismatches = [];
  const rows = [];
  const byYear = new Map();

  for (const ownerDocId of ownerDocIds) {
    const entriesSnap = await db.collection("users").doc(ownerDocId).collection("entries").get();

    for (const entryDoc of entriesSnap.docs) {
      const entry = entryDoc.data() || {};
      const entryType = typeof entry.entryType === "string" ? entry.entryType : "contract";
      if (entryType !== "contract") continue;

      scannedContractEntries += 1;
      const signedDateIso = toIsoDay(entry.contractSignedDate);
      if (!signedDateIso) {
        missingSignedDate += 1;
        continue;
      }
      if (signedDateIso < from || signedDateIso > to) {
        outsideRange += 1;
        continue;
      }

      checkedInRange += 1;
      const year = signedDateIso.slice(0, 4);
      byYear.set(year, (byYear.get(year) ?? 0) + 1);

      const match = resolvePositionTimelineMatch(signedDateIso, profile.parsedTimeline);
      const storedPosition = normalizePosition(entry.position);
      const expectedPosition = match?.position ?? null;
      const row = {
        path: `users/${ownerDocId}/entries/${entryDoc.id}`,
        id: entryDoc.id,
        contractNumber: contractLabel(entry),
        signedDateIso,
        productKey: normalizeText(entry.productKey) || null,
        clientName:
          normalizeText(entry.clientName) ||
          normalizeText(entry.clientFullName) ||
          normalizeText(entry.name) ||
          null,
        storedPosition,
        expectedPosition,
        timelineWindow: match ? `${match.validFrom} -> ${match.validTo ?? "open"}` : null,
      };

      rows.push(row);

      if (!expectedPosition) {
        unresolvedTimeline += 1;
        mismatches.push({ ...row, problem: "unresolved-timeline" });
      } else if (storedPosition !== expectedPosition) {
        mismatches.push({ ...row, problem: "position-mismatch" });
      } else {
        ok += 1;
      }
    }
  }

  rows.sort((a, b) => {
    if (a.signedDateIso !== b.signedDateIso) return a.signedDateIso.localeCompare(b.signedDateIso);
    return a.contractNumber.localeCompare(b.contractNumber, "cs");
  });
  mismatches.sort((a, b) => {
    if (a.signedDateIso !== b.signedDateIso) return a.signedDateIso.localeCompare(b.signedDateIso);
    return a.contractNumber.localeCompare(b.contractNumber, "cs");
  });

  console.log(`User: ${email}`);
  console.log(`Profile docs: ${ownerDocIds.join(", ")}`);
  console.log(`Range: ${from} -> ${to}`);
  console.log(`Timeline rows used: ${profile.parsedTimeline.length}`);
  profile.parsedTimeline.forEach((row) => {
    console.log(`- timeline ${row.validFrom} -> ${row.validTo ?? "open"} = ${row.position}`);
  });
  console.log(`Scanned contract entries: ${scannedContractEntries}`);
  console.log(`Outside range: ${outsideRange}`);
  console.log(`Missing contractSignedDate: ${missingSignedDate}`);
  console.log(`Checked in range: ${checkedInRange}`);
  console.log(
    `By year: ${Array.from(byYear.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, count]) => `${year}=${count}`)
      .join(", ")}`
  );
  console.log(`OK: ${ok}`);
  console.log(`Timeline unresolved in range: ${unresolvedTimeline}`);
  console.log(`Position mismatches in range: ${mismatches.length}`);

  if (mismatches.length > 0) {
    console.log("\nMismatches:");
    mismatches.forEach((item) => {
      console.log(
        `- ${item.path} | c=${item.contractNumber} | signed=${item.signedDateIso} | product=${item.productKey ?? "-"} | client=${item.clientName ?? "-"} | stored=${item.storedPosition ?? "null"} | expected=${item.expectedPosition ?? "null"} | timeline=${item.timelineWindow ?? "-"} | problem=${item.problem}`
      );
    });
  }

  console.log("\nAll checked rows:");
  rows.forEach((item) => {
    const status = item.storedPosition === item.expectedPosition ? "OK" : "MISMATCH";
    console.log(
      `${status} | ${item.signedDateIso} | c=${item.contractNumber} | product=${item.productKey ?? "-"} | client=${item.clientName ?? "-"} | stored=${item.storedPosition ?? "null"} | expected=${item.expectedPosition ?? "null"}`
    );
  });
}

main().catch((err) => {
  console.error("Audit failed:", err?.message ?? err);
  process.exit(1);
});
