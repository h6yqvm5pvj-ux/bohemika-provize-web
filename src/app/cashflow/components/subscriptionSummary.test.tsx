// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CashflowAccordion } from "./CashflowAccordion";
import { CashflowMonthModal } from "./CashflowMonthModal";
import { formatMoney, groupMonthsByYear } from "../helpers";
import type { MonthGroup } from "../types";

const month: MonthGroup = {
  key: "2026-9", year: 2026, monthIndex: 8, label: "Září 2026",
  total: 1350, predictedTotal: 1450, totalSource: "paid", statementPayoutTotal: 1000,
  items: [{ id: "receipt", date: new Date(2026, 8, 1), amount: 350,
    productKey: "subscription", isSubscriptionPayment: true, payoutStatus: "paid", ownerEmail: null, entryId: null }],
};
const text = (value: string) => value.replace(/\s+/g, " ").trim();

describe("cashflow subscription summary", () => {
  it("shows the unified amount in the year, month card, chart and detail with its source breakdown", () => {
    const overview = document.createElement("div");
    overview.innerHTML = renderToStaticMarkup(<CashflowAccordion yearGroups={groupMonthsByYear([month])}
      expandedYears={{ 2026: true }} onToggleYear={() => {}} onSelectMonth={() => {}} />);
    expect(text(overview.querySelector('[data-year="2026"] > button')!.textContent!)).toContain(text(formatMoney(1350)));
    const monthCard = overview.querySelector('[data-calendar-month="8"]')!;
    expect(text(monthCard.textContent!)).toContain(text(formatMoney(1350)));
    expect(monthCard.textContent).toContain("Výpis + předplatné");
    expect(text(overview.querySelector('[data-month-index="8"]')!.getAttribute("aria-label")!)).toContain(text(formatMoney(1350)));

    const detail = document.createElement("div");
    detail.innerHTML = renderToStaticMarkup(<CashflowMonthModal month={month} onClose={() => {}} />);
    expect(text(detail.textContent!)).toContain(`Přijato celkem${text(formatMoney(1350))}`);
    expect([...detail.querySelectorAll("p")].map(p => text(p.textContent!))).toContain(`Výpis: ${text(formatMoney(1000))}`);
    expect([...detail.querySelectorAll("p")].map(p => text(p.textContent!))).toContain(`Předplatné: ${text(formatMoney(350))}`);
  });

  it("keeps the usual statement label for accounts without subscription receipts", () => {
    const unchanged = { ...month, total: 1000, items: [] };
    const detail = renderToStaticMarkup(<CashflowMonthModal month={unchanged} onClose={() => {}} />);
    expect(detail).toContain("Vyplaceno");
    expect(detail).not.toContain("Přijato celkem");
    expect(detail).not.toContain("Předplatné:");
  });
});
