import { createHash } from "node:crypto";

import { adminDb } from "@/lib/server/firebaseAdmin";

type RateLimitBucket = {
  count: number;
  resetAtMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  resetAtUnix: number;
  retryAfterSeconds: number;
  store: "redis" | "firestore" | "memory" | "memory-fallback" | "unavailable";
};

type ConsumeRateLimitOptions = {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
};

const RATE_LIMIT_STORE = Symbol.for("bohemika.rateLimit.store");
const RATE_LIMIT_LAST_CLEANUP = Symbol.for("bohemika.rateLimit.lastCleanup");
const RATE_LIMIT_WARNED_KEYS = Symbol.for("bohemika.rateLimit.warnedKeys");
const CLEANUP_INTERVAL_MS = 60_000;
const FAIL_CLOSED_RETRY_AFTER_SECONDS = 60;
const REDIS_RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
local ttl = redis.call("PTTL", KEYS[1])
if current == 1 or ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { current, ttl }
`.trim();

type GlobalWithRateLimit = typeof globalThis & {
  [RATE_LIMIT_STORE]?: Map<string, RateLimitBucket>;
  [RATE_LIMIT_LAST_CLEANUP]?: number;
  [RATE_LIMIT_WARNED_KEYS]?: Set<string>;
};

function getStore(): Map<string, RateLimitBucket> {
  const g = globalThis as GlobalWithRateLimit;
  if (!g[RATE_LIMIT_STORE]) {
    g[RATE_LIMIT_STORE] = new Map<string, RateLimitBucket>();
  }
  return g[RATE_LIMIT_STORE];
}

function warnOnce(key: string, message: string, error?: unknown) {
  const g = globalThis as GlobalWithRateLimit;
  if (!g[RATE_LIMIT_WARNED_KEYS]) {
    g[RATE_LIMIT_WARNED_KEYS] = new Set<string>();
  }
  if (g[RATE_LIMIT_WARNED_KEYS].has(key)) return;
  g[RATE_LIMIT_WARNED_KEYS].add(key);
  if (error) {
    console.error(message, error);
  } else {
    console.error(message);
  }
}

function cleanupExpiredBuckets(nowMs: number) {
  const g = globalThis as GlobalWithRateLimit;
  const store = getStore();
  const lastCleanup = g[RATE_LIMIT_LAST_CLEANUP] ?? 0;

  if (nowMs - lastCleanup < CLEANUP_INTERVAL_MS) return;

  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAtMs <= nowMs) {
      store.delete(key);
    }
  }

  g[RATE_LIMIT_LAST_CLEANUP] = nowMs;
}

function normalizeRedisRestUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function getRedisRestConfig(): { url: string; token: string } | null {
  const url =
    process.env.RATE_LIMIT_REDIS_REST_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim() ||
    "";
  const token =
    process.env.RATE_LIMIT_REDIS_REST_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim() ||
    "";

  if (!url || !token) return null;
  return {
    url: normalizeRedisRestUrl(url),
    token,
  };
}

function allowMemoryRateLimitFallback(): boolean {
  const explicit = process.env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true" || explicit === "yes") return true;
  if (explicit === "0" || explicit === "false" || explicit === "no") return false;

  return process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production";
}

function bucketKey(namespace: string, key: string): string {
  const normalizedNamespace = namespace.trim().toLowerCase() || "default";
  const normalizedKey = key.trim().toLowerCase() || "anonymous";
  const keyHash = createHash("sha256").update(normalizedKey).digest("hex");
  return `rl:${normalizedNamespace}:${keyHash}`;
}

function parseRedisNumber(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

async function consumeRedisRateLimit({
  namespace,
  key,
  limit,
  windowMs,
}: ConsumeRateLimitOptions): Promise<RateLimitResult | null> {
  const config = getRedisRestConfig();
  if (!config) return null;

  const nowMs = Date.now();
  const redisKey = bucketKey(namespace, key);
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      "EVAL",
      REDIS_RATE_LIMIT_SCRIPT,
      1,
      redisKey,
      String(windowMs),
    ]),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Redis rate limit failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as { result?: unknown; error?: unknown };
  if (payload.error) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "Redis rate limit command failed."
    );
  }

  const result = Array.isArray(payload.result) ? payload.result : [];
  const count = parseRedisNumber(result[0]);
  const ttlMsRaw = parseRedisNumber(result[1]);
  if (count == null) {
    throw new Error("Redis rate limit returned invalid counter.");
  }

  const ttlMs = ttlMsRaw != null && ttlMsRaw > 0 ? ttlMsRaw : windowMs;
  const resetAtMs = nowMs + ttlMs;
  const allowed = count <= limit;
  const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil(ttlMs / 1000));

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    resetAtMs,
    resetAtUnix: Math.ceil(resetAtMs / 1000),
    retryAfterSeconds,
    store: "redis",
  };
}

async function consumeFirestoreRateLimit({
  namespace,
  key,
  limit,
  windowMs,
}: ConsumeRateLimitOptions): Promise<RateLimitResult | null> {
  if (!adminDb) return null;

  const firestoreKey = bucketKey(namespace, key);
  const docRef = adminDb.collection("_rateLimits").doc(firestoreKey);
  const nowMs = Date.now();

  const bucket = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = (snap.data() ?? {}) as Partial<RateLimitBucket>;
    const previousCount = typeof data.count === "number" ? data.count : 0;
    const previousResetAtMs = typeof data.resetAtMs === "number" ? data.resetAtMs : 0;
    const resetAtMs = previousResetAtMs > nowMs ? previousResetAtMs : nowMs + windowMs;
    const count = previousResetAtMs > nowMs ? previousCount + 1 : 1;

    tx.set(docRef, {
      count,
      resetAtMs,
      updatedAtMs: nowMs,
      expiresAt: new Date(resetAtMs),
    });

    return { count, resetAtMs };
  });

  const allowed = bucket.count <= limit;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((bucket.resetAtMs - nowMs) / 1000));

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAtMs: bucket.resetAtMs,
    resetAtUnix: Math.ceil(bucket.resetAtMs / 1000),
    retryAfterSeconds,
    store: "firestore",
  };
}

function consumeMemoryRateLimit({
  namespace,
  key,
  limit,
  windowMs,
}: ConsumeRateLimitOptions, storeKind: "memory" | "memory-fallback"): RateLimitResult {
  const memoryKey = bucketKey(namespace, key);
  const nowMs = Date.now();

  cleanupExpiredBuckets(nowMs);

  const store = getStore();
  let bucket = store.get(memoryKey);

  if (!bucket || bucket.resetAtMs <= nowMs) {
    bucket = { count: 0, resetAtMs: nowMs + windowMs };
  }

  bucket.count += 1;
  store.set(memoryKey, bucket);

  const allowed = bucket.count <= limit;
  const remaining = Math.max(0, limit - bucket.count);
  const resetAtMs = bucket.resetAtMs;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));

  return {
    allowed,
    limit,
    remaining,
    resetAtMs,
    resetAtUnix: Math.ceil(resetAtMs / 1000),
    retryAfterSeconds,
    store: storeKind,
  };
}

function unavailableRateLimitResult({
  limit,
}: ConsumeRateLimitOptions): RateLimitResult {
  const resetAtMs = Date.now() + FAIL_CLOSED_RETRY_AFTER_SECONDS * 1000;
  return {
    allowed: false,
    limit,
    remaining: 0,
    resetAtMs,
    resetAtUnix: Math.ceil(resetAtMs / 1000),
    retryAfterSeconds: FAIL_CLOSED_RETRY_AFTER_SECONDS,
    store: "unavailable",
  };
}

export async function consumeRateLimit(
  options: ConsumeRateLimitOptions
): Promise<RateLimitResult> {
  const memoryFallbackAllowed = allowMemoryRateLimitFallback();
  let sharedStoreError: unknown = null;

  try {
    const redisResult = await consumeRedisRateLimit(options);
    if (redisResult) return redisResult;
  } catch (error) {
    sharedStoreError = error;
  }

  try {
    const firestoreResult = await consumeFirestoreRateLimit(options);
    if (firestoreResult) return firestoreResult;
  } catch (error) {
    sharedStoreError = error;
  }

  if (memoryFallbackAllowed) {
    if (sharedStoreError) {
      console.warn("Shared rate limit unavailable, using in-memory fallback:", sharedStoreError);
      return consumeMemoryRateLimit(options, "memory-fallback");
    }
    return consumeMemoryRateLimit(options, "memory");
  }

  if (sharedStoreError) {
    warnOnce(
      "shared-store-unavailable",
      "Shared rate limit store is unavailable and memory fallback is disabled. Failing closed.",
      sharedStoreError
    );
  } else {
    warnOnce(
      "shared-store-missing-config",
      "No shared rate limit store is configured and memory fallback is disabled. Failing closed."
    );
  }
  return unavailableRateLimitResult(options);
}

export function applyRateLimitHeaders(
  headers: Headers,
  result: RateLimitResult
) {
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", String(result.resetAtUnix));
  headers.set("X-RateLimit-Store", result.store);
  if (!result.allowed) {
    headers.set("Retry-After", String(result.retryAfterSeconds));
  }
}

export function getRequestIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const cfConnectingIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}
