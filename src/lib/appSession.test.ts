import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createAppSessionCookieValue,
  verifyAppSessionCookieValue,
} from "@/lib/appSession";

const originalEnv = {
  APP_SESSION_SECRET: process.env.APP_SESSION_SECRET,
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
};

function restoreEnv() {
  process.env.APP_SESSION_SECRET = originalEnv.APP_SESSION_SECRET;
  process.env.AUTH_SESSION_SECRET = originalEnv.AUTH_SESSION_SECRET;
  process.env.NEXTAUTH_SECRET = originalEnv.NEXTAUTH_SECRET;
  process.env.FIREBASE_ADMIN_PRIVATE_KEY = originalEnv.FIREBASE_ADMIN_PRIVATE_KEY;
}

describe("app session cookie", () => {
  beforeEach(() => {
    process.env.APP_SESSION_SECRET = "test-session-secret";
    delete process.env.AUTH_SESSION_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  });

  afterEach(() => {
    restoreEnv();
  });

  it("creates and verifies a signed session cookie", async () => {
    const created = await createAppSessionCookieValue({
      uid: "uid-123",
      email: "USER@Example.COM",
      nowMs: 1_000_000,
      maxAgeSeconds: 120,
    });

    const verified = await verifyAppSessionCookieValue(created.value, {
      nowMs: 1_030_000,
    });

    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(created.sessionId).toEqual(verified.session.sessionId);
      expect(verified.session.sessionId).toMatch(/.+/);
      expect(verified.session).toMatchObject({
        uid: "uid-123",
        email: "user@example.com",
        issuedAt: 1_000,
        expiresAt: 1_120,
      });
    }
  });

  it("rejects a tampered session cookie", async () => {
    const created = await createAppSessionCookieValue({
      uid: "uid-123",
      email: "user@example.com",
      nowMs: 1_000_000,
      maxAgeSeconds: 120,
    });
    const [payload, signature] = created.value.split(".");
    const replacement = signature.startsWith("a") ? "b" : "a";
    const tampered = `${payload}.${replacement}${signature.slice(1)}`;

    await expect(
      verifyAppSessionCookieValue(tampered, { nowMs: 1_030_000 })
    ).resolves.toEqual({ ok: false, reason: "invalid-signature" });
  });

  it("rejects an expired session cookie", async () => {
    const created = await createAppSessionCookieValue({
      uid: "uid-123",
      email: "user@example.com",
      nowMs: 1_000_000,
      maxAgeSeconds: 120,
    });

    await expect(
      verifyAppSessionCookieValue(created.value, { nowMs: 1_121_000 })
    ).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it.each([
    ["uid", "another-user"],
    ["email", "another@example.test"],
    ["sid", "another-device"],
    ["exp", 9_999_999_999],
    ["authTime", 1_001],
    ["admin", true],
  ])("rejects changing %s without a new server signature", async (field, value) => {
    const created = await createAppSessionCookieValue({
      uid: "synthetic-user", email: "synthetic@example.test", nowMs: 1_000_000, maxAgeSeconds: 120,
    });
    const [encoded, signature] = created.value.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const tampered = Buffer.from(JSON.stringify({ ...payload, [field]: value })).toString("base64url");
    await expect(verifyAppSessionCookieValue(`${tampered}.${signature}`, { nowMs: 1_030_000 }))
      .resolves.toEqual({ ok: false, reason: "invalid-signature" });
  });

  it("fails closed when no signing secret is available", async () => {
    delete process.env.APP_SESSION_SECRET;

    await expect(
      createAppSessionCookieValue({
        uid: "uid-123",
        email: "user@example.com",
      })
    ).rejects.toThrow("APP_SESSION_SECRET");

    await expect(
      verifyAppSessionCookieValue("payload.signature")
    ).resolves.toEqual({ ok: false, reason: "not-configured" });
  });
});
