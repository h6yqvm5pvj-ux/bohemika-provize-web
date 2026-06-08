import { NextResponse } from "next/server";

import { getRequestIp } from "@/lib/server/rateLimit";

export const LOGIN_ATTEMPT_MAX_FAILED_ATTEMPTS = 3;
export const LOGIN_ATTEMPT_LOCK_WINDOW_MS = 15 * 60 * 1000;

type LoginAttemptBucket = {
  failures: number;
  lockedUntilMs: number;
};

export type LoginAttemptLockoutStatus = {
  locked: boolean;
  limit: number;
  attemptsRemaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

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

export function normalizeLoginAttemptEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function retryAfterSeconds(untilMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((untilMs - nowMs) / 1000));
}

function ipEmailKey(req: Request, email: string): string {
  return `ip:${getRequestIp(req).trim().toLowerCase() || "unknown"}:${email}`;
}

function accountKey(email: string): string {
  return `account:${email}`;
}

function keysForRequest(req: Request, email: string): string[] {
  return [ipEmailKey(req, email), accountKey(email)];
}

function isBucketLocked(bucket: LoginAttemptBucket | undefined, nowMs: number): boolean {
  return Boolean(
    bucket &&
      bucket.lockedUntilMs > nowMs &&
      bucket.failures >= LOGIN_ATTEMPT_MAX_FAILED_ATTEMPTS
  );
}

function emptyStatus(): LoginAttemptLockoutStatus {
  return {
    locked: false,
    limit: LOGIN_ATTEMPT_MAX_FAILED_ATTEMPTS,
    attemptsRemaining: LOGIN_ATTEMPT_MAX_FAILED_ATTEMPTS,
    retryAfterSeconds: 0,
    resetAt: 0,
  };
}

export function getLoginAttemptStatus(
  req: Request,
  emailRaw: unknown
): LoginAttemptLockoutStatus {
  const email = normalizeLoginAttemptEmail(emailRaw);
  if (!email) return emptyStatus();

  const nowMs = Date.now();
  cleanupExpiredBuckets(nowMs);

  const store = getStore();
  const buckets = keysForRequest(req, email)
    .map((key) => store.get(key))
    .filter((bucket): bucket is LoginAttemptBucket => Boolean(bucket));
  const lockedBuckets = buckets.filter((bucket) => isBucketLocked(bucket, nowMs));

  if (lockedBuckets.length > 0) {
    const lockedUntilMs = Math.max(...lockedBuckets.map((bucket) => bucket.lockedUntilMs));
    return {
      locked: true,
      limit: LOGIN_ATTEMPT_MAX_FAILED_ATTEMPTS,
      attemptsRemaining: 0,
      retryAfterSeconds: retryAfterSeconds(lockedUntilMs, nowMs),
      resetAt: Math.ceil(lockedUntilMs / 1000),
    };
  }

  const maxFailures = buckets.reduce((max, bucket) => {
    if (bucket.lockedUntilMs <= nowMs) return max;
    return Math.max(max, bucket.failures);
  }, 0);

  return {
    locked: false,
    limit: LOGIN_ATTEMPT_MAX_FAILED_ATTEMPTS,
    attemptsRemaining: Math.max(0, LOGIN_ATTEMPT_MAX_FAILED_ATTEMPTS - maxFailures),
    retryAfterSeconds: 0,
    resetAt: 0,
  };
}

export function recordLoginAttemptFailure(
  req: Request,
  emailRaw: unknown
): LoginAttemptLockoutStatus {
  const email = normalizeLoginAttemptEmail(emailRaw);
  if (!email) return emptyStatus();

  const nowMs = Date.now();
  cleanupExpiredBuckets(nowMs);

  const store = getStore();
  for (const key of keysForRequest(req, email)) {
    const bucket = store.get(key);
    const currentFailures =
      bucket?.lockedUntilMs && bucket.lockedUntilMs > nowMs ? bucket.failures : 0;
    store.set(key, {
      failures: currentFailures + 1,
      lockedUntilMs: nowMs + LOGIN_ATTEMPT_LOCK_WINDOW_MS,
    });
  }

  return getLoginAttemptStatus(req, email);
}

export function clearLoginAttemptFailures(req: Request, emailRaw: unknown): void {
  const email = normalizeLoginAttemptEmail(emailRaw);
  if (!email) return;

  const store = getStore();
  for (const key of keysForRequest(req, email)) {
    store.delete(key);
  }
}

export function loginAttemptLockoutMessage(status: LoginAttemptLockoutStatus): string {
  return `Příliš mnoho neúspěšných pokusů. Zkus to znovu za ${status.retryAfterSeconds} s.`;
}

export function getLoginAttemptLockoutError(req: Request, emailRaw: unknown): {
  error: string;
  status: 429;
  retryAfterSeconds: number;
} | null {
  const status = getLoginAttemptStatus(req, emailRaw);
  if (!status.locked) return null;
  return {
    error: loginAttemptLockoutMessage(status),
    status: 429,
    retryAfterSeconds: status.retryAfterSeconds,
  };
}

export function buildLoginAttemptLockedResponse(
  status: LoginAttemptLockoutStatus
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      locked: true,
      limit: status.limit,
      attemptsRemaining: 0,
      retryAfterSeconds: status.retryAfterSeconds,
      resetAt: status.resetAt,
      message: loginAttemptLockoutMessage(status),
      error: loginAttemptLockoutMessage(status),
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(status.retryAfterSeconds),
      },
    }
  );
}
