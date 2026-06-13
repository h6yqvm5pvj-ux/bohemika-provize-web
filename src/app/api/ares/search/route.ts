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

const ARES_SEARCH_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 24;

const REGISTRY_LABELS: Record<string, string> = {
  stavZdrojeRos: "ROS",
  stavZdrojeVr: "VR",
  stavZdrojeRes: "RES",
  stavZdrojeRzp: "RŽP",
  stavZdrojeNrpzs: "NRPZS",
  stavZdrojeRpsh: "RPSH",
  stavZdrojeRcns: "RCNS",
  stavZdrojeSzr: "SZR",
  stavZdrojeDph: "DPH",
  stavZdrojeSkDph: "SkDPH",
  stavZdrojeSd: "SD",
  stavZdrojeIr: "IR",
  stavZdrojeCeu: "CEÚ",
  stavZdrojeRs: "RS",
  stavZdrojeRed: "ReD",
  stavZdrojeMonitor: "Monitor",
};

type JsonObject = Record<string, unknown>;

type SearchPayload = {
  ico?: unknown;
  obchodniJmeno?: unknown;
  obec?: unknown;
  start?: unknown;
  pocet?: unknown;
};

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

function readObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function safeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeText(value: unknown, maxLength: number): string {
  const text = safeText(value);
  if (!text) return "";
  return text.slice(0, maxLength);
}

function normalizeIco(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\D+/g, "").slice(0, 8);
}

function toBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return Math.min(max, Math.max(min, rounded));
}

function readErrorMessage(payload: unknown): string | null {
  const row = readObject(payload);
  if (!row) return null;

  const keys = ["popis", "message", "detail", "error", "kod", "subKod"];
  for (const key of keys) {
    const value = safeText(row[key]);
    if (value) return value;
  }
  return null;
}

function buildAresFilter(input: {
  ico: string;
  obchodniJmeno: string;
  obec: string;
  start: number;
  pocet: number;
}) {
  const filter: JsonObject = {
    start: input.start,
    pocet: input.pocet,
    razeni: ["ico", "obchodniJmeno"],
  };

  if (input.ico) {
    filter.ico = [input.ico];
  }
  if (input.obchodniJmeno) {
    filter.obchodniJmeno = input.obchodniJmeno;
  }
  if (input.obec) {
    filter.sidlo = {
      nazevObce: input.obec,
    };
  }

  return filter;
}

function normalizeEntity(raw: unknown) {
  const row = readObject(raw);
  if (!row) return null;

  const registraceRaw = readObject(row.seznamRegistraci);
  const registrace: Record<string, string> = {};
  const aktivniRegistry: string[] = [];

  if (registraceRaw) {
    for (const [key, value] of Object.entries(registraceRaw)) {
      const state = safeText(value);
      if (!state) continue;
      registrace[key] = state;
      if (state.toUpperCase() === "AKTIVNI") {
        aktivniRegistry.push(REGISTRY_LABELS[key] ?? key);
      }
    }
  }

  const sidloRaw = readObject(row.sidlo);
  const pscValue = sidloRaw?.psc;
  const psc =
    typeof pscValue === "number" && Number.isFinite(pscValue)
      ? String(Math.trunc(pscValue))
      : safeText(pscValue);

  return {
    ico: safeText(row.ico),
    icoId: safeText(row.icoId),
    obchodniJmeno: safeText(row.obchodniJmeno) ?? "Neznámý subjekt",
    pravniForma: safeText(row.pravniForma),
    pravniFormaRos: safeText(row.pravniFormaRos),
    dic: safeText(row.dic),
    datumVzniku: safeText(row.datumVzniku),
    datumZaniku: safeText(row.datumZaniku),
    primarniZdroj: safeText(row.primarniZdroj),
    sidlo: {
      textovaAdresa: safeText(sidloRaw?.textovaAdresa),
      nazevObce: safeText(sidloRaw?.nazevObce),
      psc,
      nazevStatu: safeText(sidloRaw?.nazevStatu),
    },
    registrace,
    aktivniRegistry,
  };
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
  } catch (err: any) {
    const code = err?.code || "auth/invalid-token";
    const message = err?.message || "Invalid or expired token";
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
    namespace: "api:ares:search:post",
    key: decoded.uid,
    limit: RATE_LIMIT_MAX_REQUESTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!rate.allowed) {
    const response = NextResponse.json(
      { ok: false, error: "Příliš mnoho požadavků. Zkus to znovu za chvíli." },
      { status: 429 }
    );
    applyRateLimitHeaders(response.headers, rate);
    return response;
  }

  let payload: SearchPayload;
  try {
    payload = (await req.json()) as SearchPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Neplatný JSON payload." }, { status: 400 });
  }

  const ico = normalizeIco(payload.ico);
  const obchodniJmeno = normalizeText(payload.obchodniJmeno, 2000);
  const obec = normalizeText(payload.obec, 64);
  const start = toBoundedInt(payload.start, 0, 0, 10_000);
  const pocet = toBoundedInt(payload.pocet, 20, 1, 50);

  if (!ico && obchodniJmeno.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Vyplň IČO nebo alespoň 2 znaky obchodního jména." },
      { status: 400 }
    );
  }

  if (ico && ico.length !== 8) {
    return NextResponse.json(
      { ok: false, error: "IČO musí mít přesně 8 číslic." },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16_000);

  try {
    const upstream = await fetch(ARES_SEARCH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildAresFilter({ ico, obchodniJmeno, obec, start, pocet })),
      cache: "no-store",
      signal: controller.signal,
    });

    const upstreamPayload = (await upstream.json().catch(() => null)) as unknown;

    if (!upstream.ok) {
      const message = readErrorMessage(upstreamPayload) ?? `ARES odpověděl chybou ${upstream.status}.`;
      return NextResponse.json(
        {
          ok: false,
          error: message,
          upstreamStatus: upstream.status,
        },
        { status: upstream.status }
      );
    }

    const root = readObject(upstreamPayload) ?? {};
    const rawEntities = Array.isArray(root.ekonomickeSubjekty) ? root.ekonomickeSubjekty : [];
    const entities = rawEntities
      .map((entry) => normalizeEntity(entry))
      .filter((entry): entry is NonNullable<ReturnType<typeof normalizeEntity>> => !!entry);

    const pocetCelkemRaw = root.pocetCelkem;
    const pocetCelkem =
      typeof pocetCelkemRaw === "number" && Number.isFinite(pocetCelkemRaw)
        ? Math.max(0, Math.trunc(pocetCelkemRaw))
        : entities.length;

    return NextResponse.json(
      {
        ok: true,
        query: {
          ico,
          obchodniJmeno,
          obec,
          start,
          pocet,
        },
        pocetCelkem,
        entities,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (err: any) {
    const errorName = typeof err?.name === "string" ? err.name : "";
    const isTimeout = errorName === "AbortError";

    return NextResponse.json(
      {
        ok: false,
        error: isTimeout
          ? "ARES timeout. Zkus to prosím znovu."
          : "Nepodařilo se spojit se službou ARES.",
      },
      { status: 504 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
