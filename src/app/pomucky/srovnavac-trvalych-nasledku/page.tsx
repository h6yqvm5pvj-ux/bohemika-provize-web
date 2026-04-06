// src/app/pomucky/srovnavac-trvalych-nasledku/page.tsx
"use client";

import Link from "next/link";
import { useState } from "react";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../plan-produkce/SplitTitle";

const parseNumber = (val: string): number => {
  const num = Number(val.replace(",", ".").replace(/\s+/g, ""));
  return Number.isFinite(num) ? num : NaN;
};

const formatKcInput = (value: number): string =>
  Math.round(value).toLocaleString("cs-CZ", { maximumFractionDigits: 0 });

const formatMoney = (value: number): string => {
  if (!Number.isFinite(value)) return "0 Kč";
  return (
    Math.round(value).toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
};

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

  const multiplier = getMultiplierForRange(rangePercentValue);
  const payout = sumInsuredValue * multiplier * (rangePercentValue / 100);
  const multiplier5x = getMultiplierForRange5x(rangePercentValue);
  const payout5x = sumInsuredValue * multiplier5x * (rangePercentValue / 100);
  const multiplierUniqa = getMultiplierUniqaDomino(rangePercentValue);
  const payoutUniqa = sumInsuredValue * multiplierUniqa * (rangePercentValue / 100);
  const uniqaZivotPercent = getUniqaZivotRadostPercent(rangePercentValue);
  const payoutUniqaZivot = sumInsuredValue * (uniqaZivotPercent / 100);
  const kooperativaFlexiPercent = getKooperativaFlexiPercent(rangePercentValue);
  const payoutKooperativaFlexi = sumInsuredValue * (kooperativaFlexiPercent / 100);
  const kooperativaFlexi4Percent = getKooperativaFlexi4Percent(rangePercentValue);
  const payoutKooperativaFlexi4 = sumInsuredValue * (kooperativaFlexi4Percent / 100);
  const metlifeOneGuardPercent = getMetlifeOneGuardPercent(rangePercentValue);
  const payoutMetlifeOneGuard =
    sumInsuredValue * (rangePercentValue / 100) * (metlifeOneGuardPercent / 100);
  const metlifeGarde6Percent = getMetlifeGarde6Percent(rangePercentValue);
  const payoutMetlifeGarde6 =
    sumInsuredValue * (rangePercentValue / 100) * (metlifeGarde6Percent / 100);
  const csobNasZivotPercent = getCsobNasZivotPercent(rangePercentValue);
  const payoutCsobNasZivot = sumInsuredValue * (csobNasZivotPercent / 100);
  const generaliMujZivotPercent = getGeneraliMujZivotPercent(rangePercentValue);
  const payoutGeneraliMujZivot = sumInsuredValue * (generaliMujZivotPercent / 100);
  const nnOrangePercent = getNnOrangePercent(rangePercentValue);
  const payoutNnOrange = sumInsuredValue * (nnOrangePercent / 100);
  const nnOrange10xPercent = getNnOrange10xPercent(rangePercentValue);
  const payoutNnOrange10x = sumInsuredValue * (nnOrange10xPercent / 100);
  const maximaMaxefektMultiplier = getMaximaMaxefektMultiplier(rangePercentValue);
  const payoutMaximaMaxefekt =
    sumInsuredValue * maximaMaxefektMultiplier * (rangePercentValue / 100);
  const allianzZivotPercent = getAllianzZivotPercent(rangePercentValue);
  const payoutAllianzZivot = sumInsuredValue * (allianzZivotPercent / 100);
  const simpleaMultiplier = getSimpleaMultiplier(rangePercentValue);
  const payoutSimplea =
    sumInsuredValue * simpleaMultiplier * (rangePercentValue / 100);
  const pillowMultiplier = getPillowMultiplier(rangePercentValue);
  const payoutPillow =
    sumInsuredValue * pillowMultiplier * (rangePercentValue / 100);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState<string | null>(null);

  const cards = [
    {
      key: "cpp-10x",
      insurer: "ČPP Neon",
      badges: ["10× progrese"],
      payout: payout,
      info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${multiplier} × ${rangePercentValue}%.`,
    },
    {
      key: "cpp-5x",
      insurer: "ČPP Neon",
      badges: ["5× progrese"],
      payout: payout5x,
      info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${multiplier5x} × ${rangePercentValue}%.`,
    },
    {
      key: "uniqa-domino",
      insurer: "UNIQA Domino",
      badges: ["10× progrese"],
      payout: payoutUniqa,
      info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${multiplierUniqa} × ${rangePercentValue}%.`,
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
      info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${rangePercentValue}% × ${metlifeOneGuardPercent}%.`,
    },
    {
      key: "metlife-garde6",
      insurer: "MetLife Garde 6.0",
      badges: ["10× progrese"],
      payout: payoutMetlifeGarde6,
      info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${rangePercentValue}% × ${metlifeGarde6Percent}%.`,
    },
    {
      key: "csob-nas-zivot",
      insurer: "ČSOB Náš Život",
      badges: ["8× progrese"],
      payout: payoutCsobNasZivot,
      info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${csobNasZivotPercent}%.`,
    },
    {
      key: "generali-muj-zivot",
      insurer: "Generali Můj Život",
      badges: ["10× progrese"],
      payout: payoutGeneraliMujZivot,
      info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${generaliMujZivotPercent}%.`,
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
      info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${maximaMaxefektMultiplier} × ${rangePercentValue}%.`,
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
      info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${simpleaMultiplier} × ${rangePercentValue}%.`,
    },
    {
      key: "pillow-uraz-nemoc",
      insurer: "Pillow Úraz Nemoc",
      badges: ["10× progrese"],
      payout: payoutPillow,
      info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${rangePercentValue}% × ${pillowMultiplier}.`,
    },
  ];

  const insurerOptions = Array.from(new Set(cards.map((card) => card.insurer)));

  const visibleCards = cards.filter((card) => {
    const matchesProgression =
      !showOnly10x || card.badges.some((badge) => badge.includes("10× progrese"));
    const matchesInsurer =
      selectedInsurers.length === 0 || selectedInsurers.includes(card.insurer);

    return matchesProgression && matchesInsurer;
  });

  const sortedCards = [...visibleCards].sort((a, b) => b.payout - a.payout);
  const activeFilterCount =
    (showOnly10x ? 1 : 0) +
    (compactList ? 1 : 0) +
    (selectedInsurers.length > 0 ? 1 : 0);

  const podiumStyles: Array<{
    title: string;
    subtitle: string;
    border: string;
    badgeBg: string;
    badgeText: string;
  }> = [
    {
      title: "1. místo",
      subtitle: "Nejvyšší plnění",
      border: "border-[1.5px] [border-color:rgba(100,116,139,0.85)]",
      badgeBg: "bg-white text-slate-900",
      badgeText: "TOP",
    },
  ];

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-5xl space-y-6">
        <header className="space-y-3">
          <div className="space-y-1 leading-[1.05]">
            <SplitTitle text="Srovnavač" className="leading-[1.05]" />
            <SplitTitle text="Trvalých následků" className="leading-[1.05]" />
          </div>
          <Link
            href="/pomucky"
            className="inline-flex items-center text-xs text-slate-600 hover:text-slate-900 transition"
          >
            ← Zpět na pomůcky
          </Link>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(360px,430px)_1fr]">
          <section className="w-full rounded-3xl border border-slate-900 bg-white px-5 py-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Vstupní parametry</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <label className="space-y-1 text-sm text-slate-800">
                <span className="block text-xs uppercase tracking-wide text-slate-600">
                  Pojistná částka (Kč)
                </span>
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
                  className="w-full rounded-xl bg-white border border-slate-900 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </label>

              <label className="space-y-1 text-sm text-slate-800">
                <span className="block text-xs uppercase tracking-wide text-slate-600">
                  Rozsah trvalých následků (%)
                </span>
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
                  className="w-full rounded-xl bg-white border border-slate-900 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
                {Number.isFinite(rangePercentRaw) && rangePercentRaw > 100 && (
                  <p className="text-[11px] text-amber-800">
                    Max 100 %. Počítám s {rangePercentValue}%.
                  </p>
                )}
              </label>
            </div>
          </section>

          <section className="w-full rounded-3xl border border-slate-900 bg-white px-5 py-5 space-y-3">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Filtry</h2>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
              >
                Export PDF
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">
                  {activeFilterCount === 0
                    ? "Bez aktivních filtrů"
                    : `Aktivní filtry: ${activeFilterCount}`}
                </span>
                {showOnly10x && (
                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
                    10× progrese
                  </span>
                )}
                {selectedInsurers.length > 0 && (
                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
                    Pojišťovny: {selectedInsurers.length}
                  </span>
                )}
                {compactList && (
                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
                    Kompaktní
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="inline-flex items-center rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black"
              >
                Filtry
              </button>
            </div>
          </section>
        </div>

        {filtersOpen && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 px-4 py-6"
            onClick={() => setFiltersOpen(false)}
          >
            <div
              className="w-full max-w-3xl rounded-3xl border border-slate-900 bg-white px-5 py-5 shadow-[0_25px_70px_rgba(2,6,23,0.35)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-900">Filtry a zobrazení</h3>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-900 bg-slate-900 text-sm text-white hover:bg-black"
                  aria-label="Zavřít filtry"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-500">Filtr:</div>
                  <button
                    type="button"
                    onClick={() => setShowOnly10x((v) => !v)}
                    className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                      showOnly10x
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-900 bg-white text-slate-900 hover:bg-slate-900 hover:text-white"
                    }`}
                  >
                    Pouze 10× progrese
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] text-slate-500">Zobrazení:</div>
                  <button
                    type="button"
                    onClick={() => setCompactList((v) => !v)}
                    className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                      compactList
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-900 bg-white text-slate-900 hover:bg-slate-900 hover:text-white"
                    }`}
                  >
                    {compactList ? "Kompaktní (1/řádek)" : "Karty (3/řádek)"}
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] text-slate-500">Pojišťovny:</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedInsurers([])}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                        selectedInsurers.length === 0
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-900 bg-white text-slate-900 hover:bg-slate-900 hover:text-white"
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
                          className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                            active
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-900 bg-white text-slate-900 hover:bg-slate-900 hover:text-white"
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
                    className="inline-flex items-center rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black"
                  >
                    Zavřít
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Srovnání plnění</h2>
            <span className="text-[11px] text-slate-500">Výsledek podle zadaných parametrů.</span>
          </div>

          <div
            className={
              compactList
                ? "grid gap-3 grid-cols-1"
                : "grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
            }
          >
            {sortedCards.map((card, idx) => {
              const podium = podiumStyles[idx];
              const borderClass = podium
                ? `${podium.border} border`
                : "border [border-color:rgba(71,85,105,0.75)]";

              return (
                <div
                  key={card.key}
                  className={`relative print-card rounded-3xl bg-[#020617] text-[#f8fafc] shadow-[0_12px_30px_rgba(2,6,23,0.38)] ${compactList ? "px-4 py-4" : "px-5 py-5"} ${borderClass} ${
                    compactList ? "md:flex md:items-center md:gap-4" : ""
                  }`}
                >
                  {podium && (
                    <div className="absolute -top-3 left-4 z-10 flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-900">
                      <span className={`rounded-full px-2 py-0.5 ${podium.badgeBg}`}>
                        {podium.badgeText}
                      </span>
                      <span className="text-slate-900">{podium.title}</span>
                    </div>
                  )}

                  <div
                    className={`flex items-start justify-between gap-3 ${
                      compactList ? "md:w-1/3" : ""
                    }`}
                  >
                    <div>
                      <div className="text-xs uppercase tracking-wide text-[#94a3b8]">
                        Pojišťovna
                      </div>
                      <div className="text-xl font-semibold text-[#f8fafc]">{card.insurer}</div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                    {card.badges.map((badge) => (
                      <div
                        key={badge}
                        className="rounded-full border [border-color:rgba(148,163,184,0.55)] bg-[#0f172a] px-3 py-1 text-[11px] text-[#e2e8f0]"
                      >
                        {badge}
                      </div>
                    ))}
                  </div>
                </div>

                  <div
                    className={`mt-4 space-y-2 ${compactList ? "md:mt-0 md:w-1/3" : ""}`}
                  >
                    <div className="text-sm text-[#94a3b8]">Plnění</div>
                    <div
                      className={`font-bold text-[#34d399] ${
                        compactList ? "text-2xl" : "text-3xl"
                      }`}
                    >
                      {formatMoney(card.payout)}
                    </div>
                  </div>

                <div
                  className={`flex items-end ${compactList ? "md:ml-auto md:w-1/3 md:justify-end" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => setInfoOpen(infoOpen === card.key ? null : card.key)}
                    className="relative bottom-0 right-0 mt-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white bg-white text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
                    aria-label={`Zobrazit výpočet pro ${card.insurer}`}
                  >
                    i
                  </button>
                </div>

                {infoOpen === card.key && (
                  <div
                    className="absolute bottom-16 right-4 z-10 w-56 rounded-2xl border border-slate-900 bg-white px-3 py-2"
                    style={compactList ? { bottom: "auto", top: "100%", marginTop: "8px" } : {}}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-slate-500">
                        Výpočet
                      </span>
                      <button
                        type="button"
                        onClick={() => setInfoOpen(null)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-900 bg-slate-900 text-[11px] text-white hover:bg-black"
                        aria-label="Zavřít detail výpočtu"
                      >
                        ×
                      </button>
                    </div>
                    <p className="text-[12px] leading-snug text-slate-800">{card.info}</p>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </section>
      </div>

      <style jsx global>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html,
          body {
            background: #ffffff !important;
            color: #111827 !important;
          }
          .print-card {
            background: #ffffff !important;
            border-color: #0f172a !important;
            box-shadow: none !important;
            color: #111827 !important;
          }
          .print-card * {
            color: #111827 !important;
          }
          .print-card .text-emerald-800 {
            color: #065f46 !important;
          }
          .print-card .border {
            border-color: #0f172a !important;
          }
        }
      `}</style>
    </AppLayout>
  );
}
