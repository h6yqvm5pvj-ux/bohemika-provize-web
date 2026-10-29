import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { calculateKoopMajetekObcan } from "@/app/lib/productFormulas/koopmajetekobcan";
import { buildStatementCodeComparisons, comparisonStatus, statementAmountForSinglePayout, statementCommissionGroups } from "./statementCommissionComparisons";
import { AmountComparisonPanel } from "./statementAmountComparisonPanel";
import { statementContractIsVerified } from "./statementContractReview";
import type { CommissionRow } from "./statementTypes";
import { OtherProductCommissionTable } from "./statementContractTables";
import { otherProductCardSummary } from "./statementCardMath";

const row = (type: string, commission = 57.93, patch: Partial<CommissionRow> = {}): CommissionRow => ({
  id: `${type}-${commission}`, type, commission, product: "KOO_OBCAN", base: 862,
  contractNumber: "synthetic-contract", client: "Testovací klient", role: "Z",
  signedAt: "14.09.2025", validFrom: "15.09.2025", career: "107", percent: "6,72%",
  reserveFund: 8.69, detailUrl: null, lifeSplitKind: "unknown", lifeSplitLabel: "",
  ...patch,
});
const expectedPerPayment = calculateKoopMajetekObcan(862, "monthly", "manazer7").items
  .find(item => item.title.includes("Následná provize (z platby)"))!.amount;
const compare = (rows: CommissionRow[]) => buildStatementCodeComparisons({
  rows, keyPrefix: "subsequent", expectedForRows: () => ({ amount: expectedPerPayment }),
});

describe("duplicate single-payout commissions", () => {
  const expected = 2640.72;
  const screenshotRows = [row("A101", 2805.60), row("A101", 2640.89)];

  it.each([false, true])("compares only the matching A101, regardless of row order (%s)", reverse => {
    const rows = reverse ? [...screenshotRows].reverse() : screenshotRows;
    const amount = statementAmountForSinglePayout(rows, expected);
    expect(amount).toBe(2640.89);
    expect(comparisonStatus(amount, expected)).toBe("ok");
    expect(rows).toHaveLength(2);
  });

  it.each(["B0301", "B3601", "B4801"])("also ignores an incorrect duplicate %s", code => {
    expect(statementAmountForSinglePayout([row(code, 2805.60), row(code, 2640.89)], expected)).toBe(2640.89);
  });

  it("keeps discrepancies when no duplicate matches the expected amount", () => {
    const amount = statementAmountForSinglePayout([row("A101", 2805.60), row("A101", 2900)], expected);
    expect(amount).toBe(5705.60);
    expect(comparisonStatus(amount, expected)).toBe("diff");
  });

  it("preserves a single incorrect payout, reversals and multiple matching payments", () => {
    expect(statementAmountForSinglePayout([row("A101", 2805.60)], expected)).toBe(2805.60);
    expect(statementAmountForSinglePayout([row("A101", expected), row("A101", -expected)], expected)).toBe(0);
    expect(statementAmountForSinglePayout([row("A101", expected), row("A101", expected)], expected)).toBe(expected * 2);
  });

  it("does not discard another commission code or invent an expected payout", () => {
    expect(statementAmountForSinglePayout([row("A101", 2640.89), row("AP101", 2805.60)], expected)).toBe(5446.49);
    expect(statementAmountForSinglePayout(screenshotRows, 0)).toBe(5446.49);
    expect(statementAmountForSinglePayout(screenshotRows, Number.NaN)).toBe(5446.49);
  });
});

describe("statement comparisons for separate commission codes", () => {
  it("keeps actual Kooperativa C amounts and codes when the premium base remains constant", () => {
    const rows = [row("C101", 937.80), row("C103", 970.20), row("C105", 1019.40), row("C106", 769.80)]
      .map(item => ({ ...item, product: "KOO_NAMIRU", base: 7175 }));
    const summary = otherProductCardSummary({ key: "synthetic-koop", contractNumber: "synthetic-contract", client: "Testovací klient", signedAt: "16.02.2023", validFrom: "17.02.2023", rows, b36Payments: [] });
    expect(summary.totalCommission).toBeCloseTo(3697.20, 2);
    const html = renderToStaticMarkup(createElement(OtherProductCommissionTable, { rows, b36Payments: [], pairedB36PaymentIndexes: new Set<number>(), generalCommissionKindClass: () => "" })).replaceAll("\u00a0", " ");
    expect(html.match(/Následná provize dle výpisu/g)).toHaveLength(rows.length);
    for (const code of ["C101", "C103", "C105", "C106"]) expect(html).toContain(code);
    for (const amount of ["937,80", "970,20", "1 019,40", "769,80"]) expect(html).toContain(amount);
    expect(html).not.toContain("Neočekávaná provize");
    expect(html).not.toContain("navýšení smlouvy");
    expect(html).not.toContain("B101");
  });

  it.each([false, true])("accepts B101 and B102 as two correct payments, regardless of row order (%s)", reverse => {
    const rows = [row("B101"), row("B102")];
    const comparisons = compare(reverse ? rows.reverse() : rows);
    expect(comparisons).toHaveLength(2);
    expect(comparisons.map(item => item.label).sort()).toEqual(["B101", "B102"]);
    expect(comparisons.every(item => item.status === "ok")).toBe(true);
    expect(comparisons.reduce((sum, item) => sum + item.statementAmount, 0)).toBe(115.86);
    for (const item of comparisons) expect(item.expectedAmount).toBeCloseTo(57.93, 2);
    expect(statementContractIsVerified({ matched: true, comparisons, hasWarnings: false })).toBe(true);
    const html = renderToStaticMarkup(createElement(AmountComparisonPanel, { comparisons }));
    expect(html).toContain("B101");
    expect(html).toContain("B102");
    expect(html).not.toContain("1 rozdíl");
    expect(html.match(/>Sedí</g)).toHaveLength(2);
  });

  it("keeps an incorrect B102 visible while accepting B101", () => {
    const comparisons = compare([row("B101"), row("B102", 37.93)]);
    expect(comparisons.map(item => [item.label, item.status])).toEqual([["B101", "ok"], ["B102", "diff"]]);
    expect(statementContractIsVerified({ matched: true, comparisons, hasWarnings: false })).toBe(false);
    const html = renderToStaticMarkup(createElement(AmountComparisonPanel, { comparisons }));
    expect(html).toContain("1 rozdíl");
  });

  it("does not cancel an underpayment against an overpayment of a different code", () => {
    const comparisons = compare([row("B101", 37.93), row("B102", 77.93)]);
    expect(comparisons.every(item => item.status === "diff")).toBe(true);
    expect(comparisons[0].difference).toBeLessThan(-19);
    expect(comparisons[1].difference).toBeGreaterThan(19);
  });

  it("does not automatically excuse a duplicated B101 as two separate installments", () => {
    const comparisons = compare([row("B101"), row(" b101 ")]);
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]).toMatchObject({ label: "B101", statementAmount: 115.86, status: "diff" });
    expect(statementCommissionGroups([row("B101"), row("B101", 20)])[0].rows).toHaveLength(2);
  });

  it("preserves explicitly resolved multi-period payments within one code", () => {
    const comparisons = buildStatementCodeComparisons({ rows: [row("B101"), row("B101")], keyPrefix: "subsequent",
      expectedForRows: () => ({ amount: expectedPerPayment * 2, periods: 2, detailLines: ["Potvrzená výplata za dvě období."] }),
    });
    expect(comparisons[0]).toMatchObject({ label: "B101 (2 období)", status: "ok", detailLines: ["Potvrzená výplata za dvě období."] });
  });

  it("passes each code's own base to the independent-base calculation", () => {
    const comparisons = buildStatementCodeComparisons({ rows: [row("B101", 28.90, { base: 430 }), row("B102")], keyPrefix: "subsequent",
      expectedForRows: rows => ({ amount: rows.reduce((sum, row) => sum + row.base * 0.0672, 0) }),
    });
    expect(comparisons[0].expectedAmount).toBeCloseTo(28.896, 6);
    expect(comparisons[1].expectedAmount).toBeCloseTo(57.9264, 6);
    expect(comparisons.every(item => item.status === "ok")).toBe(true);
  });

  it("preserves absent, zero and missing-system comparison behavior", () => {
    expect(compare([])).toEqual([]);
    expect(compare([row("B101", 0)])).toEqual([]);
    expect(compare([row("B101"), row("B101", -57.93)])[0].status).toBe("missing_statement");
    expect(buildStatementCodeComparisons({ rows: [row("B101")], keyPrefix: "subsequent", expectedForRows: () => ({ amount: 0 }) })[0].status)
      .toBe("missing_expected");
  });
});
