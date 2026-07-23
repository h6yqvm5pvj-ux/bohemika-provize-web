import { describe, expect, it } from "vitest";

import {
  addMonthsToMonthKey,
  classifyLifeSplitCommissionCode,
  formatMonthKey,
  monthKeyFromStatementPeriod,
  normalizeContractNumberForMatch,
  parseLocalDate,
  resolveStatementProduct,
} from "./statementParsing";

describe("commission statement parsing helpers", () => {
  it("normalizes contract numbers for matching", () => {
    expect(normalizeContractNumberForMatch(" 12 34 / ab ")).toBe("1234/AB");
  });

  it("parses Czech date text and statement period month keys", () => {
    expect(parseLocalDate("02. 08. 2026")?.toISOString().slice(0, 10)).toBe(
      "2026-08-02"
    );
    expect(monthKeyFromStatementPeriod("01. 07. 2026 - 31. 07. 2026")).toBe(
      "2026-07"
    );
    expect(formatMonthKey(addMonthsToMonthKey("2026-07", 6))).toBe("01/2027");
  });

  it("maps known statement products to internal product metadata", () => {
    expect(resolveStatementProduct("CPP_NRF_LF")).toMatchObject({
      rawCode: "CPP_NRF_LF",
      label: "ČPP ŽP NEON",
      productKey: "neon",
      category: "life",
      usesAnnualPremiumBase: true,
    });
  });

  it("classifies life split commission codes including role split variants", () => {
    expect(classifyLifeSplitCommissionCode("APZ101")).toMatchObject({
      kind: "a101",
    });
    expect(classifyLifeSplitCommissionCode("B036")).toMatchObject({
      kind: "b3601",
    });
    expect(classifyLifeSplitCommissionCode("NVZ1")).toMatchObject({
      kind: "increase",
    });
  });
});
