// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: { name: "isolated-setup" },
  auth: { currentUser: { emailVerified: true, getIdToken: vi.fn(), reload: vi.fn() } },
  reload: vi.fn(), sendEmail: vi.fn(),
  takeSetup: vi.fn(),
  initApp: vi.fn(), initAuth: vi.fn(), login: vi.fn(), session: vi.fn(), secret: vi.fn(), enroll: vi.fn(), signOut: vi.fn(), deleteApp: vi.fn(),
}));
vi.mock("@/app/firebase-app", () => ({ firebaseApp: { options: { projectId: "synthetic" } } }));
vi.mock("@/app/lib/authEmailRequest", () => ({ requestVerificationEmail: mocks.sendEmail }));
vi.mock("@/app/lib/totpSetupSession", () => ({ takePendingTotpSetupSession: mocks.takeSetup }));
vi.mock("firebase/app", () => ({ initializeApp: mocks.initApp, deleteApp: mocks.deleteApp }));
vi.mock("firebase/auth", () => ({
  initializeAuth: mocks.initAuth, inMemoryPersistence: "memory-only", signInWithEmailAndPassword: mocks.login, signOut: mocks.signOut,
  reload: mocks.reload, sendEmailVerification: mocks.sendEmail,
  multiFactor: () => ({ getSession: mocks.session, enroll: mocks.enroll }),
  TotpMultiFactorGenerator: { generateSecret: mocks.secret, assertionForEnrollment: (secret: unknown, code: string) => ({ secret, code }) },
}));
import TotpRecoveryPage from "./page";

describe("administrator-assisted recovery remains isolated from application sign-in", () => {
  let root: Root, container: HTMLDivElement;
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Recovery must not access business APIs")));
    mocks.auth.currentUser = { emailVerified: true, getIdToken: vi.fn().mockResolvedValue("synthetic-token"), reload: mocks.reload };
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
  async function arriveFromLogin() {
    await act(async () => root.unmount());
    mocks.takeSetup.mockReturnValueOnce({ auth: mocks.auth, app: mocks.app });
    root = createRoot(container);
    await act(async () => root.render(<StrictMode><TotpRecoveryPage /></StrictMode>));
  }
  it("starts TOTP after the normal password login without requesting credentials again", async () => {
    await arriveFromLogin();
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.initAuth).not.toHaveBeenCalled();
    expect(mocks.secret).toHaveBeenCalledOnce();
    expect(container.querySelector("#recovery-password")).toBeNull();
    expect(container.querySelector("#recovery-code")).not.toBeNull();
    await input("recovery-code", "123456"); await submit();
    expect(mocks.enroll).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requests inbox verification for an unverified user arriving from normal login", async () => {
    mocks.auth.currentUser.emailVerified = false;
    await arriveFromLogin();
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledExactlyOnceWith(mocks.auth.currentUser);
    expect(container.querySelector("#recovery-password")).toBeNull();
    expect(container.textContent).toContain("Ověřovací e-mail byl vyžádán");
    expect(fetch).not.toHaveBeenCalled();
  });
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
  it("requests inbox verification without creating a secret or an application session", async () => {
    mocks.auth.currentUser.emailVerified = false;
    await submit();
    expect(mocks.sendEmail).toHaveBeenCalledWith(mocks.auth.currentUser);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Ověřovací e-mail byl vyžádán");
    expect(container.querySelector("#recovery-password")).toBeNull();
    await submit();
    expect(mocks.reload).toHaveBeenCalledTimes(2);
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("E-mail ještě není ověřený");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("continues to TOTP only after Firebase confirms inbox verification", async () => {
    mocks.auth.currentUser.emailVerified = false;
    await submit();
    mocks.reload.mockImplementation(async () => { mocks.auth.currentUser.emailVerified = true; });
    await submit();
    expect(mocks.auth.currentUser.getIdToken).toHaveBeenCalledWith(true);
    expect(mocks.secret).toHaveBeenCalledOnce();
    await input("recovery-code", "123456"); await submit();
    expect(mocks.enroll).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
    expect(container.textContent).toContain("Požádej administrátora o odblokování účtu");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("allows retrying a failed verification email without claiming it was sent", async () => {
    mocks.auth.currentUser.emailVerified = false;
    mocks.sendEmail.mockRejectedValueOnce({ code: "auth/too-many-requests", message: "private synthetic details" });
    await submit();
    expect(container.textContent).toContain("Příliš mnoho žádostí");
    expect(container.textContent).not.toContain("Ověřovací e-mail byl vyžádán");
    expect(container.textContent).not.toContain("private synthetic details");
    const resend = [...container.querySelectorAll("button")].find(button => button.textContent === "Poslat ověřovací e-mail")!;
    await act(async () => resend.click());
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Ověřovací e-mail byl vyžádán");
    expect(mocks.secret).not.toHaveBeenCalled();
  });
  it("does not start enrollment if refreshing verification fails", async () => {
    mocks.auth.currentUser.emailVerified = false;
    await submit();
    mocks.reload.mockRejectedValue(new Error("expired"));
    await submit();
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Ověření se nepodařilo dokončit");
  });
  it("rechecks the email from normal login and rejects a stale verified flag", async () => {
    mocks.reload.mockImplementation(async () => { mocks.auth.currentUser.emailVerified = false; });
    await arriveFromLogin();
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Ověř svůj e-mail");
  });
  it.each(["reload", "token"])("does not create a key if the initial %s refresh fails", async operation => {
    (operation === "reload" ? mocks.reload : mocks.auth.currentUser.getIdToken).mockRejectedValue(new Error("expired"));
    await arriveFromLogin();
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Nastavení 2FA se nepodařilo zahájit");
  });
  it("discards the key if the email is no longer verified before enrollment", async () => {
    await arriveFromLogin();
    mocks.reload.mockImplementation(async () => { mocks.auth.currentUser.emailVerified = false; });
    await input("recovery-code", "123456"); await submit();
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(container.querySelector("#recovery-code")).toBeNull();
    expect(container.textContent).not.toContain("SYNTHETIC-SETUP-KEY");
    expect(container.textContent).toContain("Ověř svůj e-mail");
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
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
