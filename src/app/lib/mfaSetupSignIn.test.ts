import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: {}, signIn: vi.fn(), signOut: vi.fn(), session: vi.fn(), clear: vi.fn(), token: vi.fn() }));
vi.mock("firebase/auth", () => ({ signInWithCustomToken: mocks.signIn, signOut: mocks.signOut }));
vi.mock("@/app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("./authSession", () => ({ createServerSessionFromToken: mocks.session, clearServerSession: mocks.clear }));
import { signInAfterMfaSetup } from "./mfaSetupSignIn";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.token.mockResolvedValue("synthetic-id-token");
  mocks.signIn.mockResolvedValue({ user: { getIdToken: mocks.token } });
});
describe("application sign-in after confirmed email and TOTP", () => {
  it("exchanges the server proof and creates a session with the resulting ID token", async () => {
    await signInAfterMfaSetup("synthetic-custom-token");
    expect(mocks.signIn).toHaveBeenCalledWith(mocks.auth, "synthetic-custom-token");
    expect(mocks.session).toHaveBeenCalledWith("synthetic-id-token");
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("requires normal login when enrollment succeeded without a sign-in token", async () => {
    await expect(signInAfterMfaSetup(null)).rejects.toThrow("2FA je nastavené");
    expect(mocks.signIn).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each(["signIn", "session"] as const)("cleans up both sessions if %s fails", async step => {
    mocks[step].mockRejectedValue(new Error("unavailable"));
    await expect(signInAfterMfaSetup("synthetic-custom-token")).rejects.toThrow();
    expect(mocks.clear).toHaveBeenCalledOnce(); expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
  });
});
