import { describe, expect, it } from "vitest";

import { calculateNeonRefreshCommissionBase } from "@/app/lib/productFormulas/neon";

import {
  type ContractsFindApiResponse,
  resolveRefreshOriginalContractInfo,
} from "./calculatorApi";

type ContractsFindItem = NonNullable<ContractsFindApiResponse["contracts"]>[number];

describe("resolveRefreshOriginalContractInfo", () => {
  it("keeps the original refresh premium when a refreshed contract was later increased", () => {
    const previousRefresh: ContractsFindItem = {
      productKey: "neon",
      inputAmount: 1300,
      effectiveInputAmount: 1450,
      lifePremiumChanges: [
        {
          premiumAmount: 1450,
          policyStartDate: "2025-10-01",
        },
      ],
      policyStartDate: "2024-11-01",
      refreshCommissionBase: {
        refreshPolicyStartDateIso: "2024-11-01",
        newMonthlyPremium: 1300,
        newAnnualPremium: 15600,
        calculationMonthlyPremium: 11039 / 12,
        calculationAnnualPremium: 11039,
      },
    };

    const original = resolveRefreshOriginalContractInfo(previousRefresh);

    expect(original).toMatchObject({
      premiumAmount: 1300,
      stornoBasePremiumAmount: 11039 / 12,
      stornoStartDateIso: "2024-11-01",
    });

    const chainedRefreshBase = calculateNeonRefreshCommissionBase({
      newMonthlyPremium: 1450,
      originalMonthlyPremium: original?.premiumAmount,
      stornoBaseMonthlyPremium: original?.stornoBasePremiumAmount,
      originalStornoStartDateIso: original?.stornoStartDateIso,
      refreshPolicyStartDateIso: "2026-05-01",
    });

    expect(chainedRefreshBase?.premiumIncreaseAnnual).toBe(1800);
    expect(chainedRefreshBase?.stornedOriginalAnnualPremium).toBeCloseTo(7727.3, 2);
    expect(chainedRefreshBase?.calculationAnnualPremium).toBeCloseTo(9527.3, 2);
  });
});
