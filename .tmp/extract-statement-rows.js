const fs = require("node:fs");

const [file, ...targetsRaw] = process.argv.slice(2);
if (!file || targetsRaw.length === 0) {
  console.error("Usage: node .tmp/extract-statement-rows.js <html-file> <contract...>");
  process.exit(1);
}

const targets = new Set(targetsRaw.map((value) => String(value).replace(/\s+/g, "")));
const html = new TextDecoder("iso-8859-2").decode(fs.readFileSync(file));

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

const cellText = (htmlValue) =>
  decodeHtml(htmlValue)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const extractSectionById = (id) => {
  const marker = `id="${id}"`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return "";
  const start = html.lastIndexOf("<div", markerIndex);
  if (start === -1) return "";
  const nextSection = html.indexOf('<div class="vypis_sekce_toggle"', markerIndex);
  return html.slice(start, nextSection === -1 ? undefined : nextSection);
};

const parseRows = (sectionHtml) =>
  [...sectionHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) =>
    [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cellMatch) =>
      cellText(cellMatch[1])
    )
  );

for (const sectionId of ["provize", "storna", "odecty", "ostatni_platby"]) {
  const rows = parseRows(extractSectionById(sectionId));
  for (const cells of rows) {
    const hasTarget = cells.some((cell) => targets.has(String(cell).replace(/\s+/g, "")));
    if (!hasTarget) continue;
    console.log(`SECTION ${sectionId}`);
    console.log(cells.map((cell, index) => `${index}:${cell}`).join(" | "));
  }
}
