// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CashflowItem, MonthGroup } from "../types";
import { formatMoney } from "../helpers";
import { CashflowMonthModal } from "./CashflowMonthModal";

const item = (id: string, overrides: Partial<CashflowItem> = {}): CashflowItem => ({
  id, amount: 1000, date: new Date(2026, 10, 25), productKey: "domex",
  contractNumber: `SYNTHETIC-${id}`, clientName: id, source: "own", ownerEmail: null, entryId: null,
  ...overrides,
});
const month = (items: CashflowItem[], key = "2026-11"): MonthGroup => ({
  key, year: 2026, monthIndex: 10, label: key, totalSource: "predicted",
  predictedTotal: items.reduce((sum, part) => sum + part.amount, 0), statementPayoutTotal: null,
  total: items.reduce((sum, part) => sum + part.amount, 0), items,
});
const normalize = (value: string | null) => (value ?? "").replace(/\s+/g, " ").trim();

describe("month detail ordering and filters", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onClose = vi.fn();
  const render = (value: MonthGroup | null) => act(async () => root.render(
    <CashflowMonthModal month={value} onClose={onClose} />
  ));
  const cards = () => [...container.querySelectorAll<HTMLElement>("[data-cashflow-card]")];
  const trigger = () => [...container.querySelectorAll("button")].find(button => button.textContent?.startsWith("Filtry"))!;
  const open = () => act(async () => trigger().click());
  const choose = (value: string) => act(async () => container.querySelector<HTMLInputElement>(`input[value="${value}"]`)!.click());
  const searchInput = () => container.querySelector<HTMLInputElement>('input[type="search"]')!;
  const searchFor = (value: string) => act(async () => {
    const input = searchInput();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    onClose.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("puts own and team forecasts before shifted payouts within a product section without changing input order", async () => {
    const items = [
      item("A shifted", { payoutStatus: "shifted" }),
      item("Z team forecast", { payoutStatus: "predicted", source: "manager" }),
      item("B own forecast"),
    ];
    await render(month(items));
    expect(cards().map(card => card.querySelector("summary")?.textContent)).toEqual([
      expect.stringContaining("B own forecast"),
      expect.stringContaining("Z team forecast"),
      expect.stringContaining("A shifted"),
    ]);
    expect(items.map(part => part.id)).toEqual(["A shifted", "Z team forecast", "B own forecast"]);
  });

  it("filters individual parts of the same contract, recalculates section counts and totals, and retains the month summary", async () => {
    const shared = { contractNumber: "SYNTHETIC-SHARED", clientName: "Synthetic shared client" };
    const value = month([
      item("forecast", { ...shared, commissionLabel: "Forecast part", amount: 1000 }),
      item("shifted", { ...shared, commissionLabel: "Shifted part", amount: 500, payoutStatus: "shifted" }),
      item("paid", { payoutStatus: "paid", amount: 200 }),
      item("cancellation", { payoutStatus: "shifted", amount: -100 }),
    ]);
    await render(value);
    await open();
    await choose("shifted");
    expect(cards()).toHaveLength(1);
    expect(cards()[0].textContent).toContain("Shifted part");
    expect(cards()[0].textContent).not.toContain("Forecast part");
    expect(normalize(container.querySelector('[data-cashflow-section="property"] > summary')!.textContent))
      .toContain(normalize(formatMoney(500)));
    expect(container.textContent).toContain("1 smlouva · 1 provize");
    expect(normalize(container.textContent)).toContain(normalize(formatMoney(value.total)));
    expect(container.textContent).toContain("Souhrn částek je za celý měsíc.");

    await choose("predicted");
    expect(cards()).toHaveLength(1);
    expect(cards()[0].textContent).toContain("Forecast part");
    expect(cards()[0].textContent).not.toContain("Shifted part");

    await choose("all");
    expect(cards()).toHaveLength(3);
    expect(container.textContent).not.toContain("Souhrn částek je za celý měsíc.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows an empty state when the selected status has no payouts", async () => {
    await render(month([item("forecast")]));
    await open();
    await choose("shifted");
    expect(cards()).toHaveLength(0);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("žádné položky");
  });

  it("searches by partial contract number or client name and combines the search with the status filter", async () => {
    const value = month([
      item("first", { clientName: "Šárka Nováková", contractNumber: "AB-20 / 601-45" }),
      item("second", { clientName: "Šárka Jiná", payoutStatus: "shifted" }),
    ]);
    await render(value);
    const section = () => container.querySelector<HTMLDetailsElement>('[data-cashflow-section="property"]')!;
    expect(section().open).toBe(false);

    await searchFor("20601");
    expect(cards()).toHaveLength(1);
    expect(cards()[0].querySelector("h4")?.textContent).toBe("Šárka Nováková");
    expect(section().open).toBe(true);
    expect(normalize(container.textContent)).toContain(normalize(formatMoney(value.total)));

    await searchFor("  NOVAK sar ");
    expect(cards()).toHaveLength(1);
    expect(cards()[0].querySelector("h4")?.textContent).toBe("Šárka Nováková");

    await open();
    await choose("shifted");
    expect(cards()).toHaveLength(0);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Hledání v tomto měsíci nenašlo žádné položky.");

    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Vymazat hledání"]')!.click());
    expect(searchInput().value).toBe("");
    expect(document.activeElement).toBe(searchInput());
    expect(cards()).toHaveLength(1);
    expect(cards()[0].querySelector("h4")?.textContent).toBe("Šárka Jiná");
  });

  it("closes the picker on Escape and outside interaction, restoring focus on Escape", async () => {
    await render(month([item("forecast")]));
    await open();
    expect(document.activeElement).toBe(container.querySelector('input[value="all"]'));
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger());
    await open();
    await act(async () => container.querySelector("h3")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("resets the filter and search when switching months or reopening the detail", async () => {
    const items = [item("forecast"), item("shifted", { payoutStatus: "shifted" })];
    await render(month(items));
    await open();
    await choose("shifted");
    await searchFor("shifted");
    expect(cards()).toHaveLength(1);
    await render(month(items, "2026-12"));
    expect(cards()).toHaveLength(2);
    expect(searchInput().value).toBe("");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    await open();
    await choose("predicted");
    await searchFor("forecast");
    await render(null);
    await render(month(items, "2026-12"));
    expect(cards()).toHaveLength(2);
    expect(searchInput().value).toBe("");
  });
});
