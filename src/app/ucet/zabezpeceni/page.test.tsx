// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";

const mocks = vi.hoisted(() => ({
  app: { name: "isolated-setup" },
  auth: { currentUser: { email: "synthetic@example.test", emailVerified: true, getIdToken: vi.fn(), reload: vi.fn() } },
  reload: vi.fn(), sendEmail: vi.fn(), requestCode: vi.fn(), startEnrollment: vi.fn(),
  takeSetup: vi.fn(), signInAfter: vi.fn(),
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
vi.mock("@/app/lib/mfaEnrollment", async importOriginal => ({ ...await importOriginal<typeof import("@/app/lib/mfaEnrollment")>(), requestMfaEmailCode: mocks.requestCode, startMfaEnrollment: mocks.startEnrollment, confirmMfaEmailCode: mocks.secret, completeMfaEnrollment: mocks.enroll }));
import { MfaEnrollmentRequestError } from "@/app/lib/mfaEnrollment";
vi.mock("@/app/lib/mfaSetupSignIn", () => ({ signInAfterMfaSetup: mocks.signInAfter }));
import TotpRecoveryPage from "./page";

describe("MFA setup stays isolated until email and TOTP are confirmed", () => {
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
    mocks.startEnrollment.mockImplementation(async user => ({ challengeId: await mocks.requestCode(user) }));
    mocks.secret.mockResolvedValue({ challengeId: "00000000-0000-4000-8000-000000000001", secretKey: "SYNTHETIC-SETUP-KEY", generateQrCodeUrl: mocks.qrUri });
    mocks.qrUri.mockReturnValue("otpauth://synthetic");
    mocks.qrDataUrl.mockResolvedValue("data:image/png;base64,c3ludGhldGlj");
    vi.spyOn(QRCode, "toDataURL").mockImplementation(mocks.qrDataUrl);
    mocks.enroll.mockResolvedValue("synthetic-sign-in-token");
    mocks.signInAfter.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue(undefined);
    mocks.deleteApp.mockResolvedValue(undefined);
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    await act(async () => root.render(<TotpRecoveryPage />));
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); window.history.replaceState(null, "", "/"); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
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
  it("keeps the password session and retries a rate-limited setup after the countdown", async () => {
    vi.useFakeTimers();
    mocks.requestCode.mockRejectedValueOnce(new MfaEnrollmentRequestError("Příliš mnoho pokusů. Chvíli počkej.", "mfa/rate-limited", 429, 30));
    await arriveFromLogin(false);
    expect(container.textContent).toContain("Příliš mnoho pokusů");
    const retry = container.querySelector<HTMLButtonElement>("button")!;
    expect(retry.disabled).toBe(true);
    expect(retry.textContent).toContain("30 s");
    await act(async () => retry.click());
    expect(mocks.requestCode).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(retry.disabled).toBe(false);
    await act(async () => retry.click());
    expect(mocks.requestCode).toHaveBeenCalledTimes(2);
    expect(container.querySelector("#mfa-email-code")).not.toBeNull();
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });
  it("shows the actual mail configuration problem without claiming a code was sent", async () => {
    mocks.requestCode.mockRejectedValueOnce(new MfaEnrollmentRequestError("Odesílání e-mailů není správně nastavené. Kontaktuj podporu.", "auth/configuration-not-found", 503));
    await arriveFromLogin(false);
    expect(container.textContent).toContain("místní verze nemá nastavené odesílání");
    expect(container.querySelector('a[href="https://bohemka.app/login"]')).not.toBeNull();
    expect(container.textContent).not.toContain("jsme odeslali");
    expect(mocks.secret).not.toHaveBeenCalled();
  });
  it("does not retry an expired setup session or expose raw Firebase errors", async () => {
    mocks.requestCode.mockRejectedValueOnce(new MfaEnrollmentRequestError("Přihlas se znovu.", "mfa/reauth-required", 401));
    await arriveFromLogin(false);
    expect(container.textContent).toContain("Přihlas se znovu.");
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    mocks.reload.mockRejectedValueOnce(new Error("private-provider-details"));
    await arriveFromLogin(false);
    expect(container.textContent).not.toContain("private-provider-details");
  });
  it("does not accept the retired administrator shortcut to QR setup", async () => {
    const challengeId = "00000000-0000-4000-8000-000000000001";
    mocks.startEnrollment.mockResolvedValueOnce({ challengeId, secret: { challengeId, secretKey: "SYNTHETIC-SETUP-KEY", generateQrCodeUrl: mocks.qrUri } });
    await arriveFromLogin(false);
    expect(container.querySelector("#mfa-email-code")).not.toBeNull();
    expect(container.querySelector("#recovery-code")).toBeNull();
    expect(mocks.enroll).not.toHaveBeenCalled(); expect(mocks.signInAfter).not.toHaveBeenCalled();
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
  it("does not show a late QR result after successful setup discards the key", async () => {
    let finishQr!: (dataUrl: string) => void;
    mocks.qrDataUrl.mockReturnValue(new Promise<string>(resolve => { finishQr = resolve; }));
    await arriveFromLogin();
    expect(container.textContent).toContain("Připravuji QR kód");
    await input("recovery-code", "123456"); await submit();
    await act(async () => finishQr("data:image/png;base64,c3ludGhldGlj"));
    expect(container.querySelector("img")).toBeNull();
    expect(mocks.signInAfter).toHaveBeenCalledWith("synthetic-sign-in-token");
  });
  it("requests the same inbox code for a previously unverified email", async () => {
    mocks.auth.currentUser.emailVerified = false;
    await arriveFromLogin(false);
    expect(mocks.requestCode).toHaveBeenCalledExactlyOnceWith(mocks.auth.currentUser);
    expect(mocks.secret).not.toHaveBeenCalled(); expect(mocks.signInAfter).not.toHaveBeenCalled();
    expect(container.querySelector("#mfa-email-code")).not.toBeNull();
    await confirmEmailCode();
    expect(mocks.secret).toHaveBeenCalledOnce();
  });
  it("waits for password, email and TOTP, then enters the app without admin activation", async () => {
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
    expect(mocks.signInAfter).toHaveBeenCalledWith("synthetic-sign-in-token");
    expect(mocks.router.replace).toHaveBeenCalledWith("/");
    expect(container.textContent).not.toContain("SYNTHETIC-SETUP-KEY");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("offers a normal login fallback if automatic sign-in fails after successful setup", async () => {
    mocks.signInAfter.mockRejectedValue(new Error("private-token"));
    await arriveFromLogin();
    await input("recovery-code", "123456"); await submit();
    expect(container.textContent).toContain("2FA je nastavené");
    expect(container.textContent).not.toContain("private-token");
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(container.querySelector("#recovery-code")).toBeNull();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });
  it("keeps data inaccessible and allows retry after an email delivery failure", async () => {
    mocks.requestCode.mockRejectedValueOnce(new MfaEnrollmentRequestError("Potvrzovací e-mail se nepodařilo odeslat.", "mfa/email-failed", 503));
    await arriveFromLogin(false);
    expect(mocks.signInAfter).not.toHaveBeenCalled(); expect(mocks.secret).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("jsme odeslali");
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(mocks.requestCode).toHaveBeenCalledTimes(2);
    expect(container.querySelector("#mfa-email-code")).not.toBeNull();
  });
  it.each(["reload", "token"])("does not create a key if the initial %s refresh fails", async operation => {
    (operation === "reload" ? mocks.reload : mocks.auth.currentUser.getIdToken).mockRejectedValue(new Error("expired"));
    await arriveFromLogin();
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Nastavení 2FA se nepodařilo zahájit");
  });
  it("never enters the app when the server rejects TOTP or the current account state", async () => {
    mocks.enroll.mockRejectedValue(new MfaEnrollmentRequestError("Přihlas se znovu.", "mfa/expired", 409));
    await arriveFromLogin();
    await input("recovery-code", "123456"); await submit();
    expect(mocks.signInAfter).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Přihlas se znovu.");
  });
  it.each(["auth/multi-factor-auth-required", "auth/user-disabled"])("explains %s without exposing provider details", async code => {
    mocks.login.mockRejectedValue({ code, message: "private synthetic token" });
    await submit();
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(container.textContent).toContain(code === "auth/user-disabled" ? "administrátora" : "přihlášení");
    expect(container.textContent).not.toContain("private synthetic token");
    expect(fetch).not.toHaveBeenCalled();
  });
});
