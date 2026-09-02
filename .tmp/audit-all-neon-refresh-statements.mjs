#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
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
      privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    };
  }
  throw new Error("Missing Firebase Admin credentials.");
}

const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizeContractNumber = (value) => normalizeText(value).replace(/\s+/g, "");
const normalizeProductCode = (value) => normalizeText(value).toUpperCase().replace(/\s+/g, "");
const normalizeCommissionCode = (value) => normalizeText(value).toUpperCase().replace(/\s+/g, "");
const comparableCommissionCode = (value) => {
  const code = normalizeCommissionCode(value);
  const roleMatch = code.match(/^(?:APZ|AP|AZ)(\d+)$/);
  return roleMatch ? `A${roleMatch[1]}` : code;
};
const isInitialCode = (value) => ["A101", "B0301"].includes(comparableCommissionCode(value));
const isRefreshProductCode = (value) =>
  ["CPP_NEONRF", "CPP_NRF_LF"].includes(normalizeProductCode(value));

const toMillis = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  return null;
};
const money = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};
const parseMoney = (value) => {
  const parsed = Number(
    String(value ?? "")
      .replace(/Kč/gi, "")
      .replace(/\s/g, "")
      .replace(",", ".")
  );
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};
const decodeHtml = (value) =>
  String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
const cellText = (value) =>
  decodeHtml(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function extractSection(html, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    String(html ?? "").match(
      new RegExp(
        `<div\\b[^>]*id=["']${escapedId}["'][^>]*>[\\s\\S]*?(?=<div\\b[^>]*class=["'][^"']*\\bvypis_sekce_toggle\\b|$)`,
        "i"
      )
    )?.[0] ?? ""
  );
}

function parseOwnCommissionRows(html) {
  const commissionSection = extractSection(html, "provize");
  const mainSection = commissionSection.replace(/<b>\s*STORNA\s*<\/b>[\s\S]*$/i, "");
  const rows = [];
  for (const rowMatch of mainSection.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const cells = [...rowMatch[0].matchAll(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi)].map((cell) =>
      cellText(cell[0])
    );
    if (cells.length < 14 || !/^\d+$/.test(cells[0] ?? "")) continue;
    const productCode = normalizeProductCode(cells[6]);
    const commissionCode = normalizeCommissionCode(cells[7]);
    rows.push({
      rowId: cells[0],
      contractNumber: normalizeContractNumber(cells[1]),
      client: cells[4],
      productCode,
      commissionCode,
      comparableCommissionCode: comparableCommissionCode(commissionCode),
      baseAmount: parseMoney(cells[8]),
      commissionAmount: parseMoney(cells[12]),
    });
  }
  return rows;
}

function statementChronology(data) {
  return (
    toMillis(data.statementChronologyMs) ??
    toMillis(data.statementDateMs) ??
    toMillis(data.periodEndMs) ??
    toMillis(data.periodStartMs) ??
    toMillis(data.processedAtMs) ??
    0
  );
}

const credentials = loadCredentials();
const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
const db = getFirestore(app);

console.log("Loading saved statements and NEON contracts...");
const [statementSnap, entrySnap] = await Promise.all([
  db.collectionGroup("commissionStatements").get(),
  db.collectionGroup("entries").where("productKey", "==", "neon").get(),
]);

const statementGroups = [];
const allStatementRowsByContract = new Map();
let refreshRowCount = 0;
for (const doc of statementSnap.docs) {
  const data = doc.data() ?? {};
  if (typeof data.html !== "string" || !data.html.trim()) continue;
  const allOwnRows = parseOwnCommissionRows(data.html);
  const rows = allOwnRows.filter((row) => isRefreshProductCode(row.productCode));
  refreshRowCount += rows.length;
  const byContract = new Map();
  for (const row of rows) {
    if (!row.contractNumber) continue;
    if (!byContract.has(row.contractNumber)) byContract.set(row.contractNumber, []);
    byContract.get(row.contractNumber).push(row);
  }
  const pathParts = doc.ref.path.split("/");
  const privateIndex = pathParts.indexOf("usersPrivate");
  const statementOwner = privateIndex >= 0 ? pathParts[privateIndex + 1] : null;
  for (const row of allOwnRows) {
    if (!row.contractNumber) continue;
    if (!allStatementRowsByContract.has(row.contractNumber)) {
      allStatementRowsByContract.set(row.contractNumber, []);
    }
    allStatementRowsByContract.get(row.contractNumber).push({
      ...row,
      statementId: doc.id,
      statementOwner,
      statementNumber: normalizeText(data.statementNumber) || null,
      statementDate: normalizeText(data.statementDate) || null,
      statementPeriod: normalizeText(data.period) || null,
      chronologyMs: statementChronology(data),
    });
  }
  for (const [contractNumber, contractRows] of byContract) {
    const initialRows = contractRows.filter((row) => isInitialCode(row.commissionCode));
    const positiveBases = initialRows
      .map((row) => row.baseAmount)
      .filter((base) => base != null && base > 0);
    const uniqueBases = [...new Set(positiveBases)];
    statementGroups.push({
      statementId: doc.id,
      statementPath: doc.ref.path,
      statementOwner,
      statementNumber: normalizeText(data.statementNumber) || null,
      statementDate: normalizeText(data.statementDate) || null,
      statementPeriod: normalizeText(data.period) || null,
      chronologyMs: statementChronology(data),
      contractNumber,
      rows: contractRows,
      initialRows,
      uniqueBases,
      expectedBase:
        positiveBases.length > 0 && positiveBases.every((base) => Math.abs(base - positiveBases[0]) <= 12)
          ? positiveBases[0]
          : null,
    });
  }
}

const contractsByNumber = new Map();
const refreshContracts = [];
for (const doc of entrySnap.docs) {
  const data = doc.data() ?? {};
  if ((normalizeText(data.entryType) || "contract") !== "contract") continue;
  const contractNumber = normalizeContractNumber(data.contractNumber);
  if (!contractNumber) continue;
  const ownerEmail = doc.ref.parent.parent?.id ?? null;
  const contract = { doc, data, ownerEmail, contractNumber };
  if (!contractsByNumber.has(contractNumber)) contractsByNumber.set(contractNumber, []);
  contractsByNumber.get(contractNumber).push(contract);
  if (data.isRefresh === true) refreshContracts.push(contract);
}

const groupsByContract = new Map();
for (const group of statementGroups) {
  if (!groupsByContract.has(group.contractNumber)) groupsByContract.set(group.contractNumber, []);
  groupsByContract.get(group.contractNumber).push(group);
}

const findings = [];
const ok = [];
for (const [contractNumber, groups] of groupsByContract) {
  const contracts = contractsByNumber.get(contractNumber) ?? [];
  const usableGroups = groups.filter((group) => group.expectedBase != null);
  usableGroups.sort((left, right) => {
    const ownerPreference = Number(right.statementOwner === contracts[0]?.ownerEmail) - Number(left.statementOwner === contracts[0]?.ownerEmail);
    return right.chronologyMs - left.chronologyMs || ownerPreference;
  });
  const latest = usableGroups[0] ?? groups.sort((a, b) => b.chronologyMs - a.chronologyMs)[0];
  const issues = [];
  if (contracts.length === 0) issues.push("missing_contract");
  if (contracts.length > 1) issues.push("ambiguous_contract");
  if (!latest || latest.expectedBase == null) issues.push("missing_or_conflicting_initial_base");

  const contract = contracts.length === 1 ? contracts[0] : null;
  if (contract && latest?.expectedBase != null) {
    const data = contract.data;
    const currentAnnualBase =
      money(data.refreshCommissionBase?.calculationAnnualPremium) ??
      (money(data.calculationInputAmount) == null
        ? null
        : money(money(data.calculationInputAmount) * 12));
    if (data.isRefresh !== true) issues.push("not_marked_refresh");
    if (data.commissionBaseSource !== "commission_statement") issues.push("base_not_from_statement");
    if (currentAnnualBase == null) issues.push("missing_current_base");
    else if (Math.abs(currentAnnualBase - latest.expectedBase) > 0.01) issues.push("wrong_current_base");

    const payouts = Array.isArray(data.commissionPayouts) ? data.commissionPayouts : [];
    const matchingPayouts = payouts.filter(
      (payout) =>
        payout.statementId === latest.statementId &&
        ["A101", "B0301"].includes(comparableCommissionCode(payout.code))
    );
    if (matchingPayouts.length === 0) issues.push("missing_initial_payout_records");
    if (
      matchingPayouts.some(
        (payout) =>
          money(payout.difference) != null && Math.abs(money(payout.difference)) > 10
      )
    ) {
      issues.push("wrong_initial_payout_expectation");
    }

    const item = {
      contractNumber,
      clientName: data.clientName ?? latest.rows[0]?.client ?? null,
      ownerEmail: contract.ownerEmail,
      entryId: contract.doc.id,
      entryPath: contract.doc.ref.path,
      isRefresh: data.isRefresh === true,
      status: data.status ?? null,
      currentAnnualBase,
      baseSource: data.commissionBaseSource ?? null,
      calculationStatus: data.commissionCalculationStatus ?? null,
      statementId: latest.statementId,
      statementOwner: latest.statementOwner,
      statementNumber: latest.statementNumber,
      statementDate: latest.statementDate,
      statementPeriod: latest.statementPeriod,
      statementProductCodes: [...new Set(latest.rows.map((row) => row.productCode))],
      statementBase: latest.expectedBase,
      statementCodes: latest.initialRows.map((row) => row.comparableCommissionCode),
      matchingPayouts: matchingPayouts.map((payout) => ({
        code: payout.code ?? null,
        paid: money(payout.amount),
        expected: money(payout.expectedAmount),
        difference: money(payout.difference),
        status: payout.status ?? null,
      })),
      issues,
    };
    (issues.length > 0 ? findings : ok).push(item);
  } else {
    findings.push({
      contractNumber,
      statementId: latest?.statementId ?? null,
      statementOwner: latest?.statementOwner ?? null,
      statementNumber: latest?.statementNumber ?? null,
      statementProductCodes: latest ? [...new Set(latest.rows.map((row) => row.productCode))] : [],
      statementBase: latest?.expectedBase ?? null,
      contractMatches: contracts.map((item) => item.doc.ref.path),
      issues,
    });
  }
}

const refreshWithoutSavedRefreshRows = refreshContracts
  .filter((contract) => !groupsByContract.has(contract.contractNumber))
  .map((contract) => {
    const otherRows = (allStatementRowsByContract.get(contract.contractNumber) ?? []).sort(
      (left, right) => left.chronologyMs - right.chronologyMs
    );
    return {
      contractNumber: contract.contractNumber,
      clientName: contract.data.clientName ?? null,
      ownerEmail: contract.ownerEmail,
      entryPath: contract.doc.ref.path,
      signedDateMs: toMillis(contract.data.contractSignedDate),
      policyStartDateMs: toMillis(contract.data.policyStartDate),
      currentAnnualBase:
        money(contract.data.refreshCommissionBase?.calculationAnnualPremium) ??
        (money(contract.data.calculationInputAmount) == null
          ? null
          : money(money(contract.data.calculationInputAmount) * 12)),
      baseSource: contract.data.commissionBaseSource ?? null,
      calculationStatus: contract.data.commissionCalculationStatus ?? null,
      requiresStatementRefresh: contract.data.requiresStatementRefresh ?? null,
      otherStatementRows: otherRows.map((row) => ({
        statementId: row.statementId,
        statementNumber: row.statementNumber,
        statementDate: row.statementDate,
        productCode: row.productCode,
        commissionCode: row.comparableCommissionCode,
        baseAmount: row.baseAmount,
        commissionAmount: row.commissionAmount,
      })),
    };
  });

findings.sort((a, b) => a.contractNumber.localeCompare(b.contractNumber, "cs"));
ok.sort((a, b) => a.contractNumber.localeCompare(b.contractNumber, "cs"));
refreshWithoutSavedRefreshRows.sort((a, b) => a.contractNumber.localeCompare(b.contractNumber, "cs"));

console.log(`STATEMENT_DOCS=${statementSnap.size}`);
console.log(`NEON_CONTRACTS=${[...contractsByNumber.values()].flat().length}`);
console.log(`SYSTEM_REFRESH_CONTRACTS=${refreshContracts.length}`);
console.log(`REFRESH_STATEMENT_ROWS=${refreshRowCount}`);
console.log(`REFRESH_STATEMENT_CONTRACTS=${groupsByContract.size}`);
console.log(`REFRESH_STATEMENT_OK=${ok.length}`);
console.log(`REFRESH_STATEMENT_FINDINGS=${findings.length}`);
console.log(`SYSTEM_REFRESH_WITHOUT_SAVED_REFRESH_ROWS=${refreshWithoutSavedRefreshRows.length}`);

console.log("\n--- FINDINGS ---");
for (const finding of findings) console.log(JSON.stringify(finding));

console.log("\n--- OK ---");
for (const item of ok) console.log(JSON.stringify(item));

console.log("\n--- SYSTEM REFRESH WITHOUT SAVED REFRESH ROWS ---");
for (const item of refreshWithoutSavedRefreshRows) console.log(JSON.stringify(item));
