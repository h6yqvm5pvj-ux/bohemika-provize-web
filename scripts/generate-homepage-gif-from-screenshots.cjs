#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

const OUTPUT_DIR = path.resolve(__dirname, "../public/demos");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "homepage-flow-real.gif");

const INPUTS = [
  path.resolve(__dirname, "../public/demos/source/step-1.png"),
  path.resolve(__dirname, "../public/demos/source/step-2.png"),
  path.resolve(__dirname, "../public/demos/source/step-3.png"),
  path.resolve(__dirname, "../public/demos/source/step-4.png"),
];

const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const FPS = 10;
const FRAME_DELAY_MS = Math.round(1000 / FPS);
const HOLD_MS = 1200;
const TRANSITION_MS = 700;
const FINAL_HOLD_MS = 1800;

const SOURCE_CROP = {
  x: 0,
  y: 90,
  width: 2880,
  height: 1620,
};

const VIEWS = [
  { zoom: 1.0, panX: 0, panY: 0 },
  { zoom: 1.02, panX: 0, panY: 8 },
  { zoom: 1.03, panX: 0, panY: 34 },
  { zoom: 1.01, panX: 0, panY: 0 },
];

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function easeInOut(t) {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function drawImageWithView(ctx, image, view) {
  const zoom = view.zoom;
  const cropW = SOURCE_CROP.width / zoom;
  const cropH = SOURCE_CROP.height / zoom;
  const baseX = SOURCE_CROP.x + (SOURCE_CROP.width - cropW) / 2;
  const baseY = SOURCE_CROP.y + (SOURCE_CROP.height - cropH) / 2;

  const maxPanX = (SOURCE_CROP.width - cropW) / 2;
  const maxPanY = (SOURCE_CROP.height - cropH) / 2;
  const panX = clamp(view.panX, -maxPanX, maxPanX);
  const panY = clamp(view.panY, -maxPanY, maxPanY);

  const sx = baseX + panX;
  const sy = baseY + panY;

  ctx.drawImage(image, sx, sy, cropW, cropH, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);
}

function mixView(a, b, t) {
  return {
    zoom: lerp(a.zoom, b.zoom, t),
    panX: lerp(a.panX, b.panX, t),
    panY: lerp(a.panY, b.panY, t),
  };
}

function toFrames(ms) {
  return Math.max(1, Math.round((ms / 1000) * FPS));
}

function addFrame(gif, ctx) {
  const frame = ctx.getImageData(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
  const rgba = frame.data;
  const palette = quantize(rgba, 128);
  const indexed = applyPalette(rgba, palette);
  gif.writeFrame(indexed, TARGET_WIDTH, TARGET_HEIGHT, {
    palette,
    delay: FRAME_DELAY_MS,
    repeat: 0,
  });
}

async function main() {
  INPUTS.forEach((input) => {
    if (!fs.existsSync(input)) {
      throw new Error(`Missing input file: ${input}`);
    }
  });

  const images = await Promise.all(INPUTS.map((input) => loadImage(input)));
  const canvas = createCanvas(TARGET_WIDTH, TARGET_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const gif = GIFEncoder();

  for (let i = 0; i < images.length; i += 1) {
    const image = images[i];
    const view = VIEWS[i];

    const holdFrames = toFrames(i === images.length - 1 ? FINAL_HOLD_MS : HOLD_MS);
    for (let f = 0; f < holdFrames; f += 1) {
      drawImageWithView(ctx, image, view);
      addFrame(gif, ctx);
    }

    if (i < images.length - 1) {
      const nextImage = images[i + 1];
      const nextView = VIEWS[i + 1];
      const transitionFrames = toFrames(TRANSITION_MS);

      for (let f = 0; f < transitionFrames; f += 1) {
        const t = easeInOut(f / Math.max(transitionFrames - 1, 1));

        ctx.globalAlpha = 1;
        drawImageWithView(ctx, image, mixView(view, nextView, t));

        ctx.globalAlpha = t;
        drawImageWithView(ctx, nextImage, mixView(view, nextView, t));
        ctx.globalAlpha = 1;

        addFrame(gif, ctx);
      }
    }
  }

  gif.finish();
  const bytes = gif.bytes();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, Buffer.from(bytes));

  const totalFrames =
    INPUTS.length * toFrames(HOLD_MS) +
    (INPUTS.length - 1) * toFrames(TRANSITION_MS) +
    (toFrames(FINAL_HOLD_MS) - toFrames(HOLD_MS));

  console.log(`Saved ${OUTPUT_FILE}`);
  console.log(`Frames: ${totalFrames}, ${TARGET_WIDTH}x${TARGET_HEIGHT}, ${FPS} fps`);
  console.log(`Size: ${(bytes.length / (1024 * 1024)).toFixed(2)} MB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
