// @vitest-environment happy-dom

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AmountComparisonPanel } from "./statementAmountComparisonPanel";
import { comparisonStatus } from "./statementCommissionComparisons";
import { statementContractIsVerified } from "./statementContractReview";
import type { CommissionAmountComparison } from "./statementTypes";

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
    expect(container.textContent).toContain("2 rozdíly");
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
