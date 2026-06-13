import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { adminDb } from "@/lib/server/firebaseAdmin";
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
  unavailable?: boolean;
};

const LOGIN_ATTEMPT_COLLECTION = "_loginAttemptLockouts";
const LOGIN_ATTEMPT_STORE = Symbol.for("bohemika.loginAttempt.store");
const LOGIN_ATTEMPT_LAST_CLEANUP = Symbol.for("bohemika.loginAttempt.lastCleanup");
const LOGIN_ATTEMPT_WARNED_KEYS = Symbol.for("bohemika.loginAttempt.warnedKeys");
const CLEANUP_INTERVAL_MS = 60_000;
const STORE_UNAVAILABLE_RETRY_AFTER_SECONDS = 60;
const STORE_UNAVAILABLE_MESSAGE =
  "Bezpečnostní limit přihlášení není momentálně dostupný. Zkus to prosím za chvíli.";

type GlobalWithLoginAttempts = typeof globalThis & {
  [LOGIN_ATTEMPT_STORE]?: Map<string, LoginAttemptBucket>;
  [LOGIN_ATTEMPT_LAST_CLEANUP]?: number;
  [LOGIN_ATTEMPT_WARNED_KEYS]?: Set<string>;
};

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function warnOnce(key: string, message: string, error?: unknown) {
  const g = globalThis as GlobalWithLoginAttempts;
  if (!g[LOGIN_ATTEMPT_WARNED_KEYS]) {
    g[LOGIN_ATTEMPT_WARNED_KEYS] = new Set<string>();
  }
  if (g[LOGIN_ATTEMPT_WARNED_KEYS].has(key)) return;
  g[LOGIN_ATTEMPT_WARNED_KEYS].add(key);
  if (error) {
    console.error(message, error);
  } else {
    console.error(message);
  }
}

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

function requestIp(req: Request): string {
  return getRequestIp(req).trim().toLowerCase();
}

function ipEmailKeyForResolvedIp(ip: string, email: string): string {
  return `ip:${ip}:${email}`;
}

function ipEmailKey(req: Request, email: string): string {
  return ipEmailKeyForResolvedIp(requestIp(req) || "unknown", email);
}

function concreteIpEmailKey(req: Request, email: string): string | null {
  const ip = requestIp(req);
  if (!ip || ip === "unknown") return null;
  return ipEmailKeyForResolvedIp(ip, email);
}

function accountKey(email: string): string {
  return `account:${email}`;
}

function keysForRequest(req: Request, email: string): string[] {
  return [ipEmailKey(req, email), accountKey(email)];
}

function bucketDocId(key: string): string {
  return createHash("sha256").update(key).digest("hex");
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

function unavailableStatus(): LoginAttemptLockoutStatus {
  return {
    locked: true,
    limit: LOGIN_ATTEMPT_MAX_FAILED_ATTEMPTS,
    attemptsRemaining: 0,
    retryAfterSeconds: STORE_UNAVAILABLE_RETRY_AFTER_SECONDS,
    resetAt: Math.ceil(
      (Date.now() + STORE_UNAVAILABLE_RETRY_AFTER_SECONDS * 1000) / 1000
    ),
    unavailable: true,
  };
}

function statusFromBuckets(
  buckets: LoginAttemptBucket[],
  nowMs: number
): LoginAttemptLockoutStatus {
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

function normalizeBucketData(data: FirebaseFirestore.DocumentData | undefined | null) {
  const failures =
    typeof data?.failures === "number" && Number.isFinite(data.failures)
      ? Math.max(0, Math.floor(data.failures))
      : 0;
  const lockedUntilMs =
    typeof data?.lockedUntilMs === "number" && Number.isFinite(data.lockedUntilMs)
      ? data.lockedUntilMs
      : 0;

  if (failures <= 0 || lockedUntilMs <= 0) return null;
  return {
    failures,
    lockedUntilMs,
  } satisfies LoginAttemptBucket;
}

async function getFirestoreBuckets(keys: string[]): Promise<LoginAttemptBucket[]> {
  if (!adminDb) throw new Error("Firestore Admin is not configured.");
  const db = adminDb;
  const refs = keys.map((key) =>
    db.collection(LOGIN_ATTEMPT_COLLECTION).doc(bucketDocId(key))
  );
  const snaps = await Promise.all(refs.map((ref) => ref.get()));
  return snaps
    .map((snap) => normalizeBucketData(snap.data()))
    .filter((bucket): bucket is LoginAttemptBucket => Boolean(bucket));
}

function getMemoryBuckets(keys: string[], nowMs: number): LoginAttemptBucket[] {
  cleanupExpiredBuckets(nowMs);
  const store = getStore();
  return keys
    .map((key) => store.get(key))
    .filter((bucket): bucket is LoginAttemptBucket => Boolean(bucket));
}

async function writeFirestoreFailure(keys: string[]): Promise<LoginAttemptBucket[]> {
  if (!adminDb) throw new Error("Firestore Admin is not configured.");
  const db = adminDb;
  const nowMs = Date.now();
  const refs = keys.map((key) =>
    db.collection(LOGIN_ATTEMPT_COLLECTION).doc(bucketDocId(key))
  );

  return db.runTransaction(async (tx) => {
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const buckets: LoginAttemptBucket[] = [];

    refs.forEach((ref, index) => {
      const existing = normalizeBucketData(snaps[index]?.data());
      const currentFailures =
        existing?.lockedUntilMs && existing.lockedUntilMs > nowMs
          ? existing.failures
          : 0;
      const bucket = {
        failures: currentFailures + 1,
        lockedUntilMs: nowMs + LOGIN_ATTEMPT_LOCK_WINDOW_MS,
      };
      buckets.push(bucket);
      tx.set(ref, {
        failures: bucket.failures,
        lockedUntilMs: bucket.lockedUntilMs,
        updatedAtMs: nowMs,
        expiresAt: new Date(bucket.lockedUntilMs),
      });
    });

    return buckets;
  });
}

function writeMemoryFailure(keys: string[], nowMs: number): LoginAttemptBucket[] {
  cleanupExpiredBuckets(nowMs);
  const store = getStore();
  return keys.map((key) => {
    const bucket = store.get(key);
    const currentFailures =
      bucket?.lockedUntilMs && bucket.lockedUntilMs > nowMs ? bucket.failures : 0;
    const nextBucket = {
      failures: currentFailures + 1,
      lockedUntilMs: nowMs + LOGIN_ATTEMPT_LOCK_WINDOW_MS,
    };
    store.set(key, nextBucket);
    return nextBucket;
  });
}

async function clearFirestoreFailures(keys: string[]): Promise<void> {
  if (!adminDb) throw new Error("Firestore Admin is not configured.");
  const db = adminDb;
  await Promise.all(
    keys.map((key) =>
      db.collection(LOGIN_ATTEMPT_COLLECTION).doc(bucketDocId(key)).delete()
    )
  );
}

function clearMemoryFailures(keys: string[]): void {
  const store = getStore();
  keys.forEach((key) => store.delete(key));
}

async function withSharedStore<T>(
  operation: () => Promise<T>,
  fallback: () => T
): Promise<T | null> {
  if (adminDb) {
    try {
      return await operation();
    } catch (error) {
      warnOnce(
        "login-attempt-firestore-unavailable",
        "Shared login attempt lockout store is unavailable.",
        error
      );
      return isProductionRuntime() ? null : fallback();
    }
  }

  if (isProductionRuntime()) {
    warnOnce(
      "login-attempt-firestore-missing",
      "Shared login attempt lockout store is missing in production."
    );
    return null;
  }

  return fallback();
}

export async function getLoginAttemptStatus(
  req: Request,
  emailRaw: unknown
): Promise<LoginAttemptLockoutStatus> {
  const email = normalizeLoginAttemptEmail(emailRaw);
  if (!email) return emptyStatus();

  const keys = keysForRequest(req, email);
  const nowMs = Date.now();
  const buckets = await withSharedStore(
    () => getFirestoreBuckets(keys),
    () => getMemoryBuckets(keys, nowMs)
  );
  if (!buckets) return unavailableStatus();

  return statusFromBuckets(buckets, nowMs);
}

export async function getClientReportedLoginAttemptStatus(
  req: Request,
  emailRaw: unknown
): Promise<LoginAttemptLockoutStatus> {
  const email = normalizeLoginAttemptEmail(emailRaw);
  if (!email) return emptyStatus();

  const key = concreteIpEmailKey(req, email);
  if (!key) return emptyStatus();

  const keys = [key];
  const nowMs = Date.now();
  const buckets = await withSharedStore(
    () => getFirestoreBuckets(keys),
    () => getMemoryBuckets(keys, nowMs)
  );
  if (!buckets) return unavailableStatus();

  return statusFromBuckets(buckets, nowMs);
}

export async function recordLoginAttemptFailure(
  req: Request,
  emailRaw: unknown
): Promise<LoginAttemptLockoutStatus> {
  const email = normalizeLoginAttemptEmail(emailRaw);
  if (!email) return emptyStatus();

  const keys = keysForRequest(req, email);
  const nowMs = Date.now();
  const buckets = await withSharedStore(
    () => writeFirestoreFailure(keys),
    () => writeMemoryFailure(keys, nowMs)
  );
  if (!buckets) return unavailableStatus();

  return statusFromBuckets(buckets, nowMs);
}

export async function recordClientReportedLoginAttemptFailure(
  req: Request,
  emailRaw: unknown
): Promise<LoginAttemptLockoutStatus> {
  const email = normalizeLoginAttemptEmail(emailRaw);
  if (!email) return emptyStatus();

  const key = concreteIpEmailKey(req, email);
  if (!key) return emptyStatus();

  const keys = [key];
  const nowMs = Date.now();
  const buckets = await withSharedStore(
    () => writeFirestoreFailure(keys),
    () => writeMemoryFailure(keys, nowMs)
  );
  if (!buckets) return unavailableStatus();

  return statusFromBuckets(buckets, nowMs);
}

export async function clearLoginAttemptFailures(
  req: Request,
  emailRaw: unknown
): Promise<void> {
  const email = normalizeLoginAttemptEmail(emailRaw);
  if (!email) return;

  const keys = keysForRequest(req, email);
  await withSharedStore(
    () => clearFirestoreFailures(keys),
    () => clearMemoryFailures(keys)
  );
}

export function loginAttemptLockoutMessage(status: LoginAttemptLockoutStatus): string {
  if (status.unavailable) return STORE_UNAVAILABLE_MESSAGE;
  return `Příliš mnoho neúspěšných pokusů. Zkus to znovu za ${status.retryAfterSeconds} s.`;
}

export async function getLoginAttemptLockoutError(
  req: Request,
  emailRaw: unknown
): Promise<{
  error: string;
  status: 429 | 503;
  retryAfterSeconds: number;
} | null> {
  const status = await getLoginAttemptStatus(req, emailRaw);
  if (!status.locked) return null;
  return {
    error: loginAttemptLockoutMessage(status),
    status: status.unavailable ? 503 : 429,
    retryAfterSeconds: status.retryAfterSeconds,
  };
}

export function buildLoginAttemptLockedResponse(
  status: LoginAttemptLockoutStatus
): NextResponse {
  const message = loginAttemptLockoutMessage(status);
  return NextResponse.json(
    {
      ok: false,
      locked: true,
      limit: status.limit,
      attemptsRemaining: 0,
      retryAfterSeconds: status.retryAfterSeconds,
      resetAt: status.resetAt,
      message,
      error: message,
    },
    {
      status: status.unavailable ? 503 : 429,
      headers: {
        "Retry-After": String(status.retryAfterSeconds),
      },
    }
  );
}
