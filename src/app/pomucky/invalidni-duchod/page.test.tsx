// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("next/link", () => ({ default: ({ children, href, className }: { children: ReactNode; href: string; className: string }) => <a href={href} className={className}>{children}</a> }));
import DisabilityPensionPage from "./page";

let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<DisabilityPensionPage />));
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function button(text: string) {
  const found = [...container.querySelectorAll("button")].find((node) => node.textContent?.trim() === text || node.getAttribute("aria-label") === text);
  expect(found).toBeTruthy();
  return found!;
}
async function click(text: string) { await act(async () => button(text).click()); }
async function fill(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function minimum(value: string) {
  const trigger = container.querySelector<HTMLButtonElement>("#pension-minimum")!;
  await act(async () => trigger.click());
  const option = document.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`)!;
  expect(option).toBeTruthy();
  await act(async () => option.click());
}
const total = (degree: number) => container.querySelector(`[data-testid="pension-total-${degree}"]`)?.textContent?.replaceAll("\u00a0", " ");

describe("kalkulačka invalidního důchodu", () => {
  it("shows no fabricated result before filling inputs, and clears results on reset", async () => {
    expect(total(1)).toBe("—"); expect(button("Kopírovat výsledek").disabled).toBe(true);
    expect(container.querySelector("#pension-minimum")?.textContent).toContain("Kliknutím vyber");
    await click("Vyplnit modelový příklad");
    expect([total(1), total(2), total(3)]).toEqual(["10 760 Kč", "13 690 Kč", "22 479 Kč"]);
    await click("Vymazat údaje");
    expect(total(3)).toBe("—"); expect(button("Kopírovat výsledek").disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>("#pension-income")?.value).toBe("");
    expect(container.querySelector("#pension-minimum")?.getAttribute("data-value")).toBe("");
  });

  it("recalculates for real input changes, including zero and higher minima", async () => {
    await fill("pension-income", "0"); await fill("pension-years", "45");
    expect(total(1)).toBe("—");
    expect(button("Kopírovat výsledek").disabled).toBe(true);
    await minimum("ordinary");
    expect([total(1), total(2), total(3)]).toEqual(["6 534 Kč", "7 350 Kč", "9 800 Kč"]);
    await minimum("insured15");
    expect([total(1), total(2), total(3)]).toEqual(["9 169 Kč", "11 304 Kč", "17 707 Kč"]);
    await minimum("under28"); expect(total(3)).toBe("17 707 Kč");
    expect(container.textContent).toContain("Samotný věk nestačí");
  });

  it("removes stale results for invalid, cleared or contradictory entries", async () => {
    await click("Vyplnit modelový příklad");
    await fill("pension-years", "14"); expect(total(3)).toBe("—");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("alespoň 15 let");
    await minimum("ordinary"); expect(total(3)).not.toBe("—");
    await fill("pension-years", "45,5"); expect(total(3)).toBe("—");
    await fill("pension-years", "45"); await fill("pension-income", "-500"); expect(total(3)).toBe("—");
    expect(container.querySelector("#pension-income")?.getAttribute("aria-invalid")).toBe("true");
    await fill("pension-income", ""); expect(total(3)).toBe("—");
    expect(button("Kopírovat výsledek").disabled).toBe(true);
  });

  it("copies results with the chosen income meaning and assumptions", async () => {
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await click("Vyplnit modelový příklad"); await click("Znám svůj OVZ");
    expect(button("Znám svůj OVZ").getAttribute("aria-pressed")).toBe("true");
    await click("Kopírovat výsledek");
    expect(write).toHaveBeenCalledWith(expect.stringContaining("Osobní vyměřovací základ:"));
    expect(write).toHaveBeenCalledWith(expect.stringContaining("Nárok ani stupeň invalidity"));
    expect(button("Zkopírováno")).toBeTruthy();
    await fill("pension-income", "30000"); expect(button("Kopírovat výsledek")).toBeTruthy();
  });

  it("reports clipboard errors without losing the calculation", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    await click("Vyplnit modelový příklad"); await click("Kopírovat výsledek");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Kopírování se nepodařilo");
    expect(total(3)).toBe("22 479 Kč");
  });
});
