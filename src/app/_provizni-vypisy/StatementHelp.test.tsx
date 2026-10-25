// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatementHelp } from "./StatementHelp";

describe("statement help dialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  let previousOverflow: string;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "auto";
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
    document.body.style.overflow = previousOverflow;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function openHelp() {
    await act(async () => root.render(<StatementHelp />));
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    trigger.focus();
    await act(async () => trigger.click());
    return trigger;
  }

  it("opens a labelled modal explaining the amounts, review statuses and processing", async () => {
    await act(async () => root.render(<StatementHelp />));
    expect(container.querySelector("dialog")).toBeNull();
    const trigger = await openHelp();
    expect(trigger.textContent?.trim()).toBe("Info");
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("Jak se ve výpisu vyznat");
    for (const text of ["Vyplaceno dle výpisu", "K prověření", "Smlouvy mimo Bohemka.App", "Zpracovat výpis", "Souhrn nesrovnalostí", "Provizní výpisy u smlouvy", "Promítnutí do Cashflow", "Audit po zápisu", "Zpracovat znovu podle aktuálních smluv", "Otevřít smlouvu v MAXX", "Otevřít extranet", "Úpravy v MAXX a Extranetu se provádějí ručně."]) {
      expect(dialog.textContent).toContain(text);
    }
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(dialog.querySelector('[aria-label="Zavřít nápovědu"]'));
  });

  it.each(["close", "continue", "escape", "backdrop"])("closes via %s and returns focus and scrolling to the page", async method => {
    const trigger = await openHelp();
    const dialog = container.querySelector("dialog")!;
    await act(async () => {
      if (method === "escape") dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
      else if (method === "backdrop") dialog.click();
      else if (method === "close") dialog.querySelector<HTMLButtonElement>('[aria-label="Zavřít nápovědu"]')!.click();
      else dialog.querySelector<HTMLButtonElement>("footer button")!.click();
    });
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("auto");
  });

  it("keeps the help open when its content is clicked and restores scrolling when the page unmounts", async () => {
    await openHelp();
    await act(async () => { container.querySelector("dialog h2")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(container.querySelector("dialog")?.open).toBe(true);
    await act(async () => root.render(null));
    expect(document.body.style.overflow).toBe("auto");
  });

  it("returns focus to the info button even when opening it did not focus the button", async () => {
    await act(async () => root.render(<StatementHelp />));
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    await act(async () => trigger.click());
    await act(async () => container.querySelector<HTMLButtonElement>('dialog [aria-label="Zavřít nápovědu"]')!.click());
    expect(document.activeElement).toBe(trigger);
  });
});
