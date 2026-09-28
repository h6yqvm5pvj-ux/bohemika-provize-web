import { decryptMailboxJson, encryptMailboxJson } from "./mailboxEncryption";

/** Enable after the migration reports no remaining plaintext records. */
export const privateEncryptionRequired = () => process.env.PRIVATE_DATA_ENCRYPTION_REQUIRED === "true";

/** Server-only envelope encryption. The master key lives in server secrets, never
 * in Firestore. Reuse the audited key ring, with a separate authenticated domain.
 * Callers must authorize access BEFORE opening a value. */
export function sealPrivateValue(value: unknown, context: string) {
  if (!context.trim()) throw new Error("Missing private encryption context");
  return { privateEncryption: 1, payload: encryptMailboxJson({ value }, `private:${context}`) };
}

export function openPrivateValue(value: unknown, context: string): unknown {
  if (value && typeof value === "object" && Object.hasOwn(value, "privateEncryption")) {
    const sealed = value as Record<string, unknown>;
    if (sealed.privateEncryption !== 1 || !context.trim()) throw new Error("Invalid private encryption envelope");
    return decryptMailboxJson<{ value: unknown }>(sealed.payload, `private:${context}`).value;
  }
  // Explicit rolling-migration compatibility; all writers MUST seal new values.
  if (value != null && privateEncryptionRequired()) throw new Error("Unencrypted private data is no longer accepted");
  return value;
}

export function isPrivateValue(value: unknown): boolean {
  return !!value && typeof value === "object" && Object.hasOwn(value, "privateEncryption");
}

export const clientCardContext = (uid: string, slug: string) => `clientCardsPrivate/${uid}/cards/${slug}:card`;
