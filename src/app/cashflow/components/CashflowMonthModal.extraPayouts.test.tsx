// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatMoney } from "@/app/lib/formatters";
import type { CashflowItem, MonthGroup } from "../types";
import { CashflowMonthModal } from "./CashflowMonthModal";

const text = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
const money = (value: number) => text(formatMoney(value));
const paidCommission: CashflowItem = {
  id: "synthetic-commission", date: new Date(2026, 1, 25), amount: 1000,
  productKey: "neon", payoutStatus: "paid", source: "own", commissionLabel: "Provize A101",
  commissionCode: "A101", clientName: "Testovací klient", contractNumber: "SYNTHETIC-001",
  ownerEmail: "advisor@example.test", entryId: "synthetic-contract",
};
const reward = (id = "synthetic-reward", amount = 75000): CashflowItem => ({
  id, date: new Date(2026, 1, 1), amount, productKey: "unknown", payoutStatus: "paid",
  source: "own", isExtraPayout: true, commissionLabel: "Mimořádná odměna",
  ownerEmail: "advisor@example.test", entryId: null, clientName: null,
});
function render(items: CashflowItem[], overrides: Partial<MonthGroup> = {}) {
  const month: MonthGroup = {
    key: "2026-2", year: 2026, monthIndex: 1, label: "Únor 2026",
    total: 75850, predictedTotal: 1000, statementPayoutTotal: 850, extraPayoutTotal: 75000,
    totalSource: "paid", items, ...overrides,
  };
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<CashflowMonthModal month={month} onClose={() => {}} />);
  return container;
}
const paragraphs = (container: HTMLElement) => [...container.querySelectorAll("p")].map(node => text(node.textContent));
const section = (container: HTMLElement, category: string) => container.querySelector<HTMLElement>(`[data-cashflow-section="${category}"]`)!;

describe("month detail extra paid rewards", () => {
  it("adds a separate paid reward without a fund deduction or a fabricated contract", () => {
    const container = render([paidCommission, reward()]);
    const extra = section(container, "extra");
    const card = extra.querySelector("[data-cashflow-card]")!;
    const regular = section(container, "life");

    expect(text(container.textContent)).toContain(`Přijato celkem${money(75850)}`);
    expect(paragraphs(container)).toContain(`Výpis: ${money(850)}`);
    expect(paragraphs(container)).toContain(`Mimořádné odměny: ${money(75000)}`);
    expect(paragraphs(container)).not.toContain(`Předplatné: ${money(75000)}`);
    expect(text(extra.querySelector("summary")?.textContent)).toContain("Mimořádné odměny");
    expect(text(extra.querySelector("summary")?.textContent)).toContain("1 odměna");
    expect(text(card.querySelector("h4")?.textContent)).toBe("Mimořádná odměna");
    expect(text(card.querySelector("summary")?.textContent)).toContain(`Vyplaceno${money(75000)}`);
    expect(text(card.textContent)).toContain("únor 2026");
    expect(text(card.textContent)).not.toMatch(/Klient neuveden|Neznámý produkt|Vlastní smlouva|Týmová smlouva|Frekvence platby|Zadané pojistné|Stornofond|1\. 2\. 2026/);
    expect(card.querySelector('a[href^="/smlouvy/"]')).toBeNull();
    expect([...card.querySelectorAll("thead th")].map(node => text(node.textContent))).toEqual(["Výplata", "Částka"]);
    expect(text(card.querySelector("tbody")?.textContent)).toContain(money(75000));
    expect(text(regular.textContent)).toContain("Stornofond 15 %");
    expect(text(regular.textContent)).toContain(money(850));
    expect(paragraphs(container)).toContain("1 smlouva · 1 provize · 1 odměna");
  });

  it("keeps subscription receipts distinct from extra rewards in the paid summary", () => {
    const subscription: CashflowItem = {
      id: "synthetic-subscription", date: new Date(2026, 1, 4), amount: 350,
      productKey: "subscription", payoutStatus: "paid", isSubscriptionPayment: true,
      ownerEmail: null, entryId: null,
    };
    const container = render([paidCommission, reward(), subscription], { total: 76200 });
    expect(text(container.textContent)).toContain(`Přijato celkem${money(76200)}`);
    expect(paragraphs(container)).toContain(`Výpis: ${money(850)}`);
    expect(paragraphs(container)).toContain(`Předplatné: ${money(350)}`);
    expect(paragraphs(container)).toContain(`Mimořádné odměny: ${money(75000)}`);
  });

  it("shows an extra-only paid month without inventing a statement or exact payment day", () => {
    const container = render([reward()], { total: 75000, predictedTotal: 0, statementPayoutTotal: undefined });
    expect(text(container.textContent)).toContain(`Přijato celkem${money(75000)}`);
    expect(paragraphs(container)).toContain(`Mimořádné odměny: ${money(75000)}`);
    expect(paragraphs(container).some(value => /^(Výpis|Vyplacené provize|Předplatné):/.test(value))).toBe(false);
    expect(paragraphs(container)).toContain("1 odměna");
    expect(text(section(container, "extra").textContent)).not.toContain("1. 2. 2026");
  });

  it("keeps independently recorded rewards separate and identifies actual commissions without a statement", () => {
    const container = render([paidCommission, reward("first", 40000), reward("second", 35000)], {
      total: 76000, statementPayoutTotal: undefined,
    });
    expect(section(container, "extra").querySelectorAll("[data-cashflow-card]")).toHaveLength(2);
    expect(text(section(container, "extra").querySelector("summary")?.textContent)).toContain("2 odměny");
    expect(paragraphs(container)).toContain(`Vyplacené provize: ${money(1000)}`);
    expect(paragraphs(container)).toContain(`Mimořádné odměny: ${money(75000)}`);
  });
});
