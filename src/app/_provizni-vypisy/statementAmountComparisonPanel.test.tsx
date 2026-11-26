// @vitest-environment happy-dom

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AmountComparisonPanel } from "./statementAmountComparisonPanel";
import { OtherProductCommissionTable } from "./statementContractTables";
import { comparisonStatus } from "./statementCommissionComparisons";
import { statementContractIsVerified } from "./statementContractReview";
import type { CommissionAmountComparison } from "./statementTypes";
import { NEON_FULL_PREMIUM_ANNUAL_TOLERANCE } from "@/app/lib/neonCorrection";

const comparison = (expectedAmount: number, statementAmount: number, label = "B105"): CommissionAmountComparison => ({
  key: label, label, expectedAmount, statementAmount,
  difference: statementAmount - expectedAmount,
  status: comparisonStatus(statementAmount, expectedAmount),
});

const render = (props: ComponentProps<typeof AmountComparisonPanel>) => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(createElement(AmountComparisonPanel, props));
  return container;
};

describe("commission comparison badges", () => {
  it("accepts the 16 CZK annual rounding difference for verified full NEON premium", () => {
    const base = {
      key: "neon-base", label: "Základna B101", statementPremiumBase: 6100, statementPaymentBase: 6100 / 12,
      statementBasePeriod: "annual" as const, systemPremiumBase: 507, systemPaymentAmount: 507,
      systemPaymentFrequency: "monthly", paymentsPerYear: 12, statementAnnualPremiumBase: 6100,
      systemAnnualPremiumBase: 6084, difference: 16 / 12, annualDifference: 16,
      canBeAnniversaryPremiumChange: false, firstAnniversaryDate: null, anniversaryDate: null, referenceDate: null,
    };
    const tolerantBase = { ...base, annualTolerance: NEON_FULL_PREMIUM_ANNUAL_TOLERANCE };
    const comparisons = [comparison(100, 100, "B101")];
    expect(render({ comparisons, baseComparisons: [base] }).textContent).toContain("Rozdíl základny");
    expect(render({ comparisons, baseComparisons: [tolerantBase] }).textContent).toContain("Vše sedí");
    expect(statementContractIsVerified({ comparisons, baseComparisons: [tolerantBase], matched: true, hasWarnings: false })).toBe(true);
  });
  it("does not excuse an unproven DOMEX Neuron overpayment as a higher commission", () => {
    const container = render({ comparisons: [{ ...comparison(333.60, 350.28), acceptHigherCommission: false }] });
    const badge = container.querySelector("tbody tr td:last-child span")!;
    expect(badge.textContent).toBe("Rozdíl");
    expect(badge.getAttribute("data-tone")).toBe("error");
    expect(container.textContent).not.toContain("Vyšší provize");
  });

  it("shows a green growth badge and difference when the paid commission exceeds the expected amount", () => {
    const comparisons = [comparison(76.10, 94.31)];
    const container = render({ comparisons });
    const row = container.querySelector("tbody tr")!;
    const badge = row.querySelector("td:last-child span")!;
    expect(badge.textContent).toBe("Vyšší provize");
    expect(badge.getAttribute("data-tone")).toBe("ok");
    expect(badge.querySelector('svg.lucide-trending-up[aria-hidden="true"]')).not.toBeNull();
    const difference = row.querySelectorAll("td")[3];
    expect(difference.textContent).toBe("+18,21 Kč");
    expect(difference.getAttribute("data-tone")).toBe("ok");
    expect(comparisons[0].status).toBe("diff");
    expect(statementContractIsVerified({ matched: true, comparisons, hasWarnings: false })).toBe(false);
  });

  it.each([
    [100, 80, "Rozdíl", "error"],
    [100, 0, "Chybí ve výpisu", "error"],
    [0, 100, "Chybí v systému", "error"],
    [100, 100, "Sedí", "ok"],
    [100, 110, "Sedí", "ok"],
    [-100, -50, "Rozdíl", "error"],
    [100, -50, "Rozdíl", "error"],
  ] as const)("keeps the correct badge for expected %s and paid %s", (expected, paid, label, tone) => {
    const container = render({ comparisons: [comparison(expected, paid)] });
    const badge = container.querySelector("tbody tr td:last-child span")!;
    expect(badge.textContent).toBe(label);
    expect(badge.getAttribute("data-tone")).toBe(tone);
    expect(container.textContent).not.toContain("Vyšší provize");
  });

  it("labels overpaid and underpaid codes separately without offsetting them", () => {
    const container = render({ comparisons: [comparison(100, 120, "B101"), comparison(100, 80, "B102")] });
    const badges = [...container.querySelectorAll("tbody tr td:last-child span")];
    expect(badges.map(badge => [badge.textContent, badge.getAttribute("data-tone")]))
      .toEqual([["Vyšší provize", "ok"], ["Rozdíl", "error"]]);
    expect(container.textContent).toContain("1 rozdíl");
  });

  it("does not label a higher premium base as a higher commission", () => {
    const container = render({
      comparisons: [comparison(76.10, 94.31)],
      baseComparisons: [{
        key: "base", label: "Základna pojistného", statementPremiumBase: 1626, statementPaymentBase: 1626,
        statementBasePeriod: "payment", systemPremiumBase: 1312, systemPaymentAmount: 1312,
        systemPaymentFrequency: "annual", paymentsPerYear: 1, statementAnnualPremiumBase: 1626,
        systemAnnualPremiumBase: 1312, difference: 314, annualDifference: 314,
        canBeAnniversaryPremiumChange: false, firstAnniversaryDate: null, anniversaryDate: null, referenceDate: null,
      }],
    });
    const rows = container.querySelectorAll("tbody tr");
    expect(rows[0].querySelector("td:last-child span")?.textContent).toBe("Nesedí");
    expect(rows[0].querySelector("td:last-child span")?.getAttribute("data-tone")).toBe("warn");
    expect(rows[1].querySelector("td:last-child span")?.textContent).toBe("Vyšší provize");
  });
});

it.each([
  ["08", "Nesoulad pozice", "Poradce 8", "error"],
  ["10", "Sedí", "Poradce 10", "ok"],
  ["", "Nelze ověřit", "—", "warn"],
] as const)("checks career %s independently of matching commission amounts", (career, status, statementLabel, tone) => {
  const view = render({
    comparisons: [comparison(771.24, 771.24)],
    positionComparison: { systemPosition: "poradce10", rows: [{ career }] },
  });
  const [position, amount] = view.querySelectorAll("tbody tr");
  expect(position.children[1].textContent).toBe("Poradce 10");
  expect(position.children[2].textContent).toBe(statementLabel);
  expect(position.querySelector("td:last-child span")?.textContent).toBe(status);
  expect(position.querySelector("td:last-child span")?.getAttribute("data-tone")).toBe(tone);
  expect(amount.querySelector("td:last-child span")?.textContent).toBe("Sedí");
});

it("puts both positions next to the premium base in the statement item table", () => {
  const view = document.createElement("div");
  view.innerHTML = renderToStaticMarkup(createElement(OtherProductCommissionTable, {
    rows: [{
      id: "1", product: "CPP_ACPIV", type: "B102", base: 6481, percent: "11,90%", career: "8",
      commission: 771.24, reserveFund: 0,
    }],
    systemPosition: "poradce10", b36Payments: [], pairedB36PaymentIndexes: new Set<number>(),
    generalCommissionKindClass: () => "",
  }));
  const headers = [...view.querySelectorAll("th")].map(cell => cell.textContent);
  const cells = [...view.querySelectorAll("tbody td")];
  const base = headers.indexOf("Základna");
  expect(headers.slice(base, base + 3)).toEqual(["Základna", "Pozice Bohemka", "Pozice výpis"]);
  expect(cells[base + 1].textContent).toBe("Poradce 10");
  expect(cells[base + 2].textContent).toContain("Poradce 8");
  expect(cells[base + 2].textContent).toContain("Nesoulad");
});
