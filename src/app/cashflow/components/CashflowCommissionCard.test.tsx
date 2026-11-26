// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CashflowItem } from "../types";
import { CashflowCommissionCard } from "./CashflowCommissionCard";

const item: CashflowItem = {
  id: "synthetic", date: new Date(2026, 10, 25), amount: 332, productKey: "cppAuto",
  clientName: "Testovací klient", contractNumber: "TEST-001", ownerEmail: "owner@example.test", entryId: "test",
  maxxContractDetailUrl: "https://sjednatel.bohemiaservis.cz/detail.aspx?sml=123456",
  extranetContractDetailUrl: "https://sjednatel.bohemiaservis.cz/redirect_extranet.aspx?type=detail&p_EntityTypeID=43&p_EntityID=123456",
};
function render(overrides: Partial<CashflowItem> = {}) {
  const leadItem = { ...item, ...overrides };
  const container = document.createElement("div");
  const amount = leadItem.amount;
  const stornoFundAmount = amount * 0.15;
  container.innerHTML = renderToStaticMarkup(<CashflowCommissionCard group={{
    id: "synthetic", leadItem, items: [leadItem], amount, stornoFundAmount, netAmount: amount - stornoFundAmount,
  }} />);
  return container;
}

describe("cashflow card contract actions", () => {
  it("shows an unknown FLEXI payout as ??? in the card and the breakdown", () => {
    const container = render({ productKey: "flexi", commissionCode: "B0301", amount: 0, amountUnknown: true });
    expect(container.querySelector("summary strong")?.textContent).toContain("???");
    expect(container.querySelector("tbody")?.textContent).toContain("B0301");
    expect([...container.querySelectorAll("tbody td")].map(cell => cell.textContent)).toEqual(["???", "???"]);
    expect(container.textContent).toContain("Částka čeká na doplnění provizní základny");
  });

  it("explains installments covered under another statement code", () => {
    expect(render({ payoutStatus: "paid", commissionCode: "A104", installmentCoverageNote: "Souhrnná výplata pod kódem A102: 271,59 Kč." }).textContent)
      .toContain("Souhrnná výplata pod kódem A102: 271,59 Kč.");
  });
  it("shows one expected amount for confirmed policy-year installments and a range for the next renewal", () => {
    expect(render({ autoCommissionForecastMinimum: 365.01, autoCommissionForecastMaximum: 365.01, autoCommissionConfirmedPolicyYear: true }).textContent)
      .toContain("Očekáváno 365 Kč");
    expect(render({ autoCommissionForecastMinimum: 365.01, autoCommissionForecastMaximum: 365.01, autoCommissionFromSavedPremium: true }).textContent)
      .toContain("Očekáváno 365 Kč");
    expect(render({ autoCommissionForecastMinimum: 335.81, autoCommissionForecastMaximum: 394.21 }).textContent)
      .toContain("Odhad 336 Kč–394 Kč");
    expect(render({ autoCommissionForecastMinimum: 0.01, autoCommissionForecastMaximum: 0.01 }).textContent)
      .not.toContain("Očekáváno");
  });
  it("keeps all three links together in the detail header, outside the toggle", () => {
    const container = render();
    const nav = container.querySelector('nav[aria-label="Odkazy ke smlouvě"]')!;
    expect([...nav.querySelectorAll("a")].map(link => link.textContent)).toEqual(["Smlouva ", "MAXX ", "Extranet "]);
    expect(nav.querySelector('a[aria-label="Otevřít smlouvu"]')?.getAttribute("href"))
      .toBe("/smlouvy/owner%40example.test___test");
    for (const [label, href] of [["MAXX", item.maxxContractDetailUrl], ["Extranetu", item.extranetContractDetailUrl]]) {
      const link = nav.querySelector(`a[aria-label="Otevřít smlouvu v ${label}"]`)!;
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.getAttribute("referrerPolicy")).toBe("no-referrer");
    }
    expect(container.querySelector("summary nav")).toBeNull();
    expect(nav.parentElement?.querySelector("h5")?.textContent).toBe("Rozpad provizí");
  });

  it("does not render unsafe links from a manipulated snapshot", () => {
    const container = render({ maxxContractDetailUrl: "javascript:alert(1)", extranetContractDetailUrl: "https://evil.example/" });
    expect(container.querySelectorAll("nav a")).toHaveLength(1);
  });

  it("does not invent portal destinations when no identifiers are available", () => {
    expect(render({ maxxContractDetailUrl: undefined, extranetContractDetailUrl: undefined }).querySelectorAll("nav a")).toHaveLength(1);
  });

  it.each([{ isTipPayout: true }, { isSubscriptionPayment: true }, { isExtraPayout: true }])("does not use injected contract links for a non-contract card: %j", overrides => {
    expect(render(overrides).querySelector("nav")).toBeNull();
  });
});
