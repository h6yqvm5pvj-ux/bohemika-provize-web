import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import nextEnv from "@next/env";
import fs from "node:fs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const CONTRACT_REFS_COLLECTION = "contractRefs";

const PROPERTY_PRODUCTS = new Set([
  "domex",
  "cpphafan",
  "pillowmajetek",
  "koopmajetekobcan",
  "koopfit",
  "koopodzam",
  "maxdomov",
  "cppPPRbez",
  "cppPPRs",
  "allianzmujdomov",
  "cppsimplex",
  "zamex",
  "comfortcc",
]);

const credentialsFromEnv = () => {
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

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const parsed = JSON.parse(
      fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")
    );
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
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

  throw new Error("Firebase Admin credentials are not configured.");
};

const decodeHtml = (value) =>
  String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16))
    );

const stripHtmlText = (value) =>
  decodeHtml(value)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeContractNumber = (value) =>
  String(value ?? "")
    .replace(/[^\d/.-]+/g, "")
    .replace(/^[./-]+|[./-]+$/g, "")
    .trim();

const normalizeContractNumberLoose = (value) =>
  String(value ?? "")
    .replace(/\D+/g, "")
    .replace(/^0+/, "")
    .trim();

const normalizeProductCode = (value) =>
  stripHtmlText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "");

const normalizeCommissionCode = (value) =>
  stripHtmlText(value).toUpperCase().replace(/\s+/g, "");

const parseMoney = (value) => {
  const normalized = String(value ?? "")
    .replace(/Kč/gi, "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractStatementSectionHtml = (html, id) => {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(html ?? "").match(
    new RegExp(
      `<div\\b[^>]*id=["']${escapedId}["'][^>]*>[\\s\\S]*?(?=<div\\b[^>]*class=["'][^"']*\\bvypis_sekce_toggle\\b|$)`,
      "i"
    )
  );
  return match?.[0] ?? "";
};

const parseRows = (sectionHtml) =>
  [...String(sectionHtml ?? "").matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((rowMatch) =>
    [...rowMatch[0].matchAll(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi)].map((cellMatch) =>
      stripHtmlText(cellMatch[0])
    )
  );

const parseStatementRows = (html, meta) => {
  const rows = [];

  const parseSection = (sectionHtml, source, layout = "commission") => {
    const isManager = source === "manager";
    const isDeduction = layout === "own_deduction";
    const minimumCells = isManager || isDeduction ? 13 : 14;
    for (const cells of parseRows(sectionHtml)) {
      if (cells.length < minimumCells || !/^\d+$/.test(cells[0] ?? "")) continue;
      const commissionIndex = isManager ? 11 : isDeduction ? 11 : 12;
      const commission = parseMoney(cells[commissionIndex]);
      const contractNumber = normalizeContractNumber(cells[1]);
      if (!contractNumber || commission == null || Math.abs(commission) < 0.005) continue;

      const productIndex =
        layout === "own_storno" || isDeduction ? 5 : isManager ? 5 : 6;
      const codeIndex =
        layout === "own_storno" || isDeduction ? 6 : isManager ? 6 : 7;
      const baseIndex = isManager ? 7 : isDeduction ? 7 : 8;
      const clientIndex =
        isDeduction ? 3 : layout === "own_storno" ? 3 : isManager ? 3 : 4;
      rows.push({
        statementId: meta.statementId,
        statementPath: meta.statementPath,
        ownerEmail: meta.ownerEmail,
        statementNumber: meta.statementNumber,
        period: meta.period,
        source,
        layout,
        rowId: cells[0] ?? "",
        contractNumber,
        contractNumberNormalized: normalizeContractNumber(contractNumber),
        contractNumberLoose: normalizeContractNumberLoose(contractNumber),
        client: cells[clientIndex] ?? "",
        productCode: normalizeProductCode(cells[productIndex]),
        commissionCode: normalizeCommissionCode(cells[codeIndex]),
        baseAmount: parseMoney(cells[baseIndex]),
        commission: Math.round(commission * 100) / 100,
        signedAt: cells[2] ?? "",
        validFrom: isManager || layout !== "commission" ? null : cells[3] ?? "",
      });
    }
  };

  const ownCommissionHtml = extractStatementSectionHtml(html, "provize");
  const ownMainHtml = ownCommissionHtml.replace(/<b>\s*STORNA\s*<\/b>[\s\S]*$/i, "");
  const ownStornoHtml =
    ownCommissionHtml.match(/<b>\s*STORNA\s*<\/b>[\s\S]*$/i)?.[0] ?? "";
  parseSection(ownMainHtml, "own", "commission");
  parseSection(extractStatementSectionHtml(html, "odecty"), "own", "own_deduction");
  parseSection(ownStornoHtml, "own", "own_storno");
  parseSection(extractStatementSectionHtml(html, "storna"), "own", "own_storno");
  parseSection(extractStatementSectionHtml(html, "manazer"), "manager", "commission");

  return rows;
};

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const addCount = (map, key, count = 1) => {
  map.set(key, (map.get(key) ?? 0) + count);
};

const sortedEntries = (map) =>
  [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "cs"));

const codeFamily = (code) => {
  if (/^A\d+$/i.test(code)) return "A";
  if (/^B\d+$/i.test(code)) return "B";
  if (/^A/i.test(code)) return "A-other";
  if (/^B/i.test(code)) return "B-other";
  return "other";
};

const app = getApps()[0] ?? initializeApp({ credential: cert(credentialsFromEnv()) });
const db = getFirestore(app);

console.log("Loading commission statement docs...");
const statementSnap = await db.collectionGroup("commissionStatements").select(
  "html",
  "statementNumber",
  "period",
  "processedAtMs"
).get();

const allRows = [];
for (const doc of statementSnap.docs) {
  const data = doc.data();
  const html = typeof data.html === "string" ? data.html : "";
  if (!html.trim()) continue;
  const pathParts = doc.ref.path.split("/");
  allRows.push(
    ...parseStatementRows(html, {
      statementId: doc.id,
      statementPath: doc.ref.path,
      ownerEmail: pathParts[pathParts.indexOf("usersPrivate") + 1] ?? null,
      statementNumber: data.statementNumber ?? null,
      period: data.period ?? null,
    })
  );
}

console.log(`statement_docs=${statementSnap.size}`);
console.log(`parsed_rows=${allRows.length}`);

const uniqueNormalizedNumbers = [
  ...new Set(allRows.map((row) => row.contractNumberNormalized).filter(Boolean)),
];

console.log(`unique_contract_numbers=${uniqueNormalizedNumbers.length}`);
console.log("Loading contract refs...");

const refsByNumber = new Map();
for (const part of chunk(uniqueNormalizedNumbers, 30)) {
  const snap = await db
    .collection(CONTRACT_REFS_COLLECTION)
    .where("contractNumberNormalized", "in", part)
    .get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const normalized = String(data.contractNumberNormalized ?? "");
    if (!normalized) continue;
    if (!refsByNumber.has(normalized)) refsByNumber.set(normalized, []);
    refsByNumber.get(normalized).push({
      ownerEmail: data.ownerEmail ?? null,
      entryId: data.entryId ?? null,
      entryPath: data.entryPath ?? null,
      productKey: data.productKey ?? null,
    });
  }
}

const entryPaths = [
  ...new Set(
    [...refsByNumber.values()]
      .flat()
      .map((item) => item.entryPath)
      .filter(Boolean)
  ),
];
console.log(`contract_ref_matches=${[...refsByNumber.values()].flat().length}`);
console.log(`entry_docs_to_load=${entryPaths.length}`);

const entriesByPath = new Map();
for (const paths of chunk(entryPaths, 300)) {
  const refs = paths.map((path) => db.doc(path));
  const snaps = await db.getAll(...refs);
  for (const snap of snaps) {
    if (!snap.exists) continue;
    entriesByPath.set(snap.ref.path, snap.data());
  }
}

const rowsWithContracts = allRows.map((row) => {
  const refs = refsByNumber.get(row.contractNumberNormalized) ?? [];
  const loadedRefs = refs
    .map((ref) => ({
      ...ref,
      data: ref.entryPath ? entriesByPath.get(ref.entryPath) ?? null : null,
    }))
    .filter((ref) => ref.data);
  const exactProductRef =
    loadedRefs.find((ref) => ref.data?.productKey && ref.productKey === ref.data.productKey) ??
    loadedRefs[0] ??
    refs[0] ??
    null;
  const data = exactProductRef?.data ?? null;
  return {
    ...row,
    systemProductKey: data?.productKey ?? exactProductRef?.productKey ?? null,
    frequencyRaw: data?.frequencyRaw ?? null,
    inputAmount: data?.inputAmount ?? data?.calculationInputAmount ?? null,
    contractSignedDate: data?.contractSignedDate ?? null,
    policyStartDate: data?.policyStartDate ?? null,
  };
});

const productCodeCounts = new Map();
const productKeyCounts = new Map();
const productCodeToKeys = new Map();
const propertyPatternMap = new Map();
const unmatchedProductCodes = new Map();

for (const row of rowsWithContracts) {
  addCount(productCodeCounts, row.productCode);
  if (row.systemProductKey) addCount(productKeyCounts, row.systemProductKey);
  const codeToKey = productCodeToKeys.get(row.productCode) ?? new Map();
  addCount(codeToKey, row.systemProductKey ?? "unmatched");
  productCodeToKeys.set(row.productCode, codeToKey);

  if (!row.systemProductKey && row.productCode) addCount(unmatchedProductCodes, row.productCode);
  if (!PROPERTY_PRODUCTS.has(row.systemProductKey)) continue;
  const key = [
    row.systemProductKey,
    row.productCode,
    row.frequencyRaw ?? "unknown_frequency",
    row.source,
  ].join("|");
  let aggregate = propertyPatternMap.get(key);
  if (!aggregate) {
    aggregate = {
      count: 0,
      codes: new Map(),
      codeFamilies: new Map(),
      examples: [],
    };
    propertyPatternMap.set(key, aggregate);
  }
  aggregate.count += 1;
  addCount(aggregate.codes, row.commissionCode);
  addCount(aggregate.codeFamilies, codeFamily(row.commissionCode));
  if (aggregate.examples.length < 5) {
    aggregate.examples.push({
      code: row.commissionCode,
      contractNumber: row.contractNumber,
      statementNumber: row.statementNumber,
      period: row.period,
      baseAmount: row.baseAmount,
      commission: row.commission,
      signedAt: row.signedAt,
      validFrom: row.validFrom,
    });
  }
}

console.log("\nTop statement product codes:");
for (const [productCode, count] of sortedEntries(productCodeCounts).slice(0, 80)) {
  const keyCounts = sortedEntries(productCodeToKeys.get(productCode) ?? new Map())
    .slice(0, 6)
    .map(([key, keyCount]) => `${key}:${keyCount}`)
    .join(", ");
  console.log(`${productCode || "(blank)"} rows=${count} systemKeys=[${keyCounts}]`);
}

console.log("\nProperty products by system key / statement code / frequency:");
for (const [key, aggregate] of [...propertyPatternMap.entries()].sort()) {
  const [systemProductKey, productCode, frequencyRaw, source] = key.split("|");
  const codes = sortedEntries(aggregate.codes)
    .map(([code, count]) => `${code}:${count}`)
    .join(", ");
  const families = sortedEntries(aggregate.codeFamilies)
    .map(([family, count]) => `${family}:${count}`)
    .join(", ");
  console.log(
    `${systemProductKey} productCode=${productCode} freq=${frequencyRaw} source=${source} rows=${aggregate.count} families=[${families}] codes=[${codes}]`
  );
  for (const example of aggregate.examples) {
    console.log(
      `  ex code=${example.code} sml=${example.contractNumber} vypis=${example.statementNumber ?? "?"} obd=${example.period ?? "?"} base=${example.baseAmount ?? "?"} prov=${example.commission}`
    );
  }
}

console.log("\nUnmatched product codes:");
for (const [productCode, count] of sortedEntries(unmatchedProductCodes).slice(0, 40)) {
  console.log(`${productCode || "(blank)"} rows=${count}`);
}
