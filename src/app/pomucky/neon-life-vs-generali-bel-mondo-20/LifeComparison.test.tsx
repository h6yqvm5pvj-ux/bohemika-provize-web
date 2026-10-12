// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("./downloadComparison", () => ({ downloadComparison: mocks.download }));
import { LifeComparison } from "./LifeComparison";

let root: Root, container: HTMLDivElement;
const button = (label: string) => [...container.querySelectorAll("button")].find((element) => element.textContent === label)!;
const click = async (label: string) => { await act(async () => button(label).click()); };
async function fill(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(async () => {
  vi.clearAllMocks(); mocks.download.mockResolvedValue(undefined); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<LifeComparison />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("pomůcka a výběr PDF", () => {
  it("hledání samo nezmění export, výslovný výběr zobrazených témat ano", async () => {
    await fill("topic-search", "P02");
    expect(container.querySelectorAll('[id^="topic-"]')).toHaveLength(2); // Search input + one topic.
    expect(container.textContent).toContain("Výklad k potvrzení");
    expect(container.textContent).toContain("49 témat v PDF");
    await click("Pouze zobrazená");
    expect(container.textContent).toContain("1 téma v PDF");
    await click("Stáhnout PDF");
    expect(mocks.download).toHaveBeenCalledWith({ selectedIds: ["P02"], percent: 50, insuredSum: 1_000_000 });
    expect(container.textContent).toContain("Co může výsledek změnit");
    await click("Zrušit výběr"); expect(button("Stáhnout PDF").disabled).toBe(true);
  });
  it("validuje model a po změně procenta exportuje aktuální výpočet", async () => {
    await fill("insured-sum", "0");
    expect(button("Stáhnout PDF").disabled).toBe(true);
    expect(container.querySelector("#insured-sum")?.getAttribute("aria-invalid")).toBe("true");
    await fill("insured-sum", "500000"); await click("70 %"); await click("Stáhnout PDF");
    expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ insuredSum: 500_000, percent: 70 }));
  });
  it("nevykreslí interní obsah chyby a umožní stažení zopakovat", async () => {
    mocks.download.mockRejectedValueOnce(new Error("private API diagnostic <script>secret</script>"));
    await click("Stáhnout PDF");
    expect(container.textContent).toContain("PDF se nepodařilo připravit");
    expect(container.textContent).not.toContain("private API diagnostic");
    expect(button("Stáhnout PDF").disabled).toBe(false);
    await click("Stáhnout PDF"); expect(mocks.download).toHaveBeenCalledTimes(2);
  });
});
