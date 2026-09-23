// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSecurityPanel } from "./AccountSecurityPanel";

afterEach(() => vi.unstubAllGlobals());
describe("settings enrollment inbox step", () => {
  it("shows six email boxes before the QR, with confirmation and resend controls", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const confirm = vi.fn(), resend = vi.fn();
    const props = { passkeyCredentials: [], accountSessions: [], userEmail: "synthetic@example.test", mfaAwaitingEmailCode: true,
      mfaEnabled: false, mfaEnrollmentSecretKey: null, mfaEnrollmentCode: "", mfaBusy: false,
      onConfirmMfaEnrollment: confirm, onStartMfaEnrollment: resend, onMfaEnrollmentCodeChange: vi.fn(),
    } as unknown as ComponentProps<typeof AccountSecurityPanel>;
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(<AccountSecurityPanel {...props} />));
      expect(container.querySelectorAll('[aria-label^="Číslice"]')).toHaveLength(6);
      expect(container.querySelector('input[type="password"]')).toBeNull();
      expect(container.querySelector('img[alt*="QR"]')).toBeNull();
      expect(container.textContent).toContain("synthetic@example.test");
      const buttons = [...container.querySelectorAll("button")];
      await act(async () => buttons.find(button => button.textContent === "Potvrdit e-mail a zobrazit QR")!.click());
      await act(async () => buttons.find(button => button.textContent === "Poslat nový kód")!.click());
      expect(confirm).toHaveBeenCalledOnce(); expect(resend).toHaveBeenCalledOnce();
      await act(async () => root.render(<AccountSecurityPanel {...props} mfaBusy />));
      expect([...container.querySelectorAll<HTMLInputElement>('[aria-label^="Číslice"]')].every(field => field.disabled)).toBe(true);
    } finally { await act(async () => root.unmount()); }
  });
});
