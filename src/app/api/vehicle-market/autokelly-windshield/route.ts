import { NextResponse, type NextRequest } from "next/server";

import { adminAuth } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTOKELLY_BASE_URL = "https://www.autokelly.cz";
const ROOT_CATALOG_ID = "39850140";
const ROOT_CATALOG_PATH = "/Catalog/osobni-automobil-nahradni-dily/39849642;39850140";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 4;
const CACHE_TTL_MS = 20 * 60_000;
const MAX_PRODUCT_PAGES = 4;

type RateBucket = {
  count: number;
  resetAtMs: number;
};

type CacheEntry = {
  expiresAtMs: number;
  response: AutoKellyWindshieldResponse;
};

type AutoKellyRequest = {
  vin?: unknown;
  brand?: unknown;
  model?: unknown;
  year?: unknown;
  firstRegistrationYear?: unknown;
  fuel?: unknown;
  powerKw?: unknown;
  displacement?: unknown;
  category?: unknown;
  body?: unknown;
};

type CatalogEntry = {
  id: string;
  text: string;
  link: string;
  year: string;
  powerKw: number | null;
  displacement: number | null;
  fuel: string;
  code: string;
  productsCount: number | null;
};

type MatchedCatalogEntry = CatalogEntry & {
  score: number;
};

type ProductEntry = {
  id: string;
  name: string;
  code: string;
  brand: string;
  url: string;
  priceText: string;
  priceCzk: number | null;
  availability: string;
  isOriginal: boolean;
  isWindshield: boolean;
};

type PriceRangeStats = {
  count: number;
  min: number | null;
  max: number | null;
  average: number | null;
};

type AutoKellyWindshieldOffer = {
  productId: string;
  name: string;
  code: string;
  brand: string;
  priceCzk: number;
  priceText: string;
  availability: string;
  url: string;
  isOriginal: boolean;
  kind: "original" | "aftermarket";
};

type AutoKellyWindshieldResponse = {
  ok: true;
  source: "autokelly";
  sourceUrl: string;
  fetchedAt: string;
  matched: {
    make: string;
    model: string;
    motor: string;
    categoryPath: string[];
  };
  offers: AutoKellyWindshieldOffer[];
  stats: {
    original: PriceRangeStats;
    aftermarket: PriceRangeStats;
    overall: PriceRangeStats;
  };
  originalCount: number;
  aftermarketCount: number;
  productCount: number;
};

const rateBuckets = new Map<string, RateBucket>();
const lookupCache = new Map<string, CacheEntry>();

class LookupError extends Error {
  status: number;
  stage: string;

  constructor(message: string, status: number, stage: string) {
    super(message);
    this.name = "LookupError";
    this.status = status;
    this.stage = stage;
  }
}

class AutoKellySession {
  private readonly cookies = new Map<string, string>();
  private readonly signal: AbortSignal;

  constructor(signal: AbortSignal) {
    this.signal = signal;
  }

  async getPage(pathOrUrl: string): Promise<string> {
    const response = await this.fetchAutoKelly(pathOrUrl, {
      method: "GET",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    });
    return response.text();
  }

  async postJson(pathOrUrl: string, body?: unknown): Promise<unknown> {
    const response = await this.fetchAutoKelly(pathOrUrl, {
      method: "POST",
      accept: "application/json, text/plain, */*",
      body: body === undefined ? "" : JSON.stringify(body),
      contentType: "application/json;charset=UTF-8",
      xhr: true,
    });
    const textBody = await response.text();
    if (!textBody.trim()) return null;
    try {
      return JSON.parse(textBody) as unknown;
    } catch {
      throw new LookupError("AutoKelly vrátilo nečitelnou odpověď.", 502, "autokelly-json");
    }
  }

  private async fetchAutoKelly(
    pathOrUrl: string,
    options: {
      method: "GET" | "POST";
      accept: string;
      body?: string;
      contentType?: string;
      xhr?: boolean;
    }
  ): Promise<Response> {
    const url = toAutoKellyUrl(pathOrUrl);
    const headers = new Headers({
      Accept: options.accept,
      "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Referer: `${AUTOKELLY_BASE_URL}${ROOT_CATALOG_PATH}`,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    });

    const cookieHeader = this.cookieHeader();
    if (cookieHeader) headers.set("Cookie", cookieHeader);
    if (options.contentType) headers.set("Content-Type", options.contentType);
    if (options.xhr) headers.set("X-Requested-With", "XMLHttpRequest");

    const response = await fetch(url, {
      method: options.method,
      headers,
      body: options.method === "POST" ? options.body ?? "" : undefined,
      cache: "no-store",
      signal: this.signal,
    });

    this.storeCookies(response.headers);

    if (!response.ok) {
      throw new LookupError(`AutoKelly odpovědělo chybou ${response.status}.`, 502, "autokelly-http");
    }

    return response;
  }

  private cookieHeader(): string {
    return Array.from(this.cookies.values()).join("; ");
  }

  private storeCookies(headers: Headers): void {
    for (const cookie of getSetCookieHeaders(headers)) {
      const part = cookie.split(";")[0]?.trim();
      if (!part) continue;
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq);
      this.cookies.set(name, part);
    }
  }
}

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

function cleanupRateBuckets(nowMs: number): void {
  if (rateBuckets.size < 1000) return;
  for (const [key, bucket] of rateBuckets.entries()) {
    if (nowMs >= bucket.resetAtMs) rateBuckets.delete(key);
  }
}

function consumeRateLimit(key: string): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const nowMs = Date.now();
  cleanupRateBuckets(nowMs);

  const existing = rateBuckets.get(key);
  if (!existing || nowMs >= existing.resetAtMs) {
    rateBuckets.set(key, {
      count: 1,
      resetAtMs: nowMs + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000)),
    };
  }

  existing.count += 1;
  rateBuckets.set(key, existing);
  return { allowed: true };
}

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function text(value: unknown): string {
  if (!hasValue(value)) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/-?\d[\d\s.,]*/);
  if (!match) return null;
  const n = Number(match[0].replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function normalizeText(value: unknown): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/\+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function cacheKey(body: AutoKellyRequest): string {
  return [
    normalizeText(body.brand),
    normalizeText(body.model),
    toInteger(body.year) ?? toInteger(body.firstRegistrationYear) ?? "",
    toInteger(body.powerKw) ?? "",
    toInteger(body.displacement) ?? "",
    normalizeText(body.fuel),
  ].join("|");
}

function readCache(key: string): AutoKellyWindshieldResponse | null {
  const existing = lookupCache.get(key);
  if (!existing) return null;
  if (Date.now() >= existing.expiresAtMs) {
    lookupCache.delete(key);
    return null;
  }
  return existing.response;
}

function writeCache(key: string, response: AutoKellyWindshieldResponse): void {
  if (lookupCache.size > 250) lookupCache.clear();
  lookupCache.set(key, {
    expiresAtMs: Date.now() + CACHE_TTL_MS,
    response,
  });
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const values = withGetSetCookie.getSetCookie?.();
  if (values && values.length > 0) return values;

  const header = headers.get("set-cookie");
  if (!header) return [];
  return header.split(/,(?=\s*[^;,\s]+=)/g).map((item) => item.trim()).filter(Boolean);
}

function toAutoKellyUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, AUTOKELLY_BASE_URL).toString();
}

function catalogId(entry: Record<string, unknown>): string {
  const id = text(entry.Id);
  if (id) return id;
  const link = text(entry.Link).split("?")[0] ?? "";
  const parts = link.split(";").map((part) => part.trim()).filter(Boolean);
  const last = parts.at(-1) ?? "";
  return /^\d+$/.test(last) ? last : "";
}

function readCatalogEntry(value: unknown): CatalogEntry | null {
  const row = readObject(value);
  if (!row) return null;

  const entryText = text(row.Text);
  const link = text(row.Link);
  const id = catalogId(row);
  if (!entryText && !link && !id) return null;

  return {
    id,
    text: entryText,
    link,
    year: text(row.Year),
    powerKw: toInteger(row.PowerKW),
    displacement: toInteger(row.Capacity),
    fuel: text(row.Fuel),
    code: text(row.Code),
    productsCount: toInteger(row.ProductsCount),
  };
}

function flattenCatalogEntries(payload: unknown): CatalogEntry[] {
  const entries: CatalogEntry[] = [];

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const row = readObject(value);
    if (!row) return;

    const entry = readCatalogEntry(row);
    if (entry) entries.push(entry);
    visit(row.Models);
    visit(row.Categories);
    visit(row.Items);
  }

  visit(payload);

  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entry.id || `${entry.text}|${entry.link}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function brandAliases(brand: unknown): string[] {
  const normalized = normalizeText(brand);
  if (!normalized) return [];
  const aliases = [normalized];
  if (normalized === "vw" || normalized.includes("volkswagen")) aliases.push("volkswagen", "vw");
  if (normalized.includes("skoda")) aliases.push("skoda", "skoda auto");
  if (normalized.includes("mercedes")) aliases.push("mercedes", "mercedes benz");
  if (normalized.includes("land rover")) aliases.push("land rover", "range rover");
  return uniq(aliases);
}

function scoreMake(entry: CatalogEntry, body: AutoKellyRequest): number {
  const entryText = normalizeText(entry.text);
  if (!entryText) return 0;
  let score = 0;

  for (const alias of brandAliases(body.brand)) {
    if (entryText === alias) score = Math.max(score, 100);
    else if (entryText.includes(alias) || alias.includes(entryText)) score = Math.max(score, 80);
  }

  return score;
}

const MODEL_TOKEN_STOP_WORDS = new Set([
  "automobil",
  "benzin",
  "ccm",
  "cdi",
  "combi",
  "crdi",
  "dci",
  "diesel",
  "fsi",
  "gdi",
  "hdi",
  "hp",
  "hybrid",
  "kw",
  "limuzina",
  "mpi",
  "nafta",
  "osobni",
  "quattro",
  "sedan",
  "tdi",
  "tfsi",
  "tsi",
  "vozidlo",
]);

function compactModelCodes(value: string): string {
  return value
    .replace(/\b([a-z]{1,3})\s+(\d{1,3})([a-z]?)\b/g, "$1$2$3")
    .replace(/\b(\d{1,3})\s+([a-z]{1,3})\b/g, "$1$2");
}

function vinModelTokens(value: unknown): string[] {
  const vin = text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (vin.length < 8) return [];

  const tokens = [vin.slice(6, 8).toLowerCase()];
  const threeChar = vin.slice(6, 9).toLowerCase();
  if (!threeChar.endsWith("0")) tokens.push(threeChar);
  return tokens.filter((token) => /^[a-z0-9]{2,3}$/.test(token));
}

function audiModelHint(body: AutoKellyRequest): { series: string; generation: string; platforms: string[] } | null {
  const brand = normalizeText(body.brand);
  const combined = compactModelCodes(normalizeText(`${body.model ?? ""} ${body.vin ?? ""}`));
  const vinTokens = vinModelTokens(body.vin);
  if (!brand.includes("audi") && !text(body.vin).toUpperCase().startsWith("WAU")) return null;

  if (/\ba6\b/.test(combined) || vinTokens.includes("4g") || /\b4g[0-9a-z]?\b/.test(combined)) {
    return {
      series: "a6",
      generation: "c7",
      platforms: ["4g", "4g2", "4gc"],
    };
  }

  return null;
}

function modelTokens(body: AutoKellyRequest): string[] {
  const brandNorm = normalizeText(body.brand);
  let normalized = compactModelCodes(
    normalizeText(`${body.model ?? ""} ${body.category ?? ""} ${body.body ?? ""}`)
  );
  if (brandNorm) {
    normalized = normalized.replace(new RegExp(`\\b${escapeRegExp(brandNorm)}\\b`, "g"), " ");
  }
  normalized = normalized
    .replace(/\b\d\s+\d\s*(tdi|tsi|tfsi|fsi|cdi|hdi|dci|crdi|gdi|mpi|hybrid|quattro)?\b/g, " ")
    .replace(/\b\d[.,]\d\s*(tdi|tsi|tfsi|fsi|cdi|hdi|dci|crdi|gdi|mpi|hybrid|quattro)?\b/g, " ")
    .replace(/\b\d{2,3}\s*kw\b/g, " ")
    .replace(/\b\d{3,4}\s*ccm\b/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized.match(/[a-z0-9]+/g) ?? [];
  const filtered = tokens.filter((token) => {
    if (MODEL_TOKEN_STOP_WORDS.has(token)) return false;
    if (/^\d{1,2}$/.test(token)) return false;
    return token.length >= 2 || /^[a-z]\d$/.test(token);
  });
  return uniq([...filtered, ...vinModelTokens(body.vin)]).slice(0, 8);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fullYear(twoOrFourDigit: number): number {
  if (twoOrFourDigit >= 100) return twoOrFourDigit;
  const currentCutoff = new Date().getFullYear() % 100;
  return twoOrFourDigit <= currentCutoff + 2 ? 2000 + twoOrFourDigit : 1900 + twoOrFourDigit;
}

function parseYearRange(value: string): { from: number | null; to: number | null } {
  const raw = value.replace(/\s+/g, "");
  const match = raw.match(/(\d{1,2})(?:\/(\d{2,4}))?\s*-\s*(?:(\d{1,2})(?:\/(\d{2,4}))?)?/);
  if (!match) return { from: null, to: null };

  const fromYear = match[2] ? fullYear(Number(match[2])) : fullYear(Number(match[1]));
  const toYear = match[4] ? fullYear(Number(match[4])) : match[3] ? fullYear(Number(match[3])) : null;
  return { from: fromYear, to: toYear };
}

function yearInRange(year: number | null, value: string): 1 | 0 | -1 {
  if (year == null || !value) return 0;
  const range = parseYearRange(value);
  if (range.from == null && range.to == null) return 0;
  if (range.from != null && year < range.from) return -1;
  if (range.to != null && year > range.to) return -1;
  return 1;
}

function targetYear(body: AutoKellyRequest): number | null {
  return toInteger(body.year) ?? toInteger(body.firstRegistrationYear);
}

function scoreModel(entry: CatalogEntry, body: AutoKellyRequest): number {
  const entryText = normalizeText(entry.text);
  const tokens = modelTokens(body);
  if (!entryText || tokens.length === 0) return 0;

  const primary = tokens[0];
  let score = entryText.split(" ").includes(primary) ? 50 : entryText.includes(primary) ? 35 : 0;
  for (const token of tokens.slice(1)) {
    if (entryText.split(" ").includes(token)) score += 14;
    else if (entryText.includes(token)) score += 8;
  }

  const yearMatch = yearInRange(targetYear(body), entry.year || entry.text);
  if (yearMatch === 1) score += 28;
  if (yearMatch === -1) score -= 18;

  const audiHint = audiModelHint(body);
  if (audiHint) {
    const hasSeries = entryText.split(" ").includes(audiHint.series);
    const hasGeneration = entryText.split(" ").includes(audiHint.generation);
    const hasPlatform = audiHint.platforms.some((platform) => entryText.includes(platform));

    if (hasSeries) score += 60;
    if (hasGeneration) score += 25;
    if (hasPlatform) score += 25;
    if (hasSeries && hasGeneration && hasPlatform) score += 60;
    if (hasSeries && yearMatch === 1) score += 20;
  }

  const target = normalizeText(`${body.model ?? ""} ${body.body ?? ""} ${body.category ?? ""}`);
  for (const bodyToken of ["allroad", "avant", "cabrio", "coupe", "sportback"]) {
    const wants = target.includes(bodyToken);
    const has = entryText.includes(bodyToken);
    if (wants && has) score += 10;
    if (!wants && has && bodyToken === "allroad") score -= 14;
  }

  return score;
}

function fuelKind(value: unknown): "diesel" | "petrol" | "hybrid" | "electric" | "unknown" {
  const normalized = normalizeText(value);
  if (!normalized) return "unknown";
  if (/(nafta|diesel|tdi|cdi|hdi|dci|crdi)/.test(normalized)) return "diesel";
  if (/(benzin|petrol|gasoline|tsi|tfsi|fsi|mpi)/.test(normalized)) return "petrol";
  if (/(hybrid|phev)/.test(normalized)) return "hybrid";
  if (/(elektro|electric|ev)/.test(normalized)) return "electric";
  return "unknown";
}

function scoreMotor(entry: CatalogEntry, body: AutoKellyRequest): number {
  const targetPower = toInteger(body.powerKw);
  const targetDisplacement = toInteger(body.displacement);
  const entryText = normalizeText(`${entry.text} ${entry.fuel}`);
  let score = 0;

  if (targetPower != null && entry.powerKw != null) {
    const diff = Math.abs(entry.powerKw - targetPower);
    score += diff <= 1 ? 45 : diff <= 5 ? 30 : diff <= 12 ? 12 : -20;
  }

  if (targetDisplacement != null && entry.displacement != null) {
    const diff = Math.abs(entry.displacement - targetDisplacement);
    score += diff <= 30 ? 35 : diff <= 120 ? 18 : diff <= 250 ? 8 : -12;
  }

  const requestFuel = fuelKind(`${body.fuel ?? ""} ${body.model ?? ""}`);
  const entryFuel = fuelKind(`${entry.fuel} ${entry.text}`);
  if (requestFuel !== "unknown" && entryFuel !== "unknown") {
    score += requestFuel === entryFuel ? 12 : -8;
  }

  const yearMatch = yearInRange(targetYear(body), entry.year || entry.text);
  if (yearMatch === 1) score += 12;
  if (yearMatch === -1) score -= 10;

  const target = normalizeText(`${body.model ?? ""} ${body.body ?? ""} ${body.category ?? ""}`);
  if (target.includes("quattro") && entryText.includes("quattro")) score += 10;
  if (target.includes("tdi") && entryText.includes("tdi")) score += 6;
  if (target.includes("tfsi") && entryText.includes("tfsi")) score += 6;

  return score;
}

function pickBest(entries: CatalogEntry[], scorer: (entry: CatalogEntry) => number, minScore: number, stage: string): MatchedCatalogEntry {
  const ranked = entries
    .map((entry) => ({ ...entry, score: scorer(entry) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < minScore) {
    const candidates = ranked
      .slice(0, 5)
      .map((entry) => `${entry.text}${entry.year ? ` (${entry.year})` : ""}: ${entry.score}`)
      .join("; ");
    throw new LookupError(
      `AutoKelly nenašlo odpovídající položku ve fázi ${stage}.${candidates ? ` Nejbližší kandidáti: ${candidates}` : ""}`,
      404,
      stage
    );
  }
  return best;
}

function pickByText(entries: CatalogEntry[], wanted: string, stage: string): CatalogEntry {
  const normalizedWanted = normalizeText(wanted);
  const exact = entries.find((entry) => normalizeText(entry.text) === normalizedWanted);
  if (exact) return exact;
  const partial = entries.find((entry) => normalizeText(entry.text).includes(normalizedWanted));
  if (partial) return partial;
  throw new LookupError(`AutoKelly nenašlo kategorii ${wanted}.`, 404, stage);
}

function readProductEntry(value: unknown): ProductEntry | null {
  const row = readObject(value);
  if (!row) return null;

  const id = text(row.Id);
  const name = text(row.Text);
  const code = text(row.Code);
  if (!id || (!name && !code)) return null;

  const brand = text(row.Brand);
  const link = text(row.Link);
  const availabilityRow = readObject(row.Disponibility);
  const availability = [text(availabilityRow?.Text), text(availabilityRow?.AmountText)].filter(Boolean).join(" · ");
  const normalizedName = normalizeText(name);
  const normalizedBrand = normalizeText(brand);
  const isOriginal =
    row.IsOEPart === true ||
    normalizedName.includes("oem") ||
    normalizedName.includes("original") ||
    normalizedBrand.includes("originalni dil") ||
    normalizedBrand.includes("original") ||
    /\bvag\b/.test(normalizedBrand);

  return {
    id,
    name,
    code,
    brand,
    url: link ? toAutoKellyUrl(link) : "",
    priceText: text(row.PriceVat),
    priceCzk: parseCzk(text(row.PriceVat)),
    availability,
    isOriginal,
    isWindshield: normalizedName.includes("celni") || normalizeText(code).includes("windshield"),
  };
}

function readProducts(payload: unknown): { products: ProductEntry[]; totalPages: number; totalCount: number } {
  const row = readObject(payload);
  const items = Array.isArray(row?.Items) ? row.Items : [];
  const paging = readObject(row?.Paging);
  const products = items.map(readProductEntry).filter((item): item is ProductEntry => item != null);
  return {
    products,
    totalPages: Math.max(1, toInteger(paging?.Total) ?? 1),
    totalCount: Math.max(products.length, toInteger(paging?.TotalCount) ?? products.length),
  };
}

function dedupeProducts(products: ProductEntry[]): ProductEntry[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

function parseCzk(value: string): number | null {
  const compact = value.replace(/\u00a0/g, " ").replace(/[^\d,.-]/g, "").replace(/\s+/g, "");
  if (!compact) return null;
  const normalized = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

async function loadUserPrices(session: AutoKellySession, products: ProductEntry[]): Promise<Map<string, { priceText: string; priceCzk: number }>> {
  const ids = products.map((product) => Number(product.id)).filter((id) => Number.isFinite(id));
  if (ids.length === 0) return new Map();

  const payload = await session.postJson("/UserPrice/Data", { productIds: ids });
  const row = readObject(payload);
  const content = Array.isArray(row?.Content) ? row.Content : [];
  const prices = new Map<string, { priceText: string; priceCzk: number }>();

  for (const item of content) {
    const priceRow = readObject(item);
    if (!priceRow) continue;
    const productId = text(priceRow.ProductId);
    const priceText = text(priceRow.PriceVat);
    const priceCzk = parseCzk(priceText);
    if (productId && priceCzk != null) {
      prices.set(productId, { priceText, priceCzk });
    }
  }

  return prices;
}

function buildPriceRangeStats(offers: AutoKellyWindshieldOffer[]): PriceRangeStats {
  const prices = offers.map((offer) => offer.priceCzk).filter((price) => Number.isFinite(price) && price > 0);
  if (prices.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      average: null,
    };
  }

  const sum = prices.reduce((total, price) => total + price, 0);
  return {
    count: prices.length,
    min: Math.min(...prices),
    max: Math.max(...prices),
    average: Math.round(sum / prices.length),
  };
}

async function lookupAutoKellyWindshield(body: AutoKellyRequest, signal: AbortSignal): Promise<AutoKellyWindshieldResponse> {
  const session = new AutoKellySession(signal);

  await session.getPage(ROOT_CATALOG_PATH);
  const makePayload = await session.postJson(`/Catalog/Cars/${ROOT_CATALOG_ID}`);
  const make = pickBest(flattenCatalogEntries(makePayload), (entry) => scoreMake(entry, body), 50, "značka");
  if (!make.id || !make.link) throw new LookupError("AutoKelly nenašlo odkaz na značku vozidla.", 404, "značka");

  await session.getPage(make.link);
  const modelPayload = await session.postJson(`/Catalog/Models/${make.id}`);
  const model = pickBest(flattenCatalogEntries(modelPayload), (entry) => scoreModel(entry, body), 30, "model");
  if (!model.id || !model.link) throw new LookupError("AutoKelly nenašlo odkaz na model vozidla.", 404, "model");

  await session.getPage(model.link);
  const motorPayload = await session.postJson(`/Catalog/Motors/${model.id}`);
  const motor = pickBest(flattenCatalogEntries(motorPayload), (entry) => scoreMotor(entry, body), 45, "motorizace");
  if (!motor.id || !motor.link) throw new LookupError("AutoKelly nenašlo odkaz na motorizaci vozidla.", 404, "motorizace");

  await session.getPage(motor.link);
  const motorCategoriesPayload = await session.postJson(`/Catalog/Categories/${motor.id}`);
  const bodyAndLighting = pickByText(flattenCatalogEntries(motorCategoriesPayload), "Karoserie a osvětlení", "karoserie");
  const glassCategory = pickByText(flattenCatalogEntries(motorCategoriesPayload), "Autoskla", "autoskla");
  if (!glassCategory.id || !glassCategory.link) throw new LookupError("AutoKelly nenašlo kategorii Autoskla.", 404, "autoskla");

  await session.getPage(glassCategory.link);
  const glassCatalogPayload = await session.postJson(`/Catalog/Catalogs/${glassCategory.id}`);
  const frontGlassCategory = pickByText(flattenCatalogEntries(glassCatalogPayload), "Přední skla", "přední skla");
  if (!frontGlassCategory.id || !frontGlassCategory.link) {
    throw new LookupError("AutoKelly nenašlo kategorii Přední skla.", 404, "přední skla");
  }

  await session.getPage(frontGlassCategory.link);
  const firstPage = readProducts(await session.postJson("/ProductList/Items/AllInOne/1"));
  const allProducts = [...firstPage.products];
  const totalPages = Math.min(firstPage.totalPages, MAX_PRODUCT_PAGES);
  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = readProducts(await session.postJson(`/ProductList/Items/AllInOne/${page}`));
    allProducts.push(...nextPage.products);
  }

  const products = dedupeProducts(allProducts);
  const windshieldProducts = products.filter((product) => product.isWindshield);
  const userPrices = await loadUserPrices(session, windshieldProducts);

  const offers = windshieldProducts
    .map((product) => {
      const price = userPrices.get(product.id);
      const priceCzk = price?.priceCzk ?? product.priceCzk;
      const priceText = price?.priceText ?? product.priceText;
      if (priceCzk == null) return null;
      return {
        productId: product.id,
        name: product.name,
        code: product.code,
        brand: product.brand,
        priceCzk,
        priceText,
        availability: product.availability,
        url: product.url,
        isOriginal: product.isOriginal,
        kind: product.isOriginal ? "original" : "aftermarket",
      } satisfies AutoKellyWindshieldOffer;
    })
    .filter((offer): offer is AutoKellyWindshieldOffer => offer != null)
    .sort((a, b) => {
      if (a.isOriginal !== b.isOriginal) return a.isOriginal ? -1 : 1;
      return b.priceCzk - a.priceCzk;
    });

  if (offers.length === 0) {
    throw new LookupError("AutoKelly našlo přední skla, ale nenašlo naceněnou čelní variantu.", 404, "ceny");
  }

  const originalOffers = offers.filter((offer) => offer.kind === "original");
  const aftermarketOffers = offers.filter((offer) => offer.kind === "aftermarket");

  return {
    ok: true,
    source: "autokelly",
    sourceUrl: toAutoKellyUrl(frontGlassCategory.link),
    fetchedAt: new Date().toISOString(),
    matched: {
      make: make.text,
      model: model.text,
      motor: motor.text,
      categoryPath: [bodyAndLighting.text, glassCategory.text, frontGlassCategory.text],
    },
    offers,
    stats: {
      original: buildPriceRangeStats(originalOffers),
      aftermarket: buildPriceRangeStats(aftermarketOffers),
      overall: buildPriceRangeStats(offers),
    },
    originalCount: originalOffers.length,
    aftermarketCount: aftermarketOffers.length,
    productCount: Math.max(firstPage.totalCount, products.length),
  };
}

async function readJson(req: NextRequest): Promise<AutoKellyRequest> {
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
    return NextResponse.json({ ok: false, error: "Missing bearer token" }, { status: 401 });
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

  const body = await readJson(req);
  if (!text(body.brand) || (!text(body.model) && !text(body.vin))) {
    return NextResponse.json(
      { ok: false, error: "Nejdřív je potřeba načíst značku vozidla a ideálně VIN nebo model." },
      { status: 400 }
    );
  }

  const key = cacheKey(body);
  const cached = readCache(key);
  if (cached) {
    return NextResponse.json(cached, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  }

  const rate = consumeRateLimit(decoded.uid);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Příliš mnoho dotazů na AutoKelly. Zkus to znovu za chvíli." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSec),
        },
      }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);

  try {
    const response = await lookupAutoKellyWindshield(body, controller.signal);
    writeCache(key, response);
    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (err: unknown) {
    const lookupError = err instanceof LookupError ? err : null;
    const row = readObject(err);
    const name = text(row?.name);
    return NextResponse.json(
      {
        ok: false,
        error:
          name === "AbortError"
            ? "AutoKelly nestihlo odpovědět. Zkus dotaz zopakovat."
            : lookupError?.message ?? "Nepodařilo se načíst cenu čelního skla z AutoKelly.",
        stage: lookupError?.stage,
      },
      { status: name === "AbortError" ? 504 : lookupError?.status ?? 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
