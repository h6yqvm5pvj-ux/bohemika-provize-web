import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {},
  startAuthentication: vi.fn(),
  signInWithCustomToken: vi.fn(),
  cancelCeremony: vi.fn(),
}));
vi.mock("@/app/firebase", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: vi.fn() }));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: mocks.startAuthentication, WebAuthnAbortService: { cancelCeremony: mocks.cancelCeremony } }));
vi.mock("firebase/auth", () => ({ signInWithCustomToken: mocks.signInWithCustomToken }));

import { PASSKEY_REQUEST_TIMEOUT_MS, signInWithPasskey } from "./passkeys";

describe("passkey sign-in", () => {
  const assertion = { id: "test-credential", response: { signature: "test-signature" } };
  const credential = { user: { uid: "verified-user" } };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.startAuthentication.mockResolvedValue(assertion);
    mocks.signInWithCustomToken.mockResolvedValue(credential);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("aborts a stalled options request and ignores its late response, then allows a retry", async () => {
    vi.useFakeTimers();
    let lateResponse!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => new Promise(resolve => { lateResponse = resolve; }));
    const failure = expect(signInWithPasskey()).rejects.toMatchObject({ code: "auth/timeout" });
    await vi.advanceTimersByTimeAsync(PASSKEY_REQUEST_TIMEOUT_MS);
    await failure;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    lateResponse(Response.json({ ok: true, options: { challenge: "expired" } }));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.startAuthentication).not.toHaveBeenCalled();
    expect(mocks.signInWithCustomToken).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(Response.json({ ok: true, options: { challenge: "fresh" } }))
      .mockResolvedValueOnce(Response.json({ ok: true, customToken: "verified" }));
    await expect(signInWithPasskey()).resolves.toBe(credential);
  });

  it("also limits reading an unfinished response body", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: () => new Promise(() => {}) } as unknown as Response);
    const failure = expect(signInWithPasskey()).rejects.toMatchObject({ code: "auth/timeout" });
    await vi.advanceTimersByTimeAsync(PASSKEY_REQUEST_TIMEOUT_MS);
    await failure;
    expect(mocks.startAuthentication).not.toHaveBeenCalled();
  });

  it("cancels the native prompt without allowing a late assertion to sign in", async () => {
    let lateAssertion!: (value: typeof assertion) => void;
    mocks.startAuthentication.mockReturnValue(new Promise(resolve => { lateAssertion = resolve; }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true, options: { challenge: "test" } }));
    const controller = new AbortController();
    const failure = expect(signInWithPasskey({ signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(mocks.startAuthentication).toHaveBeenCalledOnce());
    controller.abort();
    await failure;
    expect(mocks.cancelCeremony).toHaveBeenCalledOnce();
    lateAssertion(assertion);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.signInWithCustomToken).not.toHaveBeenCalled();
  });

  it("times out server verification before calling Firebase sign-in", async () => {
    vi.useFakeTimers();
    const stages = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ ok: true, options: { challenge: "test" } }))
      .mockImplementationOnce(() => new Promise(() => {}));
    const failure = expect(signInWithPasskey({ onStage: stages })).rejects.toMatchObject({ code: "auth/timeout" });
    await vi.advanceTimersByTimeAsync(0);
    expect(stages.mock.calls.map(([stage]) => stage)).toEqual(["preparation", "verification", "session"]);
    await vi.advanceTimersByTimeAsync(PASSKEY_REQUEST_TIMEOUT_MS);
    await failure;
    expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(true);
    expect(mocks.signInWithCustomToken).not.toHaveBeenCalled();
  });

  it("stops a native prompt that never settles, even if the browser ignores its timeout", async () => {
    vi.useFakeTimers();
    mocks.startAuthentication.mockReturnValue(new Promise(() => {}));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true, options: { challenge: "test" } }));
    const failure = expect(signInWithPasskey()).rejects.toMatchObject({ code: "auth/timeout" });
    await vi.advanceTimersByTimeAsync(60_000);
    await failure;
    expect(mocks.cancelCeremony).toHaveBeenCalledOnce();
    expect(mocks.signInWithCustomToken).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives a Czech connection error when the local server is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(signInWithPasskey()).rejects.toMatchObject({ code: "auth/network-request-failed", message: expect.stringContaining("Server přihlášení není dostupný") });
    expect(mocks.startAuthentication).not.toHaveBeenCalled();
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
