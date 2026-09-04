#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const { loadEnvConfig } = nextEnv;
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
const ANNUAL_STATEMENT_BASE_PRODUCTS = new Set(["allianzAuto", "pillowAuto"]);
const STRICT_MONEY_TOLERANCE = 1;
const CONFLICT_TOLERANCE = 12;
const APPLY = process.argv.includes("--apply");
const SUMMARY_ONLY = process.argv.includes("--summary");

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

const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
};

const normalizeContractNumber = (value) =>
  String(value ?? "").replace(/\D+/g, "").replace(/^0+/, "").trim();

const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

const paymentCount = (frequency) => {
  if (frequency === "monthly") return 12;
  if (frequency === "quarterly") return 4;
  if (frequency === "semiannual") return 2;
  return 1;
};

const toIsoDay = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const czech = trimmed.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
    if (czech) {
      return `${czech[3]}-${String(czech[2]).padStart(2, "0")}-${String(
        czech[1]
      ).padStart(2, "0")}`;
    }
  }
  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : typeof value?.seconds === "number"
        ? new Date(value.seconds * 1000)
        : new Date(value);
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : null;
};

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

const cellText = (html) =>
  decodeHtml(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const parseMoney = (value) => {
  const parsed = Number(
    String(value ?? "")
      .replace(/Kč/gi, "")
      .replace(/\s/g, "")
      .replace(",", ".")
      .trim()
  );
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};

function extractA101Rows(html) {
  const markerIndex = html.indexOf('id="provize"');
  if (markerIndex === -1) return [];
  const start = html.lastIndexOf("<div", markerIndex);
  if (start === -1) return [];
  const next = html.indexOf('<div class="vypis_sekce_toggle"', markerIndex);
  const section = html.slice(start, next === -1 ? undefined : next);
  return [...section.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) =>
      [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
        (cellMatch) => cellText(cellMatch[1])
      )
    )
    .filter(
      (cells) =>
        /^\d+$/.test(cells[0] ?? "") &&
        String(cells[7] ?? "").trim().toUpperCase() === "A101"
    )
    .map((cells) => ({
      rowId: cells[0] ?? "",
      contractNumber: normalizeContractNumber(cells[1]),
      signedIso: toIsoDay(cells[2]),
      validFromIso: toIsoDay(cells[3]),
      clientName: String(cells[4] ?? "").trim(),
      productCode: String(cells[6] ?? "").trim().toUpperCase(),
      base: parseMoney(cells[8]),
    }))
    .filter((row) => row.contractNumber && row.base != null && row.base > 0);
}

function historyAnnual(entry, contract) {
  const annual = money(entry?.newAnnualPremium);
  const raw = money(entry?.newPremium);
  const count = paymentCount(contract.frequencyRaw);
  const paymentBased = !ANNUAL_STATEMENT_BASE_PRODUCTS.has(contract.productKey);
  if (annual != null) {
    const legacyPaymentStoredAsAnnual =
      entry?.basePremiumPeriod == null &&
      paymentBased &&
      count > 1 &&
      raw != null &&
      Math.abs(annual - raw) <= CONFLICT_TOLERANCE;
    return legacyPaymentStoredAsAnnual
      ? Math.round(annual * count * 100) / 100
      : annual;
  }
  if (raw == null) return null;
  return entry?.basePremiumPeriod === "payment" ||
    (entry?.basePremiumPeriod == null && paymentBased)
    ? Math.round(raw * count * 100) / 100
    : raw;
}

const stableJson = (value) => JSON.stringify(value ?? null);

const statementAnnual = (row, contract) =>
  ANNUAL_STATEMENT_BASE_PRODUCTS.has(contract.productKey)
    ? row.base
    : Math.round(row.base * paymentCount(contract.frequencyRaw) * 100) / 100;

const approx = (left, right, tolerance = STRICT_MONEY_TOLERANCE) =>
  left != null && right != null && Math.abs(left - right) <= tolerance;

const distinctMoney = (values, tolerance = STRICT_MONEY_TOLERANCE) => {
  const result = [];
  for (const value of values.filter((item) => item != null).sort((a, b) => a - b)) {
    if (!result.some((item) => approx(item, value, tolerance))) result.push(value);
  }
  return result;
};

const countBy = (rows, key) =>
  Object.fromEntries(
    [...rows.reduce((counts, row) => {
      const value = row[key] || "unknown";
      counts.set(value, (counts.get(value) ?? 0) + 1);
      return counts;
    }, new Map())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  );

async function main() {
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing Firebase credentials.");
  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const [entrySnap, statementSnap] = await Promise.all([
    db.collectionGroup("entries").get(),
    db
      .collectionGroup("commissionStatements")
      .select("html", "statementChronologyMs", "statementNumber", "period")
      .get(),
  ]);

  const contracts = entrySnap.docs
    .map((doc) => {
      const data = doc.data() ?? {};
      return {
        path: doc.ref.path,
        contractNumber: normalizeContractNumber(data.contractNumber),
        clientName: String(data.clientName ?? "").trim(),
        ownerEmail: normalizeEmail(data.userEmail ?? doc.ref.parent.parent?.id),
        productKey: data.productKey,
        frequencyRaw: data.frequencyRaw,
        signedIso: toIsoDay(data.contractSignedDate),
        policyStartIso: toIsoDay(data.policyStartDate),
        history: Array.isArray(data.premiumStatementHistory)
          ? data.premiumStatementHistory
          : [],
      };
    })
    .filter(
      (contract) =>
        AUTO_PRODUCTS.has(contract.productKey) && contract.contractNumber
    );
  const contractCountByNumber = contracts.reduce((counts, contract) => {
    counts.set(contract.contractNumber, (counts.get(contract.contractNumber) ?? 0) + 1);
    return counts;
  }, new Map());

  const statementRowsByContract = new Map();
  for (const doc of statementSnap.docs) {
    const data = doc.data() ?? {};
    for (const row of extractA101Rows(String(data.html ?? ""))) {
      const list = statementRowsByContract.get(row.contractNumber) ?? [];
      list.push({
        ...row,
        statementId: doc.id,
        statementPath: doc.ref.path,
        statementChronologyMs: Number(data.statementChronologyMs) || 0,
        statementNumber: data.statementNumber ?? null,
        statementPeriod: data.period ?? null,
      });
      statementRowsByContract.set(row.contractNumber, list);
    }
  }

  const safe = [];
  const ambiguous = [];
  for (const contract of contracts) {
    const initialRows = contract.history
      .map((entry, index) => ({
        entry,
        index,
        annual: historyAnnual(entry, contract),
      }))
      .filter(
        (row) =>
          row.entry?.premiumKind === "auto_initial" &&
          row.entry?.source !== "manager" &&
          row.annual != null &&
          row.annual > 0
      );
    const storedValues = distinctMoney(initialRows.map((row) => row.annual), CONFLICT_TOLERANCE);
    if (storedValues.length < 2) continue;

    const allA101Rows = statementRowsByContract.get(contract.contractNumber) ?? [];
    const dateMatchedRows = allA101Rows.filter(
      (row) =>
        (contract.signedIso && row.signedIso === contract.signedIso) ||
        (contract.policyStartIso && row.validFromIso === contract.policyStartIso)
    );
    const sourceRows = dateMatchedRows.length > 0 ? dateMatchedRows : allA101Rows;
    const physicalRows = [...new Map(
      sourceRows.map((row) => [
        [
          row.rowId,
          row.contractNumber,
          row.signedIso,
          row.validFromIso,
          row.productCode,
          row.base,
        ].join("::"),
        row,
      ])
    ).values()];
    const authorityValues = distinctMoney(
      physicalRows.map((row) => statementAnnual(row, contract))
    );
    const base = {
      contractNumber: contract.contractNumber,
      clientName: contract.clientName,
      ownerEmail: contract.ownerEmail,
      productKey: contract.productKey,
      frequencyRaw: contract.frequencyRaw,
      storedInitialAnnualValues: storedValues,
      sourceA101AnnualValues: authorityValues,
      storedInitialRows: initialRows.map((row) => ({
        index: row.index,
        annual: row.annual,
        code: row.entry?.commissionCode ?? null,
        statementNumber: row.entry?.statementNumber ?? null,
        statementPeriod: row.entry?.statementPeriod ?? null,
        statementDate: row.entry?.statementDate ?? null,
        statementId: row.entry?.statementId ?? null,
        rawNewPremium: money(row.entry?.newPremium),
        storedAnnualPremium: money(row.entry?.newAnnualPremium),
        basePremiumPeriod: row.entry?.basePremiumPeriod ?? null,
      })),
      sourceRows: physicalRows.map((row) => ({
        statementId: row.statementId,
        statementNumber: row.statementNumber,
        statementPeriod: row.statementPeriod,
        rowId: row.rowId,
        signedIso: row.signedIso,
        validFromIso: row.validFromIso,
        productCode: row.productCode,
        base: row.base,
        annualBase: statementAnnual(row, contract),
      })),
      path: contract.path,
    };

    const blockers = [];
    if ((contractCountByNumber.get(contract.contractNumber) ?? 0) !== 1) {
      blockers.push("contract_number_not_unique");
    }
    if (physicalRows.length === 0) blockers.push("missing_A101_source_row");
    if (authorityValues.length !== 1) blockers.push("conflicting_A101_source_rows");
    const authority = authorityValues.length === 1 ? authorityValues[0] : null;
    const goodRows =
      authority == null
        ? []
        : initialRows.filter((row) => approx(row.annual, authority));
    const badRows =
      authority == null
        ? []
        : initialRows.filter(
            (row) => !approx(row.annual, authority, CONFLICT_TOLERANCE)
          );
    if (goodRows.length === 0) blockers.push("no_initial_matching_A101");
    if (badRows.length === 0) blockers.push("no_proven_bad_initial_row");
    if (blockers.length > 0) {
      ambiguous.push({ ...base, blockers });
      continue;
    }

    safe.push({
      ...base,
      originalHistory: contract.history,
      authorityAnnual: authority,
      matchingInitialRows: goodRows.length,
      provenBadInitialRows: badRows.length,
      removeIndexes: badRows.map((row) => row.index),
      removeValues: badRows.map((row) => row.annual),
      sourceEvidence: physicalRows.map((row) => ({
        statementId: row.statementId,
        statementNumber: row.statementNumber,
        rowId: row.rowId,
        signedIso: row.signedIso,
        validFromIso: row.validFromIso,
        productCode: row.productCode,
        base: row.base,
        annualBase: statementAnnual(row, contract),
      })),
    });
  }

  safe.sort((a, b) => a.contractNumber.localeCompare(b.contractNumber, "cs"));
  ambiguous.sort((a, b) => a.contractNumber.localeCompare(b.contractNumber, "cs"));
  const report = {
    summary: {
          autoContractsScanned: contracts.length,
          contractsWithConflictingInitialValues: safe.length + ambiguous.length,
          safeContracts: safe.length,
          provenBadRows: safe.reduce(
            (sum, row) => sum + row.provenBadInitialRows,
            0
          ),
          ambiguousContracts: ambiguous.length,
          safeByOwner: countBy(safe, "ownerEmail"),
          safeByProduct: countBy(safe, "productKey"),
          ambiguousBlockers: ambiguous.reduce((counts, row) => {
            for (const blocker of row.blockers) {
              counts[blocker] = (counts[blocker] ?? 0) + 1;
            }
            return counts;
          }, {}),
    },
    safe,
    ambiguous,
  };

  if (!APPLY) {
    console.log(
      JSON.stringify(
        SUMMARY_ONLY ? { summary: report.summary, ambiguous: report.ambiguous } : report,
        null,
        2
      )
    );
    return;
  }

  if (safe.length !== 163 || ambiguous.length !== 7) {
    throw new Error(
      `Preflight totals changed (safe=${safe.length}, ambiguous=${ambiguous.length}); refusing cleanup.`
    );
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    process.cwd(),
    ".tmp",
    `auto-initial-cleanup-backup-${runId}.json`
  );
  await mkdir(path.dirname(backupPath), { recursive: true });
  await writeFile(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        purpose: "Backup before removal of proven incorrect auto_initial duplicates",
        report,
      },
      null,
      2
    ),
    "utf8"
  );

  const applied = [];
  const skipped = [];
  for (const candidate of safe) {
    const ref = db.doc(candidate.path);
    try {
      const result = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new Error("contract_missing");
        const current = snapshot.data() ?? {};
        const currentHistory = Array.isArray(current.premiumStatementHistory)
          ? current.premiumStatementHistory
          : [];
        if (stableJson(currentHistory) !== stableJson(candidate.originalHistory)) {
          throw new Error("history_changed_since_preflight");
        }
        if (
          normalizeContractNumber(current.contractNumber) !== candidate.contractNumber ||
          current.productKey !== candidate.productKey ||
          current.frequencyRaw !== candidate.frequencyRaw
        ) {
          throw new Error("contract_identity_changed_since_preflight");
        }

        const keep = [];
        const removed = [];
        for (let index = 0; index < currentHistory.length; index += 1) {
          if (candidate.removeIndexes.includes(index)) removed.push(currentHistory[index]);
          else keep.push(currentHistory[index]);
        }
        if (removed.length !== candidate.provenBadInitialRows) {
          throw new Error("removal_count_changed_since_preflight");
        }
        const remainingInitial = keep
          .filter(
            (entry) =>
              entry?.premiumKind === "auto_initial" && entry?.source !== "manager"
          )
          .map((entry) => historyAnnual(entry, candidate))
          .filter((value) => value != null && value > 0);
        if (!remainingInitial.some((value) => approx(value, candidate.authorityAnnual))) {
          throw new Error("authoritative_initial_would_be_missing");
        }
        if (
          removed.some(
            (entry) =>
              entry?.premiumKind !== "auto_initial" ||
              entry?.source === "manager" ||
              approx(historyAnnual(entry, candidate), candidate.authorityAnnual, CONFLICT_TOLERANCE)
          )
        ) {
          throw new Error("planned_row_no_longer_proven_bad");
        }
        transaction.update(ref, { premiumStatementHistory: keep });
        return { removedCount: removed.length };
      });
      applied.push({
        contractNumber: candidate.contractNumber,
        path: candidate.path,
        removedCount: result.removedCount,
      });
    } catch (error) {
      skipped.push({
        contractNumber: candidate.contractNumber,
        path: candidate.path,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        backupPath,
        appliedContracts: applied.length,
        removedRows: applied.reduce((sum, item) => sum + item.removedCount, 0),
        skippedContracts: skipped.length,
        skipped,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
