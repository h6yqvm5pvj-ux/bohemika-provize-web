import { describe, expect, it } from "vitest";
import { calculateConseqZenit } from "./conseqzenit";
import { productCoefficientValidityError } from "./coefficientSets";
import { calculateCommission } from "../calculateCommission";
import { applyTipContractAdjustmentToCommissionResult } from "../tipContractCommission";
import { generateCashflow } from "../../cashflow/generator";
import { calculateResultForPosition } from "../../smlouvy/[id]/contractDetailHelpers";

describe("CONSEQ Zenit DPS", () => {
  it.each([
    [99.99, 0], [100, 42], [200, 42], [299, 42], [299.99, 42],
    [300, 84], [500, 84], [999, 84], [999.99, 84],
    [1000, 1247], [1500, 1247], [100000, 1247],
  ])("uses a fixed manager 4 amount for contribution %s", (contribution, expected) => {
    const result = calculateConseqZenit(contribution, "manazer4");
    expect(result.total).toBe(expected);
    expect(result.items).toEqual([{ title: "💸 Okamžitá provize", code: "A101", amount: expected }]);
  });

  it("uses the selected advisor or manager grade, retaining the screenshot precision", () => {
    expect(calculateConseqZenit(100, "poradce1").total).toBe(23.086);
    expect(calculateConseqZenit(500, "poradce4").total).toBe(69.902);
    expect(calculateConseqZenit(1000, "poradce7").total).toBe(1393);
    expect(calculateConseqZenit(500, "poradce10").total).toBe(106.596);
    expect(calculateConseqZenit(500, "manazer9").total).toBe(130.172);
    expect(calculateConseqZenit(1000, "manazer10").total).toBe(2079);
  });

  it.each([0, -100, Number.NaN, Infinity])("has no commission for invalid contribution %s", (amount) => {
    expect(calculateConseqZenit(amount, "poradce1").total).toBe(0);
  });

  it("applies the supplied validity date", () => {
    expect(productCoefficientValidityError("conseqzenit", "2024-07-31")).toContain("01. 08. 2024");
    expect(productCoefficientValidityError("conseqzenit", "2024-08-01")).toBeNull();
  });

  it.each(["standard", "accelerated"] as const)("ignores duration and frequency in %s mode", async (commissionMode) => {
    const result = calculateCommission({
      productKey: "conseqzenit", position: "manazer4", commissionMode,
      contractSignedDateIso: "2024-08-01", inputAmount: 500, frequencyRaw: "quarterly",
      durationYears: 30, durationMonths: 12, maxCizinKomplexVariant: null,
      comfortPayment: null, comfortGradual: null, comfortTargetAmount: null,
    });
    expect(result?.total).toBe(84);
    expect(result?.items).toHaveLength(1);
    expect(await calculateResultForPosition({ id: "conseq-test", productKey: "conseqzenit", inputAmount: 500 }, "manazer4", commissionMode)).toEqual(result);
  });

  it.each(["A101", "APZ101"])("matches %s once for a tipped contract without subsequent payouts", (code) => {
    const base = calculateConseqZenit(500, "manazer4");
    const adjusted = applyTipContractAdjustmentToCommissionResult({
      product: "conseqzenit", items: base.items, total: base.total, tipsterPercent: 50,
    });
    expect(adjusted.total).toBe(42);
    const cashflow = generateCashflow([{
      id: "conseq-test", productKey: "conseqzenit", frequencyRaw: "monthly", inputAmount: 500,
      policyStartDate: new Date("2026-09-11T12:00:00Z"),
      contractSignedDate: new Date("2026-09-11T12:00:00Z"),
      items: adjusted.items,
      commissionPayouts: [{ key: "paid-conseq", code, amount: 42, status: "paid", payoutMonthKey: "2026-10" }],
    }]);
    expect(cashflow).toHaveLength(1);
    expect(cashflow[0]).toMatchObject({ amount: 42, payoutStatus: "paid", commissionPayoutKey: "paid-conseq" });
    expect(cashflow[0].isStatementOnly).not.toBe(true);
  });
});
