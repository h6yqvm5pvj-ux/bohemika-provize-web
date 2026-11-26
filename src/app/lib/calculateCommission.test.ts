import { describe, expect, it } from "vitest";

import type { CommissionCalculationInput } from "./calculateCommission";
import { calculateCommission } from "./calculateCommission";
import { calculateCppAuto, calculateNeon } from "./productFormulas";

const baseInput = (
  overrides: Partial<CommissionCalculationInput> = {}
): CommissionCalculationInput => ({
  productKey: "neon",
  position: "poradce5",
  commissionMode: "standard",
  contractSignedDateIso: "2026-01-10",
  inputAmount: 1_000,
  frequencyRaw: "monthly",
  durationYears: 15,
  durationMonths: null,
  maxCizinKomplexVariant: null,
  ...overrides,
});

describe("calculateCommission", () => {
  it.each(["investikaRealitniFond", "investikaEfektika", "investikaMonetika", "conseqInvest"] as const)("never calculates a commission for %s", productKey => {
    for (const position of [null, "poradce5", "manazer10"] as const) {
      expect(calculateCommission(baseInput({ productKey, position, inputAmount: 999_999 })))
        .toEqual({ items: [], total: 0 });
    }
  });
  it.each([null, "poradce5", "manazer10"] as const)("never generates commissions for the free trailer product at position %s", position => {
    expect(calculateCommission(baseInput({ productKey: "cppAutoVozikZdarma", position, inputAmount: 999_999 })))
      .toEqual({ items: [], total: 0 });
  });
  it("uses the NEON formula with the supplied position, mode, duration and date", () => {
    const input = baseInput({
      commissionMode: "accelerated",
      contractSignedDateIso: "2025-05-01",
      durationYears: 12,
    });

    expect(calculateCommission(input)).toEqual(
      calculateNeon(1_000, "poradce5", 12, "accelerated", "2025-05-01")
    );
  });

  it("uses the signed date when choosing an auto-product coefficient set", () => {
    const input = baseInput({
      productKey: "cppAuto",
      contractSignedDateIso: "2021-05-01",
      frequencyRaw: "annual",
      durationYears: null,
    });

    expect(calculateCommission(input)).toEqual(
      calculateCppAuto(1_000, "annual", "poradce5", "2021-05-01")
    );
  });

  it("keeps only the immediate payment-based items for property products", () => {
    const result = calculateCommission(
      baseInput({
        productKey: "domex",
        frequencyRaw: "quarterly",
        durationYears: null,
      })
    );

    expect(result).not.toBeNull();
    expect(result?.items.length).toBeGreaterThan(0);
    expect(result?.items.every((item) => item.title.toLowerCase().includes("(z platby)"))).toBe(
      true
    );
    const immediateFromItems = (result?.items ?? [])
      .filter((item) => item.title.toLowerCase().includes("okamžitá"))
      .reduce((sum, item) => sum + item.amount, 0);
    expect(result?.total).toBeCloseTo(immediateFromItems * 4, 2);
  });

  it("calculates DOMEX NEURON by payment frequency with A101 and B101 codes", () => {
    const result = calculateCommission(
      baseInput({
        productKey: "domexneuron",
        position: "manazer9",
        contractSignedDateIso: "2026-09-01",
        inputAmount: 1_000,
        frequencyRaw: "semiannual",
        durationYears: null,
      })
    );

    expect(result?.items).toMatchObject([
      { code: "A101-A102" },
      { code: "B101-B102", excludeFromTotal: true },
    ]);
    expect(result?.items[0]?.amount).toBeCloseTo(312.4, 6);
    expect(result?.items[1]?.amount).toBeCloseTo(78.1, 6);
    expect(result?.total).toBeCloseTo(624.8, 6);
  });

  it.each([
    ["poradce1", 0.03240, 0.02493],
    ["poradce2", 0.03530, 0.02785],
    ["poradce3", 0.03820, 0.03024],
    ["poradce4", 0.04100, 0.03775],
    ["poradce5", 0.04390, 0.04244],
    ["poradce6", 0.04680, 0.04536],
    ["poradce7", 0.05830, 0.05067],
    ["poradce8", 0.06120, 0.05369],
    ["poradce9", 0.06410, 0.05597],
    ["poradce10", 0.06700, 0.05756],
    ["manazer4", 0.05830, 0.04536],
    ["manazer5", 0.06120, 0.05067],
    ["manazer6", 0.06410, 0.05560],
    ["manazer7", 0.06700, 0.06048],
    ["manazer8", 0.06980, 0.06579],
    ["manazer9", 0.07270, 0.07029],
    ["manazer10", 0.07560, 0.07560],
  ] as const)("calculates both KOOP ODZAM commissions for %s before and from September 2026", (position, historical, current) => {
    for (const [contractSignedDateIso, coefficient] of [
      ["2026-08-31", historical],
      ["2026-09-01", current],
      ["2026-11-24", current],
      [null, current],
    ] as const) {
      const result = calculateCommission(baseInput({
        productKey: "koopodzam",
        position,
        contractSignedDateIso,
        inputAmount: 500,
        frequencyRaw: "quarterly",
        durationYears: null,
      }));

      expect(result?.items).toMatchObject([
        { code: "A101-A104" },
        { code: "B101-B104", excludeFromTotal: true },
      ]);
      expect(result?.items[0].amount).toBeCloseTo(500 * coefficient, 8);
      expect(result?.items[1].amount).toBeCloseTo(500 * coefficient, 8);
      expect(result?.total).toBeCloseTo(2_000 * coefficient, 8);
    }
  });

  it.each([
    ["poradce1", 0.1108, 0.0277, 0.0277],
    ["poradce2", 0.1238, 0.0309, 0.0309],
    ["poradce3", 0.1344, 0.0336, 0.0336],
    ["poradce4", 0.1678, 0.0419, 0.0419],
    ["poradce5", 0.1886, 0.0472, 0.0472],
    ["poradce6", 0.2016, 0.0504, 0.0504],
    ["poradce7", 0.2252, 0.0563, 0.0563],
    ["poradce8", 0.2386, 0.0597, 0.0597],
    ["poradce9", 0.2488, 0.0662, 0.0622],
    ["poradce10", 0.2558, 0.0640, 0.0640],
    ["manazer4", 0.2016, 0.0504, 0.0504],
    ["manazer5", 0.2252, 0.0563, 0.0563],
    ["manazer6", 0.2471, 0.0618, 0.0618],
    ["manazer7", 0.2688, 0.0672, 0.0672],
    ["manazer8", 0.2924, 0.0731, 0.0731],
    ["manazer9", 0.3124, 0.0781, 0.0781],
    ["manazer10", 0.3360, 0.0840, 0.0840],
  ] as const)("selects the correct OBCAN and FIT commissions for %s", (position, acquisition, historical, current) => {
    for (const [productKey, contractSignedDateIso, subsequent] of [
      ["koopmajetekobcan", "2026-08-31", historical],
      ["koopmajetekobcan", "2026-09-01", current],
      ["koopmajetekobcan", null, current],
      ["koopfit", "2026-09-01", historical],
    ] as const) {
      const result = calculateCommission(baseInput({
        productKey,
        position,
        contractSignedDateIso,
        inputAmount: 1_000,
        frequencyRaw: "quarterly",
        durationYears: null,
      }));
      expect(result?.items).toMatchObject([
        { code: "A101-A104" },
        { code: "B101-B104", excludeFromTotal: true },
      ]);
      expect(result?.items[0].amount).toBeCloseTo(1_000 * acquisition, 8);
      expect(result?.items[1].amount).toBeCloseTo(1_000 * subsequent, 8);
      expect(result?.total).toBeCloseTo(4_000 * acquisition, 8);
    }
  });

  it("matches anonymized amounts that were actually paid in commission statements", () => {
    // Each selected item below was reconciled with a statement row whose paid
    // and expected amounts matched exactly. The cases deliberately contain no
    // client, adviser or contract-number data.
    const paidReferences: Array<{
      label: string;
      input: Partial<CommissionCalculationInput>;
      total: number;
      paidItems: Array<{ key: string; amount: number }>;
    }> = [
      {
        label: "Allianz Auto / initial payout",
        input: {
          productKey: "allianzAuto",
          position: "poradce6",
          commissionMode: "accelerated",
          contractSignedDateIso: "2024-07-30",
          inputAmount: 5_214,
          frequencyRaw: "semiannual",
          durationYears: null,
        },
        total: 788.36,
        paidItems: [{ key: "A101", amount: 788.36 }],
      },
      {
        label: "ČPP Auto / semiannual initial payout",
        input: {
          productKey: "cppAuto",
          position: "poradce6",
          commissionMode: "accelerated",
          contractSignedDateIso: "2025-03-13",
          inputAmount: 5_869,
          frequencyRaw: "semiannual",
          durationYears: null,
        },
        total: 1_267.7,
        paidItems: [{ key: "A101", amount: 633.85 }],
      },
      {
        label: "ČPP Cestovní / single payout",
        input: {
          productKey: "cppcestovko",
          position: "manazer6",
          commissionMode: "accelerated",
          contractSignedDateIso: "2025-07-28",
          inputAmount: 233,
          frequencyRaw: "annual",
          durationYears: null,
        },
        total: 30.06,
        paidItems: [{ key: "A101", amount: 30.06 }],
      },
      {
        label: "DOMEX / quarterly payout",
        input: {
          productKey: "domex",
          position: "manazer7",
          commissionMode: "accelerated",
          contractSignedDateIso: "2025-11-24",
          inputAmount: 616,
          frequencyRaw: "quarterly",
          durationYears: null,
        },
        total: 662.32,
        paidItems: [{ key: "A101-A104", amount: 165.58 }],
      },
      {
        label: "FLEXI / initial split payouts",
        input: {
          productKey: "flexi",
          position: "poradce6",
          commissionMode: "standard",
          contractSignedDateIso: "2024-12-19",
          inputAmount: 793,
          frequencyRaw: "monthly",
          durationYears: 50,
        },
        total: 10_791.14,
        paidItems: [
          { key: "A101", amount: 3_671.15 },
          { key: "B0301", amount: 878.4 },
        ],
      },
      {
        label: "Kooperativa Majetek / monthly payout",
        input: {
          productKey: "koopmajetekobcan",
          position: "manazer7",
          commissionMode: "accelerated",
          contractSignedDateIso: "2025-09-14",
          inputAmount: 862,
          frequencyRaw: "monthly",
          durationYears: null,
        },
        total: 2_780.47,
        paidItems: [{ key: "A101-A112", amount: 231.71 }],
      },
      {
        label: "NEON / initial split payouts",
        input: {
          productKey: "neon",
          position: "manazer7",
          commissionMode: "accelerated",
          contractSignedDateIso: "2025-09-19",
          inputAmount: 943,
          frequencyRaw: "monthly",
          durationYears: 15,
        },
        total: 13_633.86,
        paidItems: [
          { key: "A101", amount: 5_504.67 },
          { key: "B0301", amount: 1_369.8 },
        ],
      },
      {
        label: "Pillow Majetek / quarterly payout",
        input: {
          productKey: "pillowmajetek",
          position: "manazer6",
          commissionMode: "accelerated",
          contractSignedDateIso: "2025-07-07",
          inputAmount: 879,
          frequencyRaw: "quarterly",
          durationYears: null,
        },
        total: 868.8,
        paidItems: [{ key: "A101-A104", amount: 868.8 }],
      },
      {
        label: "UNIQA Auto / quarterly initial payout",
        input: {
          productKey: "uniqaAuto",
          position: "manazer8",
          commissionMode: "accelerated",
          contractSignedDateIso: "2026-04-10",
          inputAmount: 5_051,
          frequencyRaw: "quarterly",
          durationYears: null,
        },
        total: 2_586.11,
        paidItems: [{ key: "A101", amount: 646.53 }],
      },
      {
        label: "ZAMEX / annual payout",
        input: {
          productKey: "zamex",
          position: "manazer6",
          commissionMode: "accelerated",
          contractSignedDateIso: "2025-07-04",
          inputAmount: 2_208,
          frequencyRaw: "annual",
          durationYears: null,
        },
        total: 170.46,
        paidItems: [{ key: "A101", amount: 170.46 }],
      },
    ];

    paidReferences.forEach(({ label, input, total, paidItems }) => {
      const result = calculateCommission(baseInput(input));
      expect(result, label).not.toBeNull();
      expect(result?.total, label).toBeCloseTo(total, 2);

      paidItems.forEach(({ key, amount }) => {
        const item = result?.items.find(
          (candidate) => candidate.code === key || candidate.title.includes(key)
        );
        expect(item, `${label}: ${key}`).toBeDefined();
        expect(item?.amount, `${label}: ${key}`).toBeCloseTo(amount, 2);
      });
    });
  });

  it("has one mapping for every supported calculator product", () => {
    const products: CommissionCalculationInput["productKey"][] = [
      "neon",
      "flexi",
      "maximaMaxEfekt",
      "maxcizinkomplex",
      "pillowInjury",
      "zamex",
      "cppbytex",
      "domexneuron",
      "domex",
      "cpphafan",
      "pillowmajetek",
      "koopmajetekobcan",
      "koopfit",
      "koopodzam",
      "kooppmop",
      "maxdomov",
      "cppsimplex",
      "cppAuto",
      "slaviaauto",
      "slaviaflotila",
      "allianzAuto",
      "allianzmujdomov",
      "csobAuto",
      "uniqaAuto",
      "uniqaflotila",
      "pillowAuto",
      "kooperativaAuto",
      "koopflotila",
      "koopcestovko",
      "cppcestovko",
      "axacestovko",

      "cppPPRs",
      "cppPPRbez",
    ];

    products.forEach((productKey) => {
      const result = calculateCommission(
        baseInput({
          productKey,
          frequencyRaw: "annual",
          durationYears: productKey === "maximaMaxEfekt" ? 30 : 15,
          durationMonths: productKey === "maxcizinkomplex" ? 12 : null,
          maxCizinKomplexVariant:
            productKey === "maxcizinkomplex" ? "exclusiveStandard" : null,
        })
      );

      expect(result, productKey).not.toBeNull();
      expect(Number.isFinite(result?.total)).toBe(true);
    });
  });

  it("requires a position", () => {
    expect(calculateCommission(baseInput({ position: null }))).toBeNull();
  });
});
