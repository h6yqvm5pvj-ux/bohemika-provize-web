// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalculatorContractReviewModal } from "./CalculatorContractReviewModal";
import { buildContractReviewWarnings } from "./contractReview";
import { useContractReview } from "./useContractReview";

describe("contract recap before saving", () => {
  let container: HTMLDivElement;
  let root: Root;
  const saved = vi.fn();

  function Harness({ initialName = "Jan Novák" } = {}) {
    const [clientName, setClientName] = useState(initialName);
    const { review, requestReview, resolveReview } = useContractReview();
    const save = async () => {
      if (await requestReview({
        title: "Rekapitulace smlouvy",
        rows: [{ label: "Klient", value: clientName }, { label: "Číslo smlouvy", value: "1400000001" }, { label: "Měsíční pojistné", value: "704 Kč" }],
        warnings: buildContractReviewWarnings({ product: "flexi", clientName, contractNumber: "1400000001", amount: 704, frequency: "monthly" }),
      })) saved(clientName);
    };
    return <>
      <input aria-label="Klient" value={clientName} onChange={(event) => setClientName(event.target.value)} />
      <button onClick={() => void save()}>Sepsáno</button>
      {review && <CalculatorContractReviewModal review={review} onResolve={resolveReview} />}
    </>;
  }
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
  const action = (text: string) => Array.from(document.querySelectorAll("button")).find((button) => button.textContent === text)!;
  const click = async (text: string) => act(async () => action(text).click());
  const typeName = async (value: string) => act(async () => {
    const input = container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    saved.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows the recap first and saves only once after Souhlasí", async () => {
    await act(async () => root.render(<Harness />));
    await click("Sepsáno");
    expect(saved).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain("Jan Novák");
    expect(dialog()?.textContent).toContain("704 Kč");
    expect(dialog()?.querySelector('[aria-label="Údaje ke kontrole"]')).toBeNull();
    const confirm = action("Souhlasí");
    await act(async () => { confirm.click(); confirm.click(); });
    expect(saved).toHaveBeenCalledExactlyOnceWith("Jan Novák");
    expect(dialog()).toBeNull();
  });

  it("preserves the form on Upravit and refreshes warnings after a correction", async () => {
    await act(async () => root.render(<Harness initialName="Novák" />));
    await click("Sepsáno");
    expect(dialog()?.textContent).toContain("Jméno klienta vypadá neúplně");
    await click("Upravit");
    expect(saved).not.toHaveBeenCalled();
    expect(container.querySelector("input")?.value).toBe("Novák");
    await typeName("Jan Novák");
    await click("Sepsáno");
    expect(dialog()?.textContent).toContain("Jan Novák");
    expect(dialog()?.textContent).not.toContain("Jméno klienta vypadá neúplně");
    await click("Souhlasí");
    expect(saved).toHaveBeenCalledExactlyOnceWith("Jan Novák");
  });

  it("allows confirmation when unusual data is correct", async () => {
    await act(async () => root.render(<Harness initialName="Novák" />));
    await click("Sepsáno");
    expect(dialog()?.textContent).toContain("Pokud údaje odpovídají smlouvě");
    await click("Souhlasí");
    expect(saved).toHaveBeenCalledExactlyOnceWith("Novák");
  });

  it("cancels with Escape, restores focus and body scrolling, and traps keyboard navigation", async () => {
    await act(async () => root.render(<Harness />));
    action("Sepsáno").focus();
    await click("Sepsáno");
    expect(document.activeElement).toBe(action("Upravit"));
    expect(document.body.style.overflow).toBe("hidden");
    action("Souhlasí").focus();
    await act(async () => action("Souhlasí").dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    const close = dialog()!.querySelector("button");
    expect(document.activeElement).toBe(close);
    await act(async () => close!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(action("Souhlasí"));
    await act(async () => dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(dialog()).toBeNull();
    expect(saved).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(action("Sepsáno"));
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("does not save after closing the page while a review is pending", async () => {
    await act(async () => root.render(<Harness />));
    await click("Sepsáno");
    await act(async () => root.render(null));
    expect(dialog()).toBeNull();
    expect(saved).not.toHaveBeenCalled();
  });
});
