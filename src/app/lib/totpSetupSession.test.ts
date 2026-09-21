import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

const mocks = vi.hoisted(() => ({
  initApp: vi.fn(), initAuth: vi.fn(), transfer: vi.fn(), signOut: vi.fn(), deleteApp: vi.fn(),
}));
vi.mock("@/app/firebase-app", () => ({ firebaseApp: { options: { projectId: "synthetic" } } }));
vi.mock("firebase/app", () => ({ initializeApp: mocks.initApp, deleteApp: mocks.deleteApp }));
vi.mock("firebase/auth", () => ({
  initializeAuth: mocks.initAuth, inMemoryPersistence: "memory-only", updateCurrentUser: mocks.transfer, signOut: mocks.signOut,
}));
import { discardPendingTotpSetupSession, prepareTotpSetupSession, takePendingTotpSetupSession } from "./totpSetupSession";

const user = { uid: "synthetic", email: "synthetic@example.test" } as User;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  mocks.initApp.mockImplementation((_options, name) => ({ name }));
  mocks.initAuth.mockImplementation(app => ({ app, currentUser: null }));
  mocks.transfer.mockImplementation(async (auth, source) => { auth.currentUser = { ...source }; });
  mocks.signOut.mockResolvedValue(undefined);
  mocks.deleteApp.mockResolvedValue(undefined);
});
afterEach(async () => { await discardPendingTotpSetupSession(); vi.useRealTimers(); });

describe("one-time memory-only handoff from password login to TOTP setup", () => {
  it("copies only the verified Firebase sign-in to an isolated Auth instance", async () => {
    await prepareTotpSetupSession(user);
    const session = takePendingTotpSetupSession()!;
    expect(mocks.initAuth).toHaveBeenCalledWith(session.app, { persistence: "memory-only" });
    expect(mocks.transfer).toHaveBeenCalledWith(session.auth, user);
    expect(session.auth.currentUser?.uid).toBe(user.uid);
    expect(session.auth.currentUser).not.toBe(user);
    expect(takePendingTotpSetupSession()).toBeNull();
    await vi.advanceTimersByTimeAsync(60_001);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it("cleans up a transfer that never reaches the setup page", async () => {
    await prepareTotpSetupSession(user);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(takePendingTotpSetupSession()).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.deleteApp).toHaveBeenCalledOnce();
  });
  it("discards the previous pending account before preparing another", async () => {
    await prepareTotpSetupSession(user);
    const previous = mocks.initAuth.mock.results[0].value;
    await prepareTotpSetupSession({ ...user, uid: "second" } as User);
    expect(mocks.signOut).toHaveBeenCalledWith(previous);
    expect(takePendingTotpSetupSession()?.auth.currentUser?.uid).toBe("second");
  });
  it("cleans up if Firebase rejects the transfer", async () => {
    mocks.transfer.mockRejectedValue(new Error("transfer failed"));
    await expect(prepareTotpSetupSession(user)).rejects.toThrow("transfer failed");
    expect(takePendingTotpSetupSession()).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.deleteApp).toHaveBeenCalledOnce();
  });
  it("rejects a missing or mismatched user after the transfer", async () => {
    mocks.transfer.mockImplementation(async auth => { auth.currentUser = { uid: "different" }; });
    await expect(prepareTotpSetupSession(user)).rejects.toThrow("not transferred");
    expect(takePendingTotpSetupSession()).toBeNull();
    expect(mocks.deleteApp).toHaveBeenCalledOnce();
  });
});
