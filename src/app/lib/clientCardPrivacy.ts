const LEGACY_CLIENT_CARD_PREFIX = "bohemika.client-card.";

export function isLegacyClientCardKey(key: string | null): boolean {
  return key?.startsWith(LEGACY_CLIENT_CARD_PREFIX) === true;
}

// Legacy drafts have no reliable account ownership and are retired without
// migration. Never read their values or assign them to the current account.
export function clearLegacyClientCards(): void {
  if (typeof window === "undefined") return;
  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[storageName];
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key && isLegacyClientCardKey(key)) storage.removeItem(key);
      }
    } catch {
      // A browser may deny access to storage. Still clean the other store and
      // allow logout to finish; personal data is never written here again.
    }
  }
}

export function installClientCardPrivacyCleanup(): () => void {
  if (typeof window === "undefined") return () => undefined;
  clearLegacyClientCards();
  const onStorage = (event: StorageEvent) => {
    // Also remove a draft written by another tab still running the old app.
    if (isLegacyClientCardKey(event.key)) clearLegacyClientCards();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", clearLegacyClientCards);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", clearLegacyClientCards);
  };
}
