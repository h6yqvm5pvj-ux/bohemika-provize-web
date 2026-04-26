import fs from 'node:fs/promises';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const strip = (t) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '');
const LINE_Y_TOLERANCE = 2;
const WORD_GAP_THRESHOLD = 1.5;

async function extractLayoutLinesFromPage(page) {
  const content = await page.getTextContent();
  const rawItems = content?.items ?? [];
  const items = rawItems
    .map((item) => ({
      str: typeof item?.str === 'string' ? item.str.trim() : '',
      x: item?.transform?.[4] ?? 0,
      y: item?.transform?.[5] ?? 0,
      width: item?.width ?? 0,
    }))
    .filter((i) => i.str.length > 0)
    .sort((a, b) => {
      if (Math.abs(a.y - b.y) > LINE_Y_TOLERANCE) return b.y - a.y;
      return a.x - b.x;
    });

  const rows = [];
  for (const item of items) {
    let row = rows.find((r) => Math.abs(r.y - item.y) <= LINE_Y_TOLERANCE);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }
  rows.sort((a, b) => b.y - a.y);

  return rows
    .map((row) => {
      row.items.sort((a, b) => a.x - b.x);
      let line = '';
      let prevEndX = 0;
      let hasPrev = false;
      for (const item of row.items) {
        if (!hasPrev) {
          line += item.str;
          prevEndX = item.x + item.width;
          hasPrev = true;
          continue;
        }
        const gap = item.x - prevEndX;
        if (gap > WORD_GAP_THRESHOLD) line += ' ';
        line += item.str;
        prevEndX = item.x + item.width;
      }
      return line.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

const findLabelIndexes = (asciiLines, label) => {
  const indexes = [];
  asciiLines.forEach((line, idx) => {
    if (label.test(line)) indexes.push(idx);
  });
  return indexes;
};

const extractInlineValueAfterColon = (value) => {
  const idx = value.indexOf(':');
  if (idx < 0) return null;
  const tail = value.slice(idx + 1).trim();
  return tail || null;
};

const readNearestValueByLabel = (lines, asciiLines, label, maxLookahead = 6) => {
  const indexes = findLabelIndexes(asciiLines, label);
  for (const idx of indexes) {
    const line = lines[idx] ?? '';
    const inline = extractInlineValueAfterColon(line);
    if (inline) return inline;
    for (let step = 1; step <= maxLookahead; step++) {
      const next = lines[idx + step]?.trim();
      if (!next) continue;
      return next;
    }
  }
  return null;
};

const normalizeAllianzScope = (value) => {
  if (!value) return null;
  const normalized = strip(value).toLowerCase();
  if (/\bkomfort\b/.test(normalized)) return 'Komfort';
  if (/\bplus\b/.test(normalized)) return 'Plus';
  if (/\bextra\b/.test(normalized)) return 'Extra';
  if (/\bmax\b/.test(normalized)) return 'Max';
  return null;
};

const file = process.argv[2] ?? '/Users/jakubrauscher/Desktop/testallianz/testallianz.pdf';
const data = new Uint8Array(await fs.readFile(file));
const doc = await pdfjsLib.getDocument({ data }).promise;
const lines = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  lines.push(...(await extractLayoutLinesFromPage(page)));
}
const asciiLines = lines.map((l) => strip(l).toLowerCase());
const normalized = lines.join('\n').replace(/\s+/g, ' ').trim();
const ascii = strip(normalized).toLowerCase();

const scope =
  normalizeAllianzScope(readNearestValueByLabel(lines, asciiLines, /sjednany\s+balicek/i, 4)) ??
  normalizeAllianzScope(readNearestValueByLabel(lines, asciiLines, /balicek\s*:/i, 3)) ??
  normalizeAllianzScope(normalized.match(/Sjednan[ýy]\s+bal[íi][čc]ek\s*:\s*(Komfort|Plus|Extra|Max)\b/i)?.[1] ?? null) ??
  normalizeAllianzScope(normalized.match(/bal[íi][čc]ek\s*:\s*(Komfort|Plus|Extra|Max)\b/i)?.[1] ?? null) ??
  normalizeAllianzScope(ascii.match(/sjednany\s+balicek\s*:\s*(komfort|plus|extra|max)\b/i)?.[1] ?? null) ??
  normalizeAllianzScope(ascii.match(/balicek\s*:\s*(komfort|plus|extra|max)\b/i)?.[1] ?? null);

console.log('DETECTED_SCOPE=', scope);
