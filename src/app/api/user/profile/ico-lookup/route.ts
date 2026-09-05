import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ARES_ENTITY_URL =
  "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";
const LOOKUP_RATE_LIMIT = 18;
const LOOKUP_RATE_WINDOW_MS = 60_000;

type JsonObject = Record<string, unknown>;

const readObject = (value: unknown): JsonObject | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;

const safeText = (value: unknown): string =>
  typeof value === "string"
    ? value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
    : typeof value === "number" && Number.isFinite(value)
      ? String(Math.trunc(value))
      : "";

const normalizeIco = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\D+/g, "").slice(0, 8) : "";

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:user-profile-ico-lookup:post",
    limit: LOOKUP_RATE_LIMIT,
    windowMs: LOOKUP_RATE_WINDOW_MS,
    enforceAdvisorSetup: false,
    allowImpersonation: true,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  let body: { ico?: unknown };
  try {
    body = (await req.json()) as { ico?: unknown };
  } catch {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Neplatný formát požadavku." }, { status: 400 }),
      ctx
    );
  }

  const ico = normalizeIco(body.ico);
  if (ico.length !== 8) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "IČO musí mít přesně 8 číslic." }, { status: 400 }),
      ctx
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${ARES_ENTITY_URL}/${encodeURIComponent(ico)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (response.status === 400 || response.status === 404) {
      return withRateLimitHeaders(
        NextResponse.json({ ok: true, entity: null }),
        ctx
      );
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "ARES je momentálně nedostupný. Zkus ověření později." },
          { status: 502 }
        ),
        ctx
      );
    }

    const entity = readObject(payload);
    const entityIco = normalizeIco(entity?.ico);
    const companyName = safeText(entity?.obchodniJmeno);
    if (!entity || entityIco !== ico || !companyName) {
      return withRateLimitHeaders(
        NextResponse.json({ ok: true, entity: null }),
        ctx
      );
    }

    const address = readObject(entity.sidlo);
    const endedAt = safeText(entity.datumZaniku);
    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        entity: {
          ico: entityIco,
          companyName,
          address: safeText(address?.textovaAdresa),
          legalForm: safeText(entity.pravniForma),
          active: !endedAt,
        },
      }),
      ctx
    );
  } catch (error) {
    const timedOut =
      error instanceof Error && error.name === "AbortError";
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: timedOut
            ? "Ověření v ARESu trvalo příliš dlouho. Zkus to znovu."
            : "K registru ARES se nepodařilo připojit.",
        },
        { status: timedOut ? 504 : 502 }
      ),
      ctx
    );
  } finally {
    clearTimeout(timeout);
  }
}
