import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("./authEmailRequest", () => ({ requestVerificationEmail: send }));
import { ensureEmailVerifiedForMfaEnrollment } from "./mfaEmailVerification";

describe("MFA requires inbox verification", () => {
  const makeUser = (emailVerified = false) => ({
    emailVerified,
    reload: vi.fn().mockResolvedValue(undefined),
    getIdToken: vi.fn().mockResolvedValue("synthetic-token"),
  });
  beforeEach(() => {
    send.mockReset().mockResolvedValue(false);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected API bypass"); }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("requests server delivery and stops enrollment while unverified", async () => {
    const user = makeUser();
    expect(await ensureEmailVerifiedForMfaEnrollment(user as unknown as User)).toBe(false);
    expect(send).toHaveBeenCalledExactlyOnceWith(user);
    expect(user.emailVerified).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recognizes verification in another tab and refreshes claims before proceeding", async () => {
    const user = makeUser();
    user.reload.mockImplementation(async () => { user.emailVerified = true; });
    expect(await ensureEmailVerifiedForMfaEnrollment(user as unknown as User)).toBe(true);
    expect(user.getIdToken).toHaveBeenCalledExactlyOnceWith(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not trust a stale verified flag after Firebase reload", async () => {
    const user = makeUser(true);
    user.reload.mockImplementation(async () => { user.emailVerified = false; });
    expect(await ensureEmailVerifiedForMfaEnrollment(user as unknown as User)).toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });

  it("fails closed when refreshing the verified token fails", async () => {
    const user = makeUser(true);
    user.getIdToken.mockRejectedValue({ code: "auth/user-token-expired" });
    await expect(ensureEmailVerifiedForMfaEnrollment(user as unknown as User)).rejects.toThrow("Přihlas se znovu");
    expect(send).not.toHaveBeenCalled();
  });

  it("shows delivery errors without logging tokens or addresses", async () => {
    send.mockRejectedValue({ code: "auth/too-many-requests", message: "synthetic@example.test token=private" });
    await expect(ensureEmailVerifiedForMfaEnrollment(makeUser() as unknown as User)).rejects.toThrow("Příliš mnoho žádostí");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/synthetic@|private/);
  });

  it("does not treat a delivery API acknowledgement as verified Firebase claims", async () => {
    send.mockResolvedValue(true);
    const user = makeUser();
    expect(await ensureEmailVerifiedForMfaEnrollment(user as unknown as User)).toBe(false);
    expect(user.reload).toHaveBeenCalledTimes(2);
    expect(user.getIdToken).not.toHaveBeenCalled();
  });

  it("refreshes Firebase claims when verification completes during the request", async () => {
    const user = makeUser();
    send.mockImplementation(async () => { user.emailVerified = true; return true; });
    expect(await ensureEmailVerifiedForMfaEnrollment(user as unknown as User)).toBe(true);
    expect(user.getIdToken).toHaveBeenCalledExactlyOnceWith(true);
  });
});
