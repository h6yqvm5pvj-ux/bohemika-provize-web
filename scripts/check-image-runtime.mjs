import { createRequire } from "node:module";
import assert from "node:assert/strict";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const atLeast = (version, minimum) => {
  if (!/^\d+\.\d+\.\d+$/.test(version || "")) return false;
  const actual = version.split(".").map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
  }
  return true;
};

const nextVersion = require("next/package.json").version;
// Resolve sharp from Next's own location as well as from our upload code.
const nextRequire = createRequire(require.resolve("next/package.json"));
const nextSharp = nextRequire("sharp");
assert(atLeast(nextVersion, [16, 3, 8]), "Next.js 16.3.8+ is required for the current security fixes.");
for (const [source, implementation] of [["application", sharp], ["next", nextSharp]]) {
  assert(atLeast(implementation.versions.sharp, [0, 35, 5]), `${source}: sharp 0.35.5+ is required (GHSA-wq5f-xc86-pv6w).`);
  assert(atLeast(implementation.versions.rsvg, [2, 63, 2]), `${source}: native librsvg 2.63.2+ is required.`);
  assert(atLeast(implementation.versions.heif, [1, 23, 2]), `${source}: native libheif 1.23.2+ is required.`);
}
console.log(JSON.stringify({
  imageRuntimeSecurity: "verified",
  platform: process.platform,
  arch: process.arch,
  next: nextVersion,
  sharp: sharp.versions.sharp,
  libheif: sharp.versions.heif,
  libvips: sharp.versions.vips,
  nextSharp: nextSharp.versions.sharp,
  nextLibheif: nextSharp.versions.heif,
}));
