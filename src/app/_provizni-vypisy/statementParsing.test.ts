import { describe, expect, it } from "vitest";

import {
  addMonthsToMonthKey,
  classifyLifeSplitCommissionCode,
  commissionCodeAliasesForPayoutHistory,
  expectedPremiumIncreaseAmountFromItems,
  formatMonthKey,
  filterManagerCommissionRowsOffsetByDeductions,
  INVESTMENT_SECTION_PRODUCT_CODES,
  isInvestmentSectionProductCode,
  isLifeSplitProductCode,
  managerCommissionCodeForSystemItems,
  managerCommissionRowIdentity,
  monthKeyFromStatementPeriod,
  normalizeContractNumberForMatch,
  parseLocalDate,
  resolveStatementPremiumBasePeriod,
  resolveStatementProduct,
  statementPaymentBundleCount,
  usesIndependentStatementCommissionBase,
} from "./statementParsing";
import { createStatementProductMappingIndex } from "./statementProductMap";

describe("commission statement parsing helpers", () => {
  it("maps premium-increase manager codes to endorsement commission items", () => {
    expect(managerCommissionCodeForSystemItems("NB0301")).toBe("B0301");
    expect(managerCommissionCodeForSystemItems("NV101")).toBe("A101");
    expect(managerCommissionCodeForSystemItems("NVP101")).toBe("A101");
    expect(managerCommissionCodeForSystemItems("B3601")).toBe("B3601");
    expect(commissionCodeAliasesForPayoutHistory("NV101")).toContain("A101");
    expect(commissionCodeAliasesForPayoutHistory("NB0301")).toContain("B0301");
  });

  it("compares NV/NB increase rows with A101/B0301 items stored on an endorsement", () => {
    const items = [
      { code: "A101", title: "Okamžitá provize A101", amount: 2_010.1 },
      { code: "B0301", title: "Provize B0301", amount: 578.83 },
      { code: "B3601", title: "Provize po 3 letech B3601", amount: 2_447.29 },
      { code: "TOTAL", title: "Celkem", amount: 5_036.22 },
    ];

    expect(
      expectedPremiumIncreaseAmountFromItems(items, [
        { type: "NV101" },
        { type: "NB0301" },
      ])
    ).toBeCloseTo(2_588.93, 2);
    expect(
      expectedPremiumIncreaseAmountFromItems(items, [{ type: "NB0301" }])
    ).toBeCloseTo(578.83, 2);
  });

  it("falls back to item titles for legacy endorsements without stored item codes", () => {
    expect(
      expectedPremiumIncreaseAmountFromItems(
        [
          { title: "Okamžitá provize A101", amount: 2_010.1 },
          { title: "Provize B0301", amount: 578.83 },
        ],
        [{ type: "NV101" }, { type: "NB0301" }]
      )
    ).toBeCloseTo(2_588.93, 2);
  });

  it("keeps repeated manager rows with different amounts uniquely identifiable", () => {
    const shared = {
      id: "451334",
      detailUrl: null,
      contractNumber: "7503327308",
      signedAt: "18.06.2026",
      client: "Pazderková Kateřina",
      role: "M",
      product: "CPP_N_LIFE",
      type: "A101",
      percent: "3,52%",
      career: "108",
      reserveFund: 500,
      isStorno: false,
    };

    const first = managerCommissionRowIdentity({
      ...shared,
      base: 22_800,
      commission: 7_941,
    });
    const second = managerCommissionRowIdentity({
      ...shared,
      base: 23_580,
      commission: 3_332,
    });

    expect(first).not.toBe(second);
  });

  it("removes manager commission rows fully canceled in the statement deductions", () => {
    const shared = {
      detailUrl: null,
      contractNumber: "7503327308",
      signedAt: "18.06.2026",
      client: "Pazderková Kateřina",
      role: "M",
      product: "CPP_N_LIFE",
      type: "A101",
      percent: "3,52%",
      career: "108",
      isStorno: false,
    };
    const rows = filterManagerCommissionRowsOffsetByDeductions([
      {
        ...shared,
        sourceKey: "manager:commission:0",
        id: "451334",
        base: 22_800,
        commission: 7_941,
        reserveFund: 1_191,
      },
      {
        ...shared,
        sourceKey: "manager:commission:1",
        id: "451334",
        base: 23_580,
        commission: 3_332,
        reserveFund: 500,
      },
      {
        ...shared,
        sourceKey: "manager:deduction:0",
        isDeduction: true,
        id: "451334",
        base: 22_800,
        commission: -7_941,
        reserveFund: -1_191,
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      base: 23_580,
      commission: 3_332,
      reserveFund: 500,
    });
  });

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

  it("recognizes multiple premium payments bundled into one statement row", () => {
    expect(
      statementPaymentBundleCount({
        statementBase: 3_780,
        systemPaymentBase: 1_890,
        statementCommission: 76,
        expectedCommissionPerPayment: 37.8,
        systemFrequency: "quarterly",
      })
    ).toBe(2);
  });

  it("does not hide a base mismatch when the commission is not the same multiple", () => {
    expect(
      statementPaymentBundleCount({
        statementBase: 3_780,
        systemPaymentBase: 1_890,
        statementCommission: 60,
        expectedCommissionPerPayment: 37.8,
        systemFrequency: "quarterly",
      })
    ).toBeNull();
    expect(
      statementPaymentBundleCount({
        statementBase: 3_000,
        systemPaymentBase: 1_890,
        statementCommission: 76,
        expectedCommissionPerPayment: 37.8,
        systemFrequency: "quarterly",
      })
    ).toBeNull();
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

  it("puts COLOS_NEMO statement rows into the investment section", () => {
    expect(resolveStatementProduct("COLOS_NEMO")).toMatchObject({
      rawCode: "COLOS_NEMO",
      category: "investment",
    });
    expect(INVESTMENT_SECTION_PRODUCT_CODES.has("COLOS_NEMO")).toBe(true);
  });

  it("maps statement product aliases into product categories", () => {
    expect(resolveStatementProduct("CPP_DOMEX+")).toMatchObject({
      productKey: "domex",
      category: "property",
    });
    expect(resolveStatementProduct("CPP_BYTEX+")).toMatchObject({
      productKey: "cppbytex",
      category: "property",
    });
    expect(resolveStatementProduct("CPP_BYTEX")).toMatchObject({
      productKey: "cppbytex",
      category: "property",
    });
    expect(resolveStatementProduct("CPP_ZAMEX")).toMatchObject({
      productKey: "zamex",
      category: "property",
    });
    expect(resolveStatementProduct("PIL_MAJ")).toMatchObject({
      label: "Pillow Majetek",
      productKey: "pillowmajetek",
      category: "property",
      usesAnnualPremiumBase: true,
    });
    expect(resolveStatementProduct("MAX_DOM3")).toMatchObject({
      productKey: "maxdomov",
      category: "property",
    });
    expect(resolveStatementProduct("CPP_SIMPLE")).toMatchObject({
      productKey: "cppsimplex",
      category: "business",
    });
    expect(resolveStatementProduct("CPP_KP_III")).toMatchObject({
      category: "business",
    });
    expect(resolveStatementProduct("CPP_PPD")).toMatchObject({
      category: "business",
    });
    expect(resolveStatementProduct("CPP_PPR")).toMatchObject({
      productKey: "cppPPRbez",
      category: "business",
    });
    expect(resolveStatementProduct("CPP_CS_Z")).toMatchObject({
      productKey: "cppcestovko",
      category: "travel",
    });
    expect(resolveStatementProduct("AXA_CS")).toMatchObject({
      productKey: "axacestovko",
      category: "travel",
    });
    expect(resolveStatementProduct("MAX_CIZIN")).toMatchObject({
      productKey: "maxcizinkomplex",
      category: "foreigners",
    });
    expect(resolveStatementProduct("MAX_CIZIN_TEST")).toMatchObject({
      category: "foreigners",
    });
    for (const code of ["ČSOBP_AU_Z", "CSOBP_AU_Z", "SOBP_AU_Z"]) {
      expect(resolveStatementProduct(code)).toMatchObject({
        productKey: "csobAuto",
        category: "auto",
        usesAnnualPremiumBase: true,
      });
    }
    expect(resolveStatementProduct("KOO_PRANI")).toMatchObject({
      category: "life",
    });
    expect(isLifeSplitProductCode("KOO_PRANI")).toBe(false);
  });

  it("allows runtime product map overrides for statement parsing", () => {
    const mapping = createStatementProductMappingIndex([
      {
        code: "CPP_NRF_LF",
        label: "NEON mimo rozpad",
        productKey: "neon",
        category: "property",
        baseRule: "statement",
        isLifeSplit: false,
        isInvestmentSection: true,
        note: null,
      },
    ]);

    expect(resolveStatementProduct("CPP_NRF_LF", mapping)).toMatchObject({
      rawCode: "CPP_NRF_LF",
      label: "NEON mimo rozpad",
      productKey: "neon",
      category: "property",
      usesAnnualPremiumBase: false,
    });
    expect(isLifeSplitProductCode("CPP_NRF_LF", mapping)).toBe(false);
    expect(isInvestmentSectionProductCode("CPP_NRF_LF", mapping)).toBe(true);
  });

  it("resolves ČSOB Auto statement bases as annual without multiplying them again", () => {
    expect(
      resolveStatementPremiumBasePeriod({
        product: "CSOBP_AU_Z",
        statementBase: 10_436,
        systemPaymentBase: 2_609,
        systemFrequency: "quarterly",
      })
    ).toBe("annual");
  });

  it("treats the Pillow Majetek statement base as an independent annual commission base", () => {
    expect(
      resolveStatementPremiumBasePeriod({
        product: "PIL_MAJ",
        statementBase: 3_456,
        systemPaymentBase: 879,
        systemFrequency: "quarterly",
      })
    ).toBe("annual");
    expect(usesIndependentStatementCommissionBase("PIL_MAJ")).toBe(true);
    expect(usesIndependentStatementCommissionBase("CPP_DOMEX+")).toBe(false);
  });

  it("infers annual versus payment bases for auto products with automatic rules", () => {
    expect(
      resolveStatementPremiumBasePeriod({
        product: "CPP_ACPIV",
        statementBase: 12_000,
        systemPaymentBase: 3_000,
        systemFrequency: "quarterly",
      })
    ).toBe("annual");
    expect(
      resolveStatementPremiumBasePeriod({
        product: "CPP_ACPIV",
        statementBase: 3_000,
        systemPaymentBase: 3_000,
        systemFrequency: "quarterly",
      })
    ).toBe("payment");
  });

  it("keeps an explicit statement-base override authoritative", () => {
    const mapping = createStatementProductMappingIndex([
      {
        code: "CSOBP_AU_Z",
        label: "ČSOB Auto",
        productKey: "csobAuto",
        category: "auto",
        baseRule: "statement",
        isLifeSplit: false,
        isInvestmentSection: false,
        note: null,
      },
    ]);

    expect(
      resolveStatementPremiumBasePeriod({
        product: "CSOBP_AU_Z",
        statementBase: 10_436,
        systemPaymentBase: 2_609,
        systemFrequency: "quarterly",
        mappingIndex: mapping,
      })
    ).toBe("payment");
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
