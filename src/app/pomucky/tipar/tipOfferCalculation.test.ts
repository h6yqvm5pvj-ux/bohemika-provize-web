import { describe, expect, it } from "vitest";

import { AUTO_PRODUCTS, LIFE_PRODUCTS, PRODUCT_ORDER } from "@/app/lib/productCatalog";
import { calculateCommission } from "@/app/lib/calculateCommission";
import {
  TIP_OFFER_PRODUCTS,
  calculateTipOfferProduct,
  sumA101Commission,
  sumCommissionByCode,
} from "./tipOfferCalculation";

describe("TIP offer calculation", () => {
  it("lists products and replaces autos, life and travel with aggregate rows", () => {
    const representedProducts = new Set(
      TIP_OFFER_PRODUCTS.filter((item) => item.id !== "auto").map(
        (item) => item.calculatorProduct
      )
    );

    const averagedTravelProducts = [
      "cppcestovko",
      "axacestovko",
      "koopcestovko",
    ] as const;
    PRODUCT_ORDER.filter(
      (product) =>
        !AUTO_PRODUCTS.includes(product) &&
        !LIFE_PRODUCTS.includes(product) &&
        product !== "comfortcc" &&
        !averagedTravelProducts.includes(
          product as (typeof averagedTravelProducts)[number]
        )
    ).forEach((product) => expect(representedProducts.has(product)).toBe(true));
    expect(TIP_OFFER_PRODUCTS.filter((item) => item.id === "auto")).toHaveLength(1);
    expect(TIP_OFFER_PRODUCTS.filter((item) => item.id === "life")).toHaveLength(1);
    expect(TIP_OFFER_PRODUCTS.filter((item) => item.id === "travel")).toHaveLength(1);
    expect(TIP_OFFER_PRODUCTS).toHaveLength(
      PRODUCT_ORDER.length -
        AUTO_PRODUCTS.length -
        LIFE_PRODUCTS.length -
        averagedTravelProducts.length +
        2
    );
  });

  it("uses only the exact A101 component", () => {
    expect(
      sumA101Commission([
        { title: "Provize A101", code: "A101", amount: 1_000 },
        { title: "Provize B0301", code: "B0301", amount: 500 },
        { title: "Provize po 3 letech", code: "B3601", amount: 750 },
        { title: "A101 až A104", code: "A101-A104", amount: 2_000 },
      ])
    ).toBe(1_000);
  });

  it("calculates the tip percentage from A101 and not from total commission", () => {
    const definition = TIP_OFFER_PRODUCTS.find((item) => item.id === "life");
    expect(definition).toBeDefined();

    const result = calculateTipOfferProduct({
      definition: definition!,
      position: "poradce5",
      premium: 1_500,
      tipPercent: 30,
      durationYears: 30,
      signedDateIso: "2026-08-29",
    });

    expect(result.baseCommission).toBeGreaterThan(0);
    expect(result.tipCommission).toBe(
      Math.round(result.baseCommission * 0.3 * 100) / 100
    );
    expect(result.adviserCommission).toBe(
      Math.round((result.baseCommission - result.tipCommission) * 100) / 100
    );
  });

  it("uses the arithmetic average of NEON and FLEXI A101 for life insurance", () => {
    const definition = TIP_OFFER_PRODUCTS.find((item) => item.id === "life");
    expect(definition?.averageCalculatorProducts).toEqual(["neon", "flexi"]);

    const commonInput = {
      position: "poradce6" as const,
      commissionMode: "accelerated" as const,
      contractSignedDateIso: "2026-08-29",
      inputAmount: 1_800,
      frequencyRaw: "monthly" as const,
      durationYears: 30,
      durationMonths: null,
      maxCizinKomplexVariant: "exclusiveStandard" as const,
      comfortPayment: null,
      comfortGradual: false,
      comfortTargetAmount: null,
    };
    const neon = calculateCommission({ productKey: "neon", ...commonInput });
    const flexi = calculateCommission({ productKey: "flexi", ...commonInput });
    const expectedAverage =
      Math.round(
        ((sumA101Commission(neon?.items ?? []) +
          sumA101Commission(flexi?.items ?? [])) /
          2) *
          100
      ) / 100;

    const result = calculateTipOfferProduct({
      definition: definition!,
      position: "poradce6",
      premium: 1_800,
      tipPercent: 30,
      durationYears: 30,
      signedDateIso: "2026-08-29",
    });

    expect(result.baseCommission).toBe(expectedAverage);
  });

  it("uses one representative Auta calculation", () => {
    const definition = TIP_OFFER_PRODUCTS.find((item) => item.id === "auto");
    expect(definition?.calculatorProduct).toBe("cppAuto");

    const result = calculateTipOfferProduct({
      definition: definition!,
      position: "manazer7",
      premium: 18_000,
      tipPercent: 25,
      signedDateIso: "2026-08-29",
    });

    expect(result.baseCommission).toBeGreaterThan(0);
    expect(result.tipCommission).toBe(
      Math.round(result.baseCommission * 0.25 * 100) / 100
    );
  });

  it("uses the arithmetic average of ČPP, AXA and Kooperativa for travel insurance", () => {
    const definition = TIP_OFFER_PRODUCTS.find((item) => item.id === "travel");
    expect(definition?.averageCalculatorProducts).toEqual([
      "cppcestovko",
      "axacestovko",
      "koopcestovko",
    ]);

    const commonInput = {
      position: "manazer6" as const,
      commissionMode: "accelerated" as const,
      contractSignedDateIso: "2026-08-29",
      inputAmount: 6_000,
      frequencyRaw: "annual" as const,
      durationYears: null,
      durationMonths: null,
      maxCizinKomplexVariant: "exclusiveStandard" as const,
      comfortPayment: null,
      comfortGradual: false,
      comfortTargetAmount: null,
    };
    const products = [
      "cppcestovko",
      "axacestovko",
      "koopcestovko",
    ] as const;
    const expectedAverage =
      Math.round(
        (products.reduce((sum, productKey) => {
          const result = calculateCommission({ productKey, ...commonInput });
          return sum + sumA101Commission(result?.items ?? []);
        }, 0) /
          products.length) *
          100
      ) / 100;

    const result = calculateTipOfferProduct({
      definition: definition!,
      position: "manazer6",
      premium: 6_000,
      tipPercent: 30,
      signedDateIso: "2026-08-29",
    });

    expect(result.baseCommission).toBe(expectedAverage);
  });

  it("uses MAXIMA A501 instead of A101 for foreigners insurance", () => {
    const definition = TIP_OFFER_PRODUCTS.find(
      (item) => item.id === "maxcizinkomplex"
    );
    expect(definition?.commissionCode).toBe("A501");

    const calculated = calculateCommission({
      productKey: "maxcizinkomplex",
      position: "poradce8",
      commissionMode: "accelerated",
      contractSignedDateIso: "2026-08-29",
      inputAmount: 20_000,
      frequencyRaw: "annual",
      durationYears: null,
      durationMonths: null,
      maxCizinKomplexVariant: "exclusiveStandard",
      comfortPayment: null,
      comfortGradual: false,
      comfortTargetAmount: null,
    });
    const expectedA501 = sumCommissionByCode(calculated?.items ?? [], "A501");
    const result = calculateTipOfferProduct({
      definition: definition!,
      position: "poradce8",
      premium: 20_000,
      tipPercent: 30,
      signedDateIso: "2026-08-29",
    });

    expect(expectedA501).toBeGreaterThan(0);
    expect(result.baseCommission).toBe(expectedA501);
    expect(result.tipCommission).toBe(
      Math.round(expectedA501 * 0.3 * 100) / 100
    );
  });

  it("calculates every offered row with the current annual non-life model", () => {
    TIP_OFFER_PRODUCTS.forEach((definition) => {
      expect(() =>
        calculateTipOfferProduct({
          definition,
          position: "poradce7",
          premium: 12_000,
          tipPercent: 30,
          durationYears: 30,
          signedDateIso: "2026-08-29",
        })
      ).not.toThrow();
    });
  });
});
