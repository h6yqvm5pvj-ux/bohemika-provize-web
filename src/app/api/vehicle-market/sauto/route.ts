import { NextResponse, type NextRequest } from "next/server";

import { adminAuth } from "@/lib/server/firebaseAdmin";
import { getAdvisorAccessError } from "@/lib/server/advisorSetupGuard";
import { getLoginAttemptLockoutError } from "@/lib/server/loginAttemptLockout";
import {
  applyRateLimitHeaders,
  consumeRateLimit as consumeSharedRateLimit,
} from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAUTO_SEARCH_URL = "https://www.sauto.cz/api/v1/items/search";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 8;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

type MarketRequest = {
  brand?: unknown;
  model?: unknown;
  year?: unknown;
  mileageKm?: unknown;
  fuel?: unknown;
  powerKw?: unknown;
  displacement?: unknown;
  limit?: unknown;
};

type MarketListing = {
  id: string;
  brand: string;
  model: string;
  title: string;
  priceCzk: number;
  mileageKm: number | null;
  year: number | null;
  fuel: string;
  powerKw: number | null;
  displacementLiters: number | null;
  location: string;
  seller: string;
  url: string;
  imageUrl: string;
  match?: MarketMatch;
};

type MarketMatch = {
  score: number;
  label: string;
  tone: "good" | "ok" | "warn" | "bad";
  reasons: string[];
};

type ComparableTarget = {
  brandSeo: string;
  modelSeoCandidates: string[];
  year: number | null;
  mileageKm: number | null;
  fuelKind: string;
  powerKw: number | null;
  displacementLiters: number | null;
  motorTokens: string[];
};

type Stats = {
  count: number;
  min: number | null;
  max: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  average: number | null;
  trimmedAverage: number | null;
  recommended: number | null;
};

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function text(value: unknown): string {
  if (!hasValue(value)) return "";
  return String(value).trim();
}

function normalizeSearchPart(value: unknown): string {
  const raw = text(value);
  if (!raw || raw === "—") return "";
  return raw.replace(/\s+/g, " ").trim();
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function seoSlug(value: unknown): string {
  return normalizeSearchPart(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/\+/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function modelSeoCandidates(value: unknown): string[] {
  const slug = seoSlug(value);
  if (!slug) return [];

  const parts = slug.split("-").filter(Boolean);
  const first = parts[0] ?? "";
  const firstTwo = parts.slice(0, 2).join("-");

  return uniq([
    first,
    firstTwo,
    slug,
  ]);
}

function toInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/\d[\d\s.,]*/);
  if (!match) return null;
  const n = Number(match[0].replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toPowerKw(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const raw = normalizeText(value);
  if (!raw) return null;
  const match = raw.match(/\b(\d{2,3})\s*k\s*w\b/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function toDisplacementLiters(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 100) return Math.round((value / 1000) * 10) / 10;
    if (value > 0 && value < 10) return Math.round(value * 10) / 10;
  }

  const raw = normalizeText(value);
  if (!raw) return null;

  const ccMatch = raw.match(/\b(\d{3,4})\s*(?:cm3|ccm|cc)\b/);
  if (ccMatch) {
    const cc = Number(ccMatch[1]);
    if (Number.isFinite(cc) && cc > 100) return Math.round((cc / 1000) * 10) / 10;
  }

  const litersMatch = raw.match(/\b([1-9])[\.,](\d)\b/);
  if (litersMatch) {
    const n = Number(`${litersMatch[1]}.${litersMatch[2]}`);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function toYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.round(value);
    return n >= 1950 && n <= new Date().getFullYear() + 1 ? n : null;
  }

  const raw = text(value);
  const match = raw.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readPath(row: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    const currentObject = readObject(current);
    return currentObject ? currentObject[key] : undefined;
  }, row);
}

function firstValue(row: Record<string, unknown>, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(row, path);
    if (hasValue(value)) return value;
  }
  return null;
}

function normalizeImageUrl(value: unknown): string {
  if (typeof value === "string") {
    const url = value.trim();
    if (!url) return "";
    return url.startsWith("//") ? `https:${url}` : url;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const direct = normalizeImageUrl(item);
      if (direct) return direct;
      const itemObject = readObject(item);
      if (itemObject) {
        const nested = normalizeImageUrl(firstValue(itemObject, ["url", "image", "src"]));
        if (nested) return nested;
      }
    }
  }

  const object = readObject(value);
  if (object) {
    return normalizeImageUrl(firstValue(object, ["url", "image", "src"]));
  }

  return "";
}

function buildDetailUrl(row: Record<string, unknown>, id: string): string {
  const brand = seoSlug(firstValue(row, ["manufacturer_cb.name", "manufacturer", "brand", "znacka"]));
  const model = seoSlug(firstValue(row, ["model_cb.name", "model", "typ"]));
  if (!id || !brand || !model) return "";
  return `https://www.sauto.cz/osobni/detail/${brand}/${model}/${encodeURIComponent(id)}`;
}

function normalizeListing(row: unknown): MarketListing | null {
  const object = readObject(row);
  if (!object) return null;

  const priceCzk = toInteger(firstValue(object, ["price", "price_czk", "priceCzk", "cena", "Cena"]));
  if (priceCzk == null || priceCzk < 20_000) return null;

  const id = text(firstValue(object, ["id", "custom_id", "old_id", "url", "from_url"])) || crypto.randomUUID();
  const brand = text(firstValue(object, ["manufacturer_cb.name", "manufacturer", "brand", "znacka"]));
  const model = text(firstValue(object, ["model_cb.name", "model", "typ"]));
  const title =
    text(firstValue(object, ["name", "title", "vehicle", "manufacturer_cb.name", "model_cb.name"])) ||
    "Inzerát Sauto.cz";
  const year =
    toYear(firstValue(object, ["manufacturing_date", "year", "rok", "in_operation_date", "first_registration"])) ??
    null;
  const mileageKm = toInteger(firstValue(object, ["tachometer", "mileage", "mileageKm", "najeto", "stav_tachometru"]));
  const url =
    text(firstValue(object, ["url", "link", "detail_url", "detailUrl", "from_url"])) ||
    buildDetailUrl(object, id);
  const location = text(
    firstValue(object, [
      "locality.municipality",
      "locality.district",
      "locality.region",
      "location",
      "locality",
    ])
  );
  const seller = text(firstValue(object, ["premise.name", "seller", "dealer", "user.name"]));
  const fuel = text(firstValue(object, ["fuel_cb.name", "fuel", "palivo", "Fuel"]));
  const imageUrl = normalizeImageUrl(firstValue(object, ["images", "image", "imageUrl", "photo", "photos"]));
  const powerKw =
    toPowerKw(firstValue(object, ["engine_power", "enginePower", "power", "power_kw", "powerKw", "vykon"])) ??
    toPowerKw(title);
  const displacementLiters =
    toDisplacementLiters(firstValue(object, ["engine_volume", "engineVolume", "displacement", "objem"])) ??
    toDisplacementLiters(title);

  return {
    id,
    brand,
    model,
    title,
    priceCzk,
    mileageKm,
    year,
    fuel,
    powerKw,
    displacementLiters,
    location,
    seller,
    url,
    imageUrl,
  };
}

function quantile(sortedValues: number[], q: number): number | null {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sortedValues[base + 1];
  if (next == null) return sortedValues[base];
  return sortedValues[base] + rest * (next - sortedValues[base]);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildStats(listings: MarketListing[]): Stats {
  const prices = listings
    .map((listing) => listing.priceCzk)
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b);

  const trimCount = prices.length >= 10 ? Math.floor(prices.length * 0.1) : 0;
  const trimmed = trimCount > 0 ? prices.slice(trimCount, prices.length - trimCount) : prices;
  const median = quantile(prices, 0.5);

  return {
    count: prices.length,
    min: prices[0] ?? null,
    max: prices[prices.length - 1] ?? null,
    q1: quantile(prices, 0.25),
    median,
    q3: quantile(prices, 0.75),
    average: average(prices),
    trimmedAverage: average(trimmed),
    recommended: median == null ? null : roundTo(median, 5_000),
  };
}

function buildKeyword(body: MarketRequest): string {
  const brand = normalizeSearchPart(body.brand);
  const model = normalizeSearchPart(body.model);
  const displacement = toDisplacementLiters(body.displacement);
  const powerKw = toPowerKw(body.powerKw);

  return [
    brand,
    model,
    displacement != null ? `${displacement.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })}` : "",
    powerKw != null ? `${powerKw} kW` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeText(value: unknown): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function fuelKind(value: unknown): string {
  const normalized = normalizeText(value);
  if (normalized === "nm" || /(nafta|diesel|tdi|dci|hdi|cdi)/.test(normalized)) return "diesel";
  if (normalized === "ba" || /(benzin|benzín|tsi|tfsi|mpi)/.test(normalized)) return "benzin";
  if (/(hybrid|phev|hev)/.test(normalized)) return "hybrid";
  if (/(elektro|electric|ev)/.test(normalized)) return "electric";
  if (/(lpg|cng)/.test(normalized)) return "gas";
  return "";
}

function motorTokensFromText(value: unknown): string[] {
  const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, " ");
  const tokens: string[] = [];

  if (/\bbi\s*tdi\b/.test(normalized) || /\bbitdi\b/.test(normalized)) tokens.push("bitdi");
  if (/\btdi\b/.test(normalized)) tokens.push("tdi");
  if (/\bfsi\b/.test(normalized)) tokens.push("fsi");
  if (/\btfsi\b/.test(normalized)) tokens.push("tfsi");
  if (/\btsi\b/.test(normalized)) tokens.push("tsi");
  if (/\bdci\b/.test(normalized)) tokens.push("dci");
  if (/\bhdi\b/.test(normalized)) tokens.push("hdi");
  if (/\bcdi\b/.test(normalized)) tokens.push("cdi");
  if (/\bquattro\b/.test(normalized) || /\b4x4\b/.test(normalized) || /\b4motion\b/.test(normalized)) {
    tokens.push("4x4");
  }

  return uniq(tokens);
}

function inferredTargetMotorTokens(body: MarketRequest, target: Pick<ComparableTarget, "fuelKind" | "powerKw" | "displacementLiters">): string[] {
  const explicit = motorTokensFromText(`${normalizeSearchPart(body.brand)} ${normalizeSearchPart(body.model)}`);
  const tokens = [...explicit];
  const brand = seoSlug(body.brand);

  if (target.fuelKind === "diesel" && target.displacementLiters != null && target.displacementLiters >= 2.7) {
    tokens.push("tdi");
  }

  if (
    brand === "audi" &&
    target.fuelKind === "diesel" &&
    target.displacementLiters != null &&
    target.displacementLiters >= 2.7 &&
    target.displacementLiters <= 3.2 &&
    target.powerKw != null &&
    target.powerKw >= 210
  ) {
    tokens.push("bitdi");
  }

  return uniq(tokens);
}

function scorePower(listingPowerKw: number | null, targetPowerKw: number | null): number {
  if (targetPowerKw == null) return 0;
  if (listingPowerKw == null) return 22;

  const diff = Math.abs(listingPowerKw - targetPowerKw);
  if (diff <= 6) return 0;
  if (diff <= 15) return 8;
  if (diff <= 35) return 22;
  return 48;
}

function scoreDisplacement(listingLiters: number | null, targetLiters: number | null): number {
  if (targetLiters == null) return 0;
  if (listingLiters == null) return 6;

  const diff = Math.abs(listingLiters - targetLiters);
  if (diff <= 0.16) return 0;
  if (diff <= 0.35) return 16;
  return 36;
}

function scoreMotorTokens(listing: MarketListing, target: ComparableTarget): number {
  if (target.motorTokens.length === 0) return 0;

  const listingTokens = motorTokensFromText(`${listing.title} ${listing.fuel}`);
  let score = 0;

  if (target.motorTokens.includes("bitdi")) {
    if (listingTokens.includes("bitdi")) return 0;
    if (listing.powerKw != null && target.powerKw != null && Math.abs(listing.powerKw - target.powerKw) <= 8) {
      return 4;
    }
    return 42;
  }

  const important = target.motorTokens.filter((token) => token !== "4x4");
  for (const token of important) {
    if (!listingTokens.includes(token)) score += 12;
  }

  if (target.motorTokens.includes("4x4") && listingTokens.length > 0 && !listingTokens.includes("4x4")) {
    score += 5;
  }

  return score;
}

function scoreListing(listing: MarketListing, target: ComparableTarget): number {
  let score = 0;

  if (target.brandSeo) {
    const listingBrandSeo = seoSlug(listing.brand || listing.title);
    if (listingBrandSeo && listingBrandSeo !== target.brandSeo) {
      score += 80;
    }
  }

  if (target.modelSeoCandidates.length > 0) {
    const listingModelSeo = seoSlug(listing.model || listing.title);
    const titleSeo = seoSlug(listing.title);
    const modelMatches =
      target.modelSeoCandidates.includes(listingModelSeo) ||
      target.modelSeoCandidates.some((candidate) => titleSeo.split("-").includes(candidate));

    if (!modelMatches) {
      score += 45;
    }
  }

  if (target.year != null && listing.year != null) {
    score += Math.min(Math.abs(listing.year - target.year) * 8, 32);
  }

  if (target.mileageKm != null && listing.mileageKm != null) {
    const baseMileage = Math.max(50_000, target.mileageKm);
    score += Math.min((Math.abs(listing.mileageKm - target.mileageKm) / baseMileage) * 34, 34);
  }

  const listingFuel = fuelKind(listing.fuel || listing.title);
  if (target.fuelKind && listingFuel && target.fuelKind !== listingFuel) {
    score += 18;
  }

  score += scorePower(listing.powerKw, target.powerKw);
  score += scoreDisplacement(listing.displacementLiters, target.displacementLiters);
  score += scoreMotorTokens(listing, target);

  return score;
}

function buildMatchReasons(listing: MarketListing, target: ComparableTarget): string[] {
  const reasons: string[] = [];
  const listingFuel = fuelKind(listing.fuel || listing.title);
  const listingTokens = motorTokensFromText(`${listing.title} ${listing.fuel}`);

  if (target.motorTokens.includes("bitdi")) {
    if (listingTokens.includes("bitdi")) {
      reasons.push("BiTDI sedí");
    } else if (
      listing.powerKw != null &&
      target.powerKw != null &&
      Math.abs(listing.powerKw - target.powerKw) <= 8
    ) {
      reasons.push("výkon sedí");
    } else {
      reasons.push("jiná motorizace");
    }
  } else if (target.powerKw != null) {
    if (listing.powerKw == null) {
      reasons.push("výkon neuveden");
    } else {
      const powerDiff = listing.powerKw - target.powerKw;
      if (Math.abs(powerDiff) <= 8) reasons.push("výkon sedí");
      else if (powerDiff < 0) reasons.push("slabší motor");
      else reasons.push("silnější motor");
    }
  }

  if (target.displacementLiters != null && listing.displacementLiters != null) {
    const displacementDiff = Math.abs(listing.displacementLiters - target.displacementLiters);
    if (displacementDiff <= 0.16) {
      reasons.push("objem sedí");
    } else {
      reasons.push("jiný objem");
    }
  }

  if (target.fuelKind && listingFuel) {
    reasons.push(target.fuelKind === listingFuel ? "palivo sedí" : "jiné palivo");
  }

  if (target.mileageKm != null && listing.mileageKm != null) {
    const mileageDiff = listing.mileageKm - target.mileageKm;
    const ratio = Math.abs(mileageDiff) / Math.max(50_000, target.mileageKm);
    if (ratio <= 0.18) reasons.push("nájezd blízko");
    else if (mileageDiff < 0) reasons.push("nižší nájezd");
    else reasons.push("vyšší nájezd");
  }

  if (target.year != null && listing.year != null) {
    const yearDiff = listing.year - target.year;
    if (Math.abs(yearDiff) <= 1) reasons.push("rok sedí");
    else if (yearDiff < 0) reasons.push("starší kus");
    else reasons.push("novější kus");
  }

  return uniq(reasons).slice(0, 3);
}

function buildMarketMatch(listing: MarketListing, target: ComparableTarget, score: number): MarketMatch {
  const tone: MarketMatch["tone"] =
    score <= 18 ? "good" : score <= 42 ? "ok" : score <= 70 ? "warn" : "bad";
  const label =
    tone === "good"
      ? "výborná shoda"
      : tone === "ok"
        ? "dobrá shoda"
        : tone === "warn"
          ? "částečná shoda"
          : "slabá shoda";

  return {
    score: Math.round(score),
    label,
    tone,
    reasons: buildMatchReasons(listing, target),
  };
}

function selectComparableListings(listings: MarketListing[], target: ComparableTarget): MarketListing[] {
  const scored = listings
    .map((listing) => ({ listing, score: scoreListing(listing, target) }))
    .sort((a, b) => a.score - b.score || a.listing.priceCzk - b.listing.priceCzk);

  const close = scored.filter((item) => item.score <= 60);
  const selected = close.length >= Math.min(6, scored.length) ? close : scored;

  return selected.map((item) => ({
    ...item.listing,
    match: buildMarketMatch(item.listing, target, item.score),
  }));
}

function buildManufacturerModelSeo(body: MarketRequest): string {
  const brand = seoSlug(body.brand);
  const model = modelSeoCandidates(body.model)[0] ?? "";
  if (!brand) return "";
  return model ? `${brand}:${model}` : brand;
}

function buildSautoUrl(params: {
  manufacturerModelSeo: string;
  limit: number;
  sort?: string;
  mileageFrom?: number | null;
  mileageTo?: number | null;
}): URL {
  const url = new URL(SAUTO_SEARCH_URL);
  url.searchParams.set("limit", String(params.limit));
  url.searchParams.set("offset", "0");
  url.searchParams.set("condition_seo", "nove,ojete,predvadeci");
  url.searchParams.set("category_id", "838");
  url.searchParams.set("operating_lease", "false");
  if (params.manufacturerModelSeo) {
    url.searchParams.set("manufacturer_model_seo", params.manufacturerModelSeo);
  }
  if (params.sort) {
    url.searchParams.set("sort", params.sort);
  }
  if (params.mileageFrom != null) {
    url.searchParams.set("tachometer_from", String(params.mileageFrom));
  }
  if (params.mileageTo != null) {
    url.searchParams.set("tachometer_to", String(params.mileageTo));
  }
  return url;
}

function dedupeListings(listings: MarketListing[]): MarketListing[] {
  const seen = new Set<string>();
  const result: MarketListing[] = [];

  for (const listing of listings) {
    const key = listing.id || `${listing.title}-${listing.priceCzk}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(listing);
  }

  return result;
}

async function fetchSautoItems(url: URL, signal: AbortSignal): Promise<{ rows: unknown[]; total: number }> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Accept-Language": "cs",
      "User-Agent": "Bohemika-SmartApp/1.0",
    },
    cache: "no-store",
    signal,
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message = readObject(payload)?.status_message ?? response.statusText;
    throw new Error(`Sauto API skončilo chybou (${response.status}): ${text(message)}`);
  }

  const row = readObject(payload);
  const rows = Array.isArray(row?.results) ? row.results : [];
  const pagination = readObject(row?.pagination);
  const total = toInteger(pagination?.total) ?? rows.length;

  return { rows, total };
}

async function readJson(req: NextRequest): Promise<MarketRequest> {
  const payload = await req.json().catch(() => ({}));
  return readObject(payload) ?? {};
}

export async function POST(req: NextRequest) {
  if (!adminAuth) {
    return NextResponse.json(
      { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
      { status: 500 }
    );
  }

  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Missing bearer token" },
      { status: 401 }
    );
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch (err: unknown) {
    const row = readObject(err);
    const code = text(row?.code) || "auth/invalid-token";
    const message = text(row?.message) || "Invalid or expired token";
    return NextResponse.json(
      { ok: false, error: `Invalid or expired token (${code}): ${message}` },
      { status: 401 }
    );
  }

  if (!decoded.email) {
    return NextResponse.json(
      { ok: false, error: "Přihlášený účet nemá dostupný e-mail v tokenu." },
      { status: 401 }
    );
  }
  const lockout = await getLoginAttemptLockoutError(req, decoded.email);
  if (lockout) {
    const response = NextResponse.json(
      { ok: false, error: lockout.error },
      { status: lockout.status }
    );
    response.headers.set("Retry-After", String(lockout.retryAfterSeconds));
    return response;
  }
  const setupError = await getAdvisorAccessError({ email: decoded.email, uid: decoded.uid });
  if (setupError) {
    return NextResponse.json(
      { ok: false, error: setupError.error, missingSetup: setupError.missing },
      { status: setupError.status }
    );
  }

  const rate = await consumeSharedRateLimit({
    namespace: "api:vehicle-market:sauto:post",
    key: decoded.uid,
    limit: RATE_LIMIT_MAX_REQUESTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!rate.allowed) {
    const response = NextResponse.json(
      { ok: false, error: "Příliš mnoho dotazů na Sauto. Zkus to znovu za chvíli." },
      { status: 429 }
    );
    applyRateLimitHeaders(response.headers, rate);
    return response;
  }

  const body = await readJson(req);
  const keyword = buildKeyword(body);
  if (keyword.length < 3) {
    return NextResponse.json(
      { ok: false, error: "Nejdřív je potřeba načíst značku a model vozidla." },
      { status: 400 }
    );
  }

  const limit = clamp(toInteger(body.limit) ?? DEFAULT_LIMIT, 5, MAX_LIMIT);
  const target: ComparableTarget = {
    brandSeo: seoSlug(body.brand),
    modelSeoCandidates: modelSeoCandidates(body.model),
    year: toYear(body.year),
    mileageKm: toInteger(body.mileageKm),
    fuelKind: fuelKind(body.fuel),
    powerKw: toPowerKw(body.powerKw),
    displacementLiters: toDisplacementLiters(body.displacement),
    motorTokens: [],
  };
  target.motorTokens = inferredTargetMotorTokens(body, target);
  const manufacturerModelSeo = buildManufacturerModelSeo(body);
  const mileageFrom =
    target.mileageKm == null ? null : Math.max(0, Math.round((target.mileageKm * 0.55) / 10_000) * 10_000);
  const mileageTo =
    target.mileageKm == null ? null : Math.round((target.mileageKm * 1.55) / 10_000) * 10_000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);

  try {
    const requests = [
      buildSautoUrl({ manufacturerModelSeo, limit, mileageFrom, mileageTo }),
      buildSautoUrl({ manufacturerModelSeo, limit, sort: "price" }),
      ...(mileageFrom != null || mileageTo != null
        ? [buildSautoUrl({ manufacturerModelSeo, limit })]
        : []),
    ];

    const batches = await Promise.all(requests.map((url) => fetchSautoItems(url, controller.signal)));
    const rows = batches.flatMap((batch) => batch.rows);
    const rawTotal = Math.max(...batches.map((batch) => batch.total), rows.length);
    const listings = dedupeListings(
      rows.map(normalizeListing).filter((item): item is MarketListing => item != null)
    );
    const comparableListings = selectComparableListings(listings, target);
    const stats = buildStats(comparableListings);

    return NextResponse.json(
      {
        ok: true,
        source: "sauto",
        keyword,
        limit,
        rawCount: rawTotal,
        count: listings.length,
        comparableCount: comparableListings.length,
        stats,
        listings: comparableListings,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (err: unknown) {
    const row = readObject(err);
    const name = text(row?.name);
    return NextResponse.json(
      {
        ok: false,
        error:
          name === "AbortError"
            ? "Sauto nestihlo odpovědět. Zkus dotaz zopakovat."
            : "Nepodařilo se načíst tržní data ze Sauto.",
      },
      { status: 504 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
