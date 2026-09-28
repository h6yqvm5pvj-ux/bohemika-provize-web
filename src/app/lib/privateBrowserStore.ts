import type { User } from "firebase/auth";
import { auth } from "@/app/firebase-auth";
import { fetchAuthedJsonOrThrow } from "./authenticatedApi";
import { readAdminImpersonationState } from "./adminImpersonation";
import { privateMemoryGeneration } from "./privateMemory";

const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
const decode = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0));
export class PrivateBrowserMigrationError extends Error {}

/** Small persistent planning drafts; only the server-verified author may open
 * the store, including when migrating an old email-addressed local draft. */
export async function openPrivateBrowserStore(user: User) {
  const uid = user.uid;
  const generation = privateMemoryGeneration();
  let key: CryptoKey | null = null;
  let disposed = false;
  const assertOwner = () => {
    if (disposed || generation !== privateMemoryGeneration() || auth.currentUser?.uid !== uid || readAdminImpersonationState()) {
      throw new Error("Plán může otevřít pouze přihlášený autor mimo režim zastoupení.");
    }
  };
  assertOwner();
  const response = await fetchAuthedJsonOrThrow<{ ownerUid: string; ownerEmail: string; key: string }>(user, "/api/document-drafts/key", { method: "POST", cache: "no-store" });
  assertOwner();
  if (response.ownerUid !== uid || !response.ownerEmail) throw new Error("Nepodařilo se ověřit autora plánu.");
  const bytes = decode(response.key);
  try {
    if (bytes.length !== 32) throw new Error("Neplatný klíč plánu.");
    key = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  } finally { bytes.fill(0); }
  assertOwner();
  const storageKey = `bohemika:private:v1:${uid}:projection`;
  const additionalData = new TextEncoder().encode(storageKey);
  const legacyKey = `bohemika:projection:v1:${uid}:${response.ownerEmail.trim().toLowerCase()}`;
  const requireLegacyCleanup = () => {
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith("bohemika:projection:v1:")) {
        throw new PrivateBrowserMigrationError("V prohlížeči zbývají starší nešifrované plány jiných účtů. Jejich autoři se musí přihlásit a otevřít Projekci výkonu, aby se plány převedly. Žádný cizí plán se neotevřel ani nesmazal.");
      }
    }
  };
  const write = async (value: unknown) => {
    assertOwner();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    try {
      if (plaintext.length > 1_000_000) throw new Error("Plán je příliš velký.");
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData, tagLength: 128 }, key!, plaintext);
      assertOwner();
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) }));
    } finally { plaintext.fill(0); }
  };
  const read = async (): Promise<unknown | null> => {
    assertOwner();
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const record = JSON.parse(raw);
      if (raw.length > 1_400_000 || record.version !== 1 || typeof record.iv !== "string" || typeof record.ciphertext !== "string") throw new Error("Uložený plán je poškozený.");
      const iv = decode(record.iv);
      if (iv.length !== 12) throw new Error("Uložený plán je poškozený.");
      const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData, tagLength: 128 }, key!, decode(record.ciphertext)));
      try {
        assertOwner();
        const value: unknown = JSON.parse(new TextDecoder().decode(plaintext));
        localStorage.removeItem(legacyKey);
        requireLegacyCleanup();
        return value;
      } finally { plaintext.fill(0); }
    }
    const legacy = localStorage.getItem(legacyKey);
    if (!legacy) { requireLegacyCleanup(); return null; }
    if (legacy.length > 1_000_000) throw new Error("Starší plán je příliš velký.");
    const value: unknown = JSON.parse(legacy);
    await write(value); // Remove the only old copy only after encrypted persistence succeeds.
    assertOwner();
    localStorage.removeItem(legacyKey);
    requireLegacyCleanup();
    return value;
  };
  return { read, write, dispose() { disposed = true; key = null; } };
}
