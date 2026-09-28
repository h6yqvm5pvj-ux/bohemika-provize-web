import { decryptMailboxBytes, encryptMailboxBytes } from "./mailboxEncryption";
import { privateEncryptionRequired } from "./privateEncryption";

// An atomic self-contained object avoids races between ciphertext and metadata.
// Authentication is completed before any plaintext is returned or streamed.
const MAGIC = Buffer.from("BOHEMIKA-PRIVATE-V1\n", "ascii");
const MAX_HEADER = 4096;

export function encryptPrivateFile(bytes: Buffer, bucket: string, path: string): Buffer {
  const encrypted = encryptMailboxBytes(bytes, `private-file:${bucket}/${path}`);
  const header = Buffer.from(JSON.stringify(encrypted.encryption), "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return Buffer.concat([MAGIC, length, header, encrypted.bytes]);
}

export function isPrivateFile(bytes: Buffer): boolean {
  return bytes.subarray(0, MAGIC.length).equals(MAGIC);
}

export function decryptPrivateFile(bytes: Buffer, bucket: string, path: string): Buffer {
  if (!isPrivateFile(bytes)) {
    if (privateEncryptionRequired()) throw new Error("Unencrypted private files are no longer accepted");
    return bytes; // Legacy objects are migrated separately.
  }
  if (bytes.length < MAGIC.length + 4) throw new Error("Invalid encrypted file");
  const length = bytes.readUInt32BE(MAGIC.length);
  const start = MAGIC.length + 4;
  if (length <= 0 || length > MAX_HEADER || bytes.length < start + length) throw new Error("Invalid encrypted file");
  const envelope: unknown = JSON.parse(bytes.subarray(start, start + length).toString("utf8"));
  return decryptMailboxBytes(bytes.subarray(start + length), envelope, `private-file:${bucket}/${path}`);
}
