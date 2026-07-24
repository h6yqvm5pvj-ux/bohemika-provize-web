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

function purgeLegacyLocalStorageHomeCache(email?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    removeHomeCacheKeys(window.localStorage, email);
  } catch {
    // Best effort legacy cleanup.
  }
}

export function readPersistedHomeCache<TPayload>(
  cacheKey: string
): PersistedHomeCache<TPayload> | null {
  if (typeof window === "undefined") return null;
  purgeLegacyLocalStorageHomeCache();
  try {
    const raw = window.sessionStorage.getItem(`${HOME_CACHE_STORAGE_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      ts?: unknown;
      payload?: unknown;
    };
    if (typeof parsed.ts !== "number" || !parsed.payload) return null;
    return {
      ts: parsed.ts,
      payload: parsed.payload as TPayload,
    };
  } catch {
    return null;
  }
}

export function writePersistedHomeCache<TPayload>(
  cacheKey: string,
  payload: TPayload
): void {
  if (typeof window === "undefined") return;
  purgeLegacyLocalStorageHomeCache();
  try {
    window.sessionStorage.setItem(
      `${HOME_CACHE_STORAGE_PREFIX}${cacheKey}`,
      JSON.stringify({ ts: Date.now(), payload })
    );
  } catch {
    // ignore storage errors
  }
}
