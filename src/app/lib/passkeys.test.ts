import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {},
  startAuthentication: vi.fn(),
  signInWithCustomToken: vi.fn(),
}));
vi.mock("@/app/firebase", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: vi.fn() }));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: mocks.startAuthentication }));
vi.mock("firebase/auth", () => ({ signInWithCustomToken: mocks.signInWithCustomToken }));

import { signInWithPasskey } from "./passkeys";

describe("passkey sign-in", () => {
  const assertion = { id: "test-credential", response: { signature: "test-signature" } };
  const credential = { user: { uid: "verified-user" } };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.startAuthentication.mockResolvedValue(assertion);
    mocks.signInWithCustomToken.mockResolvedValue(credential);
  });

  it("returns the Firebase credential only after native and server verification", async () => {
    let confirmNative!: (value: typeof assertion) => void;
    let confirmServer!: (value: Response) => void;
    mocks.startAuthentication.mockReturnValue(new Promise((resolve) => { confirmNative = resolve; }));
    const serverVerification = new Promise<Response>((resolve) => { confirmServer = resolve; });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ ok: true, options: { challenge: "test-challenge" } }))
      .mockReturnValueOnce(serverVerification);

    try {
      const login = signInWithPasskey();
      await vi.waitFor(() => expect(mocks.startAuthentication).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mocks.signInWithCustomToken).not.toHaveBeenCalled();

      confirmNative(assertion);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(mocks.signInWithCustomToken).not.toHaveBeenCalled();
      confirmServer(Response.json({ ok: true, customToken: "verified-custom-token" }));

      await expect(login).resolves.toBe(credential);
      expect(mocks.signInWithCustomToken).toHaveBeenCalledExactlyOnceWith(mocks.auth, "verified-custom-token");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("does not sign in when the native prompt is cancelled", async () => {
    const error = new DOMException("Cancelled", "NotAllowedError");
    mocks.startAuthentication.mockRejectedValue(error);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ ok: true, options: { challenge: "test-challenge" } })
    );
    try {
      await expect(signInWithPasskey()).rejects.toBe(error);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mocks.signInWithCustomToken).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("does not sign in when the server rejects the assertion", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ ok: true, options: { challenge: "test-challenge" } }))
      .mockResolvedValueOnce(Response.json({ error: "Ověření klíče selhalo." }, { status: 401 }));
    try {
      await expect(signInWithPasskey()).rejects.toThrow("Ověření klíče selhalo.");
      expect(mocks.signInWithCustomToken).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
