// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: { name: "isolated-setup" },
  auth: { currentUser: { emailVerified: true } },
  initApp: vi.fn(), initAuth: vi.fn(), login: vi.fn(), session: vi.fn(), secret: vi.fn(), enroll: vi.fn(), signOut: vi.fn(), deleteApp: vi.fn(),
}));
vi.mock("@/app/firebase-app", () => ({ firebaseApp: { options: { projectId: "synthetic" } } }));
vi.mock("firebase/app", () => ({ initializeApp: mocks.initApp, deleteApp: mocks.deleteApp }));
vi.mock("firebase/auth", () => ({
  initializeAuth: mocks.initAuth, inMemoryPersistence: "memory-only", signInWithEmailAndPassword: mocks.login, signOut: mocks.signOut,
  multiFactor: () => ({ getSession: mocks.session, enroll: mocks.enroll }),
  TotpMultiFactorGenerator: { generateSecret: mocks.secret, assertionForEnrollment: (secret: unknown, code: string) => ({ secret, code }) },
}));
import TotpRecoveryPage from "./page";

describe("administrator-assisted recovery remains isolated from application sign-in", () => {
  let root: Root, container: HTMLDivElement;
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Recovery must not access application APIs")));
    mocks.auth.currentUser = { emailVerified: true };
    mocks.initApp.mockReturnValue(mocks.app);
    mocks.initAuth.mockReturnValue(mocks.auth);
    mocks.login.mockResolvedValue({ user: mocks.auth.currentUser });
    mocks.session.mockResolvedValue("synthetic-session");
    mocks.secret.mockResolvedValue({ secretKey: "SYNTHETIC-SETUP-KEY" });
    mocks.enroll.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue(undefined);
    mocks.deleteApp.mockResolvedValue(undefined);
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    await act(async () => root.render(<TotpRecoveryPage />));
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function input(id: string, value: string) {
    await act(async () => {
      const field = container.querySelector<HTMLInputElement>(`#${id}`)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function submit() {
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  }
  it("waits for explicit submission, uses memory-only auth and finishes without an application session", async () => {
    expect(mocks.initApp).not.toHaveBeenCalled();
    await input("recovery-email", "synthetic@example.test");
    await input("recovery-password", "synthetic-password");
    await submit();
    expect(mocks.initAuth).toHaveBeenCalledWith(mocks.app, { persistence: "memory-only" });
    expect(mocks.login).toHaveBeenCalledWith(mocks.auth, "synthetic@example.test", "synthetic-password");
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(container.querySelector("#recovery-password")).toBeNull();
    await input("recovery-code", "123456"); await submit();
    expect(mocks.enroll).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
    expect(container.textContent).toContain("Požádej administrátora o odblokování účtu");
    expect(container.textContent).not.toContain("SYNTHETIC-SETUP-KEY");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never generates a secret for an unverified email", async () => {
    mocks.auth.currentUser.emailVerified = false;
    await submit();
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Kontaktuj administrátora");
  });
  it.each(["auth/multi-factor-auth-required", "auth/user-disabled"])("keeps %s behind administrator recovery", async code => {
    mocks.login.mockRejectedValue({ code, message: "private synthetic token" });
    await submit();
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(container.textContent).toContain("administrátora");
    expect(container.textContent).not.toContain("private synthetic token");
    expect(fetch).not.toHaveBeenCalled();
  });
});
