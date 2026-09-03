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
  comfortPayment: null,
  comfortGradual: null,
  comfortTargetAmount: null,
  ...overrides,
});

describe("calculateCommission", () => {
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
      "comfortcc",
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
          comfortPayment: productKey === "comfortcc" ? 1_000 : null,
          comfortGradual: productKey === "comfortcc" ? false : null,
          comfortTargetAmount: null,
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
