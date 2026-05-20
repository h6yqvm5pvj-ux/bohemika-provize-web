#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createCanvas } = require("@napi-rs/canvas");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

const WIDTH = 800;
const HEIGHT = 450;
const FPS = 10;
const DURATION_MS = 17000;
const TOTAL_FRAMES = Math.round((DURATION_MS / 1000) * FPS);
const FRAME_DELAY = Math.round(1000 / FPS);

const OUTPUT_DIR = path.resolve(__dirname, "../public/demos");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "homepage-flow.gif");

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext("2d");

const EASE = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from, to, t) {
  return from + (to - from) * t;
}

function progress(ms, start, end) {
  return clamp((ms - start) / (end - start), 0, 1);
}

function roundedRectPath(context, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

function fillRoundedRect(context, x, y, w, h, r, color) {
  roundedRectPath(context, x, y, w, h, r);
  context.fillStyle = color;
  context.fill();
}

function strokeRoundedRect(context, x, y, w, h, r, color, lineWidth = 1) {
  roundedRectPath(context, x, y, w, h, r);
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.stroke();
}

function drawText(context, text, x, y, options = {}) {
  const {
    size = 14,
    weight = 500,
    color = "#D7DEEA",
    align = "left",
    baseline = "alphabetic",
  } = options;
  context.font = `${weight} ${size}px "Arial"`;
  context.textAlign = align;
  context.textBaseline = baseline;
  context.fillStyle = color;
  context.fillText(text, x, y);
}

function drawPointer(context, x, y, scale = 1, click = 0) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);

  context.shadowColor = "rgba(0,0,0,0.45)";
  context.shadowBlur = 10;
  context.shadowOffsetY = 3;

  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, 20);
  context.lineTo(6, 16);
  context.lineTo(10, 28);
  context.lineTo(14, 27);
  context.lineTo(10, 15);
  context.lineTo(20, 15);
  context.closePath();
  context.fillStyle = "#F8FBFF";
  context.fill();

  context.shadowColor = "transparent";
  context.lineWidth = 1.2;
  context.strokeStyle = "#182133";
  context.stroke();

  if (click > 0) {
    context.beginPath();
    context.arc(8, 10, 10 + click * 8, 0, Math.PI * 2);
    context.strokeStyle = `rgba(147, 197, 253, ${0.55 * (1 - click)})`;
    context.lineWidth = 2;
    context.stroke();
  }

  context.restore();
}

function drawBase(context, ms) {
  const bgGradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGradient.addColorStop(0, "#0B1220");
  bgGradient.addColorStop(1, "#111E31");
  context.fillStyle = bgGradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.strokeStyle = "rgba(120, 139, 173, 0.08)";
  context.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 32) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, HEIGHT);
    context.stroke();
  }
  for (let y = 0; y < HEIGHT; y += 32) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(WIDTH, y);
    context.stroke();
  }

  const appX = 36;
  const appY = 26;
  const appW = WIDTH - 72;
  const appH = HEIGHT - 52;

  fillRoundedRect(context, appX, appY, appW, appH, 18, "rgba(8, 12, 20, 0.86)");
  strokeRoundedRect(context, appX, appY, appW, appH, 18, "rgba(84, 108, 147, 0.35)");

  fillRoundedRect(context, appX + 1, appY + 1, appW - 2, 44, 17, "rgba(17, 28, 45, 0.95)");
  drawText(context, "BOHEMIKA PROVIZE", appX + 20, appY + 28, {
    size: 13,
    weight: 700,
    color: "#DCEBFF",
  });
  drawText(context, "Auto výpočet provizí", appX + 180, appY + 28, {
    size: 12,
    weight: 500,
    color: "#91A8CE",
  });

  const pulse = 0.45 + 0.55 * Math.sin((ms / 1000) * Math.PI * 0.9);
  fillRoundedRect(
    context,
    appX + appW - 116,
    appY + 13,
    90,
    20,
    10,
    `rgba(31, 201, 129, ${0.18 + pulse * 0.15})`,
  );
  drawText(context, "LIVE DEMO", appX + appW - 71, appY + 27, {
    size: 10,
    weight: 700,
    color: "#A7F3D0",
    align: "center",
  });

  const sidebarX = appX + 16;
  const sidebarY = appY + 60;
  const sidebarW = 168;
  const sidebarH = appH - 76;
  fillRoundedRect(context, sidebarX, sidebarY, sidebarW, sidebarH, 12, "rgba(18, 31, 51, 0.8)");

  const navItems = [
    "Dashboard",
    "Smlouvy",
    "Provize",
    "Výplaty",
    "Audit",
    "Nastavení",
  ];
  navItems.forEach((item, idx) => {
    const rowY = sidebarY + 18 + idx * 42;
    const active = idx === 2;
    if (active) {
      fillRoundedRect(context, sidebarX + 10, rowY - 14, sidebarW - 20, 30, 8, "rgba(59, 130, 246, 0.28)");
    }
    drawText(context, item, sidebarX + 24, rowY + 4, {
      size: 12,
      weight: active ? 700 : 500,
      color: active ? "#D9E9FF" : "#8EA2C8",
    });
  });
}

function drawHeadline(context, stepLabel, subtitle) {
  drawText(context, stepLabel, 240, 111, {
    size: 12,
    weight: 700,
    color: "#93C5FD",
  });
  drawText(context, subtitle, 240, 138, {
    size: 18,
    weight: 700,
    color: "#EAF2FF",
  });
}

function drawImportScene(context, ms) {
  const pIn = EASE.inOutCubic(progress(ms, 0, 3200));
  drawHeadline(context, "KROK 1/5", "Import smlouvy");

  const zoneX = 260;
  const zoneY = 158;
  const zoneW = 460;
  const zoneH = 205;
  fillRoundedRect(context, zoneX, zoneY, zoneW, zoneH, 16, "rgba(16, 27, 45, 0.92)");
  strokeRoundedRect(context, zoneX, zoneY, zoneW, zoneH, 16, "rgba(75, 117, 171, 0.55)");

  context.setLineDash([8, 6]);
  strokeRoundedRect(context, zoneX + 18, zoneY + 52, zoneW - 36, 95, 10, "rgba(122, 153, 204, 0.55)", 1.5);
  context.setLineDash([]);

  drawText(context, "Přetáhněte PDF/CSV smlouvu", zoneX + zoneW / 2, zoneY + 98, {
    size: 16,
    weight: 700,
    align: "center",
    color: "#DDEAFF",
  });
  drawText(context, "nebo klikněte pro výběr souboru", zoneX + zoneW / 2, zoneY + 123, {
    size: 12,
    weight: 500,
    align: "center",
    color: "#8EA9D0",
  });

  const fileMove = EASE.inOutCubic(progress(ms, 350, 1900));
  const fileX = lerp(190, 445, fileMove);
  const fileY = lerp(100, 202, fileMove);

  fillRoundedRect(context, fileX, fileY, 118, 56, 9, "rgba(37, 99, 235, 0.96)");
  drawText(context, "Smlouva_05_2026.pdf", fileX + 58, fileY + 33, {
    size: 10,
    weight: 700,
    align: "center",
    color: "#F4F8FF",
  });

  const loadP = EASE.outCubic(progress(ms, 1300, 3200));
  fillRoundedRect(context, zoneX + 36, zoneY + 170, zoneW - 72, 16, 8, "rgba(36, 53, 79, 0.9)");
  fillRoundedRect(context, zoneX + 36, zoneY + 170, (zoneW - 72) * loadP, 16, 8, "rgba(56, 189, 248, 0.95)");
  drawText(context, `Nahrávání ${Math.round(loadP * 100)} %`, zoneX + 36, zoneY + 204, {
    size: 11,
    weight: 600,
    color: "#98B2D8",
  });

  const pointerX = lerp(220, 465, progress(ms, 500, 2000));
  const pointerY = lerp(130, 230, progress(ms, 500, 2000));
  drawPointer(context, pointerX, pointerY, 1.1, pIn > 0.6 ? (pIn - 0.6) / 0.4 : 0);
}

function drawValidationScene(context, ms) {
  drawHeadline(context, "KROK 2/5", "Kontrola a doplnění dat");

  const cardX = 260;
  const cardY = 158;
  const cardW = 460;
  const cardH = 205;
  fillRoundedRect(context, cardX, cardY, cardW, cardH, 16, "rgba(16, 27, 45, 0.92)");
  strokeRoundedRect(context, cardX, cardY, cardW, cardH, 16, "rgba(75, 117, 171, 0.55)");

  const local = progress(ms, 3200, 6700);
  const rows = [
    { label: "Klient", value: "Jan Novák", okAt: 0.05 },
    { label: "Produkt", value: "Životní pojištění", okAt: 0.14 },
    { label: "Pojistné", value: "2 450 Kč / měsíc", okAt: 0.32 },
    { label: "Datum podpisu", value: "15.05.2026", okAt: 0.62 },
    { label: "Tarif", value: "STANDARD", okAt: 0.74 },
  ];

  rows.forEach((row, idx) => {
    const y = cardY + 26 + idx * 34;
    fillRoundedRect(context, cardX + 18, y - 16, cardW - 36, 28, 7, "rgba(22, 38, 61, 0.92)");
    drawText(context, row.label, cardX + 30, y + 2, {
      size: 11,
      weight: 600,
      color: "#91A9CF",
    });
    drawText(context, row.value, cardX + 160, y + 2, {
      size: 12,
      weight: 600,
      color: "#DCE8FC",
    });

    const ok = local >= row.okAt;
    if (idx === 3 && !ok) {
      strokeRoundedRect(context, cardX + 18, y - 16, cardW - 36, 28, 7, "rgba(239, 68, 68, 0.85)", 1.4);
      fillRoundedRect(context, cardX + cardW - 120, y - 11, 90, 18, 6, "rgba(239, 68, 68, 0.2)");
      drawText(context, "chybí údaj", cardX + cardW - 75, y + 2, {
        size: 10,
        weight: 700,
        align: "center",
        color: "#FCA5A5",
      });
      return;
    }

    if (ok) {
      fillRoundedRect(context, cardX + cardW - 52, y - 11, 24, 18, 5, "rgba(16, 185, 129, 0.26)");
      drawText(context, "✓", cardX + cardW - 40, y + 2, {
        size: 12,
        weight: 700,
        align: "center",
        color: "#6EE7B7",
      });
    }
  });

  const pointerP = progress(ms, 4020, 5600);
  const pointerClick = clamp((pointerP - 0.4) / 0.22, 0, 1);
  drawPointer(context, lerp(665, 671, pointerP), lerp(252, 257, pointerP), 1.05, pointerClick);
}

function drawCalculationScene(context, ms) {
  drawHeadline(context, "KROK 3/5", "Výpočet provize podle pravidel");

  const cardX = 260;
  const cardY = 158;
  const cardW = 460;
  const cardH = 205;
  fillRoundedRect(context, cardX, cardY, cardW, cardH, 16, "rgba(16, 27, 45, 0.92)");
  strokeRoundedRect(context, cardX, cardY, cardW, cardH, 16, "rgba(75, 117, 171, 0.55)");

  const local = progress(ms, 6700, 10500);
  const calcP = EASE.outCubic(local);

  const buttonX = cardX + 22;
  const buttonY = cardY + 20;
  const clicked = local > 0.16;
  fillRoundedRect(
    context,
    buttonX,
    buttonY,
    120,
    30,
    8,
    clicked ? "rgba(30, 64, 175, 0.95)" : "rgba(30, 58, 138, 0.66)",
  );
  drawText(context, "Spočítat", buttonX + 60, buttonY + 20, {
    size: 13,
    weight: 700,
    align: "center",
    color: "#E6F0FF",
  });

  const lines = [
    { label: "Poradce", amount: 17200 },
    { label: "Manažer", amount: 5300 },
    { label: "Firma", amount: 2800 },
  ];

  lines.forEach((line, idx) => {
    const y = cardY + 72 + idx * 46;
    fillRoundedRect(context, cardX + 22, y - 14, cardW - 44, 34, 8, "rgba(21, 36, 58, 0.92)");
    const amt = Math.round(line.amount * clamp((calcP - idx * 0.08) / 0.75, 0, 1));
    drawText(context, line.label, cardX + 38, y + 8, {
      size: 13,
      weight: 600,
      color: "#9AB0D6",
    });
    drawText(context, `${amt.toLocaleString("cs-CZ")} Kč`, cardX + cardW - 38, y + 8, {
      size: 14,
      weight: 700,
      align: "right",
      color: "#DDEAFF",
    });
  });

  const barX = cardX + 22;
  const barY = cardY + cardH - 28;
  fillRoundedRect(context, barX, barY, cardW - 44, 10, 5, "rgba(36, 53, 79, 0.9)");
  fillRoundedRect(context, barX, barY, (cardW - 44) * calcP, 10, 5, "rgba(16, 185, 129, 0.95)");

  drawPointer(context, 304, 187, 1.05, local > 0.12 && local < 0.32 ? 1 - Math.abs(0.22 - local) / 0.1 : 0);
}

function drawApprovalScene(context, ms) {
  drawHeadline(context, "KROK 4/5", "Schválení výplaty a audit");

  const cardX = 260;
  const cardY = 158;
  const cardW = 460;
  const cardH = 205;
  fillRoundedRect(context, cardX, cardY, cardW, cardH, 16, "rgba(16, 27, 45, 0.92)");
  strokeRoundedRect(context, cardX, cardY, cardW, cardH, 16, "rgba(75, 117, 171, 0.55)");

  const local = progress(ms, 10500, 13800);
  const appearP = EASE.outCubic(local);

  const approveX = cardX + 22;
  const approveY = cardY + 20;
  fillRoundedRect(
    context,
    approveX,
    approveY,
    172,
    34,
    9,
    local > 0.32 ? "rgba(16, 185, 129, 0.95)" : "rgba(22, 101, 52, 0.75)",
  );
  drawText(context, "Schválit výplatu", approveX + 86, approveY + 22, {
    size: 13,
    weight: 700,
    align: "center",
    color: "#ECFDF5",
  });

  drawText(context, "Auditní stopa", cardX + 24, cardY + 78, {
    size: 13,
    weight: 700,
    color: "#B6CAEC",
  });

  const auditItems = [
    "15:02 Import: Smlouva_05_2026.pdf",
    "15:02 Auto-doplněn tarif STANDARD",
    "15:03 Výpočet potvrzen: 25 300 Kč",
    "15:03 Schválil: Jakub R.",
  ];

  auditItems.forEach((item, idx) => {
    const rowY = cardY + 102 + idx * 24;
    const rowAppear = clamp((appearP - idx * 0.15) / 0.6, 0, 1);
    if (rowAppear <= 0) return;

    fillRoundedRect(context, cardX + 22, rowY - 14, cardW - 44, 20, 6, `rgba(24, 41, 66, ${0.5 + rowAppear * 0.35})`);
    drawText(context, item, cardX + 34, rowY, {
      size: 11,
      weight: 600,
      color: "#D5E5FF",
      baseline: "middle",
    });
  });

  drawPointer(
    context,
    lerp(360, 375, clamp((local - 0.08) / 0.22, 0, 1)),
    lerp(188, 192, clamp((local - 0.08) / 0.22, 0, 1)),
    1.05,
    local > 0.26 && local < 0.42 ? 1 - Math.abs(0.34 - local) / 0.08 : 0,
  );
}

function drawExportScene(context, ms) {
  drawHeadline(context, "KROK 5/5", "Připraveno k výplatě");

  const cardX = 260;
  const cardY = 158;
  const cardW = 460;
  const cardH = 205;
  fillRoundedRect(context, cardX, cardY, cardW, cardH, 16, "rgba(16, 27, 45, 0.92)");
  strokeRoundedRect(context, cardX, cardY, cardW, cardH, 16, "rgba(75, 117, 171, 0.55)");

  const local = progress(ms, 13800, 17000);
  const exportP = EASE.outCubic(local);

  fillRoundedRect(context, cardX + 22, cardY + 22, 230, 32, 10, "rgba(16, 185, 129, 0.24)");
  drawText(context, "Stav: Připraveno k výplatě", cardX + 137, cardY + 43, {
    size: 13,
    weight: 700,
    align: "center",
    color: "#A7F3D0",
  });

  fillRoundedRect(context, cardX + 22, cardY + 72, cardW - 44, 52, 10, "rgba(21, 36, 58, 0.92)");
  drawText(context, "Export do účetnictví", cardX + 40, cardY + 102, {
    size: 13,
    weight: 700,
    color: "#CFE0FC",
  });

  fillRoundedRect(context, cardX + 22, cardY + 140, cardW - 44, 16, 8, "rgba(36, 53, 79, 0.9)");
  fillRoundedRect(context, cardX + 22, cardY + 140, (cardW - 44) * exportP, 16, 8, "rgba(59, 130, 246, 0.95)");

  drawText(context, `Export ${Math.round(exportP * 100)} %`, cardX + cardW - 28, cardY + 171, {
    size: 12,
    weight: 700,
    align: "right",
    color: "#AFC5EA",
  });

  if (local > 0.7) {
    fillRoundedRect(context, cardX + cardW - 155, cardY + 72, 133, 34, 8, "rgba(16, 185, 129, 0.3)");
    drawText(context, "Výplata odeslána", cardX + cardW - 89, cardY + 94, {
      size: 12,
      weight: 700,
      align: "center",
      color: "#A7F3D0",
    });
  }

  drawPointer(context, lerp(300, 686, exportP), lerp(246, 248, exportP), 1.05, local > 0.78 ? (local - 0.78) / 0.22 : 0);
}

function drawFrame(context, ms) {
  drawBase(context, ms);

  if (ms < 3200) {
    drawImportScene(context, ms);
    return;
  }
  if (ms < 6700) {
    drawValidationScene(context, ms);
    return;
  }
  if (ms < 10500) {
    drawCalculationScene(context, ms);
    return;
  }
  if (ms < 13800) {
    drawApprovalScene(context, ms);
    return;
  }
  drawExportScene(context, ms);
}

function createGif() {
  const gif = GIFEncoder();

  for (let frame = 0; frame < TOTAL_FRAMES; frame += 1) {
    const ms = (frame / (TOTAL_FRAMES - 1)) * DURATION_MS;
    drawFrame(ctx, ms);
    const image = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    const rgba = image.data;
    const palette = quantize(rgba, 128);
    const indexed = applyPalette(rgba, palette);
    gif.writeFrame(indexed, WIDTH, HEIGHT, {
      palette,
      delay: FRAME_DELAY,
      repeat: 0,
    });
  }

  gif.finish();
  const bytes = gif.bytes();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, Buffer.from(bytes));
  return bytes.length;
}

const bytes = createGif();
const sizeMb = (bytes / (1024 * 1024)).toFixed(2);
console.log(`Saved ${OUTPUT_FILE}`);
console.log(`Frames: ${TOTAL_FRAMES}, ${WIDTH}x${HEIGHT}, ${FPS} fps, ${DURATION_MS / 1000}s`);
console.log(`Size: ${sizeMb} MB`);
