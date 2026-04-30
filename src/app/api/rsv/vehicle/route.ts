import { NextResponse, type NextRequest } from "next/server";

import { adminAuth } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RSV_LOOKUP_URL =
  process.env.RSV_LOOKUP_URL?.trim() ||
  process.env.NEXT_PUBLIC_RSV_LOOKUP_URL?.trim() ||
  "https://europe-central2-bohemikasmlouvy.cloudfunctions.net/rsvVehicleLookup";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{11,25}$/;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 40;

type RateBucket = {
  count: number;
  resetAtMs: number;
};

const rateBuckets = new Map<string, RateBucket>();

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

function normalizeVin(value: string | null): string {
  if (!value) return "";
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function cleanupRateBuckets(nowMs: number): void {
  if (rateBuckets.size < 1000) return;
  for (const [key, bucket] of rateBuckets.entries()) {
    if (nowMs >= bucket.resetAtMs) {
      rateBuckets.delete(key);
    }
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

function readErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const candidate = row.error ?? row.message ?? row.detail;
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate.trim();
  }
  return null;
}

export async function GET(req: NextRequest) {
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

  const rate = consumeRateLimit(decoded.uid);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Příliš mnoho požadavků. Zkus to znovu za chvíli." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSec),
        },
      }
    );
  }

  const vin = normalizeVin(new URL(req.url).searchParams.get("vin"));
  if (!VIN_RE.test(vin)) {
    return NextResponse.json(
      { ok: false, error: "VIN není ve validním formátu." },
      { status: 400 }
    );
  }

  const upstreamUrl = `${RSV_LOOKUP_URL}?vin=${encodeURIComponent(vin)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const msg =
        readErrorMessage(payload) ??
        `RSV lookup failed with status ${upstream.status}.`;
      return NextResponse.json(
        { ok: false, error: msg, upstreamStatus: upstream.status },
        { status: upstream.status }
      );
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (err: any) {
    const errorName = typeof err?.name === "string" ? err.name : "";
    const isTimeout = errorName === "AbortError";
    return NextResponse.json(
      {
        ok: false,
        error: isTimeout
          ? "RSV lookup timeout. Zkus to prosím znovu."
          : "Nepodařilo se spojit se službou RSV.",
      },
      { status: 504 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
