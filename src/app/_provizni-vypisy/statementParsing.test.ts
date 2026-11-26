import { describe, expect, it } from "vitest";

import {
  addMonthsToMonthKey,
  classifyLifeSplitCommissionCode,
  classifyGeneralCommissionCode,
  isKooperativaCStatementRow,
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
  it.each(["INVESTIKA", "EFEKTIKA", "MONETIKA", "CON_INV2_C"])("treats %s payments as investment receipts", product => {
    for (const code of ["BC180", "C101", "OTHER"]) {
      expect(classifyGeneralCommissionCode(product, code)).toMatchObject({ kind: "investment" });
    }
  });

  it.each(["TU_JN", "TU_ZP", "TU_ZS"])("keeps retired statement product %s outside insurance classifications", product => {
    expect(resolveStatementProduct(product)).toMatchObject({ rawCode: product, productKey: null, category: "unknown" });
    for (const code of ["A1", "A2", "A3", "B1"]) {
      expect(classifyGeneralCommissionCode(product, code)).toEqual({ kind: "unknown", label: `Nezařazený kód ${code}` });
    }
  });

  it.each(["C101", "C102", "C103", "C104", "C105", "C106", " c111 "])(
    "recognizes Kooperativa Auto %s as a statement-paid subsequent commission", code => {
      expect(classifyGeneralCommissionCode("KOO_NAMIRU", code)).toEqual({ kind: "subsequent", label: "Následná provize dle výpisu" });
      expect(isKooperativaCStatementRow({ product: "KOO_NAMIRU", type: code })).toBe(true);
      expect(commissionCodeAliasesForPayoutHistory(code)).not.toContain("B101");
    }
  );

  it.each(["CPP_1C_II", "KOO_OBCAN", "KOOP_FLEXI", "UNKNOWN"])(
    "keeps C101 meaning scoped to Kooperativa Auto rather than %s", product => {
      expect(classifyGeneralCommissionCode(product, "C101").kind).toBe("unexpected");
      expect(isKooperativaCStatementRow({ product, type: "C101" })).toBe(false);
    }
  );

  it.each(["C101suffix", "C201", "CP101", "CPZ101", "CZ101"])(
    "does not infer a Kooperativa C1 subsequent payout for %s", code => {
      expect(isKooperativaCStatementRow({ product: "KOO_NAMIRU", type: code })).toBe(false);
      expect(classifyGeneralCommissionCode("KOO_NAMIRU", code).kind).not.toBe("subsequent");
    }
  );
  it.each(["CPP_CS_Z", "CPP_CS6"])("maps %s to ČPP travel insurance without annualizing the premium", code => {
    expect(resolveStatementProduct(code)).toMatchObject({
      rawCode: code, productKey: "cppcestovko", category: "travel", usesAnnualPremiumBase: false,
    });
  });

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
    expect(resolveStatementProduct("CPP_1C_II")).toMatchObject({
      productKey: "cppAuto",
      category: "auto",
    });
    expect(resolveStatementProduct("CPP_NRF_LF")).toMatchObject({
      rawCode: "CPP_NRF_LF",
      label: "ČPP Životní pojištění NEON",
      productKey: "neon",
      category: "life",
      usesAnnualPremiumBase: true,
    });
  });

  it("classifies CPP_N_INVS as life insurance", () => {
    expect(resolveStatementProduct("CPP_N_INVS")).toMatchObject({
      rawCode: "CPP_N_INVS",
      productKey: "neon",
      category: "life",
      usesAnnualPremiumBase: true,
    });
    expect(isLifeSplitProductCode("CPP_N_INVS")).toBe(true);
    expect(isInvestmentSectionProductCode("CPP_N_INVS")).toBe(false);
  });

  it("puts COLOS_NEMO statement rows into the investment section", () => {
    expect(resolveStatementProduct("COLOS_NEMO")).toMatchObject({
      rawCode: "COLOS_NEMO",
      category: "investment",
    });
    expect(INVESTMENT_SECTION_PRODUCT_CODES.has("COLOS_NEMO")).toBe(true);
  });

  it("keeps the investment variant of NEON REFRESH in life insurance with separate A201 commissions", () => {
    expect(resolveStatementProduct("CPP_NRF_IN")).toMatchObject({
      productKey: "neon",
      category: "life",
      usesAnnualPremiumBase: true,
    });
    expect(isLifeSplitProductCode("CPP_NRF_IN")).toBe(true);
    expect(isInvestmentSectionProductCode("CPP_NRF_IN")).toBe(false);
    expect(classifyLifeSplitCommissionCode("A101").kind).toBe("a101");
    expect(classifyLifeSplitCommissionCode("A201").kind).toBe("unknown");
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

  it.each(["CPP_DOMX", "CPP_DOMX+2", "CPP_DOMEX+"])(
    "recognizes the annual manager commission base for %s with quarterly premiums",
    (product) => {
      expect(
        resolveStatementPremiumBasePeriod({
          product,
          statementBase: 3_096,
          systemPaymentBase: 774,
          systemFrequency: "quarterly",
        })
      ).toBe("annual");
    }
  );

  it.each([
    { statementBase: 3_096, systemPaymentBase: 258, systemFrequency: "monthly", expected: "annual" },
    { statementBase: 3_096, systemPaymentBase: 1_548, systemFrequency: "semiannual", expected: "annual" },
    { statementBase: 774, systemPaymentBase: 774, systemFrequency: "quarterly", expected: "payment" },
    { statementBase: 3_200, systemPaymentBase: 774, systemFrequency: "quarterly", expected: "annual" },
    { statementBase: 800, systemPaymentBase: 774, systemFrequency: "quarterly", expected: "payment" },
  ])(
    "resolves property base $statementBase against $systemPaymentBase $systemFrequency as $expected, including differing premiums",
    ({ expected, ...input }) => {
      expect(
        resolveStatementPremiumBasePeriod({ product: "CPP_DOMX+2", ...input })
      ).toBe(expected);
    }
  );

  it.each([
    { baseRule: "annual" as const, statementBase: 774, expected: "annual" },
    { baseRule: "statement" as const, statementBase: 3_096, expected: "payment" },
  ])("keeps an explicit property $baseRule rule authoritative", ({ baseRule, statementBase, expected }) => {
    const mapping = createStatementProductMappingIndex([
      {
        code: "CPP_DOMX+2",
        label: "ČPP DOMEX",
        productKey: "domex",
        category: "property",
        baseRule,
        isLifeSplit: false,
        isInvestmentSection: false,
        note: null,
      },
    ]);

    expect(
      resolveStatementPremiumBasePeriod({
        product: "CPP_DOMX+2",
        statementBase,
        systemPaymentBase: 774,
        systemFrequency: "quarterly",
        mappingIndex: mapping,
      })
    ).toBe(expected);
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

describe("deferred increase statement components", () => {
  it.each([["NB3601", "B3601", 3], ["NB4801", "B4801", 4]] as const)("keeps %s separate from NB0301", (code, component, years) => {
    expect(managerCommissionCodeForSystemItems(code)).toBe(component);
    const aliases = commissionCodeAliasesForPayoutHistory(code);
    expect(aliases).toContain(component);
    expect(aliases).not.toContain("B0301");
    expect(classifyLifeSplitCommissionCode(code)).toEqual({ kind: "increase", label: `Provize za navýšení po ${years} letech` });
    expect(classifyGeneralCommissionCode("CPP_N_LIFE", code)).toEqual({ kind: "increase", label: `Provize za navýšení po ${years} letech` });
    expect(expectedPremiumIncreaseAmountFromItems([
      { code: "B0301", title: "Provize B0301", amount: 25 },
      { code: component, title: `Provize po ${years} letech`, amount: 75 },
    ], [{ type: code }])).toBe(75);
  });
  it("preserves unknown NB codes without mapping them to the card commission", () => {
    expect(managerCommissionCodeForSystemItems("NB999")).toBe("NB999");
    expect(commissionCodeAliasesForPayoutHistory("NB999")).not.toContain("B0301");
    expect(expectedPremiumIncreaseAmountFromItems([
      { code: "B0301", title: "Provize B0301", amount: 25 },
    ], [{ type: "NB999" }])).toBeNull();
  });
  it("does not claim an expected zero when the corresponding deferred item is missing", () => {
    expect(expectedPremiumIncreaseAmountFromItems([
      { code: "B0301", title: "Provize B0301", amount: 25 },
    ], [{ type: "NB3601" }])).toBeNull();
  });
});
