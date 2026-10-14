// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSetupWizard } from "./AccountSetupWizard";

vi.mock("./AccountSetupSuccess", () => ({ AccountSetupSuccess: () => null }));

type WizardProps = ComponentProps<typeof AccountSetupWizard>;

function makeCareerProps(): WizardProps {
  return {
    user: { uid: "synthetic-setup-account", email: "advisor@example.test" } as User,
    completedStepIds: ["phone"],
    careerDraftStatus: "none",
    mfaAwaitingEmail: false,
    mfaAwaitingEmailCode: false,
    onResendMfaEmailCode: vi.fn(),
    mfaEmailVerified: false,
    onComplete: vi.fn(),
    onStepChange: vi.fn(),
    ariaLabel: "Nastavení syntetického účtu",
    logoutLabel: "Odhlásit se",
    steps: [
      { id: "phone", label: "Profil" },
      { id: "career", label: "Kariéra" },
      { id: "security", label: "Zabezpečení" },
    ],
    stepIndex: 1,
    completed: false,
    currentStep: "career",
    phone: "777123456",
    phoneMaxLength: 40,
    phoneSaving: false,
    ico: "12345678",
    icoMaxLength: 8,
    fullName: "Ukázkový poradce",
    fullNameMaxLength: 120,
    agencyNumber: "",
    agencyNumberMaxLength: 80,
    aresIcoLookup: { status: "idle", ico: "" },
    timelineDraft: [{ id: "existing-period", position: "poradce5", validFrom: "2020-01-01", validTo: "", ongoing: true }],
    timelineSaving: false,
    positions: [
      { id: "poradce5", label: "Poradce 5" },
      { id: "manazer6", label: "Manažer 6" },
    ],
    mfaGraceActive: false,
    mfaGraceExpired: false,
    mfaGraceRemainingDays: 0,
    mfaGraceDeadlineLabel: "",
    mfaEnabled: false,
    mfaPassword: "",
    mfaSecretKey: null,
    mfaQrLoading: false,
    mfaQrDataUrl: "",
    mfaQrError: null,
    mfaCode: "",
    mfaSaving: false,
    completionSaving: false,
    info: null,
    error: null,
    busy: false,
    hasInvalidRangeOrder: (from, to) => Boolean(from && to && to < from),
    onLogout: vi.fn(),
    onPhoneChange: vi.fn(),
    onIcoChange: vi.fn(),
    onFullNameChange: vi.fn(),
    onAgencyNumberChange: vi.fn(),
    onTimelineRowChange: vi.fn(),
    onRemoveTimelineRow: vi.fn(),
    onAddTimelineRow: vi.fn(),
    onImportTimeline: vi.fn(),
    onMfaPasswordChange: vi.fn(),
    onMfaCodeChange: vi.fn(),
    onDismissGrace: vi.fn(),
    onBack: vi.fn(),
    onPrimaryAction: vi.fn(),
  };
}

describe("career import in account setup", () => {
  let root: Root;
  let container: HTMLDivElement;
  let props: WizardProps;
  let originalOverflow: string;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
    props = makeCareerProps();
    originalOverflow = document.body.style.overflow;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<AccountSetupWizard {...props} />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.style.overflow = originalOverflow;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function button(name: string) {
    const match = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
      item.getAttribute("aria-label") === name || item.textContent?.trim() === name,
    );
    expect(match, name).toBeTruthy();
    return match!;
  }

  async function click(name: string) {
    await act(async () => button(name).click());
  }

  async function paste(text: string) {
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, text);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("shows the import field immediately and prefills allowed fields without completing the step", async () => {
    const textarea = container.querySelector("textarea")!;
    expect(textarea.closest("details")?.open).toBe(true);
    await paste("Finanční poradce\t106 - Řídící manažer\t01.01.2025 - současnost\t999");
    expect(props.onImportTimeline).not.toHaveBeenCalled();
    await click("Předvyplnit historii");
    expect(props.onImportTimeline).toHaveBeenCalledExactlyOnceWith([
      { position: "manazer6", validFrom: "2025-01-01", validTo: "" },
    ]);
    expect(props.onPrimaryAction).not.toHaveBeenCalled();
    expect(textarea.value).toBe("");
    expect(container.textContent).toContain("Zkontroluj období a zvol Pokračovat");
  });

  it("keeps the existing career untouched when pasted input is invalid", async () => {
    await paste("Finanční poradce\t106 - Řídící manažer\t31.02.2025 - současnost");
    await click("Předvyplnit historii");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector("textarea")!.getAttribute("aria-invalid")).toBe("true");
    expect(props.onImportTimeline).not.toHaveBeenCalled();
    expect(props.onTimelineRowChange).not.toHaveBeenCalled();
    expect(container.querySelector("select")!.value).toBe("poradce5");
    expect(props.onPrimaryAction).not.toHaveBeenCalled();
  });

  it("preserves pasted text and restores the setup focus and scroll lock after Escape closes help", async () => {
    const text = "5 - Konzultant referent 01.01.2020 - současnost";
    await paste(text);
    const opener = button("Nápověda s ukázkou");
    await act(async () => { opener.focus(); opener.click(); });
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(button("Zavřít nápovědu"));
    const cancel = new Event("cancel", { cancelable: true });
    await act(async () => dialog.dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true);
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector("textarea")!.value).toBe(text);
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("hidden");
    expect(props.onImportTimeline).not.toHaveBeenCalled();
    expect(props.onPrimaryAction).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    expect(document.body.style.overflow).toBe(originalOverflow);
  });

  it("keeps guide keyboard events and controls from submitting the setup form", async () => {
    await click("Nápověda s ukázkou");
    const guide = container.querySelector("dialog")!;
    for (const name of ["2. Zkopíruj obsah", "3. Vlož do Bohemka App", "4. Předvyplň a pokračuj", "Přehrát znovu"]) {
      const control = button(name);
      expect(control.type).toBe("button");
      await act(async () => {
        control.focus();
        control.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        control.click();
      });
    }
    expect(guide.open).toBe(true);
    expect(props.onPrimaryAction).not.toHaveBeenCalled();
    expect(props.onImportTimeline).not.toHaveBeenCalled();
    await click("Zavřít nápovědu");
    await click("Pokračovat");
    expect(props.onPrimaryAction).toHaveBeenCalledOnce();
  });

  it("blocks importing and continuing while the step is saving", async () => {
    await paste("5 - Konzultant referent 01.01.2020 - současnost");
    props = { ...props, busy: true, timelineSaving: true };
    await act(async () => root.render(<AccountSetupWizard {...props} />));
    expect(container.querySelector("textarea")!.disabled).toBe(true);
    expect(button("Předvyplnit historii").disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await click("Předvyplnit historii");
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(props.onImportTimeline).not.toHaveBeenCalled();
    expect(props.onPrimaryAction).not.toHaveBeenCalled();
  });
});
