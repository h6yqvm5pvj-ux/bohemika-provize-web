import fs from 'node:fs/promises';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const strip = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (text) => strip(text).toLowerCase();

const looksLikeStandaloneLabelLine = (value) => {
  const n = norm(value).trim();
  return (
    /[:：]\s*$/.test(value) ||
    /^(pojistnik|pojisteny|jmeno|prijmeni|datum|frekvence|pojistne|typ osoby|ico|adresa|email|mobil|platce dph)\s*$/.test(n) ||
    n.includes('nazev/jmeno a prijmeni') ||
    n.includes('titul, jmeno, prijmeni')
  );
};

const readNearest = (lines, asciiLines, label, maxLookahead = 6) => {
  for (let idx = 0; idx < asciiLines.length; idx += 1) {
    if (!label.test(asciiLines[idx])) continue;
    const line = lines[idx] ?? '';
    const colon = line.indexOf(':');
    if (colon >= 0) {
      const inline = line.slice(colon + 1).trim();
      if (inline) return inline;
    }
    for (let step = 1; step <= maxLookahead; step += 1) {
      const next = lines[idx + step]?.trim();
      if (!next) continue;
      if (looksLikeStandaloneLabelLine(next)) continue;
      return next;
    }
  }
  return null;
};

const toDateInput = (value) => {
  if (!value) return null;
  const m = value.match(/(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})/);
  if (!m) return null;
  const [, dRaw, mRaw, yRaw] = m;
  const d = String(Number(dRaw)).padStart(2, '0');
  const mm = String(Number(mRaw)).padStart(2, '0');
  return `${yRaw}-${mm}-${d}`;
};

const normalizeVehicleMakeModel = (value) => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, '')
    .trim();
  if (!cleaned || cleaned.length < 2) return null;
  if (!/[A-Za-zÀ-ž0-9]/.test(cleaned)) return null;
  return cleaned;
};

const normalizePlate = (value) => {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, '').trim().toUpperCase();
  if (cleaned.length < 3) return null;
  return cleaned;
};

const normalizeVin = (value) => {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, '').trim().toUpperCase();
  if (cleaned.length < 10) return null;
  if (!/^[A-HJ-NPR-Z0-9]+$/.test(cleaned)) return null;
  return cleaned;
};

const normalizeVehicleDocCode = (value) => {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, '').trim().toUpperCase();
  if (cleaned.length < 3) return null;
  if (cleaned === 'NENI' || cleaned === 'NENÍ') return null;
  return cleaned;
};

const LIABILITY_LIMIT_VALUES = new Set([
  50_000_000,
  70_000_000,
  100_000_000,
  150_000_000,
  200_000_000,
  250_000_000,
]);

const normalizeLiabilityLimit = (value) => {
  if (!value) return null;
  const normalized = value.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();

  const groupedMatches = normalized.match(/\d[\d\s]{4,}\d/g) ?? [];
  for (const candidate of groupedMatches) {
    const num = Number.parseInt(candidate.replace(/\s+/g, ''), 10);
    if (Number.isFinite(num) && LIABILITY_LIMIT_VALUES.has(num)) return num;
  }

  const slashMatch = normalized.match(/\b(50|70|100|150|200|250)\s*\/\s*(50|70|100|150|200|250)\b/);
  if (slashMatch?.[1] && slashMatch[1] === slashMatch[2]) {
    const mil = Number.parseInt(slashMatch[1], 10);
    if (Number.isFinite(mil)) return mil * 1_000_000;
  }

  const milMatch = normalized.match(/\b(50|70|100|150|200|250)\b\s*(?:mil(?:ionu?)?|mio)/i);
  if (milMatch?.[1]) {
    const mil = Number.parseInt(milMatch[1], 10);
    if (Number.isFinite(mil)) return mil * 1_000_000;
  }

  const compact = normalized.replace(/[^\d]/g, '');
  if (compact.length >= 7) {
    const num = Number.parseInt(compact, 10);
    if (Number.isFinite(num) && LIABILITY_LIMIT_VALUES.has(num)) return num;
  }

  return null;
};

const filePath = '/Users/jakubrauscher/Desktop/testkoop/testkoop.pdf';
const data = await fs.readFile(filePath);
const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;

const pages = [];
for (let i = 1; i <= doc.numPages; i += 1) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  const text = content.items
    .map((item) => (typeof item?.str === 'string' ? item.str : ''))
    .filter(Boolean)
    .join('\n');
  pages.push(text);
}

const fullText = pages.join('\n');
const lines = fullText
  .split(/\n+/)
  .map((line) => line.trim())
  .filter(Boolean);
const asciiLines = lines.map((line) => norm(line));

const contract = (readNearest(lines, asciiLines, /cislo\s+navrhu/i, 5) ?? '').replace(/\D+/g, '');
const clientName = readNearest(lines, asciiLines, /nazev\/?jmeno\s+a\s+prijmeni/i, 4);
const policyStartDate = toDateInput(readNearest(lines, asciiLines, /pocatek\s+pojisteni/i, 4));
const contractSignedDate = toDateInput(
  readNearest(lines, asciiLines, /datum\s+vzniku\s+navrhu\s+smlouvy/i, 4)
);

const manufacturer = normalizeVehicleMakeModel(
  readNearest(lines, asciiLines, /tovarni\s+znacka/i, 4)
);
const model = normalizeVehicleMakeModel(
  readNearest(lines, asciiLines, /obchodni\s+oznaceni/i, 4)
);
const carMake = normalizeVehicleMakeModel([manufacturer, model].filter(Boolean).join(' '));
const carPlate = normalizePlate(readNearest(lines, asciiLines, /registracni\s+znacka/i, 3));
const carVin = normalizeVin(readNearest(lines, asciiLines, /^vin$/i, 3));
const carOrv = normalizeVehicleDocCode(readNearest(lines, asciiLines, /cislo\s+technicaku/i, 3));
const carLiabilityLimit = normalizeLiabilityLimit(
  readNearest(lines, asciiLines, /limit\s+pro\s+ujmu\s+na\s+zdravi\s+nebo\s+na\s+zivote/i, 4)
);

console.log(
  JSON.stringify(
    {
      contract,
      clientName,
      policyStartDate,
      contractSignedDate,
      carMake,
      carPlate,
      carVin,
      carOrv,
      carLiabilityLimit,
      periodRaw: readNearest(lines, asciiLines, /pojistne\s+obdobi/i, 4),
      amountRaw: readNearest(lines, asciiLines, /pojistne\s+za\s+pojistne\s+obdobi/i, 4),
    },
    null,
    2
  )
);
