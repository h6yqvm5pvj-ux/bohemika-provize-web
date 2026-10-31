import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("./authenticatedApi", () => ({ fetchAuthedJsonOrThrow: request }));
import { removeTotp } from "./mfaRemoval";
const user = { uid: "synthetic" } as User;
const challengeId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks(); request.mockResolvedValueOnce({ challengeId, waitMs: 0 }).mockResolvedValue({ removed: true });
});
afterEach(() => vi.useRealTimers());
describe("server-owned TOTP removal transport", () => {
  it("reauthenticates after server preparation, then completes only that challenge without cookies", async () => {
    const reauthenticate = vi.fn(async () => {
      expect(request).toHaveBeenCalledOnce(); return true;
    });
    await expect(removeTotp(user, reauthenticate)).resolves.toBe(true);
    expect(request.mock.calls.map(call => JSON.parse(call[2].body))).toEqual([{ action: "prepare" }, { action: "complete", challengeId }]);
    expect(request).toHaveBeenLastCalledWith(user, "/api/auth/mfa-removal", expect.objectContaining({ credentials: "omit", redirect: "error" }));
  });
  it("stops before removal when password/TOTP confirmation fails", async () => {
    await expect(removeTotp(user, async () => false)).resolves.toBe(false); expect(request).toHaveBeenCalledOnce();
  });
  it("waits for the server authentication-time boundary before reauthentication", async () => {
    vi.useFakeTimers(); request.mockReset().mockResolvedValueOnce({ challengeId, waitMs: 1150 }).mockResolvedValue({ removed: true });
    const reauthenticate = vi.fn(async () => true), pending = removeTotp(user, reauthenticate);
    await vi.advanceTimersByTimeAsync(1149); expect(reauthenticate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await expect(pending).resolves.toBe(true);
  });
  it("does not reauthenticate or remove a factor when preparation fails", async () => {
    request.mockReset().mockRejectedValue(new Error("unavailable")); const reauthenticate = vi.fn();
    await expect(removeTotp(user, reauthenticate)).rejects.toThrow("unavailable"); expect(reauthenticate).not.toHaveBeenCalled();
  });
  it.each([{ challengeId: "foreign", waitMs: 0 }, { challengeId, waitMs: 10000 }])("rejects invalid challenge responses", async challenge => {
    request.mockReset().mockResolvedValue(challenge); const reauthenticate = vi.fn();
    await expect(removeTotp(user, reauthenticate)).rejects.toThrow(); expect(reauthenticate).not.toHaveBeenCalled();
  });
  it("requires positive server acknowledgement before reporting removal", async () => {
    request.mockReset().mockResolvedValueOnce({ challengeId, waitMs: 0 }).mockResolvedValue({ removed: false });
    await expect(removeTotp(user, async () => true)).rejects.toThrow("potvrdit");
  });
});
