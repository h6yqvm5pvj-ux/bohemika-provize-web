import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_ALGORITHM = "A256GCM";
const ENVELOPE_VERSION = 1;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DEFAULT_KEY_ID = "v1";
const MAX_KEY_ID_LENGTH = 64;

export type MailboxEncryptionEnvelope = {
  version: 1;
  algorithm: "A256GCM";
  keyId: string;
  iv: string;
  tag: string;
  wrappedKey: string;
  wrapIv: string;
  wrapTag: string;
};

export type MailboxEncryptedPayload = MailboxEncryptionEnvelope & {
  ciphertext: string;
};

export class MailboxEncryptionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailboxEncryptionConfigurationError";
  }
}

export class MailboxDecryptionError extends Error {
  constructor(message = "Šifrovaný obsah zprávy nelze přečíst.") {
    super(message);
    this.name = "MailboxDecryptionError";
  }
}

const decodeBase64 = (value: unknown, field: string): Buffer => {
  if (typeof value !== "string" || !value.trim()) {
    throw new MailboxDecryptionError(`Šifrovaný obsah neobsahuje pole ${field}.`);
  }
  const raw = value.trim();
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 !== 0) {
    throw new MailboxDecryptionError(`Pole ${field} nemá platný Base64 formát.`);
  }
  return Buffer.from(raw, "base64");
};

const decodeMasterKey = (value: string, keyId: string): Buffer => {
  const raw = value.trim();
  if (!raw) {
    throw new MailboxEncryptionConfigurationError(
      `Šifrovací klíč ${keyId} je prázdný.`
    );
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 !== 0) {
    throw new MailboxEncryptionConfigurationError(
      `Šifrovací klíč ${keyId} musí být v Base64 formátu.`
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new MailboxEncryptionConfigurationError(
      `Šifrovací klíč ${keyId} musí mít po dekódování přesně ${KEY_BYTES} bajtů.`
    );
  }
  return key;
};

const normalizeKeyId = (value: unknown, fallback = ""): string => {
  if (typeof value !== "string") return fallback;
  const keyId = value.trim();
  if (!keyId || keyId.length > MAX_KEY_ID_LENGTH || !/^[A-Za-z0-9._-]+$/.test(keyId)) {
    return fallback;
  }
  return keyId;
};

const readPreviousKeys = (): Map<string, Buffer> => {
  const keys = new Map<string, Buffer>();
  const raw = process.env.MAILBOX_ENCRYPTION_PREVIOUS_KEYS?.trim();
  if (!raw) return keys;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MailboxEncryptionConfigurationError(
      "MAILBOX_ENCRYPTION_PREVIOUS_KEYS musí být platný JSON objekt."
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new MailboxEncryptionConfigurationError(
      "MAILBOX_ENCRYPTION_PREVIOUS_KEYS musí být JSON objekt klíčů."
    );
  }

  Object.entries(parsed as Record<string, unknown>).forEach(([rawKeyId, value]) => {
    const keyId = normalizeKeyId(rawKeyId);
    if (!keyId || typeof value !== "string") {
      throw new MailboxEncryptionConfigurationError(
        "MAILBOX_ENCRYPTION_PREVIOUS_KEYS obsahuje neplatný záznam."
      );
    }
    keys.set(keyId, decodeMasterKey(value, keyId));
  });
  return keys;
};

const readKeyRing = (): { activeKeyId: string; keys: Map<string, Buffer> } => {
  const configuredKeyId = process.env.MAILBOX_ENCRYPTION_KEY_ID?.trim();
  const activeKeyId = configuredKeyId
    ? normalizeKeyId(configuredKeyId)
    : DEFAULT_KEY_ID;
  if (!activeKeyId) {
    throw new MailboxEncryptionConfigurationError(
      "MAILBOX_ENCRYPTION_KEY_ID má neplatný formát."
    );
  }
  const activeKeyRaw = process.env.MAILBOX_ENCRYPTION_KEY?.trim();
  if (!activeKeyRaw) {
    throw new MailboxEncryptionConfigurationError(
      "Chybí MAILBOX_ENCRYPTION_KEY. Nastav serverový Base64 klíč o délce 32 bajtů."
    );
  }

  const keys = readPreviousKeys();
  keys.set(activeKeyId, decodeMasterKey(activeKeyRaw, activeKeyId));
  return { activeKeyId, keys };
};

const aadForContent = (context: string): Buffer =>
  Buffer.from(`bohemika-mailbox:v1:content:${context}`, "utf8");

const aadForWrappedKey = (context: string, keyId: string): Buffer =>
  Buffer.from(`bohemika-mailbox:v1:key:${keyId}:${context}`, "utf8");

const encode = (value: Buffer): string => value.toString("base64");

const parseEnvelope = (value: unknown): MailboxEncryptionEnvelope => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MailboxDecryptionError();
  }
  const row = value as Record<string, unknown>;
  if (row.version !== ENVELOPE_VERSION || row.algorithm !== ENVELOPE_ALGORITHM) {
    throw new MailboxDecryptionError("Šifrovaný obsah používá nepodporovanou verzi.");
  }
  const keyId = normalizeKeyId(row.keyId);
  if (!keyId) throw new MailboxDecryptionError("Šifrovaný obsah nemá platné ID klíče.");

  const iv = decodeBase64(row.iv, "iv");
  const tag = decodeBase64(row.tag, "tag");
  const wrappedKey = decodeBase64(row.wrappedKey, "wrappedKey");
  const wrapIv = decodeBase64(row.wrapIv, "wrapIv");
  const wrapTag = decodeBase64(row.wrapTag, "wrapTag");
  if (iv.length !== IV_BYTES || wrapIv.length !== IV_BYTES) {
    throw new MailboxDecryptionError("Šifrovaný obsah má neplatný inicializační vektor.");
  }
  if (tag.length !== TAG_BYTES || wrapTag.length !== TAG_BYTES) {
    throw new MailboxDecryptionError("Šifrovaný obsah má neplatný autentizační tag.");
  }
  if (wrappedKey.length !== KEY_BYTES) {
    throw new MailboxDecryptionError("Šifrovaný obsah má neplatný zabalený klíč.");
  }

  return {
    version: ENVELOPE_VERSION,
    algorithm: ENVELOPE_ALGORITHM,
    keyId,
    iv: encode(iv),
    tag: encode(tag),
    wrappedKey: encode(wrappedKey),
    wrapIv: encode(wrapIv),
    wrapTag: encode(wrapTag),
  };
};

export function isMailboxEncryptionEnvelope(
  value: unknown
): value is MailboxEncryptionEnvelope {
  try {
    parseEnvelope(value);
    return true;
  } catch {
    return false;
  }
}

export function encryptMailboxBytes(
  plaintext: Uint8Array,
  context: string
): { bytes: Buffer; encryption: MailboxEncryptionEnvelope } {
  if (!context.trim()) {
    throw new MailboxEncryptionConfigurationError("Chybí kontext šifrovaného obsahu.");
  }
  const { activeKeyId, keys } = readKeyRing();
  const masterKey = keys.get(activeKeyId)!;
  const dataKey = randomBytes(KEY_BYTES);

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, dataKey, iv);
  cipher.setAAD(aadForContent(context));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const wrapIv = randomBytes(IV_BYTES);
  const keyCipher = createCipheriv(ALGORITHM, masterKey, wrapIv);
  keyCipher.setAAD(aadForWrappedKey(context, activeKeyId));
  const wrappedKey = Buffer.concat([keyCipher.update(dataKey), keyCipher.final()]);
  const wrapTag = keyCipher.getAuthTag();
  dataKey.fill(0);

  return {
    bytes: ciphertext,
    encryption: {
      version: ENVELOPE_VERSION,
      algorithm: ENVELOPE_ALGORITHM,
      keyId: activeKeyId,
      iv: encode(iv),
      tag: encode(tag),
      wrappedKey: encode(wrappedKey),
      wrapIv: encode(wrapIv),
      wrapTag: encode(wrapTag),
    },
  };
}

export function decryptMailboxBytes(
  ciphertext: Uint8Array,
  envelopeRaw: unknown,
  context: string
): Buffer {
  try {
    const envelope = parseEnvelope(envelopeRaw);
    const { keys } = readKeyRing();
    const masterKey = keys.get(envelope.keyId);
    if (!masterKey) {
      throw new MailboxEncryptionConfigurationError(
        `Pro zprávu chybí šifrovací klíč ${envelope.keyId}.`
      );
    }

    const keyDecipher = createDecipheriv(
      ALGORITHM,
      masterKey,
      Buffer.from(envelope.wrapIv, "base64")
    );
    keyDecipher.setAAD(aadForWrappedKey(context, envelope.keyId));
    keyDecipher.setAuthTag(Buffer.from(envelope.wrapTag, "base64"));
    const dataKey = Buffer.concat([
      keyDecipher.update(Buffer.from(envelope.wrappedKey, "base64")),
      keyDecipher.final(),
    ]);

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        dataKey,
        Buffer.from(envelope.iv, "base64")
      );
      decipher.setAAD(aadForContent(context));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext)),
        decipher.final(),
      ]);
    } finally {
      dataKey.fill(0);
    }
  } catch (error) {
    if (error instanceof MailboxEncryptionConfigurationError) throw error;
    if (error instanceof MailboxDecryptionError) throw error;
    throw new MailboxDecryptionError();
  }
}

export function encryptMailboxJson(
  value: unknown,
  context: string
): MailboxEncryptedPayload {
  const result = encryptMailboxBytes(
    Buffer.from(JSON.stringify(value), "utf8"),
    context
  );
  return {
    ...result.encryption,
    ciphertext: encode(result.bytes),
  };
}

export function decryptMailboxJson<T>(
  payloadRaw: unknown,
  context: string
): T {
  if (!payloadRaw || typeof payloadRaw !== "object" || Array.isArray(payloadRaw)) {
    throw new MailboxDecryptionError();
  }
  const payload = payloadRaw as Record<string, unknown>;
  const ciphertext = decodeBase64(payload.ciphertext, "ciphertext");
  const plaintext = decryptMailboxBytes(ciphertext, payload, context);
  try {
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    throw new MailboxDecryptionError("Šifrovaná zpráva neobsahuje platná data.");
  }
}
