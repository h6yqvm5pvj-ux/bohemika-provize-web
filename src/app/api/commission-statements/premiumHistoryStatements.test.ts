import { describe, expect, it } from "vitest";

import {
  autoPremiumContractNumbersForRows,
  filterAutoPremiumRowsForContract,
  normalizePremiumHistoryContractNumber,
  normalizeStoredAutoPremiumRows,
} from "./premiumHistoryStatements";

describe("premium history statement summaries", () => {
  it("normalizes contract numbers used for premium history lookup", () => {
    expect(normalizePremiumHistoryContractNumber(" 003 330/8098 ")).toBe("0033308098");
    expect(normalizePremiumHistoryContractNumber("123")).toBeNull();
  });

  it("sanitizes stored auto premium rows and derives indexed contract numbers", () => {
    const rows = normalizeStoredAutoPremiumRows([
      {
        premiumKind: "auto_change",
        rowId: " 12 ",
        detailUrl: " https://example.test/detail ",
        contractNumber: " 003 330/8098 ",
        client: " Jan Novak ",
        productCode: " CPP_ACPIV ",
        productKey: "cppAuto",
        commissionCode: " B101 ",
        basePremium: "12345.67",
        commission: "1000",
        signedAt: "01.01.2024",
        validFrom: "01.02.2024",
        source: "manager",
      },
      {
        rowId: "missing-contract",
        productCode: "CPP_ACPIV",
        commissionCode: "B101",
        basePremium: 1000,
      },
    ]);

    expect(rows).toEqual([
      {
        premiumKind: "auto_change",
        rowId: "12",
        detailUrl: "https://example.test/detail",
        contractNumber: "0033308098",
        client: "Jan Novak",
        productCode: "CPP_ACPIV",
        productKey: "cppAuto",
        commissionCode: "B101",
        basePremium: 12345.67,
        commission: 1000,
        signedAt: "01.01.2024",
        validFrom: "01.02.2024",
        source: "manager",
      },
    ]);
    expect(autoPremiumContractNumbersForRows(rows ?? [])).toEqual(["0033308098"]);
  });

  it("filters rows to the requested contract number", () => {
    const rows = normalizeStoredAutoPremiumRows([
      {
        rowId: "1",
        contractNumber: "0033308098",
        productCode: "CPP_ACPIV",
        commissionCode: "B101",
        basePremium: 12000,
      },
      {
        rowId: "2",
        contractNumber: "3250129511",
        productCode: "CPP_ACPIV",
        commissionCode: "B101",
        basePremium: 9000,
      },
    ]);

    expect(filterAutoPremiumRowsForContract(rows ?? [], "33308098")).toEqual([]);
    expect(filterAutoPremiumRowsForContract(rows ?? [], "003 330 8098")).toMatchObject([
      { rowId: "1", contractNumber: "0033308098" },
    ]);
  });
});
