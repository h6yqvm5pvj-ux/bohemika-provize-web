import { NextResponse, type NextRequest } from "next/server";

import { adminAuth } from "@/lib/server/firebaseAdmin";
import { getAdvisorAccessError } from "@/lib/server/advisorSetupGuard";
import { getLoginAttemptLockoutError } from "@/lib/server/loginAttemptLockout";
import {
  applyRateLimitHeaders,
  consumeRateLimit,
} from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CuzkAddressLookupQuery = {
  q?: string;
  obec?: string;
  ulice?: string;
  cisloDomovni?: string | number;
  cisloOrientacni?: string | number;
  psc?: string | number;
  cp?: string | number;
  co?: string | number;
  pickFirst?: string | number | boolean;
};

type AddressLookupCandidate = CuzkAddressLookupQuery & {
  _label: string;
};

type RuianMatch = {
  kod: number;
  adresa: string;
  psc?: number;
  cislodomovni?: number;
  cisloorientacni?: number;
  cisloorientacnipismeno?: string;
  stavebniobjekt?: number | null;
};

type AddressSearchHints = {
  houseNumber: string | null;
  zipCode: string | null;
  localityTokens: string[];
};

type CuzkSearchSuccess = {
  ok: true;
  data?: unknown;
  resolvedAddress?: string;
  suggestions?: RuianMatch[];
  matches?: RuianMatch[];
};

type CuzkSearchError = {
  ok: false;
  error: string;
};

type AuthContext = {
  token: string;
  uid: string;
  email: string;
};

const CUZK_DETAIL_URL =
  process.env.CUZK_FN_URL?.trim() ||
  process.env.NEXT_PUBLIC_CUZK_FN_URL?.trim() ||
  "";
const CUZK_ADDRESS_URL =
  process.env.CUZK_FN_ADDRESS_URL?.trim() ||
  process.env.NEXT_PUBLIC_CUZK_FN_ADDRESS_URL?.trim() ||
  "";
const CUZK_SUGGEST_URL =
  process.env.CUZK_FN_SUGGEST_URL?.trim() ||
  process.env.NEXT_PUBLIC_CUZK_FN_SUGGEST_URL?.trim() ||
  "";

const RATE_LIMIT_MAX = 90;
const RATE_LIMIT_WINDOW_MS = 60_000;

const CACHE_TTL_SEARCH_MS = 120_000;
const CACHE_TTL_DETAIL_MS = 180_000;
const CACHE_TTL_SUGGEST_MS = 45_000;
const CACHE_MAX_ITEMS = 500;
const SMART_SEARCH_TIMEOUT_MS = 24_000;
const ADDRESS_LOOKUP_TIMEOUT_MS = 7_000;
const SUGGEST_LOOKUP_TIMEOUT_MS = 2_500;
const SUGGEST_TOTAL_TIMEOUT_MS = 6_000;

const CUZK_CACHE = Symbol.for("bohemika.cuzk.cache");
type CacheEntry = {
  expiresAt: number;
  payload: CuzkSearchSuccess;
};
type GlobalWithCuzkCache = typeof globalThis & {
  [CUZK_CACHE]?: Map<string, CacheEntry>;
};

function getCacheStore(): Map<string, CacheEntry> {
  const g = globalThis as GlobalWithCuzkCache;
  if (!g[CUZK_CACHE]) g[CUZK_CACHE] = new Map<string, CacheEntry>();
  return g[CUZK_CACHE];
}

function getCachedPayload(cacheKey: string): CuzkSearchSuccess | null {
  const now = Date.now();
  const store = getCacheStore();
  const row = store.get(cacheKey);
  if (!row) return null;
  if (row.expiresAt <= now) {
    store.delete(cacheKey);
    return null;
  }
  return row.payload;
}

function pruneCache(store: Map<string, CacheEntry>, now: number): void {
  if (store.size <= CACHE_MAX_ITEMS) return;
  for (const [key, row] of store.entries()) {
    if (row.expiresAt <= now) {
      store.delete(key);
    }
  }
  if (store.size <= CACHE_MAX_ITEMS) return;
  const entries = Array.from(store.entries()).sort(
    (a, b) => a[1].expiresAt - b[1].expiresAt
  );
  for (let i = 0; i < entries.length - CACHE_MAX_ITEMS; i += 1) {
    const key = entries[i]?.[0];
    if (key) store.delete(key);
  }
}

function setCachedPayload(
  cacheKey: string,
  payload: CuzkSearchSuccess,
  ttlMs: number
): void {
  const store = getCacheStore();
  const now = Date.now();
  pruneCache(store, now);
  store.set(cacheKey, { expiresAt: now + ttlMs, payload });
}

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

async function getAuthContext(req: NextRequest): Promise<AuthContext> {
  if (!adminAuth) {
    throw Object.assign(
      new Error("Server není správně nakonfigurován (Firebase Admin)."),
      { status: 500 }
    );
  }

  const token = getBearerToken(req);
  if (!token) {
    throw Object.assign(new Error("Missing bearer token"), { status: 401 });
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch (err: any) {
    const code = err?.code || "auth/invalid-token";
    const message = err?.message || "Invalid or expired token";
    throw Object.assign(
      new Error(`Invalid or expired token (${code}): ${message}`),
      { status: 401 }
    );
  }

  const email = String(decoded.email ?? "").trim().toLowerCase();
  if (!email) {
    throw Object.assign(
      new Error("Přihlášený účet nemá dostupný e-mail v tokenu."),
      { status: 401 }
    );
  }
  const lockout = await getLoginAttemptLockoutError(req, email);
  if (lockout) {
    throw Object.assign(new Error(lockout.error), {
      status: lockout.status,
      retryAfterSeconds: lockout.retryAfterSeconds,
    });
  }
  const setupError = await getAdvisorAccessError({ email, uid: decoded.uid });
  if (setupError) {
    throw Object.assign(new Error(setupError.error), {
      status: setupError.status,
      missingSetup: setupError.missing,
    });
  }

  return {
    token,
    uid: String(decoded.uid ?? ""),
    email,
  };
}

function ensureConfiguredEndpoint(url: string, name: string): string {
  if (!url) {
    throw Object.assign(
      new Error(`Chybí konfigurace ${name}.`),
      { status: 500 }
    );
  }
  return url;
}

function buildCuzkTimeoutError(): Error & { status?: number } {
  return Object.assign(
    new Error(
      "ČÚZK odpovídá příliš dlouho. Zkus dotaz znovu, případně vyber přesnou adresu z našeptávače."
    ),
    { status: 504 }
  );
}

function remainingTimeoutMs(deadlineAt: number, maxMs: number): number {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw buildCuzkTimeoutError();
  return Math.min(maxMs, remaining);
}

function appendIfPresent(
  params: URLSearchParams,
  key: string,
  value: unknown
): void {
  if (value == null) return;
  const str = String(value).trim();
  if (!str) return;
  params.set(key, str);
}

function safeNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeSpaces(value: string): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function normalizeAddressForCompare(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSuggestPayload(data: unknown): RuianMatch[] {
  const toList = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    return [];
  };

  const row = (data && typeof data === "object" ? data : null) as
    | Record<string, unknown>
    | null;
  const dataRow =
    row?.data && typeof row.data === "object"
      ? (row.data as Record<string, unknown>)
      : null;
  const rawCandidates = [
    toList(data),
    toList(row?.suggestions),
    toList(row?.matches),
    toList(row?.items),
    toList(row?.results),
    toList(row?.data),
    toList(dataRow?.items),
    toList(dataRow?.results),
  ];
  const raw = rawCandidates.find((arr) => arr.length > 0) ?? [];

  const seen = new Set<string>();
  return raw
    .map((x: unknown) => {
      if (typeof x === "string") return { kod: 0, adresa: x } as RuianMatch;
      if (!x || typeof x !== "object") return null;
      const item = x as Record<string, unknown>;
      const adresa = String(
        item.adresa ??
          item.address ??
          item.text ??
          item.label ??
          item.title ??
          item.displayName ??
          item.value ??
          item.name ??
          ""
      ).trim();
      const kod = Number(
        item.kod ??
          item.id ??
          item.ruianKod ??
          item.ruian_kod ??
          item.adresniMistoKod ??
          item.adresnimistokod ??
          item.addressPointCode ??
          0
      );
      return {
        kod: Number.isFinite(kod) ? kod : 0,
        adresa,
        psc: item.psc != null ? Number(item.psc) : undefined,
        cislodomovni:
          item.cislodomovni != null ? Number(item.cislodomovni) : undefined,
        cisloorientacni:
          item.cisloorientacni != null ? Number(item.cisloorientacni) : undefined,
        cisloorientacnipismeno: String(
          item.cisloorientacnipismeno ?? item.cisloOrientacniPismeno ?? ""
        ),
        stavebniobjekt:
          safeNum(item.stavebniobjekt ?? item.stavebniObjekt) ?? null,
      } as RuianMatch;
    })
    .filter(
      (m): m is RuianMatch =>
        Boolean(m && m.adresa && String(m.adresa).trim().length > 0)
    )
    .filter(match => {
      const key = match.kod > 0 ? `kod:${match.kod}` : normalizeAddressForCompare(match.adresa);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function normalizeSuggestQueryVariants(input: string): string[] {
  const base = String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return [];

  const capFirst = (s: string) => {
    const t = String(s ?? "").trim();
    if (!t) return "";
    return t[0].toLocaleUpperCase("cs-CZ") + t.slice(1);
  };

  const v1 = base;
  const v2 = capFirst(base);
  const v3 = base
    .split(",")
    .map((seg) => capFirst(seg))
    .filter(Boolean)
    .join(", ");

  return Array.from(new Set([v1, v2, v3].filter((s) => s && s.length >= 2)));
}

function extractAddressSearchHints(input: string): AddressSearchHints {
  const base = String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return { houseNumber: null, zipCode: null, localityTokens: [] };

  const zipMatch = base.match(/\b\d{3}\s?\d{2}\b/);
  const zipCode = zipMatch ? zipMatch[0].replace(/\s+/g, "") : null;

  const cleaned = base
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d{3}\s?\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const houseNumber =
    cleaned.match(/\b\d+[a-zA-Z]?(?:\/\d+)?\b/)?.[0]?.toLowerCase() ?? null;

  const localityRaw = cleaned
    .replace(/\b\d+[a-zA-Z]?(?:\/\d+)?\b/g, " ")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const localityTokens = normalizeAddressForCompare(localityRaw)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+$/.test(token))
    .slice(0, 6);
  return { houseNumber, zipCode, localityTokens };
}

function scoreMatchForAddressHints(
  match: RuianMatch,
  hints: AddressSearchHints
): number {
  const addressRaw = String(match?.adresa ?? "").trim();
  if (!addressRaw) return Number.NEGATIVE_INFINITY;

  const normalizedAddress = normalizeAddressForCompare(addressRaw);
  let score = 0;

  if (hints.houseNumber) {
    const numberPattern = new RegExp(
      `(^|\\D)${escapeRegExp(hints.houseNumber)}(?=\\D|$)`
    );
    if (numberPattern.test(normalizedAddress)) score += 10;
    else score -= 4;

    const matchHouseNumber = String(match?.cislodomovni ?? "")
      .trim()
      .toLowerCase();
    if (matchHouseNumber && matchHouseNumber === hints.houseNumber) {
      score += 6;
    }
  }

  for (const token of hints.localityTokens) {
    if (normalizedAddress.includes(token)) score += 2;
    else score -= 1;
  }

  if (hints.zipCode) {
    const psc = String(match?.psc ?? "").replace(/\s+/g, "");
    if (psc && psc === hints.zipCode) score += 6;
    else if (normalizedAddress.includes(hints.zipCode)) score += 3;
  }
  return score;
}

function parseStructuredAddressCandidates(input: string): AddressLookupCandidate[] {
  const base = normalizeSpaces(input);
  if (!base) return [];

  const withoutParentheses = normalizeSpaces(base.replace(/\([^)]*\)/g, " "));
  const zipMatch = withoutParentheses.match(/\b\d{3}\s?\d{2}\b/);
  const zipCode = zipMatch ? zipMatch[0].replace(/\s+/g, "") : "";
  const withoutZip = normalizeSpaces(
    withoutParentheses.replace(/\b\d{3}\s?\d{2}\b/g, " ")
  );
  const numberMatch = withoutZip.match(/\b(\d+)(?:\s*\/\s*(\d+))?\b/);
  const houseNumber = numberMatch?.[1] ?? "";
  const orientNumber = numberMatch?.[2] ?? "";

  const localityRaw = normalizeSpaces(
    withoutZip.replace(/\b\d+(?:\s*\/\s*\d+)?\b/g, " ").replace(/\s+,/g, ",")
  );
  const parts = localityRaw
    .split(",")
    .map((part) => normalizeSpaces(part))
    .filter(Boolean);
  const obec = parts.length ? parts[parts.length - 1] : "";
  const ulice = parts.length > 1 ? parts[0] : "";

  const out: AddressLookupCandidate[] = [];
  const seen = new Set<string>();
  const add = (candidate: AddressLookupCandidate) => {
    const normalized: AddressLookupCandidate = {
      ...candidate,
      q: normalizeSpaces(String(candidate.q ?? "")) || undefined,
      obec: normalizeSpaces(String(candidate.obec ?? "")) || undefined,
      ulice: normalizeSpaces(String(candidate.ulice ?? "")) || undefined,
      cisloDomovni:
        normalizeSpaces(String(candidate.cisloDomovni ?? "")) || undefined,
      cisloOrientacni:
        normalizeSpaces(String(candidate.cisloOrientacni ?? "")) || undefined,
      psc: normalizeSpaces(String(candidate.psc ?? "")) || undefined,
    };
    if (
      !normalized.q &&
      !normalized.obec &&
      !normalized.ulice &&
      !normalized.cisloDomovni
    ) {
      return;
    }
    const key = JSON.stringify({
      q: normalized.q ?? "",
      obec: normalized.obec ?? "",
      ulice: normalized.ulice ?? "",
      cp: normalized.cisloDomovni ?? "",
      co: normalized.cisloOrientacni ?? "",
      psc: normalized.psc ?? "",
    });
    if (seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  };

  add({ _label: "q-raw", q: base });

  if (houseNumber && obec) {
    if (
      ulice &&
      normalizeAddressForCompare(ulice) !== normalizeAddressForCompare(obec)
    ) {
      add({
        _label: "obec+ulice+cp",
        obec,
        ulice,
        cisloDomovni: houseNumber,
        ...(orientNumber ? { cisloOrientacni: orientNumber } : {}),
        ...(zipCode ? { psc: zipCode } : {}),
      });
    }
    add({
      _label: "obec+cp",
      obec,
      cisloDomovni: houseNumber,
      ...(orientNumber ? { cisloOrientacni: orientNumber } : {}),
      ...(zipCode ? { psc: zipCode } : {}),
    });
  }

  if (houseNumber && obec) {
    add({
      _label: "q-cp-format",
      q: `č. p. ${houseNumber}, ${obec}`,
    });
  }

  return out;
}

function normalizeAutoAddressCandidates(input: string): string[] {
  const base = String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const cleaned = String(value ?? "")
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ", ")
      .trim();
    if (cleaned.length < 2) return;
    const key = normalizeAddressForCompare(cleaned);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(cleaned);
  };

  add(base);

  const withoutParentheses = base
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
  add(withoutParentheses);

  const withoutZip = withoutParentheses
    .replace(/\b\d{3}\s?\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim()
    .replace(/,\s*,/g, ", ");
  add(withoutZip);

  const parts = withoutZip
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 0) {
    add(parts[0]);
    if (parts.length > 1) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      const firstWithoutNumber = first
        .replace(/\b\d+[a-zA-Z]?(?:\/\d+)?\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (
        firstWithoutNumber &&
        normalizeAddressForCompare(firstWithoutNumber) !==
          normalizeAddressForCompare(last)
      ) {
        add(`${first}, ${last}`);
      }
    }
  }

  const numberToken =
    withoutZip.match(/\b\d+[a-zA-Z]?(?:\/\d+)?\b/)?.[0] ?? "";
  const firstPart = parts[0] ?? withoutZip;
  const lastPart = parts.length > 1 ? parts[parts.length - 1] : "";
  const firstWithoutNumber = firstPart
    .replace(/\b\d+[a-zA-Z]?(?:\/\d+)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const locality =
    (lastPart || firstWithoutNumber || firstPart)
      .replace(/\b\d+[a-zA-Z]?(?:\/\d+)?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "";

  if (firstWithoutNumber) add(firstWithoutNumber);
  if (
    locality &&
    normalizeAddressForCompare(locality) !==
      normalizeAddressForCompare(firstWithoutNumber)
  ) {
    add(locality);
  }

  if (numberToken && locality) {
    add(`${locality} ${numberToken}`);
    add(`${numberToken} ${locality}`);
    add(`č. p. ${numberToken}, ${locality}`);
    add(`č.p. ${numberToken}, ${locality}`);
    add(`c. p. ${numberToken}, ${locality}`);
    add(`c.p. ${numberToken}, ${locality}`);
    add(`cp ${numberToken}, ${locality}`);
    add(`číslo popisné ${numberToken}, ${locality}`);
  }

  if (
    numberToken &&
    firstWithoutNumber &&
    locality &&
    normalizeAddressForCompare(firstWithoutNumber) !==
      normalizeAddressForCompare(locality)
  ) {
    add(`${firstWithoutNumber} ${numberToken}, ${locality}`);
    add(`${locality}, ${firstWithoutNumber} ${numberToken}`);
  }

  return out;
}

async function fetchJsonWithAuth(
  url: string,
  token: string,
  timeoutMs = 15_000
): Promise<{ ok: boolean; status: number; body: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw Object.assign(new Error("ČÚZK neodpověděl včas. Zkus dotaz znovu."), {
        status: 504,
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function readErrorMessage(
  payload: any,
  fallback: string
): string {
  const message =
    (payload &&
      (payload.message || payload.error || payload.detail || payload.reason)) ??
    fallback;
  const normalized = String(message).trim();
  if (normalized.toUpperCase() === "CUZK_CALL_FAILED") {
    return "ČÚZK teď nevrátil data pro zadanou adresu. Zkus vybrat konkrétní adresu z našeptávače, případně dotaz za chvíli zopakuj.";
  }
  return normalized;
}

async function lookupByAdresniMisto(
  kod: number,
  includeUnits: boolean,
  token: string,
  timeoutMs = 18_000
): Promise<unknown> {
  const baseUrl = ensureConfiguredEndpoint(CUZK_DETAIL_URL, "CUZK_FN_URL");
  const url = new URL(baseUrl);
  url.searchParams.set("kod", String(kod));
  url.searchParams.set("includeUnits", includeUnits ? "1" : "0");
  const { ok, status, body } = await fetchJsonWithAuth(
    url.toString(),
    token,
    timeoutMs
  );
  if (!ok) {
    throw Object.assign(
      new Error(readErrorMessage(body, `Chyba při volání ČÚZK (${status})`)),
      { status }
    );
  }
  return body;
}

async function lookupByAddress(
  query: string | CuzkAddressLookupQuery,
  includeUnits: boolean,
  token: string,
  timeoutMs = 18_000
): Promise<any> {
  const baseUrl = ensureConfiguredEndpoint(
    CUZK_ADDRESS_URL,
    "CUZK_FN_ADDRESS_URL"
  );
  const url = new URL(baseUrl);
  url.searchParams.set("includeUnits", includeUnits ? "1" : "0");
  url.searchParams.set("pickFirst", "0");

  if (typeof query === "string") {
    const q = String(query ?? "").trim();
    if (q.length < 2) {
      throw Object.assign(new Error("Zadej prosím adresu (aspoň 2 znaky)."), {
        status: 400,
      });
    }
    url.searchParams.set("q", q);
  } else {
    const q = String(query?.q ?? "").trim();
    const obec = String(query?.obec ?? "").trim();
    const ulice = String(query?.ulice ?? "").trim();
    const cisloDomovni = query?.cisloDomovni ?? query?.cp ?? "";
    const cisloOrientacni = query?.cisloOrientacni ?? query?.co ?? "";
    const psc = query?.psc ?? "";
    const pickFirst = query?.pickFirst;

    if (!q && !obec && !ulice && !String(cisloDomovni).trim()) {
      throw Object.assign(new Error("Zadej adresu nebo aspoň obec + č.p."), {
        status: 400,
      });
    }

    appendIfPresent(url.searchParams, "q", q);
    appendIfPresent(url.searchParams, "obec", obec);
    appendIfPresent(url.searchParams, "ulice", ulice);
    appendIfPresent(url.searchParams, "cisloDomovni", cisloDomovni);
    appendIfPresent(url.searchParams, "cisloOrientacni", cisloOrientacni);
    appendIfPresent(url.searchParams, "psc", psc);
    if (pickFirst !== undefined) appendIfPresent(url.searchParams, "pickFirst", pickFirst);
  }

  const { ok, status, body } = await fetchJsonWithAuth(
    url.toString(),
    token,
    timeoutMs
  );
  if (!ok) {
    throw Object.assign(
      new Error(readErrorMessage(body, `Chyba při hledání adresy (${status})`)),
      { status }
    );
  }
  return body;
}

async function suggestAddress(
  query: string,
  token: string,
  timeoutMs = 7_000
): Promise<any> {
  const q = String(query ?? "").trim();
  if (q.length < 2) return { ok: true, suggestions: [] };
  const baseUrl = ensureConfiguredEndpoint(
    CUZK_SUGGEST_URL,
    "CUZK_FN_SUGGEST_URL"
  );
  const url = new URL(baseUrl);
  url.searchParams.set("q", q);
  const { ok, status, body } = await fetchJsonWithAuth(
    url.toString(),
    token,
    timeoutMs
  );
  if (!ok) {
    throw Object.assign(
      new Error(readErrorMessage(body, `Chyba při našeptávání (${status})`)),
      { status }
    );
  }
  return body;
}

function parseIncludeUnits(value: string | null): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return true;
}

async function runSuggestOrchestration(
  rawQuery: string,
  token: string
): Promise<RuianMatch[]> {
  const typed = normalizeSpaces(rawQuery);
  if (typed.length < 2) return [];
  const hints = extractAddressSearchHints(typed);
  const queries = Array.from(new Set([
    ...normalizeSuggestQueryVariants(typed),
    ...normalizeAutoAddressCandidates(typed).slice(0, 3)
      .flatMap(candidate => normalizeSuggestQueryVariants(candidate)),
  ])).slice(0, 4);
  const deadlineAt = Date.now() + SUGGEST_TOTAL_TIMEOUT_MS;
  let lastError: unknown = null;
  let receivedResponse = false;

  for (const query of queries) {
    if (Date.now() >= deadlineAt) break;
    try {
      const data = await suggestAddress(query, token, remainingTimeoutMs(deadlineAt, SUGGEST_LOOKUP_TIMEOUT_MS));
      receivedResponse = true;
      const list = normalizeSuggestPayload(data);
      if (list.length) return list.sort((a, b) => scoreMatchForAddressHints(b, hints) - scoreMatchForAddressHints(a, hints));
    } catch (err) {
      lastError = err;
      if (Number((err as { status?: number })?.status) === 401 || Number((err as { status?: number })?.status) === 403) throw err;
    }
  }
  // A network failure is different from a successful search with no matches.
  if (!receivedResponse && lastError) throw lastError;
  return [];
}

async function runSmartAddressSearch(
  rawQuery: string,
  includeUnits: boolean,
  token: string
): Promise<{ data: unknown; resolvedAddress?: string; matches?: RuianMatch[] }> {
  const candidates = normalizeAutoAddressCandidates(rawQuery);
  if (candidates.length === 0) {
    throw Object.assign(new Error("Adresa pro automatické vyhledání je prázdná."), {
      status: 400,
    });
  }

  const hints = extractAddressSearchHints(rawQuery);
  const structuredCandidates = parseStructuredAddressCandidates(rawQuery).slice(0, 3);
  const deadlineAt = Date.now() + SMART_SEARCH_TIMEOUT_MS;
  let lastError: unknown = null;

  const resolveLookupPayload = (
    data: any,
    fallbackAddress: string
  ): { data: unknown; resolvedAddress?: string; matches?: RuianMatch[] } => {
    if (data?.mode === "MULTI_MATCH" && Array.isArray(data?.matches)) {
      const matches = normalizeSuggestPayload(data).sort((a, b) => scoreMatchForAddressHints(b, hints) - scoreMatchForAddressHints(a, hints));
      if (!matches.length) throw Object.assign(new Error("Adresní místo se podle zadaných údajů nenašlo."), { status: 404 });
      return { data: null, matches };
    }
    return { data, resolvedAddress: String(data?.match?.adresa ?? fallbackAddress) };
  };

  for (const structured of structuredCandidates) {
    try {
      const data: any = await lookupByAddress(
        structured,
        includeUnits,
        token,
        remainingTimeoutMs(deadlineAt, ADDRESS_LOOKUP_TIMEOUT_MS)
      );
      return resolveLookupPayload(
        data,
        String(structured.q ?? structured.obec ?? rawQuery)
      );
    } catch (err) {
      lastError = err;
    }
  }

  const suggestQueries = Array.from(
    new Set(
      candidates
        .slice(0, 4)
        .flatMap((candidate) => normalizeSuggestQueryVariants(candidate))
    )
  ).slice(0, 6);

  for (const suggestQuery of suggestQueries) {
    try {
      const suggestData = await suggestAddress(
        suggestQuery,
        token,
        remainingTimeoutMs(deadlineAt, SUGGEST_LOOKUP_TIMEOUT_MS)
      );
      const suggestMatches = normalizeSuggestPayload(suggestData).sort((a, b) => {
        return scoreMatchForAddressHints(b, hints) - scoreMatchForAddressHints(a, hints);
      });

      if (suggestMatches.length) return { data: null, matches: suggestMatches };
    } catch (err) {
      lastError = err;
    }
  }

  for (const candidate of candidates.slice(0, 3)) {
    try {
      const data: any = await lookupByAddress(
        candidate,
        includeUnits,
        token,
        remainingTimeoutMs(deadlineAt, ADDRESS_LOOKUP_TIMEOUT_MS)
      );
      return resolveLookupPayload(data, candidate);
    } catch (err) {
      lastError = err;
    }
  }

  throw (
    lastError ??
    Object.assign(new Error("Adresní místo se podle zadaných údajů nenašlo."), {
      status: 404,
    })
  );
}

export async function GET(req: NextRequest) {
  let authContext: AuthContext | null = null;
  try {
    authContext = await getAuthContext(req);

    const rateLimitResult = await consumeRateLimit({
      namespace: "api:cuzk:search:get",
      key: authContext.uid || authContext.email,
      limit: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        {
          ok: false,
          error: "Příliš mnoho požadavků. Zkus to prosím za chvíli.",
        } satisfies CuzkSearchError,
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const action = (req.nextUrl.searchParams.get("action") ?? "search")
      .trim()
      .toLowerCase();
    const includeUnits = parseIncludeUnits(
      req.nextUrl.searchParams.get("includeUnits")
    );
    const q = String(req.nextUrl.searchParams.get("q") ?? "").trim();

    if (action === "suggest") {
      if (q.length < 2) {
        const response = NextResponse.json({ ok: true, suggestions: [] } satisfies CuzkSearchSuccess);
        applyRateLimitHeaders(response.headers, rateLimitResult);
        return response;
      }
      const cacheKey = `suggest:v2:${authContext.uid}:${q.toLowerCase()}`;
      const cached = getCachedPayload(cacheKey);
      if (cached) {
        const response = NextResponse.json(cached);
        applyRateLimitHeaders(response.headers, rateLimitResult);
        return response;
      }
      const suggestions = await runSuggestOrchestration(q, authContext.token);
      const payload: CuzkSearchSuccess = { ok: true, suggestions };
      setCachedPayload(cacheKey, payload, CACHE_TTL_SUGGEST_MS);
      const response = NextResponse.json(payload);
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    if (action === "detail") {
      const kodRaw = req.nextUrl.searchParams.get("kod");
      const kod = Number(kodRaw ?? "");
      if (!Number.isFinite(kod) || kod <= 0) {
        return NextResponse.json(
          { ok: false, error: "Neplatný kód adresního místa." } satisfies CuzkSearchError,
          { status: 400 }
        );
      }
      const cacheKey = `detail:${authContext.uid}:${kod}:${includeUnits ? "1" : "0"}`;
      const cached = getCachedPayload(cacheKey);
      if (cached) {
        const response = NextResponse.json(cached);
        applyRateLimitHeaders(response.headers, rateLimitResult);
        return response;
      }
      const data = await lookupByAdresniMisto(kod, includeUnits, authContext.token);
      const payload: CuzkSearchSuccess = { ok: true, data };
      setCachedPayload(cacheKey, payload, CACHE_TTL_DETAIL_MS);
      const response = NextResponse.json(payload);
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    if (action === "search") {
      if (q.length < 2) {
        return NextResponse.json(
          { ok: false, error: "Zadej prosím adresu (aspoň 2 znaky)." } satisfies CuzkSearchError,
          { status: 400 }
        );
      }
      const cacheKey = `search:v2:${authContext.uid}:${q.toLowerCase()}:${includeUnits ? "1" : "0"}`;
      const cached = getCachedPayload(cacheKey);
      if (cached) {
        const response = NextResponse.json(cached);
        applyRateLimitHeaders(response.headers, rateLimitResult);
        return response;
      }
      const { data, resolvedAddress, matches } = await runSmartAddressSearch(
        q,
        includeUnits,
        authContext.token
      );
      const payload: CuzkSearchSuccess = { ok: true, data, resolvedAddress, matches };
      setCachedPayload(cacheKey, payload, CACHE_TTL_SEARCH_MS);
      const response = NextResponse.json(payload);
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    return NextResponse.json(
      { ok: false, error: "Nepodporovaná akce." } satisfies CuzkSearchError,
      { status: 400 }
    );
  } catch (err: any) {
    const status = Number(err?.status) || 500;
    const message =
      typeof err?.message === "string" && err.message.trim().length > 0
        ? err.message.trim()
        : "Nepodařilo se načíst data z ČÚZK.";
    const response = NextResponse.json(
      { ok: false, error: message } satisfies CuzkSearchError,
      { status }
    );
    if (typeof err?.retryAfterSeconds === "number") {
      response.headers.set("Retry-After", String(err.retryAfterSeconds));
    }
    return response;
  }
}
