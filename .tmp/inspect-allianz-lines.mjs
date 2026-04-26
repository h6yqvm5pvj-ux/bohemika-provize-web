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

const file = process.argv[2] ?? '/Users/jakubrauscher/Desktop/testallianz/testallianz.pdf';
const data = new Uint8Array(await fs.readFile(file));
const doc = await pdfjsLib.getDocument({ data }).promise;
const lines = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const pageLines = await extractLayoutLinesFromPage(page);
  lines.push(...pageLines);
}

for (let i = 0; i < lines.length; i++) {
  const ascii = strip(lines[i]).toLowerCase();
  if (ascii.includes('sjednan') || ascii.includes('balicek') || ascii.includes('povinne ruceni') || ascii.includes('rozsirena asistence') || ascii.includes('prirodni udalosti') || ascii.includes('pozar a vybuch') || ascii.includes('kradez') || ascii.includes('skla') || ascii.includes('vandalismus') || ascii.includes('havarie') || ascii.includes('doplatek na nove') || ascii.includes('gap')) {
    console.log('\n---- index', i, '----');
    for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 5); j++) {
      console.log(String(j).padStart(4, ' '), '|', lines[j]);
    }
  }
}

console.log('\nTOTAL LINES:', lines.length);
