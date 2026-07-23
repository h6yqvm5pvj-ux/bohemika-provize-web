#!/usr/bin/env node

import { stat, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const ROOT = process.cwd();
const ICON_DIR = path.join(ROOT, "public", "icons");
const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 82;

const TARGET_ICONS = [
  "cilmesice",
  "export-produkce",
  "icon_auto",
  "icon_cestovko",
  "icon_domex",
  "icon_zamex",
  "kalendar",
  "klient",
  "nasledna",
  "pdfexp",
  "penize2",
  "trezor",
  "zivot",
];

const replaceSource = process.argv.includes("--replace");

const formatKb = (bytes) => `${Math.round(bytes / 1024)} KB`;

let totalBefore = 0;
let totalAfter = 0;

for (const name of TARGET_ICONS) {
  const source = path.join(ICON_DIR, `${name}.png`);
  const output = path.join(ICON_DIR, `${name}.webp`);

  let sourceStats;
  try {
    sourceStats = await stat(source);
  } catch {
    continue;
  }

  await sharp(source)
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: WEBP_QUALITY,
      effort: 5,
    })
    .toFile(output);

  const outputStats = await stat(output);
  totalBefore += sourceStats.size;
  totalAfter += outputStats.size;

  if (replaceSource) {
    await unlink(source);
  }

  console.log(
    `${name}.png -> ${name}.webp: ${formatKb(sourceStats.size)} -> ${formatKb(
      outputStats.size
    )}`
  );
}

if (totalBefore === 0) {
  console.log("No target PNG icons found.");
} else {
  console.log(
    `Optimized icons: ${formatKb(totalBefore)} -> ${formatKb(totalAfter)}${
      replaceSource ? " and removed source PNG files." : "."
    }`
  );
}
