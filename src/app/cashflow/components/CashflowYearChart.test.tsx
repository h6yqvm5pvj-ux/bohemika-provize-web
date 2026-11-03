// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatMoney } from "@/app/lib/formatters";
import type { MonthGroup, YearGroup } from "../types";
import { CashflowYearChart } from "./CashflowYearChart";

const month = (monthIndex: number, total: number, overrides: Partial<MonthGroup> = {}): MonthGroup => ({
  key: `2026-${monthIndex + 1}`, year: 2026, monthIndex, label: `Měsíc ${monthIndex + 1}`,
  total, predictedTotal: total, totalSource: "predicted", statementPayoutTotal: null, items: [],
  ...overrides,
});
const year = (...months: MonthGroup[]): YearGroup => ({
  year: 2026, total: months.reduce((sum, value) => sum + value.total, 0), months,
});
const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
const content = (element: Element | null) => normalized(element?.textContent ?? "");
const onSelectMonth = vi.fn();
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const buttonFor = (index: number) => container.querySelector<HTMLButtonElement>(`[data-month-index="${index}"]`)!;
const hover = (button: HTMLButtonElement) => button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
const render = async (yearGroup: YearGroup, previousMonth?: MonthGroup | null) => {
  await act(async () => root.render(<CashflowYearChart yearGroup={yearGroup} previousMonth={previousMonth} onSelectMonth={onSelectMonth} />));
};

describe("cashflow line chart interactions", () => {
  it("keeps missing months disabled while a real zero opens the original month", async () => {
    const zero = month(8, 0);
    await render(year(zero));
    expect(container.querySelectorAll("button[data-month-index]")).toHaveLength(12);
    const missing = buttonFor(0);
    const available = buttonFor(8);
    expect(missing.disabled).toBe(true);
    expect(missing.getAttribute("aria-label")).toContain("bez dat v aktuálním výběru");
    expect(available.disabled).toBe(false);
    expect(normalized(available.getAttribute("aria-label")!)).toContain(normalized(formatMoney(0)));

    await act(async () => missing.click());
    expect(onSelectMonth).not.toHaveBeenCalled();
    await act(async () => available.click());
    expect(onSelectMonth).toHaveBeenCalledExactlyOnceWith(zero);
    expect(onSelectMonth.mock.calls[0][0]).toBe(zero);
  });

  it.each(["pointer", "keyboard"] as const)("shows the unified paid amount and source on %s interaction", async (interaction) => {
    const paid = month(8, 1350, {
      label: "Září 2026", predictedTotal: 1450, statementPayoutTotal: 1000, totalSource: "paid",
      items: [{
        id: "synthetic-receipt", date: new Date(2026, 8, 1), amount: 350,
        productKey: "subscription", isSubscriptionPayment: true, payoutStatus: "paid", ownerEmail: null, entryId: null,
      }],
    });
    await render(year(month(7, 1000, { label: "Srpen 2026" }), paid));
    const button = buttonFor(8);
    await act(async () => { if (interaction === "pointer") hover(button); else button.focus(); });

    const tooltip = container.querySelector('[role="tooltip"]')!;
    expect(tooltip).not.toBeNull();
    expect(content(tooltip)).toContain(normalized(formatMoney(1350)));
    expect(content(tooltip)).not.toContain(normalized(formatMoney(1450)));
    expect(content(tooltip)).not.toContain(normalized(formatMoney(1000)));
    expect(content(tooltip)).toContain("Září 2026");
    expect(content(tooltip)).toContain("Výpis + předplatné");
    expect(content(tooltip.querySelector('[data-trend="up"]'))).toBe("+35 %");
    expect(tooltip.id).not.toBe("");
    expect(button.getAttribute("aria-describedby")).toBe(tooltip.id);

    await act(async () => button.click());
    expect(onSelectMonth).toHaveBeenCalledExactlyOnceWith(paid);
    expect(onSelectMonth.mock.calls[0][0]).toBe(paid);
  });

  it.each([
    { amount: 1813, percentage: "+81,3 %", trend: "up" },
    { amount: 750, percentage: "-25 %", trend: "down" },
    { amount: 1000, percentage: "0 %", trend: "flat" },
  ])("shows $percentage against the previous calendar month for a displayed amount of $amount", async ({ amount, percentage, trend }) => {
    await render(year(month(7, 1000, { label: "Srpen 2026" }), month(8, amount, { label: "Září 2026" })));
    await act(async () => buttonFor(8).focus());
    const tooltip = container.querySelector('[role="tooltip"]')!;
    expect(content(tooltip.querySelector("[data-trend]"))).toBe(percentage);
    expect(tooltip.querySelector("[data-trend]")?.getAttribute("data-trend")).toBe(trend);
    expect(content(tooltip)).toContain(normalized(formatMoney(amount)));
    expect(content(tooltip)).toContain("srpen 2026");
  });

  it.each([
    { reason: "missing", previous: null },
    { reason: "zero", previous: month(7, 0) },
    { reason: "negative", previous: month(7, -100) },
  ])("omits the percentage when the previous calendar month is $reason", async ({ previous }) => {
    await render(year(month(6, 500), ...(previous ? [previous] : []), month(8, 1500)));
    await act(async () => { hover(buttonFor(8)); });
    const tooltip = container.querySelector('[role="tooltip"]')!;
    expect(content(tooltip)).toContain(normalized(formatMoney(1500)));
    expect(tooltip.querySelector("[data-trend]")).toBeNull();
    expect(content(tooltip)).not.toContain("%");
  });

  it("compares January only with an explicitly supplied December from the preceding year", async () => {
    const january = month(0, 1000, { label: "Leden 2026" });
    await render(year(january, month(11, 5000)));
    await act(async () => buttonFor(0).focus());
    expect(container.querySelector('[role="tooltip"] [data-trend]')).toBeNull();

    const december = month(11, 750, { key: "2025-12", year: 2025, label: "Prosinec 2025" });
    await render(year(january), december);
    const tooltip = container.querySelector('[role="tooltip"]')!;
    expect(content(tooltip.querySelector('[data-trend="up"]'))).toBe("+33,3 %");
    expect(content(tooltip)).toContain("prosinec 2025");
    expect(onSelectMonth).not.toHaveBeenCalled();
  });

  it("moves the tooltip and accessible description to keyboard focus after hovering another month", async () => {
    const hovered = month(0, 500, { label: "Leden 2026" });
    const focused = month(1, 1250, { label: "Únor 2026" });
    await render(year(hovered, focused));
    const first = buttonFor(0);
    const second = buttonFor(1);
    await act(async () => { hover(first); });
    expect(content(container.querySelector('[role="tooltip"]'))).toContain("Leden 2026");

    await act(async () => second.focus());
    expect(document.activeElement).toBe(second);
    const tooltip = container.querySelector('[role="tooltip"]')!;
    expect(content(tooltip)).toContain("Únor 2026");
    expect(content(tooltip)).toContain(normalized(formatMoney(1250)));
    expect(content(tooltip)).not.toContain("Leden 2026");
    expect(second.getAttribute("aria-describedby")).toBe(tooltip.id);
    expect(first.hasAttribute("aria-describedby")).toBe(false);
    expect(onSelectMonth).not.toHaveBeenCalled();
  });

  it("dismisses focused and hovered tooltips with Escape without moving focus or opening a month", async () => {
    await render(year(month(0, 500)));
    const button = buttonFor(0);
    await act(async () => button.focus());
    expect(container.querySelector('[role="tooltip"]')).not.toBeNull();

    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    expect(button.hasAttribute("aria-describedby")).toBe(false);
    expect(document.activeElement).toBe(button);

    await act(async () => { hover(button); });
    expect(container.querySelector('[role="tooltip"]')).not.toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    expect(button.hasAttribute("aria-describedby")).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(onSelectMonth).not.toHaveBeenCalled();
  });

  it("leaves an empty year with twelve inactive months and no invented paid value or tooltip", async () => {
    await render(year());
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button[data-month-index]")];
    expect(buttons).toHaveLength(12);
    expect(buttons.every(button => button.disabled)).toBe(true);
    expect(buttons.every(button => button.getAttribute("aria-label")?.includes("bez dat v aktuálním výběru"))).toBe(true);
    await act(async () => { hover(buttons[0]); buttons[0].focus(); buttons[0].click(); });
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    expect(container.querySelector('[data-tone="paid"]')).toBeNull();
    expect(container.querySelector("[aria-describedby]")).toBeNull();
    expect(container.textContent).not.toContain("Nejsilnější měsíc");
    expect(onSelectMonth).not.toHaveBeenCalled();
  });
});
