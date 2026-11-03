// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatMoney } from "@/app/lib/formatters";
import type { CashflowItem, MonthGroup } from "../types";
import { CashflowMonthModal } from "./CashflowMonthModal";

const text = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
const item = (id: string, amount: number, overrides: Partial<CashflowItem> = {}): CashflowItem => ({
  id, amount, date: new Date(2026, 5, 25), productKey: "neon", payoutStatus: "paid",
  contractNumber: "SYNTHETIC-001", clientName: "Testovací klient", ownerEmail: "advisor@example.test",
  entryId: "synthetic-contract", commissionCode: "A101", commissionLabel: "Provize A101",
  source: "own", ...overrides,
});
const render = (items: CashflowItem[], total = 722.5) => {
  const month: MonthGroup = {
    key: "2026-6", year: 2026, monthIndex: 5, label: "Červen 2026",
    total, predictedTotal: 1000, statementPayoutTotal: total, totalSource: "paid", items,
  };
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<CashflowMonthModal month={month} onClose={() => {}} />);
  return container;
};
const section = (container: HTMLElement, category: string) => container.querySelector<HTMLElement>(`[data-cashflow-section="${category}"]`);
const cards = (container: ParentNode) => [...container.querySelectorAll<HTMLElement>("[data-cashflow-card]")];

describe("month detail commission cancellations", () => {
  it("separates positive and negative parts of the same contract without altering the month's actual receipt", () => {
    const container = render([item("paid", 1000), item("cancelled", -150)]);
    const regular = section(container, "life")!;
    const cancelled = section(container, "cancelled")!;

    expect(regular).not.toBeNull();
    expect(cancelled).not.toBeNull();
    expect(cards(regular)).toHaveLength(1);
    expect(cards(cancelled)).toHaveLength(1);
    expect(text(cards(regular)[0].textContent)).toContain("Vyplaceno");
    expect(text(cards(regular)[0].textContent)).not.toContain(text(formatMoney(-150)));
    expect(text(cards(cancelled)[0].textContent)).toContain("Stornováno");
    expect(text(cards(cancelled)[0].textContent)).not.toContain("Vyplaceno");
    expect(text(cards(cancelled)[0].textContent)).toContain(text(formatMoney(-150)));
    expect(text(cards(cancelled)[0].textContent)).toContain(text(formatMoney(-127.5)));
    expect(text(cards(regular)[0].textContent)).toContain(text(formatMoney(850)));
    expect(text(cancelled.querySelector("summary")?.textContent)).toContain("Stornované");

    const headerCounts = [...container.querySelectorAll("p")].map(node => text(node.textContent));
    expect(headerCounts).toContain("1 smlouva · 2 provize");
    expect(headerCounts).not.toContain("2 smlouvy · 2 provize");
    const received = [...container.querySelectorAll("div")].find(node => text(node.textContent) === "Vyplaceno");
    expect(text(received?.parentElement?.textContent)).toContain(text(formatMoney(722.5)));
  });

  it("describes a negative A101 as a cancellation rather than a normal first commission", () => {
    const container = render([item("cancelled", -150)], -127.5);
    const cancellation = cards(section(container, "cancelled")!)[0];
    expect(text(cancellation.textContent)).toContain("Stornováno");
    expect(text(cancellation.textContent)).not.toContain("První část okamžité provize");
    expect(text(cancellation.textContent)).not.toContain("Vyplaceno");
  });

  it("separates an explicitly marked positive cancellation from an ordinary receipt on the same contract", () => {
    const container = render([
      item("paid", 500),
      item("explicit-cancellation", 100, { note: "Manažerská · storno z výpisu" }),
    ], 510);
    expect(cards(section(container, "life")!)).toHaveLength(1);
    expect(cards(section(container, "cancelled")!)).toHaveLength(1);
    expect(text(section(container, "cancelled")?.textContent)).toContain("Stornováno");
    expect(text(section(container, "life")?.textContent)).toContain("Vyplaceno");
  });

  it("keeps a genuine positive receipt on a now-cancelled contract among ordinary commissions", () => {
    const container = render([item("historical-paid", 500, { contractStatus: "storno" })], 425);
    expect(section(container, "cancelled")).toBeNull();
    expect(text(section(container, "life")?.textContent)).toContain("Vyplaceno");
    expect(text(section(container, "life")?.textContent)).not.toContain("Stornováno");
  });

  it("does not turn a subscription refund into a cancelled commission", () => {
    const container = render([item("refund", -100, { productKey: "subscription", isSubscriptionPayment: true })], -100);
    expect(section(container, "cancelled")).toBeNull();
    expect(section(container, "subscription")).not.toBeNull();
    expect(text(section(container, "subscription")?.textContent)).not.toContain("Stornováno");
  });
});
