// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CareerTimelineImport } from "./CareerTimelineImport";

describe("career clipboard import control", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onImport = vi.fn();

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    onImport.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<CareerTimelineImport onImport={onImport} />));
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

  const paste = async (text: string) => {
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, text);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("prefills only on request, returning allowed fields and clearing the pasted source", async () => {
    await paste("Finanční poradce\t106 - Řídící manažer\t01.01.2025 - současnost\t123");
    expect(onImport).not.toHaveBeenCalled();
    expect(container.textContent).toContain("nahradí rozepsaná období");
    await act(async () => container.querySelector("button")!.click());
    expect(onImport).toHaveBeenCalledExactlyOnceWith([{ position: "manazer6", validFrom: "2025-01-01", validTo: "" }]);
    expect(container.querySelector("textarea")!.value).toBe("");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Zkontroluj období a ulož");
  });

  it("keeps the existing draft untouched on invalid input and displays a safe error", async () => {
    await paste("5 - Poradce 01.01.2020 - 01.01.2025\n<script>alert('synthetic')</script>");
    await act(async () => container.querySelector("button")!.click());
    expect(onImport).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Období 2");
    expect(container.querySelector("textarea")?.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector("script")).toBeNull();
    await paste("5 - Poradce 01.01.2020 - současnost");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("does not import while saving and clears source text when the account context changes", async () => {
    await paste("5 - Poradce 01.01.2020 - současnost");
    await act(async () => root.render(<CareerTimelineImport disabled onImport={onImport} />));
    expect(container.querySelector("textarea")!.disabled).toBe(true);
    expect(container.querySelector("button")!.disabled).toBe(true);
    await act(async () => container.querySelector("button")!.click());
    expect(onImport).not.toHaveBeenCalled();
    await act(async () => root.render(<CareerTimelineImport key="different-account" onImport={onImport} />));
    expect(container.querySelector("textarea")!.value).toBe("");
  });

  it("opens the guide without changing pasted text or importing demonstration data", async () => {
    const text = "5 - Poradce 01.01.2020 - současnost";
    await paste(text);
    const help = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Jak zkopírovat kariéru"))!;
    await act(async () => { help.focus(); help.click(); });
    expect(container.querySelector("dialog")!.open).toBe(true);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Zavřít nápovědu"]')!.click());
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector("textarea")!.value).toBe(text);
    expect(onImport).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(help);
  });

  it("uses the settings help handler when provided instead of opening a second modal", async () => {
    const onHelp = vi.fn();
    await act(async () => root.render(<CareerTimelineImport onImport={onImport} onHelp={onHelp} />));
    const help = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Jak zkopírovat kariéru"))!;
    await act(async () => help.click());
    expect(onHelp).toHaveBeenCalledOnce();
    expect(container.querySelector("dialog")).toBeNull();
    expect(onImport).not.toHaveBeenCalled();
  });
});
