import { NextResponse } from "next/server";

import {
  requireIpRateLimited,
  withIpRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const revalidate = 60;

type TrackedProductKey = "argor-1oz" | "argor-20g" | "pamp-1oz";

type TrackedProduct = {
  key: TrackedProductKey;
  label: string;
  productId: number;
};

type PriceSnapshot = {
  sellCzk: number | null;
  buybackCzk: number | null;
  productId: number;
  productLabel: string;
};

type LiveState = {
  ts: number;
  prices: Record<TrackedProductKey, PriceSnapshot>;
  note?: string;
};

const DEFAULT_API_BASE = "https://eshop.comfort-commodity.cz/api-produkce/eshop/";
const CACHE_MS = 60_000;
const REQUEST_TIMEOUT_MS = 12_000;
const AGENT = "Bohemika-SmartApp/1.0";
const COMFORT_PRICES_RATE_LIMIT = 120;
const COMFORT_PRICES_RATE_LIMIT_WINDOW_MS = 60_000;

let lastLiveState: LiveState | null = null;
let cachedToken: { token: string; ts: number } | null = null;

function normalizeApiBase(raw: string | undefined): string {
  const base = (raw ?? DEFAULT_API_BASE).trim();
  if (!base) return DEFAULT_API_BASE;
  return base.endsWith("/") ? base : `${base}/`;
}

function parsePositiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getTrackedProducts(): TrackedProduct[] {
  const argorId = parsePositiveInt(process.env.COMFORT_ESHOP_ARGOR_1OZ_ID) ?? 646;
  const argor20gId = parsePositiveInt(process.env.COMFORT_ESHOP_ARGOR_20G_ID) ?? 652;
  const pampId = parsePositiveInt(process.env.COMFORT_ESHOP_PAMP_1OZ_ID);

  const rows: TrackedProduct[] = [
    { key: "argor-1oz", label: "ARGOR 1 oz", productId: argorId },
    { key: "argor-20g", label: "ARGOR 20 g", productId: argor20gId },
  ];

  if (pampId) {
    rows.push({ key: "pamp-1oz", label: "PAMP 1 oz", productId: pampId });
  }

  return rows;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/Kč/gi, "")
    .replace(/,/g, ".");

  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRoundedCzk(value: unknown): number | null {
  const n = toFiniteNumber(value);
  if (n == null || n <= 0) return null;
  return Math.round(n);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function buildAuthHeaders(token: string): Record<string, string> {
  const basic = Buffer.from(`1:${token}`).toString("base64");
  return {
    Authorization: `Basic ${basic}`,
    AuthToken: token,
    Cookie: `cc_eshop_token=${token}`,
  };
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": AGENT,
        ...(init?.headers ?? {}),
      },
    });

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (!response.ok) {
      const preview = typeof payload === "string" ? payload.slice(0, 220) : "";
      throw new Error(
        `Comfort API HTTP ${response.status}${preview ? `: ${preview}` : ""}`
      );
    }

    if (typeof payload === "string" && /^Array\s*\(/.test(payload.trim())) {
      throw new Error("Comfort API returned non-JSON payload.");
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function loginForToken(apiBase: string): Promise<string> {
  const staticToken = process.env.COMFORT_ESHOP_TOKEN?.trim();
  if (staticToken) return staticToken;

  if (cachedToken && Date.now() - cachedToken.ts < 20 * 60_000) {
    return cachedToken.token;
  }

  const username = process.env.COMFORT_ESHOP_USERNAME?.trim();
  const password = process.env.COMFORT_ESHOP_PASSWORD?.trim();

  if (!username || !password) {
    throw new Error(
      "Missing Comfort credentials. Set COMFORT_ESHOP_TOKEN or COMFORT_ESHOP_USERNAME/COMFORT_ESHOP_PASSWORD."
    );
  }

  const loginUrl = new URL("session/prihlasit", apiBase).toString();
  const payload = {
    uzivatel: username,
    heslo: password,
    prohlizec: "Bohemika SmartApp",
    zarizeni: "server",
    os: "node",
    rozliseni_sirka: 1920,
    rozliseni_vyska: 1080,
  };

  const loginRes = await fetchJson(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!isObject(loginRes)) {
    throw new Error("Comfort login response is invalid.");
  }

  const loggedIn = loginRes.prihlasen === true;
  const token = typeof loginRes.token === "string" ? loginRes.token.trim() : "";

  if (!loggedIn || !token) {
    throw new Error("Comfort login failed.");
  }

  cachedToken = { token, ts: Date.now() };
  return token;
}

function extractCzkPrice(payload: unknown): { sellCzk: number | null; buybackCzk: number | null } {
  if (!isObject(payload)) {
    return { sellCzk: null, buybackCzk: null };
  }

  const topSell = toRoundedCzk(payload.prodejni_cena);
  const topBuyback = toRoundedCzk(payload.vykupni_cena);

  const rows = Array.isArray(payload.aktualni_ceny) ? payload.aktualni_ceny : [];
  const firstRow = rows.find((row) => isObject(row));

  const czkRow = rows.find((row) => {
    if (!isObject(row)) return false;
    const mena = isObject(row.mena) ? row.mena : null;
    if (!mena) return false;

    const ident = typeof mena.identifikator === "string" ? mena.identifikator.toUpperCase() : "";
    const zkratka = typeof mena.zkratka === "string" ? mena.zkratka.toUpperCase() : "";
    const name = typeof mena.nazev === "string" ? mena.nazev.toLowerCase() : "";

    return ident === "CZK" || zkratka === "CZK" || zkratka.includes("KČ") || name.includes("koruna");
  });

  const candidate = (isObject(czkRow) ? czkRow : isObject(firstRow) ? firstRow : null) as
    | Record<string, unknown>
    | null;

  const rowSell = candidate ? toRoundedCzk(candidate.prodejni_cena) : null;
  const rowBuyback = candidate ? toRoundedCzk(candidate.vykupni_cena) : null;

  return {
    sellCzk: rowSell ?? topSell,
    buybackCzk: rowBuyback ?? topBuyback,
  };
}

async function loadLiveState(): Promise<LiveState> {
  if (lastLiveState && Date.now() - lastLiveState.ts < CACHE_MS) {
    return lastLiveState;
  }

  const products = getTrackedProducts();
  if (!products.length) {
    throw new Error("No Comfort products configured for sync.");
  }

  const apiBase = normalizeApiBase(process.env.COMFORT_ESHOP_API_URL);
  const token = await loginForToken(apiBase);
  const headers = buildAuthHeaders(token);

  const prices: Partial<Record<TrackedProductKey, PriceSnapshot>> = {};

  for (const product of products) {
    const url = new URL(`produkty/${product.productId}`, apiBase).toString();
    const payload = await fetchJson(url, { headers });
    const parsed = extractCzkPrice(payload);

    prices[product.key] = {
      sellCzk: parsed.sellCzk,
      buybackCzk: parsed.buybackCzk,
      productId: product.productId,
      productLabel: product.label,
    };
  }

  const missing = products.filter((product) => !prices[product.key]);
  if (missing.length) {
    throw new Error(`Comfort sync missing products: ${missing.map((item) => item.key).join(", ")}`);
  }

  const state: LiveState = {
    ts: Date.now(),
    prices: prices as Record<TrackedProductKey, PriceSnapshot>,
  };

  lastLiveState = state;
  return state;
}

export async function GET(req: Request) {
  const guard = await requireIpRateLimited(req, {
    namespace: "api:comfort-prices:get",
    limit: COMFORT_PRICES_RATE_LIMIT,
    windowMs: COMFORT_PRICES_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const withRateLimit = (response: NextResponse) =>
    withIpRateLimitHeaders(response, guard.ctx);

  try {
    const state = await loadLiveState();
    return withRateLimit(
      NextResponse.json({
        ok: true,
        source: "live",
        fetchedAt: state.ts,
        prices: state.prices,
      })
    );
  } catch (err: any) {
    if (lastLiveState) {
      return withRateLimit(
        NextResponse.json({
          ok: true,
          source: "fallback",
          stale: true,
          fetchedAt: lastLiveState.ts,
          prices: lastLiveState.prices,
          message: String(err?.message || "Comfort sync failed; using cached snapshot."),
        })
      );
    }

    return withRateLimit(
      NextResponse.json(
        {
          ok: false,
          error: String(err?.message || "Comfort sync failed."),
        },
        { status: 500 }
      )
    );
  }
}
