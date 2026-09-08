// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const cachedUser = {
    uid: "cached-user",
    email: "cached@example.test",
    getIdToken: vi.fn().mockResolvedValue("cached-token"),
  };
  return {
    cachedUser,
    auth: { currentUser: cachedUser as typeof cachedUser | null },
    listeners: new Set<(user: typeof cachedUser | null) => void>(),
    router: { replace: vi.fn() },
    passkey: vi.fn(),
    password: vi.fn(),
    resolveMfa: vi.fn(),
    profile: vi.fn(),
    signOut: vi.fn(),
    mfaPing: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("../firebase", () => ({ auth: mocks.auth }));
vi.mock("firebase/auth", () => ({
  // Model restoration and cross-tab auth events as well as explicit sign-ins.
  onAuthStateChanged: (_auth: unknown, listener: (user: typeof mocks.cachedUser | null) => void) => {
    mocks.listeners.add(listener);
    queueMicrotask(() => listener(mocks.auth.currentUser));
    return () => mocks.listeners.delete(listener);
  },
  signInWithEmailAndPassword: mocks.password,
  signOut: mocks.signOut,
  sendPasswordResetEmail: vi.fn(),
  FactorId: { TOTP: "totp" },
  TotpMultiFactorGenerator: {
    assertionForSignIn: (uid: string, code: string) => ({ uid, code }),
  },
  getMultiFactorResolver: () => ({
    hints: [{ factorId: "totp", uid: "totp-factor" }],
    resolveSignIn: mocks.resolveMfa,
  }),
}));
vi.mock("@/app/lib/passkeys", () => ({
  getPasskeyAvailability: async () => ({ supported: true, platformAvailable: true }),
  signInWithPasskey: mocks.passkey,
  resolvePasskeyErrorMessage: () => "Ověření bylo zrušené nebo vypršel časový limit.",
}));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: mocks.profile }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.mfaPing }));

import LoginPage from "./page";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const freshUser = {
  uid: "fresh-user",
  email: "fresh@example.test",
  getIdToken: vi.fn().mockResolvedValue("fresh-token"),
};

describe("login verification boundary", () => {
  let root: Root;
  let container: HTMLDivElement;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.listeners.clear();
    mocks.auth.currentUser = mocks.cachedUser;
    mocks.passkey.mockReset();
    mocks.password.mockReset().mockResolvedValue({ user: freshUser });
    mocks.resolveMfa.mockReset().mockResolvedValue({ user: freshUser });
    mocks.profile.mockReset().mockResolvedValue({ hasProfile: false });
    mocks.signOut.mockImplementation(async () => { mocks.auth.currentUser = null; });
    mocks.mfaPing.mockResolvedValue({ ok: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<LoginPage />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const sessionPosts = () => fetchMock.mock.calls.filter(
    ([url, init]) => url === "/api/auth/session" && init?.method === "POST"
  );
  const restoreCachedUser = async () => {
    await act(async () => {
      mocks.auth.currentUser = mocks.cachedUser;
      for (const listener of mocks.listeners) listener(mocks.cachedUser);
    });
  };
  const startPasskey = async () => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Přihlásit přes přístupový klíč"
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
  };
  const changeInput = async (selector: string, value: string) => {
    const input = container.querySelector<HTMLInputElement>(selector)!;
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const submit = async () => {
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  };
  const enterPassword = async () => {
    await changeInput("#login-email", "fresh@example.test");
    await changeInput("#login-password", "test-password");
  };
  const expectNotLoggedIn = () => {
    expect(sessionPosts()).toHaveLength(0);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  };

  it("does not turn a persisted Firebase user into a new app session on mount", async () => {
    await restoreCachedUser();
    expectNotLoggedIn();
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it("waits for the current passkey verification despite cached auth events and competing submits", async () => {
    const verification = deferred<{ user: typeof freshUser }>();
    mocks.passkey.mockReturnValue(verification.promise);
    await enterPassword();
    await startPasskey();
    await restoreCachedUser();
    await submit();
    expectNotLoggedIn();
    expect(mocks.passkey).toHaveBeenCalledTimes(1);
    expect(mocks.password).not.toHaveBeenCalled();

    await act(async () => verification.resolve({ user: freshUser }));
    expect(sessionPosts()).toHaveLength(1);
    expect(new Headers(sessionPosts()[0][1]?.headers).get("Authorization")).toBe("Bearer fresh-token");
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("stays logged out when the passkey prompt is cancelled and allows another attempt", async () => {
    const verification = deferred<{ user: typeof freshUser }>();
    mocks.passkey.mockReturnValueOnce(verification.promise);
    await startPasskey();
    await restoreCachedUser();
    await act(async () => verification.reject(new DOMException("Cancelled", "NotAllowedError")));
    expectNotLoggedIn();
    expect(container.textContent).toContain("Ověření bylo zrušené");

    mocks.passkey.mockResolvedValueOnce({ user: freshUser });
    await startPasskey();
    expect(sessionPosts()).toHaveLength(1);
    expect(mocks.router.replace).toHaveBeenCalledTimes(1);
  });

  it("waits for the server session and preserves the trusted-device choice", async () => {
    const session = deferred<Response>();
    fetchMock.mockImplementation(async (url, init) => {
      if (url === "/api/auth/session" && init?.method === "POST") return session.promise;
      return Response.json({ ok: true });
    });
    mocks.passkey.mockResolvedValue({ user: freshUser });
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await startPasskey();
    expect(sessionPosts()).toHaveLength(1);
    expect(JSON.parse(String(sessionPosts()[0][1]?.body))).toEqual({ rememberThisDevice: true });
    expect(mocks.router.replace).not.toHaveBeenCalled();
    await act(async () => session.resolve(Response.json({ ok: true })));
    expect(mocks.router.replace).toHaveBeenCalledTimes(1);
  });

  it("does not navigate when the server rejects session creation", async () => {
    fetchMock.mockImplementation(async (url, init) => Response.json(
      url === "/api/auth/session" && init?.method === "POST" ? { error: "Denied" } : { ok: true },
      { status: url === "/api/auth/session" && init?.method === "POST" ? 401 : 200 }
    ));
    mocks.passkey.mockResolvedValue({ user: freshUser });
    await startPasskey();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalled();
    expect(container.textContent).toContain("Nepodařilo se bezpečně dokončit přihlášení");
  });

  it("still applies the account lockout after a verified passkey", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: false, locked: true, retryAfterSeconds: 60 }));
    mocks.passkey.mockResolvedValue({ user: freshUser });
    await startPasskey();
    expectNotLoggedIn();
    expect(mocks.signOut).toHaveBeenCalled();
    expect(container.textContent).toContain("Příliš mnoho neúspěšných pokusů");
  });

  it("completes password login using the returned credential", async () => {
    await enterPassword();
    await submit();
    expect(mocks.password).toHaveBeenCalledExactlyOnceWith(mocks.auth, "fresh@example.test", "test-password");
    expect(sessionPosts()).toHaveLength(1);
    expect(new Headers(sessionPosts()[0][1]?.headers).get("Authorization")).toBe("Bearer fresh-token");
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("does not let cached Firebase state skip 2FA, including after an incorrect code", async () => {
    mocks.password.mockRejectedValue({ code: "auth/multi-factor-auth-required" });
    await enterPassword();
    await submit();
    expect(container.textContent).toContain("Přihlášení pokračuje přes 2FA");
    await restoreCachedUser();
    expectNotLoggedIn();

    await changeInput("#login-otp", "123456");
    mocks.resolveMfa.mockRejectedValueOnce({ code: "auth/invalid-verification-code" });
    await submit();
    await restoreCachedUser();
    expectNotLoggedIn();
    expect(container.textContent).toContain("Neplatný 2FA kód");

    await changeInput("#login-otp", "654321");
    await submit();
    expect(mocks.resolveMfa).toHaveBeenLastCalledWith({ uid: "totp-factor", code: "654321" });
    expect(sessionPosts()).toHaveLength(1);
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("does not complete a timed-out password attempt when Firebase finishes it later", async () => {
    vi.useFakeTimers();
    const verification = deferred<{ user: typeof freshUser }>();
    mocks.password.mockReturnValue(verification.promise);
    await enterPassword();
    await submit();
    await act(async () => { await vi.advanceTimersByTimeAsync(20001); });
    expect(container.textContent).toContain("Přihlášení trvá příliš dlouho");
    await act(async () => verification.resolve({ user: freshUser }));
    await restoreCachedUser();
    expectNotLoggedIn();
  });
});
