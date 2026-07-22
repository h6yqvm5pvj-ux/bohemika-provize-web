import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const MONEY_TOLERANCE = 0.01;
const COMMISSION_DIFFERENCE_TOLERANCE = 10;

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

function argValue(args, key, fallback = null) {
  const inline = args.find((arg) => arg.startsWith(`${key}=`));
  if (inline) return inline.slice(key.length + 1);
  const index = args.indexOf(key);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
}

function normalizeEmail(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

function normalizeContractNumber(value) {
  const normalized = String(value ?? "").replace(/\s+/g, "").trim();
  return normalized || null;
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCommissionTitle(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function parseMoney(value) {
  const normalized = String(value ?? "")
    .replace(/Kč/gi, "")
    .replace(/[−–]/g, "-")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();
  if (!/\d/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function compactHash(value, length = 32) {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function formatMoney(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString("cs-CZ", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} Kč`
    : "—";
}

function formatSignedMoney(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${formatMoney(value)}`;
}

function toMillis(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function positionLabel(position) {
  const normalized = String(position ?? "").trim().toLowerCase();
  const match = normalized.match(/^(poradce|manazer)(\d+)$/);
  if (!match) return normalized || "—";
  return `${match[1] === "manazer" ? "Manažer" : "Poradce"} ${match[2]}`;
}

function expectedB36HalfAmount(contract) {
  const items = Array.isArray(contract.items) ? contract.items : [];
  const item = items.find((entry) => {
    const code = String(entry?.code ?? "").trim().toUpperCase();
    const title = normalizeCommissionTitle(entry?.title);
    return (
      code === "B3601_HALF" ||
      code === "B36_HALF" ||
      (title.includes("50") && (title.includes("b3601") || title.includes("b36")))
    );
  });
  const amount = Number(item?.amount);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function describeContractMatch(match) {
  const data = match?.data ?? {};
  const typeParts = [
    data.entryType,
    data.changeType,
    positionLabel(data.position),
    data.clientName ?? data.client ?? data.name,
  ].filter(Boolean);
  return `${match?.ref?.path ?? "unknown"} (${typeParts.join(", ") || "bez popisu"}, očekává ${formatMoney(
    expectedB36HalfAmount(data)
  )})`;
}

function resolveContractMatch(row, matches) {
  if (!matches.length) return { status: "missing", match: null };
  if (matches.length === 1) return { status: "matched", match: matches[0] };

  const closeMatches = matches.filter((match) => {
    const expectedAmount = expectedB36HalfAmount(match.data);
    if (expectedAmount == null) return false;
    return Math.abs(row.amount - expectedAmount) <= COMMISSION_DIFFERENCE_TOLERANCE;
  });

  if (closeMatches.length === 1) {
    return { status: "matched", match: closeMatches[0] };
  }

  return {
    status: "ambiguous",
    match: null,
    reason:
      closeMatches.length > 1
        ? "více záznamů má podobnou očekávanou částku"
        : "žádný z duplicitních záznamů nemá očekávanou částku dost blízko výpisu",
  };
}

function extractB36OtherPayments(html, debugLabel = null) {
  const sectionMatch = String(html ?? "").match(
    /<div\b[^>]*id=["']ostatni_platby["'][^>]*>[\s\S]*?(?=<div\b[^>]*class=["'][^"']*\bvypis_sekce_toggle\b|<div\b[^>]*id=["']celkovy_prehled_provize["']|$)/i
  );
  let sectionHtml = sectionMatch?.[0] ?? "";
  if (!sectionHtml) {
    const start = String(html ?? "").search(/id=["']ostatni_platby["']/i);
    if (start >= 0) {
      const source = String(html ?? "");
      const next = source.slice(start + 1).search(/id=["'][^"']+["']/i);
      sectionHtml = source.slice(Math.max(0, start - 80), next > 0 ? start + 1 + next : start + 6000);
    }
  }
  if (debugLabel) {
    const plain = normalizeText(sectionHtml);
    const b36Index = plain.search(/B(?:36|3601)/i);
    console.log(
      `DEBUG ${debugLabel}: html=${String(html ?? "").length}, section=${sectionHtml.length}, b36Index=${b36Index}, sample=${plain.slice(Math.max(0, b36Index - 120), b36Index + 220)}`
    );
  }
  const rowMatches = sectionHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  const rows = [];
  const seenRows = new Set();

  const addRow = ({ contractNumber, commissionCode, amount, rowId, description }) => {
    if (!contractNumber || amount == null || amount <= MONEY_TOLERANCE) return;
    const seenKey = `${contractNumber}:${commissionCode}:${amount.toFixed(2)}`;
    if (seenRows.has(seenKey)) return;
    seenRows.add(seenKey);

    const rowKey = compactHash(
      ["own", "other_payment_b36_half", rowId, contractNumber, commissionCode, amount].join(":"),
      24
    );

    rows.push({
      rowId,
      rowKey,
      contractNumber,
      commissionCode,
      amount,
      description,
    });
  };

  rowMatches.forEach((rowHtml, index) => {
    const cells = rowHtml.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) ?? [];
    if (cells.length < 2) return;

    const description = normalizeText(cells[0]);
    if (!description || /^Popis$/i.test(description) || /^Počet položek:/i.test(description)) {
      return;
    }
    if (!/\b50\s*%/i.test(description) || !/\bB(?:36|3601)\b/i.test(description)) return;

    const amount = parseMoney(normalizeText(cells[1]));
    if (amount == null || amount <= MONEY_TOLERANCE) return;

    const contractNumber = normalizeContractNumber(
      description.match(/smlouvy\s+(\d{6,})/i)?.[1] ?? null
    );
    if (!contractNumber) return;

    const commissionCode = /\bB3601\b/i.test(description) ? "B3601_HALF" : "B36_HALF";
    addRow({
      contractNumber,
      commissionCode,
      amount,
      description,
      rowId: `ostatni-b36-${index + 1}`,
    });
  });

  if (rows.length === 0) {
    const plain = normalizeText(sectionHtml);
    const matches = plain.matchAll(
      /smlouvy\s+(\d{6,})\s+50\s*%\s*(?:provize\s*)?B(3601|36)\b(?:\s*\([^)]*\))?(?:\s+\d{1,2}\.\d{1,2}\.\d{4})?\s+(-?\s*\d{1,3}(?:\s\d{3})*,\d{2})/giu
    );
    let textIndex = 0;
    for (const match of matches) {
      textIndex += 1;
      const contractNumber = normalizeContractNumber(match[1] ?? null);
      const commissionCode = match[2]?.toUpperCase() === "3601" ? "B3601_HALF" : "B36_HALF";
      const amount = parseMoney(match[3] ?? "");
      addRow({
        contractNumber,
        commissionCode,
        amount,
        description: match[0] ?? "",
        rowId: `ostatni-b36-text-${textIndex}`,
      });
    }
  }

  return rows;
}

function payoutAlreadyExists(payouts, statementId, code) {
  const aliases = new Set(["B36_HALF", "B3601_HALF"]);
  aliases.add(String(code ?? "").trim().toUpperCase());
  return payouts.some((payout) => {
    if (payout?.statementId !== statementId) return false;
    const payoutCode = String(payout?.code ?? "").trim().toUpperCase();
    return aliases.has(payoutCode);
  });
}

function buildPayoutRecord({ statement, row, contract, writtenBy }) {
  const expectedAmount = expectedB36HalfAmount(contract);
  const difference =
    expectedAmount == null ? null : Math.round((row.amount - expectedAmount) * 100) / 100;
  const status =
    difference != null && Math.abs(difference) > COMMISSION_DIFFERENCE_TOLERANCE
      ? "difference"
      : "paid";
  const position = positionLabel(contract.position);
  const detailParts = [
    `${row.commissionCode}: vyplaceno ${formatMoney(row.amount)}, systém ${formatMoney(expectedAmount)}, rozdíl ${formatSignedMoney(difference)}.`,
    `Smlouva je uložená jako ${position}, výpis u této položky kariérní stupeň neuvádí.`,
  ];
  if (status === "difference") {
    detailParts.push("Priorita kontroly: prověřit rozdíl vyplacené částky této položky.");
  }

  return {
    key: compactHash(`${statement.id}:${row.rowKey}:${row.contractNumber}:${row.commissionCode}`),
    code: row.commissionCode,
    title: row.commissionCode,
    amount: row.amount,
    expectedAmount,
    difference,
    career: null,
    detail: detailParts.join(" "),
    status,
    statementId: statement.id,
    statementNumber: statement.statementNumber ?? null,
    statementPeriod: statement.period ?? null,
    statementDate: statement.statementDate ?? null,
    statementChronologyMs: statement.statementChronologyMs ?? null,
    payoutMonthKey: statement.payoutMonthKey ?? null,
    writtenAtMs: Date.now(),
    writtenBy,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const email = normalizeEmail(argValue(args, "--email", "jakub.rauscher@bohemika.eu"));
  const statementNumber = argValue(args, "--statement", null);
  const apply = args.includes("--apply");
  if (!email) throw new Error("Missing --email");

  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");
  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const statementSnap = await db
    .collection("usersPrivate")
    .doc(email)
    .collection("commissionStatements")
    .get();
  const statements = statementSnap.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter((statement) => toMillis(statement.processedAtMs) != null)
    .filter((statement) => !statementNumber || String(statement.statementNumber ?? "") === statementNumber);

  const allRows = [];
  for (const statement of statements) {
    const rows = extractB36OtherPayments(
      statement.html,
      args.includes("--debug") ? `statement-${statement.statementNumber ?? statement.id}` : null
    );
    for (const row of rows) allRows.push({ statement, row });
  }

  const contractNumbers = new Set(allRows.map(({ row }) => row.contractNumber));
  const entriesSnap = await db.collectionGroup("entries").get();
  const contractsByNumber = new Map();
  for (const doc of entriesSnap.docs) {
    const data = doc.data() ?? {};
    const contractNumber = normalizeContractNumber(data.contractNumber);
    if (!contractNumber || !contractNumbers.has(contractNumber)) continue;
    const ownerEmail = normalizeEmail(doc.ref.path.split("/")[1]);
    if (ownerEmail !== email) continue;
    const matches = contractsByNumber.get(contractNumber) ?? [];
    matches.push({ ref: doc.ref, data });
    contractsByNumber.set(contractNumber, matches);
  }

  let candidates = 0;
  let added = 0;
  let skippedExisting = 0;
  let missingContracts = 0;
  let ambiguousContracts = 0;

  for (const { statement, row } of allRows) {
    candidates += 1;
    const matches = contractsByNumber.get(row.contractNumber) ?? [];
    if (!matches.length) {
      missingContracts += 1;
      console.log(`MISSING ${row.contractNumber} statement ${statement.statementNumber}: ${row.amount}`);
      continue;
    }

    if (
      matches.some((match) =>
        payoutAlreadyExists(
          Array.isArray(match.data.commissionPayouts) ? match.data.commissionPayouts : [],
          statement.id,
          row.commissionCode
        )
      )
    ) {
      skippedExisting += 1;
      continue;
    }

    const resolved = resolveContractMatch(row, matches);
    if (resolved.status === "ambiguous") {
      ambiguousContracts += 1;
      console.log(
        `AMBIGUOUS ${row.contractNumber} výpis ${statement.statementNumber}: ${row.commissionCode} ${formatMoney(
          row.amount
        )} - ${resolved.reason}`
      );
      for (const match of matches) {
        console.log(`  - ${describeContractMatch(match)}`);
      }
      continue;
    }

    const match = resolved.match;
    const payouts = Array.isArray(match.data.commissionPayouts)
      ? match.data.commissionPayouts
      : [];

    const payout = buildPayoutRecord({
      statement,
      row,
      contract: match.data,
      writtenBy: email,
    });
    const nextPayouts = [...payouts, payout];

    console.log(
      `${apply ? "ADD" : "DRY"} ${row.contractNumber} výpis ${statement.statementNumber}: ${row.commissionCode} ${formatMoney(row.amount)}`
    );

    if (apply) {
      await match.ref.set(
        {
          commissionPayouts: nextPayouts,
          commissionStatementProcessedAtMs: Date.now(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }
    match.data.commissionPayouts = nextPayouts;
    added += 1;
  }

  console.log(
    JSON.stringify(
      {
        apply,
        statements: statements.length,
        candidates,
        added,
        skippedExisting,
        missingContracts,
        ambiguousContracts,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("B36 repair failed:", error?.message ?? error);
  process.exit(1);
});
