// @vitest-environment happy-dom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: {}, check: vi.fn(), apply: vi.fn(), inspectReset: vi.fn(), reset: vi.fn() }));
vi.mock("@/app/firebase", () => ({ auth: mocks.auth }));
vi.mock("firebase/auth", () => ({
  ActionCodeOperation: { VERIFY_EMAIL: "VERIFY_EMAIL" },
  checkActionCode: mocks.check, applyActionCode: mocks.apply,
  verifyPasswordResetCode: mocks.inspectReset,
}));
vi.mock("@/app/lib/passwordReset", () => ({ confirmPasswordReset: mocks.reset }));
import { AuthEmailActionPage } from "./AuthEmailActionPage";

describe("custom email action page", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", "/ucet/akce");
    mocks.check.mockResolvedValue({ operation: "VERIFY_EMAIL", data: { email: "private@example.test" } });
    mocks.inspectReset.mockResolvedValue("private@example.test");
    mocks.apply.mockResolvedValue(undefined); mocks.reset.mockResolvedValue(undefined);
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  async function mount(parameters = "#mode=verifyEmail&oobCode=synthetic-code") {
    window.history.replaceState(null, "", "/ucet/akce" + parameters);
    await act(async () => root.render(<StrictMode><AuthEmailActionPage /></StrictMode>));
  }
  async function submit() {
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  }
  async function input(selector: string, value: string) {
    await act(async () => {
      const field = container.querySelector<HTMLInputElement>(selector)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function passwords(first = "Synthetic-password-1!", second = first) {
    await input("#new-password", first); await input("#confirm-password", second);
  }

  it("does not consume verification on page load, even in StrictMode; removes secret parameters", async () => {
    await mount("#mode=verifyEmail&oobCode=synthetic-code&continueUrl=https://outside.example.test&apiKey=foreign");
    expect(mocks.check).toHaveBeenCalledExactlyOnceWith(mocks.auth, "synthetic-code");
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(window.location.search + window.location.hash).toBe("");
    expect(container.innerHTML).not.toMatch(/synthetic-code|private@example|outside.example|foreign/);
    expect([...container.querySelectorAll("a")].every((a) => a.getAttribute("href") === "/login")).toBe(true);
    await submit();
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith(mocks.auth, "synthetic-code");
    expect(container.textContent).toContain("E-mail je ověřený");
    expect(container.querySelector("form")).toBeNull();
  });
  it("rejects a missing link without contacting Firebase", async () => {
    await mount("");
    expect(container.textContent).toContain("Odkaz už není platný");
    expect(mocks.check).not.toHaveBeenCalled(); expect(mocks.inspectReset).not.toHaveBeenCalled();
  });
  it("starts a fresh lifecycle for another email link opened in the same tab", async () => {
    await mount();
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
    window.history.replaceState(null, "", "/ucet/akce#mode=resetPassword&oobCode=another-code");
    await act(async () => {
      window.dispatchEvent(new Event("hashchange"));
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(reload).toHaveBeenCalledOnce();
    expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.reset).not.toHaveBeenCalled();
  });
  it("rejects a code for a different action without applying it", async () => {
    mocks.check.mockResolvedValue({ operation: "RECOVER_EMAIL" });
    await mount();
    expect(container.textContent).toContain("Odkaz už není platný");
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it.each(["auth/expired-action-code", "auth/invalid-action-code", "auth/user-disabled"])("shows a safe explanation for %s", async (code) => {
    mocks.inspectReset.mockRejectedValue({ code, message: "secret synthetic-code private@example.test" });
    await mount("#mode=resetPassword&oobCode=synthetic-code");
    expect(container.textContent).toContain(code === "auth/expired-action-code" ? "Platnost odkazu vypršela" : "Odkaz už není platný");
    expect(container.textContent).not.toMatch(/secret|synthetic-code|private@example/);
    expect(container.querySelector("input")).toBeNull(); expect(mocks.reset).not.toHaveBeenCalled();
  });
  it("only resets after matching passwords, then clears the form without signing in", async () => {
    await mount("?mode=resetPassword&oobCode=synthetic-code&continueUrl=//outside.example.test");
    expect(mocks.inspectReset).toHaveBeenCalledExactlyOnceWith(mocks.auth, "synthetic-code");
    expect(mocks.reset).not.toHaveBeenCalled();
    await passwords("short"); await submit(); expect(mocks.reset).not.toHaveBeenCalled();
    await passwords("Synthetic-password-1!", "Different-password-1!"); await submit();
    expect(container.textContent).toContain("Hesla se neshodují"); expect(mocks.reset).not.toHaveBeenCalled();
    await passwords(); await submit();
    expect(mocks.reset).toHaveBeenCalledExactlyOnceWith("synthetic-code", "Synthetic-password-1!");
    expect(container.textContent).toContain("Nové heslo je nastavené");
    expect(container.querySelector("input")).toBeNull();
    expect(window.location.pathname).toBe("/ucet/akce"); expect(window.location.hash + window.location.search).toBe("");
  });
  it("prevents duplicate password writes while the first is pending", async () => {
    let finish!: () => void;
    mocks.reset.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    await mount("#mode=resetPassword&oobCode=synthetic-code"); await passwords();
    await submit(); await submit();
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLButtonElement>("button[type=submit]")!.disabled).toBe(true);
    await act(async () => finish());
  });
  it("allows a stronger password after a policy error without displaying raw errors", async () => {
    mocks.reset.mockRejectedValueOnce({ code: "auth/password-does-not-meet-requirements", message: "private secret" });
    await mount("#mode=resetPassword&oobCode=synthetic-code"); await passwords(); await submit();
    expect(container.textContent).toContain("Heslo nesplňuje požadavky účtu");
    expect(container.textContent).not.toContain("private secret");
    await passwords("Longer-synthetic-password-2!"); await submit();
    expect(container.textContent).toContain("Nové heslo je nastavené");
  });
  it("handles a code expiring between validation and confirmation", async () => {
    await mount(); mocks.apply.mockRejectedValue({ code: "auth/expired-action-code" });
    await submit();
    expect(container.textContent).toContain("Platnost odkazu vypršela"); expect(container.querySelector("form")).toBeNull();
  });
  it("offers an explicit retry after inspection network failure", async () => {
    mocks.check.mockRejectedValueOnce({ code: "auth/network-request-failed" }); await mount();
    expect(container.textContent).toContain("Odkaz se nepodařilo ověřit");
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "Zkusit znovu")!;
    await act(async () => button.click());
    expect(container.textContent).toContain("Potvrď svůj e-mail"); expect(mocks.apply).not.toHaveBeenCalled();
  });
});
