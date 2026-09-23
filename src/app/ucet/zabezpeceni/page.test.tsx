// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";

const mocks = vi.hoisted(() => ({
  app: { name: "isolated-setup" },
  auth: { currentUser: { email: "synthetic@example.test", emailVerified: true, getIdToken: vi.fn(), reload: vi.fn() } },
  reload: vi.fn(), sendEmail: vi.fn(), requestCode: vi.fn(),
  takeSetup: vi.fn(),
  initApp: vi.fn(), initAuth: vi.fn(), login: vi.fn(), session: vi.fn(), secret: vi.fn(), enroll: vi.fn(), signOut: vi.fn(), deleteApp: vi.fn(),
  qrUri: vi.fn(), qrDataUrl: vi.fn(),
  router: { replace: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
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
vi.mock("@/app/lib/mfaEnrollment", () => ({ requestMfaEmailCode: mocks.requestCode, confirmMfaEmailCode: mocks.secret, completeMfaEnrollment: mocks.enroll }));
import TotpRecoveryPage from "./page";

describe("administrator-assisted recovery remains isolated from application sign-in", () => {
  let root: Root, container: HTMLDivElement;
  beforeEach(async () => {
    vi.resetAllMocks();
    window.history.replaceState(null, "", "/ucet/zabezpeceni?recovery=1");
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Recovery must not access business APIs")));
    mocks.auth.currentUser = { email: "synthetic@example.test", emailVerified: true, getIdToken: vi.fn().mockResolvedValue("synthetic-token"), reload: mocks.reload };
    mocks.initApp.mockReturnValue(mocks.app);
    mocks.initAuth.mockReturnValue(mocks.auth);
    mocks.login.mockResolvedValue({ user: mocks.auth.currentUser });
    mocks.session.mockResolvedValue("synthetic-session");
    mocks.requestCode.mockResolvedValue("00000000-0000-4000-8000-000000000001");
    mocks.secret.mockResolvedValue({ challengeId: "00000000-0000-4000-8000-000000000001", secretKey: "SYNTHETIC-SETUP-KEY", generateQrCodeUrl: mocks.qrUri });
    mocks.qrUri.mockReturnValue("otpauth://synthetic");
    mocks.qrDataUrl.mockResolvedValue("data:image/png;base64,c3ludGhldGlj");
    vi.spyOn(QRCode, "toDataURL").mockImplementation(mocks.qrDataUrl);
    mocks.enroll.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue(undefined);
    mocks.deleteApp.mockResolvedValue(undefined);
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    await act(async () => root.render(<TotpRecoveryPage />));
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); window.history.replaceState(null, "", "/"); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function input(id: string, value: string) {
    await act(async () => {
      const field = container.querySelector<HTMLInputElement>(`#${id}`)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function submit() {
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => { await vi.dynamicImportSettled(); });
  }
  async function arriveFromLogin(confirmEmail = true) {
    await act(async () => root.unmount());
    window.history.replaceState(null, "", "/ucet/zabezpeceni");
    mocks.takeSetup.mockReturnValueOnce({ auth: mocks.auth, app: mocks.app });
    root = createRoot(container);
    await act(async () => root.render(<StrictMode><TotpRecoveryPage /></StrictMode>));
    await act(async () => { await vi.dynamicImportSettled(); });
    if (confirmEmail && container.querySelector("#mfa-email-code")) await confirmEmailCode();
  }
  async function confirmEmailCode() {
    expect(container.querySelector("#recovery-code")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    await input("mfa-email-code", "654321"); await submit();
  }
  it("requires a fresh six-digit email code even for an already verified address", async () => {
    await arriveFromLogin(false);
    expect(mocks.requestCode).toHaveBeenCalledExactlyOnceWith(mocks.auth.currentUser);
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[aria-label*="kódu z e-mailu"]').length).toBe(7);
    await input("mfa-email-code", "123"); await submit();
    expect(mocks.secret).not.toHaveBeenCalled();
    mocks.secret.mockRejectedValueOnce(new Error("Kód není správný."));
    await input("mfa-email-code", "654321"); await submit();
    expect(container.querySelector("#recovery-code")).toBeNull();
    expect(container.textContent).toContain("Kód není správný.");
    await submit();
    expect(mocks.secret).toHaveBeenLastCalledWith(mocks.auth.currentUser, "00000000-0000-4000-8000-000000000001", "654321");
    expect(container.querySelector("#recovery-code")).not.toBeNull();
  });
  it("returns direct visits without a setup session to login without showing another password form", async () => {
    await act(async () => root.unmount());
    window.history.replaceState(null, "", "/ucet/zabezpeceni");
    root = createRoot(container);
    await act(async () => root.render(<StrictMode><TotpRecoveryPage /></StrictMode>));
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith("/login");
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toContain("Obnov si zabezpečení");
    expect(mocks.initAuth).not.toHaveBeenCalled();
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns to login when the one-time setup session is gone after a reload", async () => {
    await arriveFromLogin();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(container.querySelector("#recovery-code")).not.toBeNull();
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<StrictMode><TotpRecoveryPage /></StrictMode>));
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith("/login");
    expect(container.querySelector("#recovery-password")).toBeNull();
    expect(container.querySelector("#recovery-code")).toBeNull();
    expect(mocks.secret).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
    expect(mocks.deleteApp).toHaveBeenCalledWith(mocks.app);
  });
  it("starts TOTP after the normal password login without requesting credentials again", async () => {
    await arriveFromLogin();
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.initAuth).not.toHaveBeenCalled();
    expect(mocks.secret).toHaveBeenCalledOnce();
    expect(container.querySelector("#recovery-password")).toBeNull();
    expect(container.querySelector("#recovery-code")).not.toBeNull();
    expect(mocks.qrUri).toHaveBeenCalledWith("synthetic@example.test", "Bohemka.App");
    expect(mocks.qrDataUrl).toHaveBeenCalledWith("otpauth://synthetic", expect.objectContaining({ margin: 4 }));
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(container.querySelector('img[alt="QR kód pro přidání účtu do ověřovací aplikace"]')?.getAttribute("src"))
        .toBe("data:image/png;base64,c3ludGhldGlj");
    });
    await input("recovery-code", "123456"); await submit();
    expect(mocks.enroll).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
    expect(container.querySelector("img")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps manual enrollment available if local QR generation fails", async () => {
    mocks.qrDataUrl.mockRejectedValue(new Error("synthetic QR failure"));
    await arriveFromLogin();
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(container.textContent).toContain("QR kód se nepodařilo vytvořit");
    });
    expect(container.querySelector("details summary")?.textContent).toContain("Zadej klíč ručně");
    expect(container.querySelector("details code")?.textContent).toBe("SYNTHETIC-SETUP-KEY");
    expect(container.querySelector("img")).toBeNull();
    await input("recovery-code", "123456"); await submit();
    expect(mocks.enroll).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires six digits and lets users correct a box without shifting the others", async () => {
    await arriveFromLogin();
    const fields = [...container.querySelectorAll<HTMLInputElement>('[aria-label^="Číslice"]')];
    expect(fields).toHaveLength(6);
    expect(fields.every(field => field.required && field.inputMode === "numeric")).toBe(true);
    await input("recovery-code", "123456");
    await act(async () => {
      fields[2].focus();
      fields[2].dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }));
    });
    expect(fields.map(field => field.value)).toEqual(["1", "2", "", "4", "5", "6"]);
    await submit();
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Zadej všech šest číslic");
    await input("recovery-code-3", "9");
    expect(document.activeElement).toBe(fields[3]);
    await submit();
    expect(mocks.enroll).toHaveBeenCalledWith(mocks.auth.currentUser, expect.objectContaining({ challengeId: expect.any(String) }), "129456");
  });
  it("pastes a complete code into any box, including spaces and a leading zero", async () => {
    await arriveFromLogin();
    const field = container.querySelector<HTMLInputElement>("#recovery-code-4")!;
    const clipboardData = new DataTransfer();
    clipboardData.setData("text", "012 345");
    await act(async () => {
      field.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
    });
    expect([...container.querySelectorAll<HTMLInputElement>('[aria-label^="Číslice"]')].map(field => field.value))
      .toEqual(["0", "1", "2", "3", "4", "5"]);
    await submit();
    expect(mocks.enroll).toHaveBeenCalledWith(mocks.auth.currentUser, expect.objectContaining({ challengeId: expect.any(String) }), "012345");
  });
  it("opens the illustrated setup guide and returns to the same enrollment", async () => {
    await arriveFromLogin();
    await input("recovery-code", "123");
    const trigger = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Návod s obrázkem"))!;
    trigger.focus();
    await act(async () => trigger.click());
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector("ol")?.children).toHaveLength(3);
    expect(dialog.querySelector('img[alt*="vyznačenou ikonou QR"]')).not.toBeNull();
    expect(dialog.querySelectorAll('a[target="_blank"]')).toHaveLength(2);
    expect(dialog.textContent).toContain("Potvrdit kód");
    expect(dialog.textContent).toContain("stejném telefonu");
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
    expect([...container.querySelectorAll<HTMLInputElement>('[aria-label^="Číslice"]')].map(field => field.value).join("")).toBe("123");
    expect(mocks.secret).toHaveBeenCalledOnce();
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it("does not show a late QR result after the enrollment key is discarded", async () => {
    let finishQr!: (dataUrl: string) => void;
    mocks.qrDataUrl.mockReturnValue(new Promise<string>(resolve => { finishQr = resolve; }));
    await arriveFromLogin();
    expect(container.textContent).toContain("Připravuji QR kód");
    mocks.reload.mockImplementation(async () => { mocks.auth.currentUser.emailVerified = false; });
    await input("recovery-code", "123456"); await submit();
    await act(async () => finishQr("data:image/png;base64,c3ludGhldGlj"));
    expect(container.textContent).toContain("Ověř svůj e-mail");
    expect(container.querySelector("img")).toBeNull();
    expect(mocks.enroll).not.toHaveBeenCalled();
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
    await confirmEmailCode();
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
    expect(mocks.secret).not.toHaveBeenCalled();
    await confirmEmailCode();
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
