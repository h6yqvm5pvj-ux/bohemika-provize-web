import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { calculateKoopMajetekObcan } from "@/app/lib/productFormulas/koopmajetekobcan";
import { buildStatementCodeComparisons, statementCommissionGroups } from "./statementCommissionComparisons";
import { AmountComparisonPanel } from "./statementAmountComparisonPanel";
import { statementContractIsVerified } from "./statementContractReview";
import type { CommissionRow } from "./statementTypes";

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

describe("statement comparisons for separate commission codes", () => {
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
    const comparisons = compare([row("B101"), row("B102", 77.93)]);
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
