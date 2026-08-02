// src/app/pomucky/srovnavac-trvalych-nasledku/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  Calculator,
  ChartNoAxesColumn,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Files,
  Loader2,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { formatMoney } from "@/app/lib/formatters";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
  institutionLogoKeyFromInsurerName,
} from "@/app/lib/institutionLogoDisplay";

let html2pdfPromise: Promise<any> | null = null;

async function getHtml2Pdf() {
  if (!html2pdfPromise) {
    html2pdfPromise = import("html2pdf.js").then(
      (mod: unknown) =>
        (mod as { default?: unknown }).default ??
        (mod as Record<string, unknown>)
    );
  }
  return html2pdfPromise;
}

const TN_ACTIVE_DARK_CLASS =
  "border-slate-950 bg-[linear-gradient(135deg,#111827_0%,#211442_54%,#090d1c_100%)] text-[#f8fafc] shadow-[0_12px_26px_rgba(18,12,43,0.24)]";
const TN_ACTIVE_VIOLET_CLASS =
  "border-violet-500 bg-[linear-gradient(135deg,#7c3aed_0%,#a855f7_56%,#c084fc_100%)] text-[#f8fafc] shadow-[0_12px_26px_rgba(124,58,237,0.28)]";
const TN_INACTIVE_CHIP_CLASS =
  "border-violet-100 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50/80";

type ComparisonCard = {
  key: string;
  insurer: string;
  badges: string[];
  payout: number;
  info: string;
};

const parseNumber = (val: string): number => {
  const num = Number(val.replace(",", ".").replace(/\s+/g, ""));
  return Number.isFinite(num) ? num : NaN;
};

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

const parsePercentInput = (raw: string): number => {
  const parsed = parseNumber(raw);
  if (!Number.isFinite(parsed)) return 0;
  return clampPercent(parsed);
};

const formatPercent = (value: number): string =>
  `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;

const stripUnsupportedColorFunctions = (input: string): string =>
  input.replace(/(?:oklch|lab)\([^)]*\)/gi, "#0f172a");

const getInsurerLogoPath = (insurer: string): string | null => {
  const normalized = insurer.toLowerCase();
  if (normalized.includes("čpp") || normalized.includes("cpp")) return "/icons/cpp.png";
  if (normalized.includes("uniqa")) return "/icons/uniqa.png";
  if (normalized.includes("nn")) return "/icons/nn.png";
  if (normalized.includes("kooperativa")) return "/icons/koop-v2.png";
  if (normalized.includes("pillow")) return "/icons/pillow.png";
  if (normalized.includes("generali")) return "/icons/generali.png";
  if (normalized.includes("metlife")) return "/icons/metlife.png";
  if (normalized.includes("allianz")) return "/icons/allianz.png";
  if (normalized.includes("slavia")) return "/icons/slavialogo.png";
  if (normalized.includes("comfort") || normalized.includes("commodity")) {
    return "/icons/cclogo.png";
  }
  if (normalized.includes("maxima")) return "/icons/maxima.png";
  if (normalized.includes("čsob") || normalized.includes("csob")) return "/icons/csb.png";
  if (normalized.includes("simplea")) return "/icons/simplea.png";
  return null;
};

const splitInsurerAndProduct = (value: string): { insurerName: string; productName: string } => {
  const insurerPrefixes = [
    "ČPP",
    "UNIQA",
    "Kooperativa",
    "MetLife",
    "ČSOB",
    "Generali",
    "NN",
    "Maxima",
    "Allianz",
    "Slavia",
    "Comfort Commodity",
    "Simplea",
    "Pillow",
  ];

  const lower = value.toLowerCase();
  const matched = insurerPrefixes.find((prefix) => lower.startsWith(prefix.toLowerCase()));
  if (!matched) {
    return { insurerName: value, productName: value };
  }

  const productName = value.slice(matched.length).trim();
  return {
    insurerName: matched,
    productName: productName || value,
  };
};

const formatKcInput = (value: number): string =>
  Math.round(value).toLocaleString("cs-CZ", { maximumFractionDigits: 0 });

const getMultiplierForRange = (percent: number): number => {
  if (percent <= 10) return 1;
  if (percent <= 20) return 2;
  if (percent <= 30) return 3;
  if (percent <= 40) return 4;
  if (percent <= 50) return 5;
  if (percent <= 60) return 6;
  if (percent <= 70) return 7;
  if (percent <= 80) return 8;
  if (percent <= 90) return 9;
  return 10;
};

const getMultiplierForRange5x = (percent: number): number => {
  if (percent <= 20) return 1;
  if (percent <= 40) return 2;
  if (percent <= 60) return 3;
  if (percent <= 80) return 4;
  return 5;
};

const getMultiplierUniqaDomino = (percent: number): number => {
  if (percent <= 20) return 1;
  if (percent <= 30) return 2;
  if (percent <= 40) return 3;
  if (percent <= 50) return 4;
  if (percent <= 60) return 5;
  if (percent <= 70) return 6;
  if (percent <= 80) return 7;
  if (percent <= 90) return 8;
  if (percent < 100) return 9; // 90,1 % až 99,9 %
  return 10; // přesně 100 %
};

const KOOP_FLEXI_TN10: Array<{ p: number; c: number }> = [
  { p: 0, c: 0 },
  { p: 0.5, c: 0.5 },
  { p: 1, c: 1 },
  { p: 1.5, c: 1.5 },
  { p: 2, c: 2 },
  { p: 2.5, c: 2.5 },
  { p: 3, c: 3 },
  { p: 3.5, c: 3.5 },
  { p: 4, c: 4 },
  { p: 4.5, c: 4.5 },
  { p: 5, c: 5 },
  { p: 5.5, c: 5.5 },
  { p: 6, c: 6 },
  { p: 6.5, c: 6.5 },
  { p: 7, c: 7 },
  { p: 7.5, c: 7.5 },
  { p: 8, c: 8 },
  { p: 8.5, c: 8.5 },
  { p: 9, c: 9 },
  { p: 9.5, c: 9.5 },
  { p: 10, c: 10 },
  { p: 10.5, c: 10.5 },
  { p: 11, c: 11 },
  { p: 11.5, c: 11.5 },
  { p: 12, c: 12 },
  { p: 12.5, c: 12.5 },
  { p: 13, c: 13 },
  { p: 13.5, c: 13.5 },
  { p: 14, c: 14 },
  { p: 14.5, c: 14.5 },
  { p: 15, c: 15 },
  { p: 15.5, c: 23.5 },
  { p: 16, c: 24 },
  { p: 16.5, c: 25 },
  { p: 17, c: 25.5 },
  { p: 17.5, c: 26.5 },
  { p: 18, c: 27 },
  { p: 18.5, c: 28 },
  { p: 19, c: 28.5 },
  { p: 19.5, c: 29.5 },
  { p: 20, c: 30 },
  { p: 20.5, c: 41 },
  { p: 21, c: 42 },
  { p: 21.5, c: 43 },
  { p: 22, c: 44 },
  { p: 22.5, c: 45 },
  { p: 23, c: 46 },
  { p: 23.5, c: 47 },
  { p: 24, c: 48 },
  { p: 24.5, c: 49 },
  { p: 25, c: 50 },
  { p: 25.5, c: 51 },
  { p: 26, c: 52 },
  { p: 26.5, c: 53 },
  { p: 27, c: 54 },
  { p: 27.5, c: 55 },
  { p: 28, c: 56 },
  { p: 28.5, c: 57 },
  { p: 29, c: 58 },
  { p: 29.5, c: 59 },
  { p: 30, c: 60 },
  { p: 30.5, c: 91.5 },
  { p: 31, c: 93 },
  { p: 31.5, c: 94.5 },
  { p: 32, c: 96 },
  { p: 32.5, c: 97.5 },
  { p: 33, c: 99 },
  { p: 33.5, c: 100.5 },
  { p: 34, c: 102 },
  { p: 34.5, c: 103.5 },
  { p: 35, c: 105 },
  { p: 35.5, c: 106.5 },
  { p: 36, c: 108 },
  { p: 36.5, c: 109.5 },
  { p: 37, c: 111 },
  { p: 37.5, c: 112.5 },
  { p: 38, c: 114 },
  { p: 38.5, c: 115.5 },
  { p: 39, c: 117 },
  { p: 39.5, c: 118.5 },
  { p: 40, c: 120 },
  { p: 40.5, c: 162 },
  { p: 41, c: 164 },
  { p: 41.5, c: 166 },
  { p: 42, c: 168 },
  { p: 42.5, c: 170 },
  { p: 43, c: 172 },
  { p: 43.5, c: 174 },
  { p: 44, c: 176 },
  { p: 44.5, c: 178 },
  { p: 45, c: 180 },
  { p: 45.5, c: 182 },
  { p: 46, c: 184 },
  { p: 46.5, c: 186 },
  { p: 47, c: 188 },
  { p: 47.5, c: 190 },
  { p: 48, c: 192 },
  { p: 48.5, c: 194 },
  { p: 49, c: 196 },
  { p: 49.5, c: 198 },
  { p: 50, c: 200 },
  { p: 50.5, c: 252.5 },
  { p: 51, c: 255 },
  { p: 51.5, c: 257.5 },
  { p: 52, c: 260 },
  { p: 52.5, c: 262.5 },
  { p: 53, c: 265 },
  { p: 53.5, c: 267.5 },
  { p: 54, c: 270 },
  { p: 54.5, c: 272.5 },
  { p: 55, c: 275 },
  { p: 55.5, c: 277.5 },
  { p: 56, c: 280 },
  { p: 56.5, c: 282.5 },
  { p: 57, c: 285 },
  { p: 57.5, c: 287.5 },
  { p: 58, c: 290 },
  { p: 58.5, c: 292.5 },
  { p: 59, c: 295 },
  { p: 59.5, c: 297.5 },
  { p: 60, c: 300 },
  { p: 60.5, c: 363 },
  { p: 61, c: 366 },
  { p: 61.5, c: 369 },
  { p: 62, c: 372 },
  { p: 62.5, c: 375 },
  { p: 63, c: 378 },
  { p: 63.5, c: 381 },
  { p: 64, c: 384 },
  { p: 64.5, c: 387 },
  { p: 65, c: 390 },
  { p: 65.5, c: 393 },
  { p: 66, c: 396 },
  { p: 66.5, c: 399 },
  { p: 67, c: 402 },
  { p: 67.5, c: 405 },
  { p: 68, c: 408 },
  { p: 68.5, c: 411 },
  { p: 69, c: 414 },
  { p: 69.5, c: 417 },
  { p: 70, c: 420 },
  { p: 70.5, c: 493.5 },
  { p: 71, c: 497 },
  { p: 71.5, c: 500.5 },
  { p: 72, c: 504 },
  { p: 72.5, c: 507.5 },
  { p: 73, c: 511 },
  { p: 73.5, c: 514.5 },
  { p: 74, c: 518 },
  { p: 74.5, c: 521.5 },
  { p: 75, c: 525 },
  { p: 75.5, c: 528.5 },
  { p: 76, c: 532 },
  { p: 76.5, c: 535.5 },
  { p: 77, c: 539 },
  { p: 77.5, c: 542.5 },
  { p: 78, c: 546 },
  { p: 78.5, c: 549.5 },
  { p: 79, c: 553 },
  { p: 79.5, c: 556.5 },
  { p: 80, c: 560 },
  { p: 80.5, c: 644 },
  { p: 81, c: 648 },
  { p: 81.5, c: 652 },
  { p: 82, c: 656 },
  { p: 82.5, c: 660 },
  { p: 83, c: 664 },
  { p: 83.5, c: 668 },
  { p: 84, c: 672 },
  { p: 84.5, c: 676 },
  { p: 85, c: 680 },
  { p: 85.5, c: 684 },
  { p: 86, c: 688 },
  { p: 86.5, c: 692 },
  { p: 87, c: 696 },
  { p: 87.5, c: 700 },
  { p: 88, c: 704 },
  { p: 88.5, c: 708 },
  { p: 89, c: 712 },
  { p: 89.5, c: 716 },
  { p: 90, c: 720 },
  { p: 90.5, c: 814.5 },
  { p: 91, c: 819 },
  { p: 91.5, c: 823.5 },
  { p: 92, c: 828 },
  { p: 92.5, c: 832.5 },
  { p: 93, c: 837 },
  { p: 93.5, c: 841.5 },
  { p: 94, c: 846 },
  { p: 94.5, c: 850.5 },
  { p: 95, c: 855 },
  { p: 95.5, c: 859.5 },
  { p: 96, c: 864 },
  { p: 96.5, c: 868.5 },
  { p: 97, c: 873 },
  { p: 97.5, c: 877.5 },
  { p: 98, c: 882 },
  { p: 98.5, c: 886.5 },
  { p: 99, c: 891 },
  { p: 99.5, c: 895.5 },
  { p: 100, c: 1000 },
];

const UNIQA_ZIVOT_RADOST_TABLE: number[] = [
  0, // 0 %
  1, // 1 %
  2, // 2 %
  3, // 3 %
  4, // 4 %
  6, // 5 %
  7, // 6 %
  8, // 7 %
  9, // 8 %
  10, // 9 %
  15, // 10 %
  16, // 11 %
  17, // 12 %
  18, // 13 %
  20, // 14 %
  22, // 15 %
  24, // 16 %
  26, // 17 %
  28, // 18 %
  30, // 19 %
  32, // 20 %
  42, // 21 %
  44, // 22 %
  46, // 23 %
  48, // 24 %
  50, // 25 %
  54, // 26 %
  58, // 27 %
  62, // 28 %
  66, // 29 %
  70, // 30 %
  93, // 31 %
  96, // 32 %
  99, // 33 %
  102, // 34 %
  105, // 35 %
  108, // 36 %
  113, // 37 %
  118, // 38 %
  123, // 39 %
  128, // 40 %
  164, // 41 %
  169, // 42 %
  174, // 43 %
  179, // 44 %
  184, // 45 %
  189, // 46 %
  194, // 47 %
  199, // 48 %
  204, // 49 %
  209, // 50 %
  255, // 51 %
  260, // 52 %
  265, // 53 %
  270, // 54 %
  275, // 55 %
  280, // 56 %
  290, // 57 %
  300, // 58 %
  310, // 59 %
  320, // 60 %
  366, // 61 %
  379, // 62 %
  392, // 63 %
  405, // 64 %
  418, // 65 %
  431, // 66 %
  444, // 67 %
  457, // 68 %
  470, // 69 %
  483, // 70 %
  496, // 71 %
  512, // 72 %
  528, // 73 %
  544, // 74 %
  560, // 75 %
  576, // 76 %
  592, // 77 %
  608, // 78 %
  624, // 79 %
  640, // 80 %
  656, // 81 %
  672, // 82 %
  688, // 83 %
  704, // 84 %
  720, // 85 %
  736, // 86 %
  752, // 87 %
  768, // 88 %
  784, // 89 %
  800, // 90 %
  910, // 91 %
  920, // 92 %
  930, // 93 %
  940, // 94 %
  950, // 95 %
  960, // 96 %
  970, // 97 %
  980, // 98 %
  990, // 99 %
  1000, // 100 %
];

const getUniqaZivotRadostPercent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return UNIQA_ZIVOT_RADOST_TABLE[idx] ?? 0;
};

const getKooperativaFlexiPercent = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  const roundedHalf = Math.round(clamped * 2) / 2;
  const found = KOOP_FLEXI_TN10.find((row) => row.p === roundedHalf);
  return found?.c ?? 0;
};

const getKooperativaFlexi4Percent = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  const p = Math.round(clamped * 2) / 2; // krok 0,5 %
  if (p <= 25) return p; // 1×
  if (p <= 50) return p * 2; // 2×
  if (p <= 75) return p * 3; // 3×
  return p * 4; // 4×
};

const getMetlifeOneGuardPercent = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  const ranges = [
    { max: 15, value: 100 },
    { max: 20, value: 150 },
    { max: 25, value: 200 },
    { max: 30, value: 250 },
    { max: 35, value: 300 },
    { max: 40, value: 350 },
    { max: 45, value: 400 },
    { max: 50, value: 450 },
    { max: 55, value: 500 },
    { max: 60, value: 550 },
    { max: 65, value: 600 },
    { max: 70, value: 650 },
    { max: 75, value: 700 },
    { max: 80, value: 750 },
    { max: 85, value: 800 },
    { max: 90, value: 850 },
    { max: 95, value: 900 },
    { max: 99, value: 950 },
    { max: 100, value: 1000 },
  ];

  const found = ranges.find((r) => clamped <= r.max);
  return found?.value ?? 0;
};

const getMetlifeGarde6Percent = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  const ranges = [
    { max: 15, value: 100 },
    { max: 20, value: 150 },
    { max: 25, value: 200 },
    { max: 30, value: 250 },
    { max: 35, value: 300 },
    { max: 40, value: 350 },
    { max: 45, value: 400 },
    { max: 50, value: 450 },
    { max: 55, value: 500 },
    { max: 60, value: 550 },
    { max: 65, value: 600 },
    { max: 70, value: 650 },
    { max: 75, value: 700 },
    { max: 80, value: 750 },
    { max: 85, value: 800 },
    { max: 90, value: 850 },
    { max: 95, value: 900 },
    { max: 99, value: 950 },
    { max: 100, value: 1000 },
  ];

  const found = ranges.find((r) => clamped <= r.max);
  return found?.value ?? 0;
};

const GENERALI_MUJ_ZIVOT_TABLE: number[] = [
  0, // 0 %
  1, // 1 %
  2, // 2 %
  3, // 3 %
  4, // 4 %
  5, // 5 %
  6, // 6 %
  7, // 7 %
  8, // 8 %
  9, // 9 %
  10, // 10 %
  11, // 11 %
  12, // 12 %
  13, // 13 %
  14, // 14 %
  15, // 15 %
  17, // 16 %
  19, // 17 %
  21, // 18 %
  23, // 19 %
  25, // 20 %
  27, // 21 %
  29, // 22 %
  31, // 23 %
  33, // 24 %
  35, // 25 %
  37, // 26 %
  39, // 27 %
  41, // 28 %
  43, // 29 %
  45, // 30 %
  45, // 31 %
  49, // 32 %
  51, // 33 %
  53, // 34 %
  55, // 35 %
  58, // 36 %
  61, // 37 %
  64, // 38 %
  67, // 39 %
  70, // 40 %
  73, // 41 %
  76, // 42 %
  79, // 43 %
  82, // 44 %
  85, // 45 %
  88, // 46 %
  91, // 47 %
  94, // 48 %
  97, // 49 %
  100, // 50 %
  103, // 51 %
  106, // 52 %
  109, // 53 %
  112, // 54 %
  115, // 55 %
  124, // 56 %
  133, // 57 %
  142, // 58 %
  151, // 59 %
  160, // 60 %
  169, // 61 %
  178, // 62 %
  187, // 63 %
  196, // 64 %
  205, // 65 %
  220, // 66 %
  235, // 67 %
  250, // 68 %
  265, // 69 %
  280, // 70 %
  295, // 71 %
  310, // 72 %
  325, // 73 %
  340, // 74 %
  355, // 75 %
  375, // 76 %
  395, // 77 %
  415, // 78 %
  435, // 79 %
  455, // 80 %
  475, // 81 %
  495, // 82 %
  515, // 83 %
  535, // 84 %
  555, // 85 %
  580, // 86 %
  605, // 87 %
  630, // 88 %
  655, // 89 %
  680, // 90 %
  705, // 91 %
  730, // 92 %
  755, // 93 %
  780, // 94 %
  805, // 95 %
  844, // 96 %
  883, // 97 %
  922, // 98 %
  961, // 99 %
  1000, // 100 %
];

const NN_ORANGE_TABLE: number[] = [
  0, // 0 %
  1, // 1 %
  2, // 2 %
  3, // 3 %
  4, // 4 %
  5, // 5 %
  6, // 6 %
  7, // 7 %
  8, // 8 %
  9, // 9 %
  10, // 10 %
  11, // 11 %
  12, // 12 %
  13, // 13 %
  14, // 14 %
  15, // 15 %
  16, // 16 %
  17, // 17 %
  18, // 18 %
  19, // 19 %
  20, // 20 %
  21, // 21 %
  22, // 22 %
  23, // 23 %
  24, // 24 %
  25, // 25 %
  28, // 26 %
  31, // 27 %
  34, // 28 %
  37, // 29 %
  40, // 30 %
  43, // 31 %
  46, // 32 %
  49, // 33 %
  52, // 34 %
  55, // 35 %
  58, // 36 %
  61, // 37 %
  64, // 38 %
  67, // 39 %
  70, // 40 %
  73, // 41 %
  76, // 42 %
  79, // 43 %
  82, // 44 %
  85, // 45 %
  88, // 46 %
  91, // 47 %
  94, // 48 %
  97, // 49 %
  100, // 50 %
  105, // 51 %
  110, // 52 %
  115, // 53 %
  120, // 54 %
  125, // 55 %
  130, // 56 %
  135, // 57 %
  140, // 58 %
  145, // 59 %
  150, // 60 %
  155, // 61 %
  160, // 62 %
  165, // 63 %
  170, // 64 %
  175, // 65 %
  180, // 66 %
  185, // 67 %
  190, // 68 %
  195, // 69 %
  200, // 70 %
  205, // 71 %
  210, // 72 %
  215, // 73 %
  220, // 74 %
  225, // 75 %
  236, // 76 %
  248, // 77 %
  260, // 78 %
  269, // 79 %
  275, // 80 %
  290, // 81 %
  295, // 82 %
  310, // 83 %
  315, // 84 %
  320, // 85 %
  330, // 86 %
  335, // 87 %
  345, // 88 %
  350, // 89 %
  360, // 90 %
  375, // 91 %
  380, // 92 %
  395, // 93 %
  400, // 94 %
  415, // 95 %
  420, // 96 %
  435, // 97 %
  440, // 98 %
  455, // 99 %
  500, // 100 %
];

const NN_ORANGE_10X_TABLE: number[] = [
  0, // 0 %
  1, // 1 %
  2, // 2 %
  3, // 3 %
  4, // 4 %
  5, // 5 %
  6, // 6 %
  7, // 7 %
  8, // 8 %
  9, // 9 %
  10, // 10 %
  11, // 11 %
  12, // 12 %
  14, // 13 %
  16, // 14 %
  18, // 15 %
  20, // 16 %
  22, // 17 %
  25, // 18 %
  27, // 19 %
  30, // 20 %
  34, // 21 %
  37, // 22 %
  41, // 23 %
  45, // 24 %
  49, // 25 %
  54, // 26 %
  58, // 27 %
  63, // 28 %
  68, // 29 %
  73, // 30 %
  79, // 31 %
  85, // 32 %
  91, // 33 %
  97, // 34 %
  103, // 35 %
  110, // 36 %
  117, // 37 %
  124, // 38 %
  131, // 39 %
  139, // 40 %
  147, // 41 %
  155, // 42 %
  163, // 43 %
  172, // 44 %
  180, // 45 %
  189, // 46 %
  198, // 47 %
  208, // 48 %
  217, // 49 %
  227, // 50 %
  237, // 51 %
  248, // 52 %
  258, // 53 %
  269, // 54 %
  280, // 55 %
  291, // 56 %
  302, // 57 %
  314, // 58 %
  326, // 59 %
  338, // 60 %
  350, // 61 %
  363, // 62 %
  376, // 63 %
  389, // 64 %
  402, // 65 %
  415, // 66 %
  429, // 67 %
  443, // 68 %
  457, // 69 %
  471, // 70 %
  486, // 71 %
  501, // 72 %
  516, // 73 %
  531, // 74 %
  547, // 75 %
  562, // 76 %
  578, // 77 %
  598, // 78 %
  611, // 79 %
  628, // 80 %
  644, // 81 %
  661, // 82 %
  679, // 83 %
  696, // 84 %
  714, // 85 %
  732, // 86 %
  750, // 87 %
  769, // 88 %
  787, // 89 %
  806, // 90 %
  825, // 91 %
  845, // 92 %
  865, // 93 %
  885, // 94 %
  905, // 95 %
  925, // 96 %
  945, // 97 %
  966, // 98 %
  987, // 99 %
  1000, // 100 %
];

const GENERALI_BEL_MONDO_20_TABLE: number[] = [
  0, // 0 %
  1, // 1 %
  2, // 2 %
  3, // 3 %
  4, // 4 %
  5, // 5 %
  6, // 6 %
  7, // 7 %
  8, // 8 %
  9, // 9 %
  10, // 10 %
  11, // 11 %
  12, // 12 %
  13, // 13 %
  14, // 14 %
  15, // 15 %
  17, // 16 %
  19, // 17 %
  21, // 18 %
  23, // 19 %
  25, // 20 %
  27, // 21 %
  29, // 22 %
  31, // 23 %
  33, // 24 %
  35, // 25 %
  38, // 26 %
  41, // 27 %
  44, // 28 %
  47, // 29 %
  50, // 30 %
  53, // 31 %
  56, // 32 %
  59, // 33 %
  62, // 34 %
  65, // 35 %
  69, // 36 %
  73, // 37 %
  77, // 38 %
  81, // 39 %
  85, // 40 %
  89, // 41 %
  93, // 42 %
  97, // 43 %
  101, // 44 %
  105, // 45 %
  113, // 46 %
  121, // 47 %
  129, // 48 %
  137, // 49 %
  145, // 50 %
  153, // 51 %
  161, // 52 %
  169, // 53 %
  177, // 54 %
  185, // 55 %
  196, // 56 %
  207, // 57 %
  218, // 58 %
  229, // 59 %
  240, // 60 %
  251, // 61 %
  262, // 62 %
  273, // 63 %
  284, // 64 %
  295, // 65 %
  308, // 66 %
  321, // 67 %
  334, // 68 %
  347, // 69 %
  360, // 70 %
  373, // 71 %
  386, // 72 %
  399, // 73 %
  412, // 74 %
  425, // 75 %
  441, // 76 %
  457, // 77 %
  473, // 78 %
  489, // 79 %
  505, // 80 %
  521, // 81 %
  537, // 82 %
  553, // 83 %
  569, // 84 %
  585, // 85 %
  607, // 86 %
  629, // 87 %
  651, // 88 %
  673, // 89 %
  695, // 90 %
  720, // 91 %
  745, // 92 %
  770, // 93 %
  795, // 94 %
  820, // 95 %
  856, // 96 %
  892, // 97 %
  928, // 98 %
  964, // 99 %
  1000, // 100 %
];

const ALLIANZ_ZIVOT_ANCHORS: Array<{ p: number; v: number }> = [
  { p: 0, v: 0 },
  { p: 5, v: 5 },
  { p: 10, v: 10 },
  { p: 15, v: 15 },
  { p: 20, v: 35 },
  { p: 25, v: 55 },
  { p: 30, v: 75 },
  { p: 35, v: 95 },
  { p: 40, v: 115 },
  { p: 45, v: 135 },
  { p: 50, v: 155 },
  { p: 55, v: 185 },
  { p: 60, v: 215 },
  { p: 65, v: 255 },
  { p: 70, v: 295 },
  { p: 75, v: 345 },
  { p: 80, v: 395 },
  { p: 85, v: 470 },
  { p: 90, v: 570 },
  { p: 95, v: 680 },
  { p: 100, v: 800 },
];

const CSOB_NAS_ZIVOT_TABLE: number[] = [
  0, // 0 %
  1, // 1 %
  2, // 2 %
  3, // 3 %
  4, // 4 %
  5, // 5 %
  6, // 6 %
  7, // 7 %
  8, // 8 %
  9, // 9 %
  10, // 10 %
  12, // 11 %
  13, // 12 %
  14, // 13 %
  15, // 14 %
  16, // 15 %
  18, // 16 %
  19, // 17 %
  20, // 18 %
  23, // 19 %
  24, // 20 %
  26, // 21 %
  29, // 22 %
  32, // 23 %
  35, // 24 %
  38, // 25 %
  41, // 26 %
  44, // 27 %
  47, // 28 %
  50, // 29 %
  53, // 30 %
  56, // 31 %
  59, // 32 %
  62, // 33 %
  62, // 34 %
  69, // 35 %
  68, // 36 %
  71, // 37 %
  74, // 38 %
  77, // 39 %
  80, // 40 %
  87, // 41 %
  94, // 42 %
  101, // 43 %
  108, // 44 %
  115, // 45 %
  122, // 46 %
  129, // 47 %
  136, // 48 %
  143, // 49 %
  150, // 50 %
  159, // 51 %
  168, // 52 %
  177, // 53 %
  186, // 54 %
  195, // 55 %
  204, // 56 %
  213, // 57 %
  222, // 58 %
  231, // 59 %
  240, // 60 %
  251, // 61 %
  262, // 62 %
  273, // 63 %
  284, // 64 %
  295, // 65 %
  306, // 66 %
  317, // 67 %
  328, // 68 %
  339, // 69 %
  350, // 70 %
  363, // 71 %
  376, // 72 %
  389, // 73 %
  402, // 74 %
  415, // 75 %
  428, // 76 %
  441, // 77 %
  454, // 78 %
  467, // 79 %
  480, // 80 %
  495, // 81 %
  510, // 82 %
  525, // 83 %
  540, // 84 %
  555, // 85 %
  570, // 86 %
  585, // 87 %
  600, // 88 %
  615, // 89 %
  630, // 90 %
  647, // 91 %
  664, // 92 %
  681, // 93 %
  698, // 94 %
  715, // 95 %
  732, // 96 %
  749, // 97 %
  766, // 98 %
  783, // 99 %
  800, // 100 %
];

const getCsobNasZivotPercent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return CSOB_NAS_ZIVOT_TABLE[idx] ?? 0;
};

const getCsobForteMultiplier = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  if (clamped <= 25) return 1;
  if (clamped <= 50) return 2;
  if (clamped <= 75) return 3;
  if (clamped <= 95) return 4;
  return 6;
};

const getGeneraliMujZivotPercent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return GENERALI_MUJ_ZIVOT_TABLE[idx] ?? 0;
};

const getNnOrangePercent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return NN_ORANGE_TABLE[idx] ?? 0;
};

const getNnOrange10xPercent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return NN_ORANGE_10X_TABLE[idx] ?? 0;
};

const getGeneraliBelMondo20Percent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return GENERALI_BEL_MONDO_20_TABLE[idx] ?? 0;
};

const getAllianzZivotPercent = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  let lower = ALLIANZ_ZIVOT_ANCHORS[0];
  let upper = ALLIANZ_ZIVOT_ANCHORS[ALLIANZ_ZIVOT_ANCHORS.length - 1];

  for (let i = 0; i < ALLIANZ_ZIVOT_ANCHORS.length; i++) {
    const current = ALLIANZ_ZIVOT_ANCHORS[i];
    if (current.p === clamped) return current.v;
    if (current.p < clamped) lower = current;
    if (current.p > clamped) {
      upper = current;
      break;
    }
  }

  if (upper.p === lower.p) return lower.v;

  const ratio = (clamped - lower.p) / (upper.p - lower.p);
  return Math.round(lower.v + (upper.v - lower.v) * ratio);
};

const getMaximaMaxefektMultiplier = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  if (clamped <= 20) return 1;
  if (clamped <= 40) return 2;
  if (clamped <= 55) return 3;
  if (clamped <= 65) return 4;
  if (clamped <= 75) return 5;
  if (clamped <= 85) return 6;
  if (clamped <= 90) return 7;
  if (clamped <= 95) return 8;
  if (clamped <= 98) return 9;
  return 10;
};

const getSimpleaMultiplier = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  if (clamped <= 15) return 1;
  if (clamped <= 20) return 1.5;
  if (clamped <= 30) return 2;
  if (clamped <= 40) return 3;
  if (clamped <= 50) return 4;
  if (clamped <= 60) return 5;
  if (clamped <= 70) return 6;
  if (clamped <= 80) return 7;
  if (clamped <= 90) return 8;
  return 10;
};

const PILLOW_ANCHORS: Array<{ p: number; m: number }> = [
  { p: 0, m: 1 },
  { p: 20, m: 1 },
  { p: 30, m: 1.7 },
  { p: 40, m: 2.5 },
  { p: 50, m: 3.4 },
  { p: 60, m: 4.4 },
  { p: 70, m: 5.5 },
  { p: 80, m: 6.7 },
  { p: 90, m: 8 },
  { p: 95, m: 9 },
  { p: 100, m: 10 },
];

const getPillowMultiplier = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  let lower = PILLOW_ANCHORS[0];
  let upper = PILLOW_ANCHORS[PILLOW_ANCHORS.length - 1];

  for (let i = 0; i < PILLOW_ANCHORS.length; i++) {
    const current = PILLOW_ANCHORS[i];
    if (current.p === clamped) return current.m;
    if (current.p < clamped) lower = current;
    if (current.p > clamped) {
      upper = current;
      break;
    }
  }

  if (upper.p === lower.p) return lower.m;
  const ratio = (clamped - lower.p) / (upper.p - lower.p);
  return Number((lower.m + (upper.m - lower.m) * ratio).toFixed(2));
};

export default function SrovnavacTrvalychNasledkuPage() {
  const [sumInsuredInput, setSumInsuredInput] = useState("500000");
  const [rangePercentInput, setRangePercentInput] = useState("50");
  const [showOnly10x, setShowOnly10x] = useState(false);
  const [compactList, setCompactList] = useState(false);
  const [selectedInsurers, setSelectedInsurers] = useState<string[]>([]);

  const sumInsuredValue = (() => {
    const parsed = parseNumber(sumInsuredInput);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round(parsed));
  })();

  const rangePercentRaw = parseNumber(rangePercentInput);
  const rangePercentValue = (() => {
    if (!Number.isFinite(rangePercentRaw)) return 0;
    const limited = Math.min(100, Math.max(0, rangePercentRaw));
    return limited;
  })();

  const buildCardsForPercent = (percent: number): ComparisonCard[] => {
    const normalizedPercent = clampPercent(percent);

    const multiplier = getMultiplierForRange(normalizedPercent);
    const payout = sumInsuredValue * multiplier * (normalizedPercent / 100);
    const multiplier5x = getMultiplierForRange5x(normalizedPercent);
    const payout5x = sumInsuredValue * multiplier5x * (normalizedPercent / 100);
    const multiplierUniqa = getMultiplierUniqaDomino(normalizedPercent);
    const payoutUniqa = sumInsuredValue * multiplierUniqa * (normalizedPercent / 100);
    const uniqaZivotPercent = getUniqaZivotRadostPercent(normalizedPercent);
    const payoutUniqaZivot = sumInsuredValue * (uniqaZivotPercent / 100);
    const kooperativaFlexiPercent = getKooperativaFlexiPercent(normalizedPercent);
    const payoutKooperativaFlexi = sumInsuredValue * (kooperativaFlexiPercent / 100);
    const kooperativaFlexi4Percent = getKooperativaFlexi4Percent(normalizedPercent);
    const payoutKooperativaFlexi4 = sumInsuredValue * (kooperativaFlexi4Percent / 100);
    const metlifeOneGuardPercent = getMetlifeOneGuardPercent(normalizedPercent);
    const payoutMetlifeOneGuard =
      sumInsuredValue * (normalizedPercent / 100) * (metlifeOneGuardPercent / 100);
    const metlifeGarde6Percent = getMetlifeGarde6Percent(normalizedPercent);
    const payoutMetlifeGarde6 =
      sumInsuredValue * (normalizedPercent / 100) * (metlifeGarde6Percent / 100);
    const csobNasZivotPercent = getCsobNasZivotPercent(normalizedPercent);
    const payoutCsobNasZivot = sumInsuredValue * (csobNasZivotPercent / 100);
    const csobForteMultiplier = getCsobForteMultiplier(normalizedPercent);
    const payoutCsobForte =
      sumInsuredValue * csobForteMultiplier * (normalizedPercent / 100);
    const generaliMujZivotPercent = getGeneraliMujZivotPercent(normalizedPercent);
    const payoutGeneraliMujZivot = sumInsuredValue * (generaliMujZivotPercent / 100);
    const nnOrangePercent = getNnOrangePercent(normalizedPercent);
    const payoutNnOrange = sumInsuredValue * (nnOrangePercent / 100);
    const nnOrange10xPercent = getNnOrange10xPercent(normalizedPercent);
    const payoutNnOrange10x = sumInsuredValue * (nnOrange10xPercent / 100);
    const generaliBelMondo20Percent = getGeneraliBelMondo20Percent(normalizedPercent);
    const payoutGeneraliBelMondo20 = sumInsuredValue * (generaliBelMondo20Percent / 100);
    const maximaMaxefektMultiplier = getMaximaMaxefektMultiplier(normalizedPercent);
    const payoutMaximaMaxefekt =
      sumInsuredValue * maximaMaxefektMultiplier * (normalizedPercent / 100);
    const allianzZivotPercent = getAllianzZivotPercent(normalizedPercent);
    const payoutAllianzZivot = sumInsuredValue * (allianzZivotPercent / 100);
    const simpleaMultiplier = getSimpleaMultiplier(normalizedPercent);
    const payoutSimplea =
      sumInsuredValue * simpleaMultiplier * (normalizedPercent / 100);
    const pillowMultiplier = getPillowMultiplier(normalizedPercent);
    const payoutPillow =
      sumInsuredValue * pillowMultiplier * (normalizedPercent / 100);

    return [
      {
        key: "cpp-10x",
        insurer: "ČPP Neon",
        badges: ["10× progrese"],
        payout: payout,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${multiplier} × ${formatPercent(normalizedPercent)}.`,
      },
      {
        key: "cpp-5x",
        insurer: "ČPP Neon",
        badges: ["5× progrese"],
        payout: payout5x,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${multiplier5x} × ${formatPercent(normalizedPercent)}.`,
      },
      {
        key: "uniqa-domino",
        insurer: "UNIQA Domino",
        badges: ["10× progrese"],
        payout: payoutUniqa,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${multiplierUniqa} × ${formatPercent(normalizedPercent)}.`,
      },
      {
        key: "uniqa-zivot-radost",
        insurer: "UNIQA Život & radost",
        badges: ["10× progrese"],
        payout: payoutUniqaZivot,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${uniqaZivotPercent}%.`,
      },
      {
        key: "koop-flexi",
        insurer: "Kooperativa FLEXI",
        badges: ["10× progrese"],
        payout: payoutKooperativaFlexi,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${kooperativaFlexiPercent}%.`,
      },
      {
        key: "koop-flexi-4x",
        insurer: "Kooperativa FLEXI",
        badges: ["4× progrese"],
        payout: payoutKooperativaFlexi4,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${kooperativaFlexi4Percent}%.`,
      },
      {
        key: "metlife-oneguard",
        insurer: "MetLife OneGuard",
        badges: ["10× progrese"],
        payout: payoutMetlifeOneGuard,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${formatPercent(normalizedPercent)} × ${metlifeOneGuardPercent}%.`,
      },
      {
        key: "metlife-garde6",
        insurer: "MetLife Garde 6.0",
        badges: ["10× progrese"],
        payout: payoutMetlifeGarde6,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${formatPercent(normalizedPercent)} × ${metlifeGarde6Percent}%.`,
      },
      {
        key: "csob-nas-zivot",
        insurer: "ČSOB Náš Život",
        badges: ["8× progrese"],
        payout: payoutCsobNasZivot,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${csobNasZivotPercent}%.`,
      },
      {
        key: "csob-forte",
        insurer: "ČSOB Forte",
        badges: ["6× progrese"],
        payout: payoutCsobForte,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${csobForteMultiplier} × ${formatPercent(normalizedPercent)}.`,
      },
      {
        key: "generali-muj-zivot",
        insurer: "Generali Můj Život",
        badges: ["10× progrese"],
        payout: payoutGeneraliMujZivot,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${generaliMujZivotPercent}%.`,
      },
      {
        key: "generali-bel-mondo-20",
        insurer: "Generali Bel Mondo 20",
        badges: ["10× progrese"],
        payout: payoutGeneraliBelMondo20,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${generaliBelMondo20Percent}%.`,
      },
      {
        key: "nn-orange",
        insurer: "NN Orange",
        badges: ["5× progrese"],
        payout: payoutNnOrange,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${nnOrangePercent}%.`,
      },
      {
        key: "nn-orange-10x",
        insurer: "NN Orange",
        badges: ["10× progrese"],
        payout: payoutNnOrange10x,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${nnOrange10xPercent}%.`,
      },
      {
        key: "maxima-maxefekt",
        insurer: "Maxima MAXEFEKT 6.0",
        badges: ["10× progrese"],
        payout: payoutMaximaMaxefekt,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${maximaMaxefektMultiplier} × ${formatPercent(normalizedPercent)}.`,
      },
      {
        key: "allianz-zivot",
        insurer: "Allianz Život",
        badges: ["8× progrese"],
        payout: payoutAllianzZivot,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${allianzZivotPercent}%.`,
      },
      {
        key: "simplea-2",
        insurer: "Simplea 2.0",
        badges: ["10× progrese"],
        payout: payoutSimplea,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${simpleaMultiplier} × ${formatPercent(normalizedPercent)}.`,
      },
      {
        key: "pillow-uraz-nemoc",
        insurer: "Pillow Úraz Nemoc",
        badges: ["10× progrese"],
        payout: payoutPillow,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${formatPercent(normalizedPercent)} × ${pillowMultiplier}.`,
      },
    ];
  };

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState<string | null>(null);
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [scenarioStep, setScenarioStep] = useState<0 | 1>(0);
  const [scenarioAInput, setScenarioAInput] = useState("25");
  const [scenarioBInput, setScenarioBInput] = useState("50");
  const [scenarioCInput, setScenarioCInput] = useState("75");
  const [currentExporting, setCurrentExporting] = useState(false);
  const [scenarioExporting, setScenarioExporting] = useState(false);
  const [scenarioExportError, setScenarioExportError] = useState<string | null>(null);
  const cards = buildCardsForPercent(rangePercentValue);

  const insurerOptions = Array.from(new Set(cards.map((card) => card.insurer)));

  const applyCardFilters = (sourceCards: ComparisonCard[]): ComparisonCard[] =>
    sourceCards.filter((card) => {
      const matchesProgression =
        !showOnly10x || card.badges.some((badge) => badge.includes("10× progrese"));
      const matchesInsurer =
        selectedInsurers.length === 0 || selectedInsurers.includes(card.insurer);

      return matchesProgression && matchesInsurer;
    });

  const scenarioValues = [
    { label: "Nižší rozsah", percent: parsePercentInput(scenarioAInput) },
    { label: "Střední rozsah", percent: parsePercentInput(scenarioBInput) },
    { label: "Vysoký rozsah", percent: parsePercentInput(scenarioCInput) },
  ];

  const escapeHtml = (value: string): string =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const buildScenarioPdfExportHtml = (
    generatedAt: string,
    exportScenarios = scenarioValues
  ): string => {
      const isMultiScenario = exportScenarios.length > 1;
      const scenariosHtml = exportScenarios
        .map((scenario, scenarioIndex) => {
          const scenarioCards = [...applyCardFilters(buildCardsForPercent(scenario.percent))]
            .sort((a, b) => b.payout - a.payout);
          const scenarioToneClass =
            scenarioIndex % 3 === 0
              ? "scenario--a"
              : scenarioIndex % 3 === 1
                ? "scenario--b"
                : "scenario--c";
          const scenarioLetter = ["A", "B", "C"][scenarioIndex] ?? `${scenarioIndex + 1}`;
          const scenarioToneLabel = isMultiScenario
            ? `Scénář ${scenarioLetter}`
            : "Aktuální výpočet";
          const rowsHtml = scenarioCards
            .map((card, idx) => {
              const logoPath = getInsurerLogoPath(card.insurer);
              const logoKey = institutionLogoKeyFromInsurerName(card.insurer);
              const { insurerName, productName } = splitInsurerAndProduct(card.insurer);
              const logoClass =
                logoKey === "cpp" || logoKey === "kooperativa"
                  ? " insurer-logo--wide"
                  : logoKey === "allianz" || logoKey === "axa"
                    ? " insurer-logo--medium"
                    : logoKey === "slavia"
                      ? " insurer-logo--square"
                      : "";
              const rankBadgeClass =
                idx === 0
                  ? "rank-badge rank-badge--top"
                  : idx === 1
                    ? "rank-badge rank-badge--second"
                    : idx === 2
                      ? "rank-badge rank-badge--third"
                      : "rank-badge";
              const variantText = card.badges.join(", ") || "Bez varianty";
              const insurerCell = logoPath
                ? `<div class="insurer-cell"><span class="insurer-logo-wrap"><img class="insurer-logo${logoClass}" src="${escapeHtml(
                    logoPath
                  )}" alt="" /></span><span class="insurer-copy"><span class="insurer-name">${escapeHtml(
                    insurerName
                  )}</span><span class="insurer-product">${escapeHtml(
                    productName
                  )}</span></span></div>`
                : `<div class="insurer-cell insurer-cell--text"><span class="insurer-copy"><span class="insurer-name">${escapeHtml(
                    insurerName
                  )}</span><span class="insurer-product">${escapeHtml(
                    productName
                  )}</span></span></div>`;
              return `
                <tr>
                  <td class="rank-cell"><span class="${rankBadgeClass}">${idx + 1}</span></td>
                  <td class="insurer-col">${insurerCell}</td>
                  <td class="variant-col"><span class="variant-chip">${escapeHtml(variantText)}</span></td>
                  <td class="amount-col">${escapeHtml(formatMoney(card.payout))}</td>
                </tr>
              `;
            })
            .join("");
          const leadersHtml = scenarioCards
            .slice(0, 3)
            .map((card, idx) => {
              const logoPath = getInsurerLogoPath(card.insurer);
              const { insurerName, productName } = splitInsurerAndProduct(card.insurer);
              const logoMarkup = logoPath
                ? `<span class="leader-logo-wrap"><img class="leader-logo" src="${escapeHtml(
                    logoPath
                  )}" alt="" /></span>`
                : `<span class="leader-logo-wrap leader-logo-fallback">${escapeHtml(
                    insurerName.slice(0, 2).toUpperCase()
                  )}</span>`;

              return `
                <div class="leader-card">
                  <span class="leader-rank">${idx + 1}</span>
                  <div class="leader-identity">
                    ${logoMarkup}
                    <span class="leader-copy">
                      <span class="leader-name">${escapeHtml(insurerName)}</span>
                      <span class="leader-product">${escapeHtml(productName)}</span>
                    </span>
                  </div>
                  <span class="leader-variant">${escapeHtml(card.badges.join(", ") || "Varianta")}</span>
                  <strong class="leader-payout">${escapeHtml(formatMoney(card.payout))}</strong>
                </div>
              `;
            })
            .join("");

          return `
            <section class="report-page ${scenarioToneClass}">
              <header class="page-header">
                <div class="hero-main">
                  <span class="hero-badge">${isMultiScenario ? "Export 3 scénáře" : "Export PDF"}</span>
                  <h1>Trvalé následky</h1>
                  <p>Porovnání plnění podle zadané pojistné částky a rozsahu poškození.</p>
                </div>
                <div class="hero-side">
                  <span>${escapeHtml(scenarioToneLabel)}</span>
                  <strong>${escapeHtml(formatPercent(scenario.percent))}</strong>
                  <small>${escapeHtml(scenario.label)}</small>
                </div>
                <div class="hero-date">
                  <span>Vygenerováno</span>
                  <strong>${escapeHtml(generatedAt)}</strong>
                </div>
              </header>

              <section class="info-card">
                <div class="info-grid">
                  <div class="info-item">
                    <span class="info-label">Pojistná částka</span>
                    <strong class="info-value">${escapeHtml(formatMoney(sumInsuredValue))}</strong>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Rozsah</span>
                    <strong class="info-value">${escapeHtml(formatPercent(scenario.percent))}</strong>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Počet variant</span>
                    <strong class="info-value">${scenarioCards.length}</strong>
                  </div>
                </div>
              </section>

              ${
                leadersHtml
                  ? `<section class="section-block">
                      <div class="section-title">Nejvyšší plnění</div>
                      <div class="leader-list">${leadersHtml}</div>
                    </section>`
                  : ""
              }

              <section class="section-block section-block--table">
                <div class="section-title">Přehled variant</div>
                <table class="scenario-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Pojišťovna</th>
                      <th>Varianta</th>
                      <th>Plnění</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml || `<tr><td colspan="4" class="empty-cell">Bez výsledků pro tento scénář.</td></tr>`}
                  </tbody>
                </table>
              </section>
            </section>
          `;
        })
        .join("");

      const pdfHtml = `
        <div class="report-stack">
          ${scenariosHtml}
        </div>
      `;

      const styleBlock = `
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { box-sizing: border-box; }
          .pdf-root {
            width: 794px;
            margin: 0 auto;
            padding: 0;
            background: #ffffff;
            font-family: Inter, "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            color: #0b1020;
            -webkit-font-smoothing: antialiased;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .report-stack {
            width: 794px;
            margin: 0 auto;
          }
          .report-page {
            --accent: #7c3aed;
            --accent-soft: #f8f5ff;
            position: relative;
            width: 794px;
            height: 1123px;
            min-height: 1123px;
            padding: 30px 34px 32px;
            background: #ffffff;
            color: #0b1020;
            break-after: page;
            page-break-after: always;
            overflow: hidden;
          }
          .report-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .report-page::before {
            content: "";
            position: absolute;
            inset: 0 0 auto 0;
            height: 6px;
            background: linear-gradient(90deg, #020617 0%, #7c3aed 54%, #ec4899 100%);
          }
          .scenario--b { --accent: #4c1d95; --accent-soft: #f7f2ff; }
          .scenario--c { --accent: #a21caf; --accent-soft: #fff1fb; }
          .page-header {
            position: relative;
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 18px;
            min-height: 116px;
            margin: 0;
            padding: 20px 22px;
            border-radius: 20px 20px 0 0;
            background: linear-gradient(135deg, #12091f 0%, #4c1d95 58%, #7c3aed 100%);
            color: #ffffff;
            overflow: hidden;
          }
          .hero-main {
            position: relative;
            z-index: 1;
            min-width: 0;
          }
          .hero-badge {
            display: inline-flex;
            width: fit-content;
            align-items: center;
            border-radius: 999px;
            padding: 6px 11px;
            border: 1px solid rgba(255,255,255,0.35);
            background: #ffffff;
            color: #2e1065;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
          }
          .hero-main h1 {
            margin: 10px 0 0;
            color: #ffffff;
            font-size: 36px;
            line-height: 1;
            font-weight: 700;
            letter-spacing: 0;
          }
          .hero-main p {
            max-width: 390px;
            margin: 8px 0 0;
            color: rgba(255,255,255,0.76);
            font-size: 10px;
            line-height: 1.45;
            font-weight: 600;
          }
          .hero-side {
            position: relative;
            z-index: 1;
            min-width: 145px;
            border: 1px solid rgba(255,255,255,0.24);
            border-radius: 16px;
            background: rgba(255,255,255,0.11);
            padding: 11px 12px;
            text-align: right;
          }
          .hero-side span,
          .hero-side small,
          .hero-date span {
            display: block;
            color: rgba(255,255,255,0.68);
            font-size: 8px;
            line-height: 1.2;
            font-weight: 700;
            letter-spacing: 0.11em;
            text-transform: uppercase;
          }
          .hero-side strong {
            display: block;
            margin-top: 5px;
            color: #ffffff;
            font-size: 24px;
            line-height: 1;
            font-weight: 700;
          }
          .hero-side small {
            margin-top: 5px;
            color: rgba(255,255,255,0.82);
            letter-spacing: 0;
            text-transform: none;
          }
          .hero-date {
            position: absolute;
            right: 22px;
            bottom: 18px;
            z-index: 1;
            text-align: right;
          }
          .hero-date strong {
            display: block;
            margin-top: 3px;
            color: #ffffff;
            font-size: 10px;
            line-height: 1.2;
            font-weight: 600;
          }
          .info-card {
            margin: 0 0 24px;
            border: 1px solid #eadff8;
            border-top: 0;
            border-radius: 0 0 18px 18px;
            background: #ffffff;
            overflow: hidden;
          }
          .info-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .info-item {
            min-height: 58px;
            padding: 13px 15px 12px;
            border-left: 1px solid #eadff8;
          }
          .info-item:first-child {
            border-left: 0;
          }
          .info-label {
            display: block;
            margin-bottom: 4px;
            color: #6d28d9;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
          }
          .info-value {
            display: block;
            color: #0b1020;
            font-size: 13px;
            line-height: 1.2;
            font-weight: 650;
          }
          .section-block {
            margin-top: 22px;
          }
          .section-title {
            display: flex;
            align-items: center;
            gap: 9px;
            margin-bottom: 11px;
            color: #0b1020;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }
          .section-title::before {
            content: "";
            width: 20px;
            height: 3px;
            border-radius: 999px;
            background: linear-gradient(90deg, #020617, var(--accent));
          }
          .leader-list {
            display: flex;
            flex-direction: column;
            border: 1px solid #eee7f6;
            border-radius: 16px;
            overflow: hidden;
            background: #ffffff;
          }
          .leader-card {
            display: grid;
            grid-template-columns: 32px minmax(0, 1fr) 120px 128px;
            align-items: center;
            gap: 12px;
            min-height: 54px;
            padding: 9px 12px;
            border-top: 1px solid #f0e7f7;
          }
          .leader-card:first-child {
            border-top: 0;
          }
          .leader-card::before {
            content: "";
            position: absolute;
          }
          .leader-rank,
          .rank-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            border: 1px solid #ddd6fe;
            background: #f8f5ff;
            color: #5b21b6;
            font-weight: 700;
          }
          .leader-rank {
            width: 24px;
            height: 24px;
            font-size: 10px;
          }
          .rank-badge {
            min-width: 22px;
            height: 22px;
            font-size: 10px;
          }
          .rank-badge--top {
            border-color: #a78bfa;
            background: #f5f3ff;
            color: #4c1d95;
          }
          .rank-badge--second,
          .rank-badge--third {
            border-color: #eadff8;
            background: #ffffff;
            color: #0b1020;
          }
          .leader-identity,
          .insurer-cell {
            display: flex;
            align-items: center;
            gap: 9px;
            min-width: 0;
          }
          .leader-logo-wrap,
          .insurer-logo-wrap {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 46px;
            height: 28px;
            flex: 0 0 46px;
            border: 1px solid #eee7f6;
            border-radius: 10px;
            background: #ffffff;
          }
          .leader-logo,
          .insurer-logo {
            width: auto;
            height: auto;
            max-width: 42px;
            max-height: 23px;
            object-fit: contain;
            display: block;
          }
          .insurer-logo--wide { max-width: 50px; }
          .insurer-logo--medium { max-width: 46px; }
          .insurer-logo--square { max-width: 34px; }
          .leader-logo-fallback {
            color: #6d28d9;
            font-size: 10px;
            font-weight: 700;
          }
          .leader-copy,
          .insurer-copy {
            display: flex;
            flex-direction: column;
            min-width: 0;
          }
          .leader-name,
          .insurer-name {
            color: #0b1020;
            font-size: 12px;
            line-height: 1.15;
            font-weight: 700;
            overflow-wrap: anywhere;
          }
          .leader-product,
          .insurer-product {
            margin-top: 2px;
            color: #667085;
            font-size: 9px;
            line-height: 1.15;
            font-weight: 600;
            overflow-wrap: anywhere;
          }
          .leader-variant,
          .variant-chip {
            display: inline-flex;
            width: fit-content;
            max-width: 100%;
            align-items: center;
            justify-content: center;
            border: 1px solid #eadff8;
            border-radius: 999px;
            background: #fbf7ff;
            color: #5b21b6;
            padding: 4px 8px;
            font-size: 9px;
            line-height: 1.1;
            font-weight: 700;
            text-align: center;
          }
          .leader-payout,
          .amount-col {
            color: #0b1020;
            font-size: 13px;
            line-height: 1.1;
            font-weight: 700;
            text-align: right;
            white-space: nowrap;
          }
          .section-block--table {
            margin-top: 24px;
          }
          .scenario-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: separate;
            border-spacing: 0;
            border: 1px solid #eee7f6;
            border-radius: 16px;
            overflow: hidden;
            background: #ffffff;
          }
          .scenario-table thead th {
            background: #070b18;
            color: #ffffff;
            padding: 8px 11px;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-align: left;
            text-transform: uppercase;
          }
          .scenario-table tbody td {
            padding: 6px 11px;
            border-top: 1px solid #f0e7f7;
            color: #0b1020;
            font-size: 10px;
            line-height: 1.15;
          }
          .scenario-table tbody tr:nth-child(even) td {
            background: #fcfaff;
          }
          .rank-cell {
            width: 44px;
            text-align: center;
          }
          .insurer-col {
            width: 43%;
          }
          .variant-col {
            width: 25%;
          }
          .amount-col {
            width: 24%;
          }
          .empty-cell {
            padding: 16px 12px;
            text-align: center;
            color: #667085;
            background: #fbf7ff;
          }
        </style>
      `;

      return stripUnsupportedColorFunctions(
        `<div class="pdf-root">${styleBlock}${pdfHtml}</div>`
      );
  };

  const validateScenarioExportInputs = (): boolean => {
    if (sumInsuredValue <= 0) {
      setScenarioExportError("Zadej nejdřív pojistnou částku.");
      return false;
    }

    const scenarioInputs = [
      { label: "nižší rozsah", value: scenarioAInput },
      { label: "střední rozsah", value: scenarioBInput },
      { label: "vysoký rozsah", value: scenarioCInput },
    ];
    const invalidInput = scenarioInputs.find(({ value }) => {
      const parsed = parseNumber(value);
      return !Number.isFinite(parsed) || parsed < 0 || parsed > 100;
    });

    if (invalidInput) {
      setScenarioExportError(`Zadej ${invalidInput.label} v rozmezí 0 až 100 %.`);
      return false;
    }

    return true;
  };

  const openScenarioExportModal = () => {
    setScenarioStep(0);
    setScenarioExportError(null);
    setScenarioModalOpen(true);
  };

  const goToScenarioPreview = () => {
    if (!validateScenarioExportInputs()) return;
    setScenarioExportError(null);
    setScenarioStep(1);
  };

  const createPdfExportOptions = (filename: string): any => ({
    margin: [0, 0, 0, 0],
    filename,
    image: { type: "png", quality: 1 },
    html2canvas: {
      scale: 2.6,
      backgroundColor: "#ffffff",
      useCORS: true,
      windowWidth: 794,
      scrollX: 0,
      scrollY: 0,
      onclone: (doc: Document) => {
        // html2canvas neumí CSS color funkce lab()/oklch()
        // z některých globálních stylů, proto je při exportu odfiltrujeme.
        doc.querySelectorAll("link[rel='stylesheet']").forEach((n) => n.remove());
        doc.querySelectorAll("style").forEach((n) => {
          const text = n.textContent ?? "";
          if (/(oklch|lab)\(/i.test(text)) n.remove();
        });
      },
    },
    jsPDF: { unit: "pt", format: "a4", orientation: "portrait", compress: true },
    pagebreak: {
      mode: ["css", "legacy"],
      before: ".report-page:not(:first-child)",
      avoid: [".leader-card", ".info-card", ".scenario-table tbody tr"],
    },
  });

  const handleExportCurrentPdf = async () => {
    if (sumInsuredValue <= 0) {
      setScenarioExportError("Zadej nejdřív pojistnou částku.");
      return;
    }

    setScenarioExportError(null);
    setCurrentExporting(true);
    try {
      const html2pdf = await getHtml2Pdf();
      const generatedAt = new Date().toLocaleString("cs-CZ");
      const fileStamp = new Date().toISOString().slice(0, 10);
      const exportHtml = buildScenarioPdfExportHtml(generatedAt, [
        { label: "Aktuální rozsah", percent: rangePercentValue },
      ]);

      await (html2pdf() as any)
        .set(createPdfExportOptions(`srovnani_trvalych_nasledku_${fileStamp}.pdf`))
        .from(exportHtml)
        .save();
    } catch (error) {
      console.error("Nepodařilo se vygenerovat PDF srovnání trvalých následků", error);
      const detail =
        error instanceof Error && error.message ? ` (${error.message})` : "";
      setScenarioExportError(`Generování PDF selhalo${detail}. Zkus to prosím znovu.`);
    } finally {
      setCurrentExporting(false);
    }
  };

  const handleExportThreeScenarioPdf = async () => {
    if (!validateScenarioExportInputs()) return;

    setScenarioExportError(null);
    setScenarioExporting(true);
    try {
      const html2pdf = await getHtml2Pdf();
      const generatedAt = new Date().toLocaleString("cs-CZ");
      const fileStamp = new Date().toISOString().slice(0, 10);
      const exportHtml = buildScenarioPdfExportHtml(generatedAt);

      await (html2pdf() as any)
        .set(createPdfExportOptions(`srovnani_trvalych_nasledku_scenare_${fileStamp}.pdf`))
        .from(exportHtml)
        .save();
    } catch (error) {
      console.error("Nepodařilo se vygenerovat 3 scénáře PDF", error);
      const detail =
        error instanceof Error && error.message ? ` (${error.message})` : "";
      setScenarioExportError(`Generování 3stránkového PDF selhalo${detail}. Zkus to prosím znovu.`);
    } finally {
      setScenarioExporting(false);
    }
  };

  const visibleCards = applyCardFilters(cards);

  const sortedCards = [...visibleCards].sort((a, b) => b.payout - a.payout);
  const activeFilterCount =
    (showOnly10x ? 1 : 0) +
    (compactList ? 1 : 0) +
    (selectedInsurers.length > 0 ? 1 : 0);

  const podiumStyles: Array<{ badgeText: string }> = [{ badgeText: "TOP" }];
  const scenarioStepperSteps = ["Scénáře", "Náhled PDF"];
  const scenarioPreviewSrcDoc =
    scenarioModalOpen && scenarioStep === 1
      ? `<!doctype html><html lang="cs"><head><meta charset="utf-8" /><style>html,body{margin:0;background:#ffffff;min-height:100%;}body{display:flex;justify-content:center;padding:16px;}.preview-scale{zoom:.94;}@supports not (zoom:1){.preview-scale{width:106.383%;transform:scale(.94);transform-origin:top center;}}</style></head><body><div class="preview-scale">${buildScenarioPdfExportHtml(
          new Date().toLocaleString("cs-CZ")
        )}</div></body></html>`
      : "";

  return (
    <AppLayout active="tools">
      <div className="relative w-full max-w-[1500px] space-y-3 overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#fbf7ff_45%,#ffffff_100%)] px-0 pb-8 sm:space-y-4 sm:px-3">
        <header className="flex flex-col gap-3 px-0 pt-0 sm:gap-4 sm:px-2 sm:pt-2">
          <Link
            href="/pomucky"
            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-violet-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_8px_18px_rgba(76,29,149,0.07)] transition hover:border-violet-300 hover:bg-violet-50 sm:gap-2 sm:py-2 sm:shadow-[0_10px_24px_rgba(76,29,149,0.08)]"
          >
            <ChevronLeft className="h-4 w-4" />
            Zpět na pomůcky
          </Link>

          <div className="flex flex-col gap-4 min-[560px]:flex-row min-[560px]:items-end min-[560px]:justify-between">
            <div className="space-y-2 sm:space-y-3">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-200 bg-white/92 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700 shadow-[0_8px_18px_rgba(217,70,239,0.08)] sm:gap-2 sm:px-3 sm:text-[11px] sm:tracking-[0.18em] sm:shadow-[0_10px_24px_rgba(217,70,239,0.1)]">
                <ChartNoAxesColumn className="h-3.5 w-3.5" />
                Srovnávač plnění
              </div>
              <div>
                <h1 className="text-[2.3rem] font-black leading-[0.98] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                  Trvalé následky
                </h1>
                <p className="mt-2 max-w-2xl text-xs font-semibold leading-6 text-slate-500 sm:mt-3 sm:text-sm sm:leading-relaxed">
                  Porovnej plnění podle pojistné částky a rozsahu poškození. Export používá stejná data i aktivní filtry.
                </p>
              </div>
            </div>

            <div className="hidden shrink-0 min-[560px]:block">
              <Image
                src="/icons/nasledna.webp"
                alt="Trvalé následky"
                width={260}
                height={260}
                className="h-28 w-auto object-contain grayscale opacity-90 sm:h-36"
                priority
              />
            </div>
          </div>
        </header>

        <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(330px,430px)_1fr]">
          <section className="relative w-full space-y-3 overflow-hidden rounded-[22px] border border-violet-100 bg-white p-3 shadow-[0_12px_28px_rgba(76,29,149,0.08)] sm:space-y-4 sm:rounded-[28px] sm:p-4 sm:shadow-[0_18px_42px_rgba(76,29,149,0.10)]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]"
            />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
                <Calculator className="h-3.5 w-3.5" />
                <span>Vstupní parametry</span>
              </h2>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
              <label className="rounded-[18px] border border-violet-100 bg-white/85 p-3 shadow-sm transition focus-within:border-fuchsia-300 focus-within:ring-2 focus-within:ring-fuchsia-500/10 sm:rounded-2xl sm:p-3.5">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase leading-tight tracking-[0.14em] text-fuchsia-700">
                      Pojistná částka
                    </span>
                    <span className="rounded-lg border border-violet-100 bg-violet-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-violet-700">
                      Kč
                    </span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    min={0}
                    value={sumInsuredInput}
                    onChange={(e) => {
                      setSumInsuredInput(e.target.value);
                    }}
                    onBlur={() => {
                      const parsed = parseNumber(sumInsuredInput);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        setSumInsuredInput(formatKcInput(parsed));
                      }
                    }}
                    className="mt-2.5 w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-base font-semibold leading-none text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-fuchsia-300 focus:ring-0 sm:mt-3 sm:text-lg"
                  />
                </div>
              </label>

              <label className="rounded-[18px] border border-violet-100 bg-white/85 p-3 shadow-sm transition focus-within:border-fuchsia-300 focus-within:ring-2 focus-within:ring-fuchsia-500/10 sm:rounded-2xl sm:p-3.5">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase leading-tight tracking-[0.14em] text-fuchsia-700">
                      Rozsah trvalých následků
                    </span>
                    <span className="rounded-lg border border-violet-100 bg-violet-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-violet-700">
                      %
                    </span>
                  </div>
                  <input
                    type="number"
                    max={100}
                    value={rangePercentInput}
                    onChange={(e) => setRangePercentInput(e.target.value)}
                    onBlur={() => {
                      const parsed = parseNumber(rangePercentInput);
                      if (!Number.isFinite(parsed)) return;
                      const limited = Math.min(100, Math.max(0, parsed));
                      setRangePercentInput(formatKcInput(limited));
                    }}
                    className="mt-2.5 w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-base font-semibold leading-none text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-fuchsia-300 focus:ring-0 sm:mt-3 sm:text-lg"
                  />
                  {Number.isFinite(rangePercentRaw) && rangePercentRaw > 100 && (
                    <p className="mt-2 text-[11px] font-semibold text-fuchsia-700">
                      Max 100 %. Počítám s {rangePercentValue}%.
                    </p>
                  )}
                </div>
              </label>
            </div>
          </section>

          <section className="relative w-full space-y-3 overflow-hidden rounded-[22px] border border-violet-100 bg-white p-3 shadow-[0_12px_28px_rgba(76,29,149,0.08)] sm:space-y-4 sm:rounded-[28px] sm:p-4 sm:shadow-[0_18px_42px_rgba(76,29,149,0.10)]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]"
            />
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <h2 className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Filtry</span>
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => void handleExportCurrentPdf()}
                  disabled={currentExporting || scenarioExporting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-[0_6px_14px_rgba(76,29,149,0.07)] transition hover:border-violet-400 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60 sm:gap-2 sm:px-4 sm:py-2 sm:shadow-[0_8px_18px_rgba(76,29,149,0.08)]"
                >
                  {currentExporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  <span>{currentExporting ? "Generuji…" : "Export PDF"}</span>
                </button>
                <button
                  type="button"
                  onClick={openScenarioExportModal}
                  disabled={currentExporting || scenarioExporting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-fuchsia-300/35 bg-[linear-gradient(135deg,#020617_0%,#4c1d95_55%,#ec4899_100%)] px-3 py-1.5 text-xs font-semibold text-zinc-50 shadow-[0_8px_20px_rgba(76,29,149,0.22)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:gap-2 sm:px-4 sm:py-2 sm:shadow-[0_12px_30px_rgba(76,29,149,0.25)]"
                >
                  {scenarioExporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Files className="h-3.5 w-3.5" />
                  )}
                  <span>{scenarioExporting ? "Generuji…" : "Export 3 scénáře PDF"}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] border border-violet-100 bg-white/85 px-3 py-2.5 shadow-sm sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">
                  {activeFilterCount === 0
                    ? "Bez aktivních filtrů"
                    : `Aktivní filtry: ${activeFilterCount}`}
                </span>
                {showOnly10x && (
                  <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-violet-700">
                    10× progrese
                  </span>
                )}
                {selectedInsurers.length > 0 && (
                  <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-violet-700">
                    Pojišťovny: {selectedInsurers.length}
                  </span>
                )}
                {compactList && (
                  <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-violet-700">
                    Hustší řádky
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-950 bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Filtry</span>
              </button>
            </div>
          </section>
        </div>

        {scenarioModalOpen && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
            onClick={() => setScenarioModalOpen(false)}
          >
            <section
              className={`relative max-h-[94vh] w-full overflow-y-auto rounded-[28px] border border-violet-100 bg-white p-4 text-slate-950 shadow-[0_34px_90px_rgba(15,23,42,0.28)] sm:p-5 ${
                scenarioStep === 1 ? "max-w-7xl" : "max-w-5xl"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]"
              />
              <button
                type="button"
                onClick={() => setScenarioModalOpen(false)}
                className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-100 bg-white text-slate-700 transition hover:border-fuchsia-200 hover:bg-fuchsia-50"
                aria-label="Zavřít export scénářů"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex flex-col gap-3 pr-12 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
                    Klientský PDF výstup
                  </p>
                  <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950 sm:text-xl">
                    Export 3 scénářů
                  </h3>
                </div>
                {scenarioStep === 1 ? (
                  <button
                    type="button"
                    onClick={handleExportThreeScenarioPdf}
                    disabled={scenarioExporting}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-fuchsia-300/35 bg-[linear-gradient(135deg,#020617_0%,#4c1d95_55%,#ec4899_100%)] px-5 py-2.5 text-sm font-semibold text-zinc-50 shadow-[0_12px_30px_rgba(76,29,149,0.25)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {scenarioExporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4" />
                    )}
                    {scenarioExporting ? "Generuji…" : "Stáhnout PDF"}
                  </button>
                ) : null}
              </div>

              <div className="mt-4 rounded-2xl border border-violet-100 bg-white/85 px-3 py-2.5 shadow-sm">
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${scenarioStepperSteps.length}, minmax(0, 1fr))`,
                  }}
                >
                  {scenarioStepperSteps.map((stepLabel, index) => {
                    const stepDone = scenarioStep > index;
                    const stepActive = scenarioStep === index;

                    return (
                      <div key={stepLabel} className="flex flex-col items-center gap-1 text-center">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
                            stepDone
                              ? "border-violet-500 bg-violet-600 text-white"
                              : stepActive
                                ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700"
                                : "border-violet-100 bg-white text-slate-400"
                          }`}
                        >
                          {stepDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                        </span>
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                            stepActive || stepDone ? "text-slate-950" : "text-slate-400"
                          }`}
                        >
                          {stepLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2.5 h-1.5 rounded-full bg-violet-50">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#020617_0%,#7c3aed_55%,#ec4899_100%)] transition-[width] duration-300"
                    style={{
                      width: `${((scenarioStep + 1) / scenarioStepperSteps.length) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-4">
                {scenarioStep === 0 ? (
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-fuchsia-700">
                      Rozsahy trvalých následků
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        {
                          label: "1. scénář",
                          helper: "Nižší rozsah",
                          value: scenarioAInput,
                          onChange: setScenarioAInput,
                        },
                        {
                          label: "2. scénář",
                          helper: "Střední rozsah",
                          value: scenarioBInput,
                          onChange: setScenarioBInput,
                        },
                        {
                          label: "3. scénář",
                          helper: "Vysoký rozsah",
                          value: scenarioCInput,
                          onChange: setScenarioCInput,
                        },
                      ].map((item) => (
                        <label
                          key={item.label}
                          className="rounded-2xl border border-violet-100 bg-white/85 px-4 py-3 shadow-sm transition focus-within:border-fuchsia-300 focus-within:ring-2 focus-within:ring-fuchsia-500/10"
                        >
                          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700">
                            {item.label}
                          </span>
                          <span className="mt-1 block text-sm font-semibold text-slate-950">
                            {item.helper}
                          </span>
                          <div className="mt-3 flex items-end gap-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={item.value}
                              onChange={(e) => item.onChange(e.target.value)}
                              className="w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-2xl font-black leading-none text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-fuchsia-300 focus:ring-0"
                            />
                            <span className="mb-2 rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">
                              %
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                    <p className="rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-xs font-semibold leading-relaxed text-slate-600">
                      Export použije aktuální pojistnou částku a aktivní filtry. Náhled v dalším kroku ukazuje stejný obsah, který se stáhne do PDF.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_22px_56px_rgba(76,29,149,0.14)]">
                      <iframe
                        title="Náhled klientského PDF výstupu"
                        srcDoc={scenarioPreviewSrcDoc}
                        className="h-[calc(94vh-205px)] min-h-[560px] w-full bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {scenarioExportError ? (
                <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  {scenarioExportError}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-500">
                  Krok {scenarioStep + 1} / {scenarioStepperSteps.length}
                </p>
                <div className="ml-auto flex items-center gap-2">
                  {scenarioStep > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setScenarioExportError(null);
                        setScenarioStep(0);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Zpět
                    </button>
                  ) : null}

                  {scenarioStep === 0 ? (
                    <button
                      type="button"
                      onClick={goToScenarioPreview}
                      className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-300/35 bg-[linear-gradient(135deg,#020617_0%,#4c1d95_55%,#ec4899_100%)] px-5 py-2.5 text-sm font-semibold text-zinc-50 shadow-[0_12px_30px_rgba(76,29,149,0.25)] transition hover:-translate-y-0.5 hover:brightness-110"
                    >
                      Pokračovat
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        )}

        {filtersOpen && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
            onClick={() => setFiltersOpen(false)}
          >
            <div
              className="relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-violet-100 bg-white px-5 py-5 shadow-[0_34px_90px_rgba(15,23,42,0.28)]"
              onClick={(e) => e.stopPropagation()}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]"
              />
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Filtry a zobrazení</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-950 bg-slate-950 text-sm text-white hover:bg-black"
                  aria-label="Zavřít filtry"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Filtr</div>
                  <button
                    type="button"
                    onClick={() => setShowOnly10x((v) => !v)}
                    className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                      showOnly10x
                        ? TN_ACTIVE_DARK_CLASS
                        : TN_INACTIVE_CHIP_CLASS
                    }`}
                  >
                    Pouze 10× progrese
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Zobrazení</div>
                  <button
                    type="button"
                    onClick={() => setCompactList((v) => !v)}
                    className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                      compactList
                        ? TN_ACTIVE_VIOLET_CLASS
                        : TN_INACTIVE_CHIP_CLASS
                    }`}
                  >
                    {compactList ? "Hustší řádky" : "Standardní řádky"}
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pojišťovny</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedInsurers([])}
                      className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                        selectedInsurers.length === 0
                          ? TN_ACTIVE_DARK_CLASS
                          : TN_INACTIVE_CHIP_CLASS
                      }`}
                    >
                      Všechny
                    </button>
                    {insurerOptions.map((insurer) => {
                      const active = selectedInsurers.includes(insurer);

                      return (
                        <button
                          key={insurer}
                          type="button"
                          onClick={() =>
                            setSelectedInsurers((current) =>
                              current.includes(insurer)
                                ? current.filter((item) => item !== insurer)
                                : [...current, insurer]
                            )
                          }
                          className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                            active
                              ? TN_ACTIVE_VIOLET_CLASS
                              : TN_INACTIVE_CHIP_CLASS
                          }`}
                          aria-pressed={active}
                        >
                          {insurer}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="inline-flex items-center rounded-xl border border-slate-950 bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black"
                  >
                    Zavřít
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <section className="relative overflow-visible rounded-[28px] border border-violet-100 bg-white p-4 shadow-[0_18px_42px_rgba(76,29,149,0.10)]">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]"
          />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
                <ChartNoAxesColumn className="h-3.5 w-3.5" />
                Srovnání plnění
              </h2>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Výsledek podle zadaných parametrů.
              </p>
            </div>
            <div className="text-right text-xs font-semibold text-slate-500">
              {sortedCards.length} variant
            </div>
          </div>

          {scenarioExportError && !scenarioModalOpen ? (
            <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {scenarioExportError}
            </p>
          ) : null}

          <div className="mt-4 overflow-visible rounded-2xl border border-violet-100 bg-white">
            {sortedCards.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                Žádná varianta neodpovídá aktivním filtrům.
              </div>
            ) : (
              sortedCards.map((card, idx) => {
                const podium = podiumStyles[idx];
                const logoPath = getInsurerLogoPath(card.insurer);
                const logoKey = institutionLogoKeyFromInsurerName(card.insurer);
                const { insurerName, productName } = splitInsurerAndProduct(card.insurer);

                return (
                  <div
                    key={card.key}
                    className={`group relative grid gap-3 border-t border-violet-100 px-4 first:border-t-0 hover:bg-violet-50/40 sm:grid-cols-[44px_minmax(0,1fr)_minmax(120px,0.42fr)_minmax(132px,auto)_36px] sm:items-center ${
                      compactList ? "py-2" : "py-3"
                    }`}
                  >
                    <div className="flex items-center gap-2 sm:block">
                      <span
                        className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-black ${
                          idx === 0
                            ? "border-violet-500 bg-[linear-gradient(135deg,#111827_0%,#4c1d95_58%,#7c3aed_100%)] text-white"
                            : "border-violet-100 bg-white text-slate-700"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      {podium ? (
                        <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-700 sm:hidden">
                          {podium.badgeText}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-violet-100 bg-white shadow-sm ${institutionLogoFrameClass(
                          logoKey,
                          "compact"
                        )}`}
                      >
                        {logoPath ? (
                          <Image
                            src={logoPath}
                            alt={insurerName}
                            fill
                            sizes="64px"
                            className={institutionLogoImageClass(logoKey)}
                          />
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400">LOGO</span>
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="break-words text-base font-black leading-tight text-slate-950">
                            {insurerName}
                          </div>
                          {podium ? (
                            <span className="hidden rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-700 sm:inline-flex">
                              {podium.badgeText}
                            </span>
                          ) : null}
                        </div>
                        <div className="break-words text-xs font-semibold leading-snug text-slate-500">
                          {productName}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {card.badges.map((badge) => (
                        <span
                          key={badge}
                          className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700 sm:text-right">
                        Plnění
                      </div>
                      <div className="mt-0.5 whitespace-nowrap text-base font-black leading-none text-slate-950 sm:text-right">
                        {formatMoney(card.payout)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setInfoOpen(infoOpen === card.key ? null : card.key)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-white text-xs font-black text-violet-700 transition hover:border-fuchsia-300 hover:bg-fuchsia-50"
                      aria-label={`Zobrazit výpočet pro ${card.insurer}`}
                      aria-expanded={infoOpen === card.key}
                      title="Výpočet"
                    >
                      i
                    </button>

                    {infoOpen === card.key && (
                      <div className="absolute right-3 top-[calc(100%-4px)] z-20 w-72 rounded-2xl border border-violet-200 bg-white px-3 py-2 text-slate-900 shadow-[0_18px_40px_rgba(76,29,149,0.22)]">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fuchsia-700">
                            Výpočet
                          </span>
                          <button
                            type="button"
                            onClick={() => setInfoOpen(null)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-950 bg-slate-950 text-[11px] text-white hover:bg-black"
                            aria-label="Zavřít detail výpočtu"
                          >
                            ×
                          </button>
                        </div>
                        <p className="text-[12px] leading-snug text-slate-700">{card.info}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

    </AppLayout>
  );
}
