import { describe, expect, it } from "vitest";

import {
  addMonthsToMonthKey,
  classifyLifeSplitCommissionCode,
  formatMonthKey,
  INVESTMENT_SECTION_PRODUCT_CODES,
  isInvestmentSectionProductCode,
  isLifeSplitProductCode,
  managerCommissionCodeForSystemItems,
  monthKeyFromStatementPeriod,
  normalizeContractNumberForMatch,
  parseLocalDate,
  resolveStatementPremiumBasePeriod,
  resolveStatementProduct,
  usesIndependentStatementCommissionBase,
} from "./statementParsing";
import { createStatementProductMappingIndex } from "./statementProductMap";

describe("commission statement parsing helpers", () => {
  it("maps premium-increase manager codes to endorsement commission items", () => {
    expect(managerCommissionCodeForSystemItems("NB0301")).toBe("B0301");
    expect(managerCommissionCodeForSystemItems("NV101")).toBe("A101");
    expect(managerCommissionCodeForSystemItems("NVP101")).toBe("A101");
    expect(managerCommissionCodeForSystemItems("B3601")).toBe("B3601");
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
