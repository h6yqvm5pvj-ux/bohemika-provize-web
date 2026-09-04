import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  decryptMailboxBytes,
  decryptMailboxJson,
  encryptMailboxBytes,
  encryptMailboxJson,
  MailboxDecryptionError,
  MailboxEncryptionConfigurationError,
} from "./mailboxEncryption";

const PRIMARY_KEY = Buffer.alloc(32, 7).toString("base64");
const NEXT_KEY = Buffer.alloc(32, 9).toString("base64");

const savedEnv = {
  key: process.env.MAILBOX_ENCRYPTION_KEY,
  keyId: process.env.MAILBOX_ENCRYPTION_KEY_ID,
  previous: process.env.MAILBOX_ENCRYPTION_PREVIOUS_KEYS,
};

describe("mailboxEncryption", () => {
  beforeEach(() => {
    process.env.MAILBOX_ENCRYPTION_KEY = PRIMARY_KEY;
    process.env.MAILBOX_ENCRYPTION_KEY_ID = "key-2026-01";
    delete process.env.MAILBOX_ENCRYPTION_PREVIOUS_KEYS;
  });

  afterEach(() => {
    if (savedEnv.key == null) delete process.env.MAILBOX_ENCRYPTION_KEY;
    else process.env.MAILBOX_ENCRYPTION_KEY = savedEnv.key;
    if (savedEnv.keyId == null) delete process.env.MAILBOX_ENCRYPTION_KEY_ID;
    else process.env.MAILBOX_ENCRYPTION_KEY_ID = savedEnv.keyId;
    if (savedEnv.previous == null) delete process.env.MAILBOX_ENCRYPTION_PREVIOUS_KEYS;
    else process.env.MAILBOX_ENCRYPTION_PREVIOUS_KEYS = savedEnv.previous;
  });

  it("encrypts and decrypts JSON without exposing plaintext", () => {
    const payload = encryptMailboxJson(
      { subject: "Citlivý předmět", messageText: "Tajná zpráva" },
      "message:123"
    );

    expect(JSON.stringify(payload)).not.toContain("Citlivý předmět");
    expect(JSON.stringify(payload)).not.toContain("Tajná zpráva");
    expect(payload.keyId).toBe("key-2026-01");
    expect(
      decryptMailboxJson<{ subject: string; messageText: string }>(
        payload,
        "message:123"
      )
    ).toEqual({ subject: "Citlivý předmět", messageText: "Tajná zpráva" });
  });

  it("encrypts attachment bytes with a fresh data key", () => {
    const first = encryptMailboxBytes(Buffer.from("obsah souboru"), "attachment:1");
    const second = encryptMailboxBytes(Buffer.from("obsah souboru"), "attachment:1");

    expect(first.bytes.equals(Buffer.from("obsah souboru"))).toBe(false);
    expect(first.bytes.equals(second.bytes)).toBe(false);
    expect(
      decryptMailboxBytes(first.bytes, first.encryption, "attachment:1").toString("utf8")
    ).toBe("obsah souboru");
  });

  it("rejects tampering and a mismatched context", () => {
    const result = encryptMailboxBytes(Buffer.from("ahoj"), "message:1");
    const tampered = Buffer.from(result.bytes);
    tampered[0] = (tampered[0] ?? 0) ^ 1;

    expect(() =>
      decryptMailboxBytes(tampered, result.encryption, "message:1")
    ).toThrow(MailboxDecryptionError);
    expect(() =>
      decryptMailboxBytes(result.bytes, result.encryption, "message:2")
    ).toThrow(MailboxDecryptionError);
  });

  it("decrypts old envelopes after rotating the active key", () => {
    const payload = encryptMailboxJson({ text: "před rotací" }, "message:rotation");
    process.env.MAILBOX_ENCRYPTION_KEY = NEXT_KEY;
    process.env.MAILBOX_ENCRYPTION_KEY_ID = "key-2026-02";
    process.env.MAILBOX_ENCRYPTION_PREVIOUS_KEYS = JSON.stringify({
      "key-2026-01": PRIMARY_KEY,
    });

    expect(
      decryptMailboxJson<{ text: string }>(payload, "message:rotation")
    ).toEqual({ text: "před rotací" });
  });

  it("fails closed when the active key is missing or invalid", () => {
    delete process.env.MAILBOX_ENCRYPTION_KEY;
    expect(() => encryptMailboxJson({ text: "ahoj" }, "message:1")).toThrow(
      MailboxEncryptionConfigurationError
    );

    process.env.MAILBOX_ENCRYPTION_KEY = "not-base64";
    expect(() => encryptMailboxJson({ text: "ahoj" }, "message:1")).toThrow(
      MailboxEncryptionConfigurationError
    );

    process.env.MAILBOX_ENCRYPTION_KEY = PRIMARY_KEY;
    process.env.MAILBOX_ENCRYPTION_KEY_ID = "invalid key id";
    expect(() => encryptMailboxJson({ text: "ahoj" }, "message:1")).toThrow(
      MailboxEncryptionConfigurationError
    );
  });
});
