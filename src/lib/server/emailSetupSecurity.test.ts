import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { getMfaEnrollmentUser } from "./emailSetupSecurity";
const verifyIdToken = vi.fn(), getUser = vi.fn(), get = vi.fn();
const auth = { verifyIdToken, getUser } as unknown as Auth;
const db = { collection: () => ({ doc: () => ({ get }) }) } as unknown as Firestore;
const now = () => Math.floor(Date.now() / 1000);
const decoded = () => ({ uid: "synthetic", email: "synthetic@example.test", auth_time: now(), firebase: { sign_in_provider: "password" } });
const user = () => ({ uid: "synthetic", email: "synthetic@example.test", emailVerified: true, disabled: false, multiFactor: { enrolledFactors: [] } });
beforeEach(() => { vi.resetAllMocks(); verifyIdToken.mockResolvedValue(decoded()); getUser.mockResolvedValue(user()); get.mockResolvedValue({ data: () => undefined }); });
describe("narrow MFA enrollment authentication", () => {
  it("accepts only a recently password-authenticated verified account with no existing factor", async () => {
    expect(await getMfaEnrollmentUser(auth, db, "token")).toMatchObject({ uid: "synthetic", emailVerified: true, authTime: now() });
    expect(verifyIdToken).toHaveBeenCalledWith("token", true);
  });
  it.each(["custom", "stale", "future", "no-email", "disabled", "email-changed", "existing-totp", "existing-phone", "block", "revoked"])("rejects %s", async reason => {
    const token = decoded(); const live: any = user();
    if (reason === "custom") token.firebase.sign_in_provider = "custom";
    if (reason === "stale") token.auth_time = now() - 601;
    if (reason === "future") token.auth_time = now() + 61;
    if (reason === "no-email") token.email = "";
    if (reason === "disabled") live.disabled = true;
    if (reason === "email-changed") live.email = "someoneelse@example.test";
    if (reason === "existing-totp") live.multiFactor.enrolledFactors = [{ factorId: "totp" }];
    if (reason === "existing-phone") live.multiFactor.enrolledFactors = [{ factorId: "phone" }];
    if (reason === "block") get.mockResolvedValue({ data: () => ({ reason: "admin-block" }) });
    if (reason === "revoked") verifyIdToken.mockRejectedValue(new Error("revoked"));
    else verifyIdToken.mockResolvedValue(token);
    getUser.mockResolvedValue(live);
    await expect(getMfaEnrollmentUser(auth, db, "token")).rejects.toThrow();
  });
  it("accepts an unverified address only for the inbox-code setup flow", async () => {
    getUser.mockResolvedValue({ ...user(), emailVerified: false });
    await expect(getMfaEnrollmentUser(auth, db, "token")).resolves.toMatchObject({ emailVerified: false });
  });
  it("permits setup under a missing-TOTP block but never ignores a revocation barrier", async () => {
    get.mockResolvedValue({ data: () => ({ reason: "missing-totp" }) });
    await expect(getMfaEnrollmentUser(auth, db, "token")).resolves.toMatchObject({ uid: "synthetic" });
    get.mockResolvedValue({ data: () => ({ reason: "missing-totp", revocation: { validAfterSeconds: now() + 1, generation: "00000000-0000-4000-8000-000000000001", pendingOperations: {} } }) });
    await expect(getMfaEnrollmentUser(auth, db, "token")).rejects.toThrow();
  });
});
