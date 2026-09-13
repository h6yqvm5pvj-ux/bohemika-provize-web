// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractFiltersDialog } from "./ContractFiltersDialog";
import { CATEGORY_DEFS, INSTITUTION_DEFS } from "./contractsPageFilters";
import { COMMISSION_AUDIT_MODE_DEFS, COMMISSION_AUDIT_CODE_DEFS } from "./contractFilterOptions";
import { emptyContractFilterSelection } from "./contractFilterSelection";

vi.mock("next/image", () => ({ default: () => <span /> }));
let root: Root, container: HTMLDivElement;
const apply = vi.fn(), close = vi.fn();
const advisers = [
  { email: "jana@example.test", label: "Jana Černá" },
  { email: "jan@example.test", label: "Jan Novák" },
  { email: "petr@example.test", label: "Petr Malý" },
];
async function render(node: ReactNode) { await act(async () => root.render(node)); }
async function mount(canShowTeam = true) { await render(<ContractFiltersDialog value={emptyContractFilterSelection()} availablePositions={["poradce2", "poradce5", "manazer4"]} advisers={advisers} canShowTeam={canShowTeam} onApply={apply} onClose={close} />); }
function button(label: string) { return [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === label || item.getAttribute("aria-label") === label)!; }
async function click(node: HTMLElement) { expect(node).toBeTruthy(); await act(async () => node.click()); }
async function choice(text: string, section?: string) {
  const label = [...container.querySelectorAll("label")].find(item => (!section || item.closest("section")?.querySelector("h3")?.textContent?.startsWith(section)) && (item.textContent?.trim() === text || item.textContent?.trim().startsWith(text)));
  expect(label, text).toBeTruthy(); await click(label!.querySelector("input")!);
}
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
beforeEach(() => { vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("contract filter dialog", () => {
  it("offers only the supplied career history and applies multiple signing positions", async () => {
    await mount();
    const section = [...container.querySelectorAll("section")].find(item => item.querySelector("h3")?.textContent?.startsWith("Sjednaná pozice"))!;
    expect([...section.querySelectorAll("label")].map(item => item.textContent)).toEqual(["Poradce 2", "Poradce 5", "Manažer 4"]);
    await choice("Poradce 2"); await choice("Manažer 4");
    expect(apply).not.toHaveBeenCalled(); await submit();
    expect(apply.mock.lastCall![0].selectedPositions).toEqual(["poradce2", "manazer4"]);
    expect(container.querySelector('[role="tab"]')?.textContent).toBe("Smlouvy2");
    await click(button("Odebrat filtr: Poradce 2")); await submit();
    expect(apply.mock.lastCall![0].selectedPositions).toEqual(["manazer4"]);
    await choice("Manažer 4"); await submit(); expect(apply.mock.lastCall![0].selectedPositions).toEqual([]);
  });

  it("never falls back to offering all career levels when history is empty", async () => {
    await render(<ContractFiltersDialog value={emptyContractFilterSelection()} advisers={[]} availablePositions={[]} canShowTeam={false} onApply={apply} onClose={close} />);
    const section = [...container.querySelectorAll("section")].find(item => item.querySelector("h3")?.textContent?.startsWith("Sjednaná pozice"))!;
    expect(section.querySelectorAll("input")).toHaveLength(0);
    await submit(); expect(apply.mock.lastCall![0].selectedPositions).toEqual([]);
  });

  it("keeps changes local until Apply and submits all product and institution choices", async () => {
    await mount();
    for (const category of CATEGORY_DEFS) await choice(category.label);
    for (const institution of INSTITUTION_DEFS) await choice(institution.label, "Pojišťovna");
    expect(apply).not.toHaveBeenCalled();
    await submit();
    expect(apply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ selectedCategories: CATEGORY_DEFS.map(item => item.id), selectedInstitutions: INSTITUTION_DEFS.map(item => item.id) }));
  });

  it("supports latest, anniversary, payment, replacement and compatible lifecycle combinations", async () => {
    await mount(); await choice("Výročí do 90 dnů"); await choice("Nezaplacené"); await choice("Refresh / náhrada"); await submit();
    expect(apply.mock.lastCall![0]).toMatchObject({ filterMode: "anniversary", showUnpaidOnly: true, showRefreshOnly: true });
    await choice("Stornované"); await choice("Dožité"); await submit();
    expect(apply.mock.lastCall![0]).toMatchObject({ filterMode: "latest", showUnpaidOnly: false, showStornoOnly: true, showMaturedOnly: true });
    await choice("Aktivní"); await submit();
    expect(apply.mock.lastCall![0]).toMatchObject({ showActiveOnly: true, showStornoOnly: false, showMaturedOnly: false });
    await click(button("Všechny")); await submit(); expect(apply.mock.lastCall![0].showActiveOnly).toBe(false);
    await choice("Výročí do 90 dnů"); await choice("Nejnovější"); await submit(); expect(apply.mock.lastCall![0].filterMode).toBe("latest");
  });

  it("submits every commission mode and code; switching off clears and disables the code", async () => {
    await mount(); await click(button("Provize"));
    const select = container.querySelector("select")!;
    expect(select.disabled).toBe(true);
    for (const mode of COMMISSION_AUDIT_MODE_DEFS) {
      await choice(mode.label);
      for (const code of COMMISSION_AUDIT_CODE_DEFS) {
        await act(async () => { select.value = code.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
        await submit(); expect(apply.mock.lastCall![0]).toMatchObject({ commissionAuditMode: mode.id, commissionAuditCodeFilter: code.id });
      }
    }
    await choice("Vypnuto"); await submit();
    expect(apply.mock.lastCall![0]).toMatchObject({ commissionAuditMode: "off", commissionAuditCodeFilter: "all" });
    expect(select.disabled).toBe(true);
  });

  it("searches Czech adviser names, bulk selects only matches and preserves choices outside the search", async () => {
    await mount(); await click(button("Poradci")); await choice("Petr Malý");
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "cerna");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button("Vybrat všechny zobrazené")); await submit();
    expect(apply.mock.lastCall![0].selectedSubordinates).toEqual(["petr@example.test", "jana@example.test"]);
    await click(button("Zrušit výběr zobrazených")); await submit(); expect(apply.mock.lastCall![0].selectedSubordinates).toEqual(["petr@example.test"]);
    await click(button("Odebrat filtr: Petr Malý")); await submit(); expect(apply.mock.lastCall![0].selectedSubordinates).toEqual([]);
  });

  it("clears selections across all tabs without applying until confirmed", async () => {
    await mount(); await choice("Poradce 2"); await choice("Auto"); await choice("Nezaplacené"); await click(button("Provize")); await choice("Nevyplacené");
    await click(button("Poradci")); await choice("Jan Novák"); await click(button("Vymazat filtry"));
    expect(apply).not.toHaveBeenCalled(); await submit(); expect(apply).toHaveBeenCalledWith(emptyContractFilterSelection());
  });

  it("cancels via Cancel, close, Escape and the backdrop without applying", async () => {
    await mount(); await choice("Auto"); await choice("Poradce 2");
    await click(button("Zrušit")); await click(button("Zavřít filtry"));
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await click(container.querySelector<HTMLDivElement>('[aria-hidden="true"]')!);
    expect(close).toHaveBeenCalledTimes(4); expect(apply).not.toHaveBeenCalled();
  });

  it("locks background scroll, supports tab arrows and restores focus when closed", async () => {
    const opener = document.createElement("button"); document.body.append(opener); opener.focus();
    await mount(); expect(document.body.style.overflow).toBe("hidden");
    const tab = container.querySelector('[role="tab"]')!;
    await act(async () => tab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Provize");
    await render(null); expect(document.body.style.overflow).toBe(""); expect(document.activeElement).toBe(opener); opener.remove();
  });

  it("hides team filters for an adviser without team access", async () => {
    await mount(false); expect(button("Poradci")).toBeUndefined(); await submit(); expect(apply.mock.lastCall![0].selectedSubordinates).toEqual([]);
  });
});
