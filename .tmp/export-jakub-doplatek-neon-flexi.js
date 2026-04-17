const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const outputRaw = execSync('node .tmp/report-jakub-doplatek-neon-flexi.js', {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const lines = outputRaw.split(/\r?\n/);
const startIdx = lines.findIndex((l) => l.trim() === '---');
if (startIdx < 0) {
  throw new Error('Report output is missing data separator (---).');
}

const rows = [];
for (let i = startIdx + 1; i < lines.length; i += 1) {
  const line = lines[i].trim();
  if (!line) continue;
  const parts = line.split(' | ');
  if (parts.length < 8) continue;

  rows.push({
    contractNumber: parts[0] ?? '',
    clientName: parts[1] ?? '',
    advisorName: parts[2] ?? '',
    product: parts[3] ?? '',
    standardImmediate: parts[4] ?? '',
    acceleratedImmediate: parts[5] ?? '',
    differenceImmediate: parts[6] ?? '',
    path: parts[7] ?? '',
  });
}

const header = [
  'contract_number',
  'client_name',
  'advisor_name',
  'product',
  'standard_immediate_meziprovize',
  'accelerated_immediate_meziprovize',
  'difference_immediate_doplatek',
  'entry_path',
];

const csvLines = [header.map(csvEscape).join(',')];
rows.forEach((row) => {
  const values = [
    row.contractNumber,
    row.clientName,
    row.advisorName,
    row.product,
    row.standardImmediate,
    row.acceleratedImmediate,
    row.differenceImmediate,
    row.path,
  ];
  csvLines.push(values.map(csvEscape).join(','));
});

const filename = `doplatek_jakub_neon_flexi_${new Date().toISOString().slice(0, 10)}.csv`;
const outPath = path.resolve('evidence', filename);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${csvLines.join('\n')}\n`, 'utf8');

console.log(JSON.stringify({ outPath, count: rows.length }, null, 2));
