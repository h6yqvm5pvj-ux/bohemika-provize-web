// @vitest-environment happy-dom

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lifeSplitCardSummary } from "./statementCardMath";
import {
  classifyLifeSplitCommissionCode,
  lifeSplitAnnualPremiumBase,
  parseStatementHtml,
  resolveStatementProduct,
} from "./statementParsing";
import { statementCalculatorPrefill } from "./statementPresentation";

const investmentRow = { type: "A201", base: 600 };
const riskRow = { type: "A101", base: 19_884 };

describe("life statement premium base", () => {
  it.each(["A101", "AP101", "AZ101", "APZ101", "B0301", "B3601", "B036", "B4801", "B101", "B201", "NV101", "NB0301", "ATP101"])(
    "uses the supported %s base even when an investment row comes first",
    (type) => {
      expect(lifeSplitAnnualPremiumBase([investmentRow, { type, base: 19_884 }])).toBe(19_884);
    }
  );

  it.each(["A201", "AP201", "AZ201", "APZ201", "UNKNOWN"])(
    "does not treat %s as a risk premium base when no supported row is available",
    (type) => {
      expect(lifeSplitAnnualPremiumBase([{ type, base: 600 }])).toBe(0);
    }
  );

  it("skips unavailable bases without falling back to the investment component", () => {
    const rows = [
      investmentRow,
      { type: "A101", base: 0 },
      { type: "A101", base: -100 },
      { type: "A101", base: Number.NaN },
      { type: "A101", base: Number.POSITIVE_INFINITY },
    ];
    expect(lifeSplitAnnualPremiumBase(rows)).toBe(0);
    expect(lifeSplitAnnualPremiumBase([...rows, riskRow])).toBe(19_884);
    expect(lifeSplitAnnualPremiumBase([])).toBe(0);
  });

  it("labels the investment component without including it in risk commission comparisons", () => {
    expect(classifyLifeSplitCommissionCode("A201")).toEqual({
      kind: "unknown",
      label: "Provize z investiční složky",
    });
  });
});

const statementRowHtml = (type: "A101" | "A201", id: number): string => {
  const cells = [
    id, "1000000001", "13.09.2021", "14.09.2021", "Testovací klient", "Z",
    "CPP_N_LIFE", type, type === "A101" ? "19 884,00" : "600,00", "",
    type === "A101" ? "1,78%" : "1,98%", "104",
    type === "A101" ? "7 086,59" : "237,60",
    type === "A101" ? "1 062,99" : "35,64",
  ];
  return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
};

const statementHtml = (types: Array<"A101" | "A201">, deductions = ""): string => `
  <section id="provize"><table><tbody>
    ${types.map((type, index) => statementRowHtml(type, index + 1)).join("")}
  </tbody></table></section>
  ${deductions}
`;

describe("investment life HTML statement import", () => {
  const rowsDescriptor = Object.getOwnPropertyDescriptor(HTMLTableSectionElement.prototype, "rows");
  beforeAll(() => {
    // happy-dom does not yet implement HTMLTableSectionElement.rows.
    if (!rowsDescriptor) {
      Object.defineProperty(HTMLTableSectionElement.prototype, "rows", {
        configurable: true,
        get(this: HTMLTableSectionElement) { return this.querySelectorAll(":scope > tr"); },
      });
    }
  });
  afterAll(() => {
    if (!rowsDescriptor) Reflect.deleteProperty(HTMLTableSectionElement.prototype, "rows");
  });

  it.each([
    ["A201", "A101"],
    ["A101", "A201"],
  ] as const)("uses the risk base with rows ordered %s, %s and keeps both payouts", (first, second) => {
    const statement = parseStatementHtml(statementHtml([first, second]), "test.html");

    expect(statement.lifeSplitContracts).toHaveLength(1);
    const contract = statement.lifeSplitContracts[0];
    expect(contract.annualPremium).toBe(19_884);
    expect(contract.rows).toHaveLength(2);
    expect(contract.rows.find((row) => row.type === "A201")).toMatchObject({
      base: 600,
      commission: 237.6,
      reserveFund: 35.64,
    });
    const summary = lifeSplitCardSummary(contract);
    expect(summary.monthlyPremium).toBe(1_657);
    expect(summary.total).toBeCloseTo(7_324.19, 2);
    expect(statementCalculatorPrefill({
      product: resolveStatementProduct(contract.productCode),
      contractNumber: contract.contractNumber,
      clientName: contract.client,
      signedAt: contract.signedAt,
      validFrom: contract.validFrom,
      statementBase: contract.annualPremium,
    })).toMatchObject({ amountText: "1657", frequency: "monthly" });
  });

  it("leaves the risk base unavailable for an investment-only statement", () => {
    const statement = parseStatementHtml(statementHtml(["A201"]), "test.html");
    const contract = statement.lifeSplitContracts[0];

    expect(contract.annualPremium).toBe(0);
    expect(lifeSplitCardSummary(contract)).toMatchObject({
      monthlyPremium: null,
      total: 237.6,
    });
  });

  it("does not reuse a canceled risk base or replace it with the investment base", () => {
    const deductionCells = [
      3, "1000000001", "13.09.2021", "Testovací klient", "Z", "CPP_N_LIFE",
      "A101", "19 884,00", "", "1,78%", "104", "-7 086,59", "-1 062,99",
    ];
    const deductions = `<section id="odecty"><table><tbody><tr>
      ${deductionCells.map((cell) => `<td>${cell}</td>`).join("")}
    </tr></tbody></table></section>`;
    const statement = parseStatementHtml(statementHtml(["A201", "A101"], deductions), "test.html");
    const contract = statement.lifeSplitContracts[0];

    expect(contract.rows.map((row) => row.type)).toEqual(["A201"]);
    expect(contract.annualPremium).toBe(0);
    expect(lifeSplitCardSummary(contract).monthlyPremium).toBeNull();
  });
});
