// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CashflowItem, MonthGroup } from "../types";
import { CashflowMonthModal } from "./CashflowMonthModal";

const text = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
const item = (id: string, overrides: Partial<CashflowItem> = {}): CashflowItem => ({
  id, amount: 1000, date: new Date(2027, 0, 25), originalDate: new Date(2026, 11, 25),
  productKey: "neon", payoutStatus: "shifted", contractNumber: "SYNTHETIC-001",
  clientName: "Testovací klient", ownerEmail: "advisor@example.test", entryId: "synthetic-contract",
  commissionCode: id, commissionLabel: `Provize ${id}`, source: "own", ...overrides,
});
const render = (items: CashflowItem[]) => {
  const total = items.reduce((sum, part) => sum + part.amount, 0);
  const month: MonthGroup = {
    key: "2027-1", year: 2027, monthIndex: 0, label: "Leden 2027",
    total, predictedTotal: total, statementPayoutTotal: null, totalSource: "predicted", items,
  };
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<CashflowMonthModal month={month} onClose={() => {}} />);
  return container;
};
const card = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-cashflow-card]")!;
const summary = (container: HTMLElement) => text(card(container).querySelector("summary")?.textContent);
const row = (container: HTMLElement, label: string) => [...card(container).querySelectorAll("tbody tr")]
  .find(node => text(node.querySelector("th")?.textContent).startsWith(label));

describe("month detail shifted payouts", () => {
  it.each([
    { originalDate: new Date(2026, 11, 31), periods: ["11/2026", "11/2026", "other"], label: "Přesunuto o 1 měsíc" },
    { originalDate: new Date(2025, 10, 25), periods: [], label: "Přesunuto o 14 měsíců" },
  ])("shows the full calendar delay across year boundaries: $label", ({ originalDate, periods, label }) => {
    const container = render([item("A101", { originalDate, missedStatementPeriods: periods })]);
    expect(summary(container)).toContain(label);
  });

  it("shows a range for grouped payouts and each payout's exact delay in the breakdown", () => {
    const container = render([
      item("A101"),
      item("B0301", { originalDate: new Date(2026, 9, 25), amount: 500 }),
    ]);

    expect(container.querySelectorAll("[data-cashflow-card]")).toHaveLength(1);
    expect(summary(container)).toContain("Přesunuto o 1–3 měsíce");
    expect(text(row(container, "Provize A101")?.textContent)).toContain("Přesunuto o 1 měsíc");
    expect(text(row(container, "Provize B0301")?.textContent)).toContain("Přesunuto o 3 měsíce");
  });

  it("keeps paid payouts paid alongside an exact delay for the pending payout", () => {
    const container = render([
      item("A101", { payoutStatus: "paid", originalDate: new Date(2026, 9, 25) }),
      item("B0301", { originalDate: new Date(2026, 10, 25), amount: 500 }),
    ]);

    expect(summary(container)).toContain("Různé stavy");
    expect(text(row(container, "Provize A101")?.textContent)).toContain("Vyplaceno");
    expect(text(row(container, "Provize A101")?.textContent)).not.toContain("Přesunuto");
    expect(text(row(container, "Provize B0301")?.textContent)).toContain("Přesunuto o 2 měsíce");
  });

  it.each([
    undefined,
    new Date("invalid"),
    new Date(2027, 0, 1),
    new Date(2027, 1, 25),
  ])("keeps the shift badge without inventing a delay for an unavailable or nonpositive interval (%s)", originalDate => {
    const container = render([item("A101", { originalDate })]);
    const badges = [...card(container).querySelectorAll("summary span")].map(node => text(node.textContent));
    expect(badges).toContain("Přesunuto");
    expect(summary(container)).not.toContain("Přesunuto o");
    expect(summary(container)).not.toContain("NaN");
  });
});
