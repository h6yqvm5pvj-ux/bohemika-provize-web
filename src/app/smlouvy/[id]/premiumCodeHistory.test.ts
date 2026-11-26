// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildPremiumHistoryRows, initialAnnualPremiumFromStatementRows, ContractAutoPremiumHistory } from "./ContractAutoPremiumHistory";
import type { ContractCommissionStatementSummary } from "./contractDetailTypes";
const owner = "adviser@example.test";
const statements: ContractCommissionStatementSummary[] = [
  { code: "A101", base: 3000, year: 2020 }, { code: "A102", base: 3200, year: 2021 }, { code: "B101", base: 3500, year: 2022 },
].map(({ code, base, year }) => ({ id: `synthetic-${year}`, fileName: "synthetic", statementNumber: "SYNTHETIC", statementDate: `23.08.${year}`, period: `01.07.${year} - 31.07.${year}`, periodStartMs: null, periodEndMs: null, payoutMonthKey: `${year}-8`,
  autoPremiumRows: [{ rowId: `row-${year}`, contractNumber: "123456", client: null, productCode: "CPP_ACPIV", productKey: "cppAuto", commissionCode: code, basePremium: base, commission: 100, signedAt: "08.06.2020", validFrom: "08.06.2020", source: "own" }],
}));
const commissionPayouts = [
  { statementId: "synthetic-2021", statementCode: "A102", code: "B101", writtenBy: owner, commissionCodeCorrectionNote: "A102 → B101" },
  { statementId: "synthetic-2022", statementCode: "B101", code: "B102", writtenBy: owner, commissionCodeCorrectionNote: "B101 → B102" },
];
describe("premium history derived from original statement rows", () => {
  it("prefers resolved original statement rows over an incomplete stored history", () => {
    const html = renderToStaticMarkup(createElement(ContractAutoPremiumHistory, {
      product: "cppAuto", contractNumber: "123456", policyStartDate: "2020-06-08", paymentFrequency: "annual", systemAnnualPremium: 3500,
      statements, viewerEmail: owner, commissionPayouts,
      storedHistory: [{ statementId: "synthetic-2022", rowId: "row-2022", commissionCode: "B101", resolvedCommissionCode: "B102", commissionCodeCorrectionNote: "B101 → B102",
        premiumKind: "auto_change", anniversaryDate: "2022-06-08", anniversaryNumber: 2, newAnnualPremium: 3500, previousAnnualPremium: null, differenceAnnual: null, source: "own" }],
    }));
    const container = document.createElement("div"); container.innerHTML = html;
    const rows = [...container.querySelectorAll('ol[aria-label="Pojistné při jednotlivých výročích"] > li')];
    expect(rows).toHaveLength(2);
    const second = rows.find(row => row.textContent?.includes("2. výročí"))!;
    expect(second.textContent?.replace(/[.\s]/g, "")).toContain("3200,00");
    expect(second.textContent?.replace(/[.\s]/g, "")).toContain("300,00");
    expect(second.textContent).toContain("B101 → B102");
  });
  it("recovers the first anniversary from A102 and computes the following increase from that premium", () => {
    const rows = buildPremiumHistoryRows({ contractNumber: "123456", policyStartDate: "2020-06-08", product: "cppAuto", paymentFrequency: "annual", systemAnnualPremium: 3500, statements, viewerEmail: owner, commissionPayouts });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ anniversaryNumber: 1, previousAnnualPremium: 3000, newAnnualPremium: 3200, differenceAnnual: 200, commissionCodes: ["A102"] });
    expect(rows[0].anniversaryDate.getFullYear()).toBe(2021);
    expect(rows[1]).toMatchObject({ anniversaryNumber: 2, previousAnnualPremium: 3200, differenceAnnual: 300, commissionCodes: ["B101"] });
    expect(initialAnnualPremiumFromStatementRows({ contractNumber: "123456", product: "cppAuto", frequency: "annual", statements: statements.slice(1), viewerEmail: owner, commissionPayouts })).toBeNull();
  });
});
