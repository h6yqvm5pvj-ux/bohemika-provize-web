import fs from 'node:fs/promises';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node .tmp/inspect-domex-lines.mjs /path/to/pdf');
  process.exit(1);
}

const strip = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
const LINE_Y_TOLERANCE = 2;
const WORD_GAP_THRESHOLD = 1.5;

function linesFromItems(rawItems) {
  const items = rawItems
    .map((item) => ({
      str: typeof item?.str === 'string' ? item.str.trim() : '',
      x: item?.transform?.[4] ?? 0,
      y: item?.transform?.[5] ?? 0,
      width: item?.width ?? 0,
    }))
    .filter((item) => item.str.length > 0)
    .sort((a, b) => {
      if (Math.abs(a.y - b.y) > LINE_Y_TOLERANCE) return b.y - a.y;
      return a.x - b.x;
    });

  const rows = [];
  for (const item of items) {
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= LINE_Y_TOLERANCE);
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

const data = await fs.readFile(filePath);
const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  const lines = linesFromItems(content.items ?? []);
  console.log(`\n===== PAGE ${p} =====`);
  for (let i = 0; i < lines.length; i++) {
    const ascii = strip(lines[i]).toLowerCase();
    if (
      ascii.includes('misto pojisteni') ||
      ascii.includes('adresa') ||
      ascii.includes('pojisteni staveb') ||
      ascii.includes('predmet pojisteni') ||
      ascii.includes('rozsah pojisteni') ||
      ascii.includes('pojistna castka / limit pojistneho plneni') ||
      ascii.includes('pojistne castky , pojistne a spoluucast') ||
      ascii.includes('hlavni stavba') ||
      ascii.includes('spoluucast') ||
      ascii.includes('mini') || ascii.includes('opti') || ascii.includes('maxi') || ascii.includes('nop')
    ) {
      console.log(String(i + 1).padStart(4, ' '), lines[i]);
    }
  }
}
