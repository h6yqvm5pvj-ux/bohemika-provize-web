// Sensitive caches stay in this page's memory, never Web Storage. Account and
// impersonation changes call clearPrivateMemory even when logout is offline.
const values = new Map<string, string>();
let generation = 0;
let ownerUid: string | null = null;
export const privateMemoryGeneration = () => generation;
export function setPrivateMemoryIdentity(uid: string | null): void {
  purgePrivateBrowserCaches();
  if (ownerUid !== uid) { clearPrivateMemory(); ownerUid = uid; }
}
export const privateMemory = {
  getItem(key: string): string | null { return typeof window === "undefined" ? null : values.get(key) ?? null; },
  setItem(key: string, value: string): void { if (typeof window !== "undefined") values.set(key, value); },
  removeItem(key: string): void { values.delete(key); },
};
export function clearPrivateMemory(): void { values.clear(); generation++; }

/** Remove obsolete caches; never adopt data from an unverified prior account. */
export function purgePrivateBrowserCaches(): void {
  if (typeof window === "undefined") return;
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[name];
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key && (key === "contracts_cache_v3" || key.startsWith("contracts_view_state_v1") ||
          key.startsWith("home.cache:") || key.startsWith("tvorba.footerProfile:"))) storage.removeItem(key);
      }
    } catch { /* Disabled storage must not prevent logout. */ }
  }
}
