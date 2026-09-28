export const HOME_CACHE_STORAGE_PREFIX = "home.cache:";

type PersistedHomeCache<TPayload> = {
  ts: number;
  payload: TPayload;
};

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

const cacheKeyPartForEmail = (email?: string | null): string | null => {
  const normalized = normalizeEmail(email);
  return normalized ? `|${normalized}|` : null;
};

function collectHomeCacheKeys(storage: Storage, email?: string | null): string[] {
  const keyPart = cacheKeyPartForEmail(email);
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key?.startsWith(HOME_CACHE_STORAGE_PREFIX)) continue;
    if (keyPart && !key.slice(HOME_CACHE_STORAGE_PREFIX.length).includes(keyPart)) {
      continue;
    }
    keys.push(key);
  }
  return keys;
}

function removeHomeCacheKeys(storage: Storage, email?: string | null): void {
  collectHomeCacheKeys(storage, email).forEach((key) => storage.removeItem(key));
}

export function clearPersistedHomeCache(email?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    removeHomeCacheKeys(window.sessionStorage, email);
    removeHomeCacheKeys(window.localStorage, email);
  } catch {
    // Best effort cache invalidation.
  }
}

// Home already maintains an identity-scoped, short-lived memory cache. Avoid a
// second persistent copy of contracts, commissions and team information.
export function readPersistedHomeCache<TPayload>(_cacheKey: string): PersistedHomeCache<TPayload> | null {
  void _cacheKey;
  clearPersistedHomeCache();
  return null;
}
export function writePersistedHomeCache<TPayload>(_cacheKey: string, _payload: TPayload): void {
  void _cacheKey; void _payload;
  clearPersistedHomeCache();
}
