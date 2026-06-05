import { NextResponse } from "next/server";

import {
  applyRateLimitHeaders,
  consumeRateLimit,
  getRequestIp,
} from "@/lib/server/rateLimit";

export const runtime = "nodejs";

const MAX_FAILED_ATTEMPTS = 3;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const ENDPOINT_RATE_LIMIT = 80;
const ENDPOINT_RATE_LIMIT_WINDOW_MS = 60_000;

type LoginAttemptBucket = {
  failures: number;
  lockedUntilMs: number;
};

type LoginAttemptAction = "check" | "failure" | "success";

const LOGIN_ATTEMPT_STORE = Symbol.for("bohemika.loginAttempt.store");
const LOGIN_ATTEMPT_LAST_CLEANUP = Symbol.for("bohemika.loginAttempt.lastCleanup");
const CLEANUP_INTERVAL_MS = 60_000;

type GlobalWithLoginAttempts = typeof globalThis & {
  [LOGIN_ATTEMPT_STORE]?: Map<string, LoginAttemptBucket>;
  [LOGIN_ATTEMPT_LAST_CLEANUP]?: number;
};

function getStore(): Map<string, LoginAttemptBucket> {
  const g = globalThis as GlobalWithLoginAttempts;
  if (!g[LOGIN_ATTEMPT_STORE]) {
    g[LOGIN_ATTEMPT_STORE] = new Map<string, LoginAttemptBucket>();
  }
  return g[LOGIN_ATTEMPT_STORE];
}

function cleanupExpiredBuckets(nowMs: number) {
  const g = globalThis as GlobalWithLoginAttempts;
  const lastCleanup = g[LOGIN_ATTEMPT_LAST_CLEANUP] ?? 0;
  if (nowMs - lastCleanup < CLEANUP_INTERVAL_MS) return;

  const store = getStore();
  for (const [key, bucket] of store.entries()) {
    if (bucket.lockedUntilMs <= nowMs) {
      store.delete(key);
    }
  }

  g[LOGIN_ATTEMPT_LAST_CLEANUP] = nowMs;
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeAction(value: unknown): LoginAttemptAction | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "check" || raw === "failure" || raw === "success") return raw;
  return null;
}

function retryAfterSeconds(untilMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((untilMs - nowMs) / 1000));
}

function buildKey(req: Request, email: string): string {
  return `${getRequestIp(req).trim().toLowerCase() || "unknown"}:${email}`;
}

function buildLockedResponse(bucket: LoginAttemptBucket, nowMs: number) {
  const retryAfter = retryAfterSeconds(bucket.lockedUntilMs, nowMs);
  return NextResponse.json(
    {
      ok: false,
      locked: true,
      limit: MAX_FAILED_ATTEMPTS,
      attemptsRemaining: 0,
      retryAfterSeconds: retryAfter,
      resetAt: Math.ceil(bucket.lockedUntilMs / 1000),
      message: `Příliš mnoho neúspěšných pokusů. Zkus to znovu za ${retryAfter} s.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
      },
    }
  );
}

export async function POST(req: Request) {
  const endpointLimit = await consumeRateLimit({
    namespace: "api:auth:login-attempts",
    key: getRequestIp(req),
    limit: ENDPOINT_RATE_LIMIT,
    windowMs: ENDPOINT_RATE_LIMIT_WINDOW_MS,
  });

  if (!endpointLimit.allowed) {
    const response = NextResponse.json(
      {
        ok: false,
        locked: true,
        limit: endpointLimit.limit,
        attemptsRemaining: 0,
        retryAfterSeconds: endpointLimit.retryAfterSeconds,
        message: "Příliš mnoho požadavků. Zkus to prosím za chvíli.",
      },
      { status: 429 }
    );
    applyRateLimitHeaders(response.headers, endpointLimit);
    return response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const response = NextResponse.json(
      { ok: false, error: "Neplatný požadavek." },
      { status: 400 }
    );
    applyRateLimitHeaders(response.headers, endpointLimit);
    return response;
  }

  const payload = body as { action?: unknown; email?: unknown };
  const action = normalizeAction(payload?.action);
  const email = normalizeEmail(payload?.email);

  if (!action || !email) {
    const response = NextResponse.json(
      { ok: false, error: "Chybí akce nebo e-mail." },
      { status: 400 }
    );
    applyRateLimitHeaders(response.headers, endpointLimit);
    return response;
  }

  const nowMs = Date.now();
  cleanupExpiredBuckets(nowMs);

  const store = getStore();
  const key = buildKey(req, email);
  const bucket = store.get(key);

  if (action === "success") {
    store.delete(key);
    const response = NextResponse.json({
      ok: true,
      locked: false,
      limit: MAX_FAILED_ATTEMPTS,
      attemptsRemaining: MAX_FAILED_ATTEMPTS,
      retryAfterSeconds: 0,
    });
    applyRateLimitHeaders(response.headers, endpointLimit);
    return response;
  }

  if (bucket && bucket.lockedUntilMs > nowMs && bucket.failures >= MAX_FAILED_ATTEMPTS) {
    const response = buildLockedResponse(bucket, nowMs);
    applyRateLimitHeaders(response.headers, endpointLimit);
    return response;
  }

  if (action === "check") {
    const failures = bucket?.lockedUntilMs && bucket.lockedUntilMs > nowMs ? bucket.failures : 0;
    const response = NextResponse.json({
      ok: true,
      locked: false,
      limit: MAX_FAILED_ATTEMPTS,
      attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - failures),
      retryAfterSeconds: 0,
    });
    applyRateLimitHeaders(response.headers, endpointLimit);
    return response;
  }

  const currentFailures =
    bucket?.lockedUntilMs && bucket.lockedUntilMs > nowMs ? bucket.failures : 0;
  const nextBucket = {
    failures: currentFailures + 1,
    lockedUntilMs: nowMs + LOCK_WINDOW_MS,
  };
  store.set(key, nextBucket);

  if (nextBucket.failures >= MAX_FAILED_ATTEMPTS) {
    const response = buildLockedResponse(nextBucket, nowMs);
    applyRateLimitHeaders(response.headers, endpointLimit);
    return response;
  }

  const response = NextResponse.json({
    ok: true,
    locked: false,
    limit: MAX_FAILED_ATTEMPTS,
    attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - nextBucket.failures),
    retryAfterSeconds: 0,
  });
  applyRateLimitHeaders(response.headers, endpointLimit);
  return response;
}
