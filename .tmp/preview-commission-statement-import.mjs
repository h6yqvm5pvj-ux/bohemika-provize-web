import fs from "node:fs";
import path from "node:path";

const DEFAULT_INPUT_DIR = "/Users/jakubrauscher/Desktop/vypisprovizi";

const decoder = new TextDecoder("iso-8859-2");

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function cellText(html) {
  return decodeHtml(html)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(value) {
  const normalized = String(value ?? "")
    .replace(/Kč/gi, "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value) {
  return value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function extractHeader(html) {
  const statementDate = (html.match(/ze dne\s+([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i) ?? [])[1] ?? null;
  const advisorNumber = (html.match(/Číslo poradce:\s*<\/b>\s*&nbsp;([0-9]+)/i) ?? [])[1] ?? null;
  const period = cellText((html.match(/Období:\s*<\/b>\s*&nbsp;([^<]+)/i) ?? [])[1] ?? "");
  const statementNumber = (html.match(/Číslo výpisu:\s*<\/b>\s*&nbsp;([0-9]+)/i) ?? [])[1] ?? null;

  return {
    statementDate,
    advisorNumber,
    period,
    statementNumber,
  };
}

function extractSectionById(html, id) {
  const marker = `id="${id}"`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return "";

  const start = html.lastIndexOf("<div", markerIndex);
  if (start === -1) return "";

  const nextSection = html.indexOf("<div class=\"vypis_sekce_toggle\"", markerIndex);
  return html.slice(start, nextSection === -1 ? undefined : nextSection);
}

function parseRows(sectionHtml) {
  return [...sectionHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) =>
    [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cellMatch) =>
      cellText(cellMatch[1])
    )
  );
}

function parseCommissionRows(html) {
  const section = extractSectionById(html, "provize");
  return parseRows(section)
    .filter((cells) => /^\d+$/.test(cells[0] ?? ""))
    .map((cells) => ({
      id: cells[0] ?? "",
      contractNumber: cells[1] ?? "",
      signedAt: cells[2] ?? "",
      validFrom: cells[3] ?? "",
      client: cells[4] ?? "",
      role: cells[5] ?? "",
      product: (cells[6] ?? "").trim(),
      type: (cells[7] ?? "").trim(),
      base: parseMoney(cells[8]),
      baseLabel: cells[8] ?? "",
      percent: cells[10] ?? "",
      career: cells[11] ?? "",
      commission: parseMoney(cells[12]),
      commissionLabel: cells[12] ?? "",
      reserveFund: parseMoney(cells[13]),
      reserveFundLabel: cells[13] ?? "",
    }));
}

function parseOtherPayments(html) {
  const section = extractSectionById(html, "ostatni_platby");
  return parseRows(section)
    .filter(
      (cells) =>
        cells.length === 2 &&
        !/^Popis$/i.test(cells[0] ?? "") &&
        !/^Počet položek:/i.test(cells[0] ?? "")
    )
    .map((cells) => {
      const description = cells[0] ?? "";
      const contractNumber = (description.match(/smlouvy\s+(\d+)/i) ?? [])[1] ?? null;
      const isB36Half = /50\s*%\s*provize\s*B36/i.test(description);
      const isStorno = /^Storno/i.test(description);

      return {
        description,
        contractNumber,
        isB36Half,
        isStorno,
        amount: parseMoney(cells[1]),
        amountLabel: cells[1] ?? "",
      };
    });
}

function groupNeonRows(commissionRows, otherPayments) {
  const grouped = new Map();
  const neonRows = commissionRows.filter(
    (row) => row.product === "CPP_N_LIFE" && ["A101", "B0301", "ATP101"].includes(row.type)
  );
  const b36Payments = otherPayments.filter((payment) => payment.isB36Half && payment.contractNumber);

  for (const row of neonRows) {
    const existing = grouped.get(row.contractNumber) ?? {
      contractNumber: row.contractNumber,
      id: row.id,
      client: row.client,
      signedAt: row.signedAt,
      validFrom: row.validFrom,
      base: row.base,
      a101: null,
      b0301: null,
      b36: [],
    };

    if (row.type === "A101") existing.a101 = row;
    if (row.type === "B0301") existing.b0301 = row;
    if (row.type === "ATP101") existing.atp101 = row;
    grouped.set(row.contractNumber, existing);
  }

  for (const payment of b36Payments) {
    const existing = grouped.get(payment.contractNumber) ?? {
      contractNumber: payment.contractNumber,
      id: "",
      client: "Klient se doplní po spárování se systémem",
      signedAt: "",
      validFrom: "",
      base: 0,
      a101: null,
      b0301: null,
      b36: [],
    };
    existing.b36.push(payment);
    grouped.set(payment.contractNumber, existing);
  }

  return {
    contracts: [...grouped.values()],
    unmatchedB36: otherPayments.filter((payment) => payment.isB36Half && !payment.contractNumber),
  };
}

function statusFor(group) {
  const problems = [];
  if (group.atp101) return "Provize z TIPU";
  if (!group.a101 && !group.b0301 && group.b36.length > 0) return "Jen B36 z ostatních plateb";
  if (!group.a101) problems.push("chybí A101");
  if (!group.b0301) problems.push("chybí B0301 / karta klienta");
  if (group.b36.some((payment) => payment.amount < 0 || payment.isStorno)) problems.push("obsahuje storno B36");
  return problems.length > 0 ? problems.join(", ") : "OK";
}

function previewFile(filePath) {
  const html = decoder.decode(fs.readFileSync(filePath));
  const header = extractHeader(html);
  const commissionRows = parseCommissionRows(html);
  const otherPayments = parseOtherPayments(html);
  const grouped = groupNeonRows(commissionRows, otherPayments);

  console.log("");
  console.log("=".repeat(96));
  console.log(path.basename(filePath));
  console.log("=".repeat(96));
  console.log(`Poradce: ${header.advisorNumber ?? "-"}`);
  console.log(`Období: ${header.period || "-"}`);
  console.log(`Číslo výpisu: ${header.statementNumber ?? "-"}`);
  console.log(`Datum výpisu / kandidát data vyplacení: ${header.statementDate ?? "-"}`);
  console.log(`Řádků v sekci Záloha za smlouvy: ${commissionRows.length}`);
  console.log(`Řádků v sekci Ostatní platby: ${otherPayments.length}`);
  console.log("");
  console.log("ČPP ŽP NEON - položky ke spárování ke smlouvám");

  if (grouped.contracts.length === 0) {
    console.log("  Nenalezeny žádné řádky CPP_N_LIFE A101/B0301.");
  }

  for (const group of grouped.contracts) {
    const b36Total = group.b36.reduce((sum, payment) => sum + payment.amount, 0);
    const total =
      (group.a101?.commission ?? 0) +
      (group.b0301?.commission ?? 0) +
      (group.atp101?.commission ?? 0) +
      b36Total;

    console.log("");
    console.log(`  Smlouva ${group.contractNumber} | ${group.client}`);
    console.log(`    uzavřeno: ${group.signedAt || "-"} | platnost: ${group.validFrom || "-"} | základna: ${formatMoney(group.base)}`);
    console.log(`    Provize A101: ${group.a101 ? formatMoney(group.a101.commission) : "-"}`);
    console.log(`    Provize B0301: ${group.b0301 ? formatMoney(group.b0301.commission) : "-"}`);
    console.log(`    Provize z TIPU ATP101: ${group.atp101 ? formatMoney(group.atp101.commission) : "-"}`);
    console.log(`    Provize 50% z B3601: ${group.b36.length > 0 ? formatMoney(b36Total) : "-"}`);
    console.log(`    Celkem nalezeno: ${formatMoney(total)}`);
    console.log(`    Stav: ${statusFor(group)}`);
  }

  if (grouped.unmatchedB36.length > 0) {
    console.log("");
    console.log("B36 v ostatních platbách bez čísla smlouvy");
    for (const payment of grouped.unmatchedB36) {
      console.log(
        `  Smlouva ${payment.contractNumber}: ${formatMoney(payment.amount)} | ${payment.description}`
      );
    }
  }
}

function resolveInputs(args) {
  const inputs = args.length > 0 ? args : [DEFAULT_INPUT_DIR];
  const files = [];

  for (const input of inputs) {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(input)) {
        if (entry.toLowerCase().endsWith(".html")) {
          files.push(path.join(input, entry));
        }
      }
      continue;
    }
    files.push(input);
  }

  return files.sort((a, b) => a.localeCompare(b, "cs"));
}

const files = resolveInputs(process.argv.slice(2));
for (const file of files) {
  previewFile(file);
}
