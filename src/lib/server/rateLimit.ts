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
};

type ConsumeRateLimitOptions = {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
};

const RATE_LIMIT_STORE = Symbol.for("bohemika.rateLimit.store");
const RATE_LIMIT_LAST_CLEANUP = Symbol.for("bohemika.rateLimit.lastCleanup");
const CLEANUP_INTERVAL_MS = 60_000;

type GlobalWithRateLimit = typeof globalThis & {
  [RATE_LIMIT_STORE]?: Map<string, RateLimitBucket>;
  [RATE_LIMIT_LAST_CLEANUP]?: number;
};

function getStore(): Map<string, RateLimitBucket> {
  const g = globalThis as GlobalWithRateLimit;
  if (!g[RATE_LIMIT_STORE]) {
    g[RATE_LIMIT_STORE] = new Map<string, RateLimitBucket>();
  }
  return g[RATE_LIMIT_STORE];
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

export function consumeRateLimit({
  namespace,
  key,
  limit,
  windowMs,
}: ConsumeRateLimitOptions): RateLimitResult {
  const normalizedNamespace = namespace.trim().toLowerCase();
  const normalizedKey = key.trim().toLowerCase() || "anonymous";
  const bucketKey = `${normalizedNamespace}:${normalizedKey}`;
  const nowMs = Date.now();

  cleanupExpiredBuckets(nowMs);

  const store = getStore();
  let bucket = store.get(bucketKey);

  if (!bucket || bucket.resetAtMs <= nowMs) {
    bucket = { count: 0, resetAtMs: nowMs + windowMs };
  }

  bucket.count += 1;
  store.set(bucketKey, bucket);

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
  };
}

export function applyRateLimitHeaders(
  headers: Headers,
  result: RateLimitResult
) {
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", String(result.resetAtUnix));
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
