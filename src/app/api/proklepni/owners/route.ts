import { NextResponse, type NextRequest } from "next/server";

import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{11,25}$/;
const UPSTREAM_BASE_URL = "https://proklepni.cz/check/";
const PROKLEPNI_OWNERS_RATE_LIMIT = 30;
const PROKLEPNI_OWNERS_RATE_LIMIT_WINDOW_MS = 10 * 60_000;

type ProklepniOwnerRaw = {
  typ_subjektu?: unknown;
  vztah?: unknown;
  aktualni?: unknown;
  ico?: unknown;
  nazev?: unknown;
  adresa?: unknown;
  datum_od?: unknown;
  datum_do?: unknown;
  display_name?: unknown;
  vztah_label?: unknown;
};

type OwnerCandidate = {
  index: number;
  score: number;
  rows: ProklepniOwnerRaw[];
};

function normalizeVin(value: string | null): string {
  if (!value) return "";
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function safeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sliceBracketArray(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "[") {
      depth += 1;
    } else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end < 0) return null;
  return text.slice(start, end + 1);
}

function extractInitialDataArrays(html: string, max = 30): Array<{ index: number; raw: string }> {
  const marker = '\\"initialData\\":';
  const out: Array<{ index: number; raw: string }> = [];

  let cursor = 0;
  while (out.length < max) {
    const markerIdx = html.indexOf(marker, cursor);
    if (markerIdx < 0) break;
    cursor = markerIdx + marker.length;

    const start = html.indexOf("[", cursor);
    if (start < 0) continue;

    const raw = sliceBracketArray(html, start);
    if (!raw) continue;
    out.push({ index: markerIdx, raw });
    cursor = start + raw.length;
  }

  return out;
}

function parseEscapedArray(raw: string): unknown[] | null {
  const attempts = [
    raw,
    raw.replace(/\\"/g, "\""),
    raw.replace(/\\"/g, "\"").replace(/\\n/g, "\n"),
  ];

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // try next decoding strategy
    }
  }

  return null;
}

function ownerSignalScore(row: Record<string, unknown>): number {
  let score = 0;
  const keys = Object.keys(row).map((key) => key.toLowerCase());
  const hasKey = (match: string) => keys.some((key) => key.includes(match));

  if (hasKey("vztah")) score += 4;
  if (hasKey("datum_od") || hasKey("datumdo") || hasKey("datum_do")) score += 3;
  if (hasKey("aktual")) score += 2;
  if (hasKey("display_name") || hasKey("nazev")) score += 2;
  if (hasKey("ico") || hasKey("adresa")) score += 1;

  const vztahLabel = safeText(row.vztah_label);
  if (vztahLabel && /(vlast|provoz)/i.test(vztahLabel)) score += 3;

  return score;
}

function pickBestOwnersArray(html: string): ProklepniOwnerRaw[] | null {
  const ownersPos = html.indexOf("Vlastníci:");
  const candidates: OwnerCandidate[] = [];

  for (const chunk of extractInitialDataArrays(html)) {
    const parsed = parseEscapedArray(chunk.raw);
    if (!parsed || parsed.length < 2) continue;

    const rows = parsed.map((item) => readObject(item)).filter((row): row is Record<string, unknown> => !!row);
    if (!rows.length) continue;

    const rowScores = rows.map((row) => ownerSignalScore(row));
    const signalScore = rowScores.reduce((sum, value) => sum + value, 0);
    const maxRowScore = rowScores.reduce((max, value) => Math.max(max, value), 0);
    if (signalScore < 10 || maxRowScore < 5) continue;

    const distancePenalty = ownersPos >= 0 ? Math.min(6, Math.floor(Math.abs(chunk.index - ownersPos) / 40_000)) : 0;
    const sizeBonus = Math.min(rows.length, 20);
    const totalScore = signalScore + sizeBonus - distancePenalty;

    candidates.push({
      index: chunk.index,
      score: totalScore,
      rows: rows as ProklepniOwnerRaw[],
    });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length;
    return b.index - a.index;
  });

  return candidates[0]?.rows ?? null;
}

function roleFromRaw(raw: ProklepniOwnerRaw): string {
  const label = safeText(raw.vztah_label);
  if (label) return label;

  const relationStr = safeText(raw.vztah);
  const relationNum = typeof raw.vztah === "number" && Number.isFinite(raw.vztah) ? raw.vztah : null;
  if (relationStr === "both" || relationStr === "3" || relationNum === 3) return "vlastník + provozovatel";
  if (relationStr === "1" || relationNum === 1) return "vlastník";
  if (relationStr === "2" || relationNum === 2) return "provozovatel";
  return "vlastník + provozovatel";
}

export async function GET(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:proklepni:owners:get",
    limit: PROKLEPNI_OWNERS_RATE_LIMIT,
    windowMs: PROKLEPNI_OWNERS_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const withRateLimit = (response: NextResponse) =>
    withRateLimitHeaders(response, guard.ctx);

  const vin = normalizeVin(new URL(req.url).searchParams.get("vin"));
  if (!VIN_RE.test(vin)) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "VIN není ve validním formátu." },
        { status: 400 }
      )
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const upstream = await fetch(`${UPSTREAM_BASE_URL}${encodeURIComponent(vin)}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      },
    });

    if (!upstream.ok) {
      return withRateLimit(
        NextResponse.json(
          { ok: false, error: `Nepodařilo se načíst fallback data (${upstream.status}).` },
          { status: 502 }
        )
      );
    }

    const html = await upstream.text();
    const ownerRows = pickBestOwnersArray(html);
    if (!ownerRows) {
      return withRateLimit(
        NextResponse.json(
          { ok: false, error: "V HTML fallbacku nebyla nalezena sekce vlastníků." },
          { status: 422 }
        )
      );
    }

    const rows = ownerRows
      .map((row) => {
        const name = safeText(row.display_name) ?? safeText(row.nazev) ?? "Neuvedený subjekt";
        return {
          name,
          roleLabel: roleFromRaw(row),
          icoLabel: safeText(row.ico) ?? "IČO neuvedeno",
          addressLabel: safeText(row.adresa) ?? "Adresa neuvedena",
          fromIso: safeText(row.datum_od),
          toIso: safeText(row.datum_do),
          isCurrent: row.aktualni === true || safeText(row.datum_do) == null,
        };
      })
      .filter((row) => row.name.length > 0);

    return withRateLimit(
      NextResponse.json(
        {
          ok: true,
          vin,
          source: "proklepni",
          recordCount: rows.length,
          records: rows,
        },
        {
          status: 200,
          headers: { "Cache-Control": "private, no-store, max-age=0" },
        }
      )
    );
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError";
    return withRateLimit(
      NextResponse.json(
        {
          ok: false,
          error: isTimeout
            ? "Fallback načítání historie vlastníků vypršelo."
            : "Nepodařilo se načíst fallback historii vlastníků.",
        },
        { status: 504 }
      )
    );
  } finally {
    clearTimeout(timeout);
  }
}
