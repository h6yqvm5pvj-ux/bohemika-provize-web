// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CareerImportHelpDialog } from "./CareerImportHelpDialog";

const STEP_DURATION_MS = 4_500;
const STEP_NAMES = [
  "1. Označ tabulku",
  "2. Zkopíruj obsah",
  "3. Vlož do Bohemka App",
  "4. Předvyplň historii",
];

describe("animated career import help", () => {
  let root: Root;
  let container: HTMLDivElement;
  let reducedMotion: boolean;
  const onClose = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    reducedMotion = false;
    onClose.mockReset();
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)" && reducedMotion,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList));
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function mount() {
    await act(async () => root.render(<CareerImportHelpDialog onClose={onClose} />));
  }

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

  function currentStep() {
    const active = container.querySelector<HTMLButtonElement>('button[aria-current="step"]');
    return active?.getAttribute("aria-label") ?? active?.textContent?.trim();
  }

  async function advance(milliseconds: number) {
    await act(async () => vi.advanceTimersByTime(milliseconds));
  }

  it("opens a labelled modal with the supplied screenshot and a safe Maxx link", async () => {
    await mount();
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(button("Zavřít nápovědu"));
    const title = document.getElementById(dialog.getAttribute("aria-labelledby")!);
    expect(title?.textContent).toBe("Jak zkopírovat kariéru z Maxxu");
    expect(container.querySelector('img[src="/images/help/career-maxx.webp"]')).not.toBeNull();
    for (const name of STEP_NAMES) expect(button(name).disabled).toBe(false);
    const externalLink = [...container.querySelectorAll<HTMLAnchorElement>("a")].find((link) => link.target === "_blank");
    expect(externalLink).toBeTruthy();
    expect(new URL(externalLink!.href).protocol).toBe("https:");
    expect(externalLink!.rel.split(/\s+/)).toContain("noopener");
    expect(externalLink!.rel.split(/\s+/)).toContain("noreferrer");
  });

  it("plays all four steps once and lets the user replay from the beginning", async () => {
    await mount();
    expect(currentStep()).toBe(STEP_NAMES[0]);
    for (const name of STEP_NAMES.slice(1)) {
      await advance(STEP_DURATION_MS);
      expect(currentStep()).toBe(name);
    }
    await advance(STEP_DURATION_MS);
    expect(button("Přehrát návod")).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
    await advance(STEP_DURATION_MS * 3);
    expect(currentStep()).toBe(STEP_NAMES[3]);
    await click("Přehrát znovu");
    expect(currentStep()).toBe(STEP_NAMES[0]);
    expect(button("Pozastavit návod")).toBeTruthy();
    await advance(STEP_DURATION_MS);
    expect(currentStep()).toBe(STEP_NAMES[1]);
  });

  it("pauses without advancing and pauses when a user selects a step", async () => {
    await mount();
    await advance(500);
    await click("Pozastavit návod");
    expect(vi.getTimerCount()).toBe(0);
    await advance(STEP_DURATION_MS * 2);
    expect(currentStep()).toBe(STEP_NAMES[0]);
    await click(STEP_NAMES[2]);
    expect(currentStep()).toBe(STEP_NAMES[2]);
    expect(button("Přehrát návod")).toBeTruthy();
    await advance(STEP_DURATION_MS * 2);
    expect(currentStep()).toBe(STEP_NAMES[2]);
    await click("Přehrát návod");
    await advance(STEP_DURATION_MS);
    expect(currentStep()).toBe(STEP_NAMES[3]);
  });

  it("restarts the full first step when replay is requested during playback", async () => {
    await mount();
    await advance(STEP_DURATION_MS - 500);
    await click("Přehrát znovu");
    await advance(500);
    expect(currentStep()).toBe(STEP_NAMES[0]);
    await advance(STEP_DURATION_MS - 500);
    expect(currentStep()).toBe(STEP_NAMES[1]);
  });

  it("resumes a paused step for its remaining duration", async () => {
    await mount();
    await advance(1_500);
    await click("Pozastavit návod");
    await advance(STEP_DURATION_MS * 2);
    await click("Přehrát návod");
    await advance(2_999);
    expect(currentStep()).toBe(STEP_NAMES[0]);
    await advance(1);
    expect(currentStep()).toBe(STEP_NAMES[1]);
  });

  it("defaults to manual steps for reduced motion and permits explicit playback", async () => {
    reducedMotion = true;
    await mount();
    expect(button("Přehrát návod")).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
    await advance(STEP_DURATION_MS * 2);
    expect(currentStep()).toBe(STEP_NAMES[0]);
    await click(STEP_NAMES[3]);
    expect(currentStep()).toBe(STEP_NAMES[3]);
    await click("Přehrát znovu");
    expect(currentStep()).toBe(STEP_NAMES[0]);
    expect(vi.getTimerCount()).toBe(0);
    await click("Přehrát návod");
    await advance(STEP_DURATION_MS);
    expect(currentStep()).toBe(STEP_NAMES[1]);
  });

  it("allows reduced-motion users to explicitly play again after completion", async () => {
    reducedMotion = true;
    await mount();
    await click("Přehrát návod");
    for (let index = 0; index < STEP_NAMES.length; index++) await advance(STEP_DURATION_MS);
    expect(currentStep()).toBe(STEP_NAMES[3]);
    expect(vi.getTimerCount()).toBe(0);
    await click("Přehrát návod");
    expect(currentStep()).toBe(STEP_NAMES[0]);
    expect(button("Pozastavit návod")).toBeTruthy();
    await advance(STEP_DURATION_MS);
    expect(currentStep()).toBe(STEP_NAMES[1]);
  });

  it("closes through the close button and the native Escape cancellation event", async () => {
    await mount();
    await click("Zavřít nápovědu");
    expect(onClose).toHaveBeenCalledOnce();
    const cancel = new Event("cancel", { bubbles: false, cancelable: true });
    await act(async () => container.querySelector("dialog")!.dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes on the backdrop without dismissing clicks inside the guide", async () => {
    await mount();
    await click(STEP_NAMES[1]);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => container.querySelector("dialog")!.click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("restores focus and background scrolling and cancels playback when closed", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const initialOverflow = document.body.style.overflow;
    await mount();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => root.render(null));
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe(initialOverflow);
    expect(vi.getTimerCount()).toBe(0);
    opener.remove();
  });

  it("demonstrates copying and pasting without accessing the real clipboard", async () => {
    const readText = vi.spyOn(navigator.clipboard, "readText");
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await mount();
    await click(STEP_NAMES[1]);
    await click(STEP_NAMES[2]);
    await click(STEP_NAMES[3]);
    expect(readText).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    for (const control of container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
      expect(control.disabled || control.readOnly).toBe(true);
    }
  });
});
