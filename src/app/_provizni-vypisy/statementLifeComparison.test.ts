import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lifeSplitComparisonScope } from "./statementLifeComparison";
import { lifeSplitCardSummary } from "./statementCardMath";
import { LifeSmallBaseNotice } from "./statementLifeCardNotices";
import type { CommissionRow, LifeSplitContractPreview } from "./statementTypes";

const row = (base: number, commission = 2.38): CommissionRow => ({
  id: String(base), contractNumber: "test", product: "CPP_NEON", type: "B101", base, commission,
  lifeSplitKind: "subsequent", lifeSplitLabel: "Následná provize B101", reserveFund: 0.36,
  career: "104", percent: "0,40%", signedAt: "13.09.2021", validFrom: "14.09.2021",
  client: "Testovací klient", detailUrl: null, role: "Z",
});
const contract = (rows: CommissionRow[]): LifeSplitContractPreview => ({
  productCode: "CPP_NEON", productLabel: "ČPP ŽP NEON", contractNumber: "test", client: "Testovací klient",
  signedAt: "13.09.2021", validFrom: "14.09.2021", rows, b36Payments: [], annualPremium: rows[0]?.base ?? 0,
});

describe("life statement base comparison scope", () => {
  it("keeps the first screenshot's risk commission: 10,308 CZK base and 40.82 CZK paid", () => {
    const source = contract([row(10_308, 40.82)]);
    const result = lifeSplitComparisonScope(source, 10_308);
    expect(result.contract).toBe(source);
    expect(result.excludedRows).toEqual([]);
  });

  it("excludes the second screenshot's 600 CZK base against 19,884 CZK while preserving its payout", () => {
    const source = contract([row(600)]);
    const result = lifeSplitComparisonScope(source, 19_884);
    expect(result.contract.rows).toEqual([]);
    expect(result.contract.annualPremium).toBe(0);
    expect(result.excludedRows).toEqual(source.rows);
    expect(lifeSplitCardSummary(source).total).toBe(2.38);
    expect(source.annualPremium).toBe(600);
    const html = renderToStaticMarkup(createElement(LifeSmallBaseNotice, { rows: result.excludedRows, riskAnnualBase: 19_884 }));
    expect(html).toContain("Investiční složka");
    expect(html).toContain("25");
    expect(html).not.toContain("Nesoulad ročního pojistného");
  });

  it.each([2999.99, 600])("excludes a %s CZK base below 25% of 12,000 CZK", (base) => {
    expect(lifeSplitComparisonScope(contract([row(base)]), 12_000).contract.rows).toEqual([]);
  });

  it.each([3000, 9000, 12_000, 13_000])("still compares a %s CZK risk base at or above 25%", (base) => {
    expect(lifeSplitComparisonScope(contract([row(base)]), 12_000).excludedRows).toEqual([]);
  });

  it("separates risk and investment rows even when they have the same code", () => {
    const source = contract([row(600), row(19_884, 78.74)]);
    const result = lifeSplitComparisonScope(source, 19_884);
    expect(result.contract.rows).toEqual([source.rows[1]]);
    expect(result.contract.annualPremium).toBe(19_884);
    expect(lifeSplitCardSummary(source).total).toBeCloseTo(81.12, 2);
  });

  it("does not exclude anything without a known risk base or for A101", () => {
    const source = contract([row(600)]);
    expect(lifeSplitComparisonScope(source, null).excludedRows).toEqual([]);
    expect(lifeSplitComparisonScope(contract([{ ...row(600), type: "A101", lifeSplitKind: "a101" }]), 19_884).excludedRows).toEqual([]);
  });
});
