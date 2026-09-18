import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";
import { withAccountSecurityPolicy } from "./accountSecurityPolicy";

const user = { uid: "synthetic", disabled: false, emailVerified: true, multiFactor: { enrolledFactors: [{ factorId: "totp" }] } };
const token = { uid: user.uid, email_verified: true, firebase: { sign_in_provider: "password", sign_in_second_factor: "totp" } };
const raw = { verifyIdToken: vi.fn(), getUser: vi.fn(), createCustomToken: vi.fn(), revokeRefreshTokens: vi.fn() };
const blocked = vi.fn();
const auth = withAccountSecurityPolicy(raw as unknown as Auth, blocked);
beforeEach(() => {
  vi.resetAllMocks();
  raw.verifyIdToken.mockResolvedValue(structuredClone(token));
  raw.getUser.mockResolvedValue(structuredClone(user));
  raw.createCustomToken.mockResolvedValue("synthetic-custom-token");
  blocked.mockResolvedValue(false);
});

describe("mandatory TOTP boundary for every application token", () => {
  it("always checks revocation, even if the caller omits or disables that option", async () => {
    await expect(auth.verifyIdToken("signed-token", false)).resolves.toEqual(token);
    expect(raw.verifyIdToken).toHaveBeenCalledWith("signed-token", true);
  });
  it.each(["disabled", "unverified", "no-factor", "sms-only", "admin-without-totp"])("blocks %s accounts before application data can be accessed", async kind => {
    const account: Record<string, unknown> = structuredClone(user);
    if (kind === "disabled") account.disabled = true;
    if (kind === "unverified") account.emailVerified = false;
    if (kind.includes("factor") || kind.includes("totp")) account.multiFactor = { enrolledFactors: [] };
    if (kind === "sms-only") account.multiFactor = { enrolledFactors: [{ factorId: "phone" } as never] };
    if (kind === "admin-without-totp") account.customClaims = { admin: true, adminRole: "owner" };
    raw.getUser.mockResolvedValue(account);
    await expect(auth.verifyIdToken("token")).rejects.toMatchObject({ code: "auth/account-blocked" });
    await expect(auth.createCustomToken(user.uid)).rejects.toMatchObject({ code: "auth/account-blocked" });
    expect(raw.createCustomToken).not.toHaveBeenCalled();
  });
  it.each([
    { sign_in_provider: "password" },
    { sign_in_provider: "password", sign_in_second_factor: "phone" },
    { sign_in_provider: "custom" },
  ])("rejects a signed token without the required proof: %j", async firebase => {
    raw.verifyIdToken.mockResolvedValue({ ...token, firebase });
    await expect(auth.verifyIdToken("token")).rejects.toMatchObject({ code: "auth/mfa-reauth-required" });
  });
  it("does not accept the custom proof on a password token", async () => {
    raw.verifyIdToken.mockResolvedValue({ ...token, app_totp_enrolled: true, firebase: { sign_in_provider: "password" } });
    await expect(auth.verifyIdToken("token")).rejects.toMatchObject({ code: "auth/mfa-reauth-required" });
  });
  it("accepts passkey tokens only with signed proof and a currently eligible account", async () => {
    raw.verifyIdToken.mockResolvedValue({ ...token, app_totp_enrolled: true, firebase: { sign_in_provider: "custom" } } as unknown as DecodedIdToken);
    await expect(auth.verifyIdToken("token")).resolves.toMatchObject({ uid: user.uid });
    raw.getUser.mockResolvedValue({ ...user, multiFactor: { enrolledFactors: [] } });
    await expect(auth.verifyIdToken("same-token")).rejects.toMatchObject({ code: "auth/account-blocked" });
  });
  it("adds custom proof only after checking the live account and persistent block", async () => {
    await auth.createCustomToken(user.uid, { otherClaim: true, app_totp_enrolled: false });
    expect(raw.createCustomToken).toHaveBeenCalledWith(user.uid, { otherClaim: true, app_totp_enrolled: true });
    blocked.mockResolvedValue(true);
    await expect(auth.createCustomToken(user.uid)).rejects.toMatchObject({ code: "auth/account-blocked" });
    await expect(auth.verifyIdToken("token")).rejects.toMatchObject({ code: "auth/account-blocked" });
  });
  it("fails closed on unavailable account or block storage", async () => {
    raw.getUser.mockRejectedValueOnce(new Error("unavailable"));
    await expect(auth.verifyIdToken("token")).rejects.toThrow();
    blocked.mockRejectedValueOnce(new Error("unavailable"));
    await expect(auth.verifyIdToken("token")).rejects.toThrow();
  });
  it("never reads account state for an invalid signature", async () => {
    raw.verifyIdToken.mockRejectedValueOnce(new Error("invalid signature"));
    await expect(auth.verifyIdToken("forged")).rejects.toThrow();
    expect(raw.getUser).not.toHaveBeenCalled();
    expect(blocked).not.toHaveBeenCalled();
  });
});
