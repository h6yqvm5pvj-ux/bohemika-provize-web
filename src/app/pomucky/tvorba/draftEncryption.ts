import type { DocumentDraft } from "./documentDraft";

export type EncryptedDraft = {
  version: 1;
  ownerUid: string;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
};

const context = (ownerUid: string) => new TextEncoder().encode(`bohemika:document-draft:v1:${ownerUid}`);

export async function encryptDraft(key: CryptoKey, ownerUid: string, draft: DocumentDraft): Promise<EncryptedDraft> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(draft));
  try {
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: context(ownerUid), tagLength: 128 }, key, plaintext);
    return { version: 1, ownerUid, iv, ciphertext };
  } finally { plaintext.fill(0); }
}

export async function decryptDraft(key: CryptoKey, ownerUid: string, record: EncryptedDraft): Promise<unknown> {
  if (record.version !== 1 || record.ownerUid !== ownerUid || record.iv?.byteLength !== 12) {
    throw new Error("Koncept nepatří přihlášenému autorovi nebo je poškozený.");
  }
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({
    name: "AES-GCM", iv: record.iv, additionalData: context(ownerUid), tagLength: 128,
  }, key, record.ciphertext));
  try { return JSON.parse(new TextDecoder().decode(plaintext)); }
  finally { plaintext.fill(0); }
}
