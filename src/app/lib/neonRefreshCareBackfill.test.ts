import { describe, expect, it } from "vitest";
import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import { calculateNeon } from "./productFormulas/neon";
import { planNeonRefreshCareBackfill } from "./neonRefreshCareBackfill";

const original = calculateNeon(300, "poradce6", 20, "standard", "2021-10-12");
const care = original.items.find(item => item.code === "B201-B206")!;
const contract = {
  productKey: "neon",
  isRefresh: true,
  inputAmount: 300,
  calculationInputAmount: 300,
  refreshCommissionBase: { calculationMonthlyPremium: 300, calculationAnnualPremium: 3600 },
  ...original,
  result: original,
  managerOverrides: [{ total: 60, items: [{ ...care, amount: 10 }] }],
} satisfies ContractDoc;

describe("NEON Refresh care backfill", () => {
  it("requires independent confirmation when the care statement conflicts with the stored premium", () => {
    const legacy = {
      ...contract,
      commissionPayouts: [{
        code: "B201", title: "CPP_NEONRF · B201", status: "paid",
        amount: 199.58, sourceBaseAmount: 7200, statementId: "statement",
      }],
    } satisfies ContractDoc & { commissionPayouts: { sourceBaseAmount: number }[] };
    expect(planNeonRefreshCareBackfill(legacy)).toEqual({ status: "review_full_premium" });
    expect(planNeonRefreshCareBackfill(legacy, 300)).toEqual({ status: "review_full_premium" });
    const plan = planNeonRefreshCareBackfill(legacy, 600);
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.statementCount).toBe(1);
    expect(plan.patch.neonRefreshCareAnnualPremium).toBe(7200);
    expect(plan.patch.items.find(item => item.code === "B201-B206")?.amount).toBeCloseTo(199.58, 2);
    expect(plan.patch.items.find(item => item.code === "A101")).toEqual(original.items[0]);
    expect(plan.patch.managerOverrides?.[0]).toMatchObject({ total: 120, items: [{ amount: 20 }] });
    expect(plan.patch).not.toHaveProperty("commissionPayouts");
    expect(plan.patch).not.toHaveProperty("refreshCommissionBase");
    expect(planNeonRefreshCareBackfill({ ...legacy, ...plan.patch })).toEqual({ status: "current" });
  });

  it("uses a known full contract premium for plans with distinct risk and full premiums", () => {
    expect(planNeonRefreshCareBackfill({ ...contract, inputAmount: 600 })).toMatchObject({
      status: "ready", patch: { neonRefreshCareAnnualPremium: 7200 },
    });
    expect(planNeonRefreshCareBackfill({ ...contract, isRefresh: false }, 600)).toEqual({ status: "out_of_scope" });
  });

  it("rechecks an exact paid care row while keeping its original payout and statement identity", () => {
    const userEmail = "adviser@example.test";
    const paid = { code: "B201", title: "CPP_NEONRF · B201", status: "paid", amount: 199.58,
      expectedAmount: 99.79, difference: 99.79, systemBaseAmount: 3600, sourceBaseAmount: 7200,
      statementId: "statement", writtenBy: userEmail };
    const careerMismatch = { ...paid, code: "B202", differenceReason: "career_mismatch" };
    const plan = planNeonRefreshCareBackfill({
      ...contract, userEmail, inputAmount: 600, commissionPayouts: [paid, careerMismatch],
    });
    expect(plan).toMatchObject({
      status: "ready", payoutCount: 1, statementCount: 1,
      patch: { commissionPayouts: [
        { ...paid, expectedAmount: 199.58, difference: 0, systemBaseAmount: 7200 },
        careerMismatch,
      ] },
    });
  });
});
