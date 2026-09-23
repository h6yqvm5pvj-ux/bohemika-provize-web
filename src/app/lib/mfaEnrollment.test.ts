import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestMfaEmailCode, confirmMfaEmailCode, completeMfaEnrollment } from "./mfaEnrollment";
const fetcher = vi.fn(), getIdToken = vi.fn();
const user = { email: "synthetic+account@example.test", getIdToken } as unknown as User;
const challengeId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", fetcher); getIdToken.mockResolvedValue("synthetic-token"); });
afterEach(() => vi.unstubAllGlobals());
describe("client MFA enrollment transport", () => {
  it("sends a bearer token with no application cookie and lets the server choose the recipient", async () => {
    fetcher.mockResolvedValue(Response.json({ ok: true, challengeId }));
    expect(await requestMfaEmailCode(user)).toBe(challengeId);
    expect(fetcher).toHaveBeenCalledWith("/api/auth/mfa-enrollment", expect.objectContaining({ credentials: "omit", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-token" }, body: JSON.stringify({ action: "request" }) }));
  });
  it("builds the standard local QR URI only from an email-confirmed response and finalizes using a challenge ID", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ ok: true, challengeId, secretKey: "JBSWY3DPEHPK3PXP" }));
    const secret = await confirmMfaEmailCode(user, challengeId, "123456");
    const uri = new URL(secret.generateQrCodeUrl());
    expect(uri.protocol).toBe("otpauth:"); expect(uri.hostname).toBe("totp");
    expect(decodeURIComponent(uri.pathname)).toBe("/Bohemka.App:synthetic+account@example.test");
    expect(Object.fromEntries(uri.searchParams)).toEqual({ secret: "JBSWY3DPEHPK3PXP", issuer: "Bohemka.App", algorithm: "SHA1", digits: "6", period: "30" });
    fetcher.mockResolvedValueOnce(Response.json({ ok: true, enrolled: true }));
    await completeMfaEnrollment(user, secret, "012345");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "complete", challengeId, code: "012345" });
  });
  it("rejects a response for another challenge", async () => {
    fetcher.mockResolvedValue(Response.json({ ok: true, challengeId: "other", secretKey: "JBSWY3DPEHPK3PXP" }));
    await expect(confirmMfaEmailCode(user, challengeId, "123456")).rejects.toThrow("QR kód");
  });
  it("shows safe server errors and distinguishes network failure", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ ok: false, error: "Vyžádej nový kód." }, { status: 409 }));
    await expect(requestMfaEmailCode(user)).rejects.toThrow("Vyžádej nový kód.");
    fetcher.mockRejectedValueOnce(new Error("private network details"));
    await expect(requestMfaEmailCode(user)).rejects.toThrow("Server pro nastavení 2FA neodpovídá");
  });
  it("preserves rate limit details for an in-place retry countdown", async () => {
    fetcher.mockResolvedValue(Response.json({ ok: false, code: "mfa/rate-limited", error: "Chvíli počkej." }, { status: 429, headers: { "Retry-After": "37" } }));
    await expect(requestMfaEmailCode(user)).rejects.toMatchObject({ message: "Chvíli počkej.", code: "mfa/rate-limited", status: 429, retryAfterSeconds: 37 });
  });
});
