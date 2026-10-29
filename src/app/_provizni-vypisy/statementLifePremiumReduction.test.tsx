import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { calculateNeon } from "@/app/lib/productFormulas/neon";
import { LifePremiumBaseNotice, LifePremiumReductionNotice } from "./statementLifeCardNotices";
import { lifeSplitPremiumReductionReview } from "./statementLifePremiumReduction";
import { systemCommissionMonthlyBase } from "./statementSystemContracts";
import type { CommissionRow, LifePremiumChangeSummary, LifeSplitContractPreview, MatchedSystemContract } from "./statementTypes";

const reduction: LifePremiumChangeSummary = {
  id: "synthetic-reduction", entryType: "endorsement", premiumAmount: 550,
  annualPremium: 6600, previousPremium: 1500, previousAnnualPremium: 18000,
  premiumDelta: -950, annualPremiumDelta: -11400, policyStartDate: "2022-12-01",
};
const original: MatchedSystemContract = {
  id: "synthetic-original", adviserEmail: "advisor@example.test", productKey: "neon",
  inputAmount: 1500, calculationInputAmount: 1500, position: "poradce6", commissionMode: "standard",
  policyStartDate: "2020-12-01", contractSignedDate: "2020-11-15", durationYears: 43,
  lifePremiumChanges: [reduction],
  items: calculateNeon(1500, "poradce6", 43, "standard", "2020-11-15").items,
};
const contract = (codes = ["B3601"], base = 6000): LifeSplitContractPreview => ({
  productCode: "CPP_NEON", productLabel: "NEON", contractNumber: "SYNTHETIC-1", client: "Testovací klient",
  signedAt: "15.11.2020", validFrom: "01.12.2020", annualPremium: base, b36Payments: [],
  rows: codes.map(type => ({ type, base, commission: 1425.51 } as CommissionRow)),
});
const period = "01.12.2023 - 31.12.2023";

describe("deferred NEON payouts after a premium reduction", () => {
  it("uses the dated 550 CZK endorsement and retains the unresolved 50 CZK difference", () => {
    const snapshot = structuredClone(original);
    const result = lifeSplitPremiumReductionReview(contract(), original, period)!;
    expect(result.reference).toMatchObject({ annualPremium: 6600, originalAnnualPremium: 18000 });
    expect(systemCommissionMonthlyBase(result.systemContract)).toBe(550);
    expect(contract().annualPremium - result.reference.annualPremium).toBe(-600);
    const expected = result.systemContract.items!.find(item => item.code === "B3601")!.amount;
    expect(expected).toBeCloseTo(1568.16, 2);
    expect(1425.51 - expected).toBeCloseTo(-142.65, 2);
    expect(result.systemContract).toMatchObject({ id: original.id, position: "poradce6", contractSignedDate: original.contractSignedDate });
    expect(result.systemContract.items!.find(item => item.code === "A101")).toEqual(original.items!.find(item => item.code === "A101"));
    expect(original).toEqual(snapshot);
  });

  it.each(["B3601", "B4801"])("preserves original coefficients for %s instead of adopting the endorsement's position", code => {
    const result = lifeSplitPremiumReductionReview(contract([code]), original, "01.12.2024 - 31.12.2024")!;
    const expected = calculateNeon(550, "poradce6", 43, "standard", "2020-11-15").items.find(item => item.code === code)!.amount;
    expect(result.systemContract.items!.find(item => item.code === code)!.amount).toBeCloseTo(expected, 2);
  });

  it.each([["A101"], ["B0301"], ["NV101"], ["B101"], ["B3601", "A101"], ["UNKNOWN"]])(
    "keeps other payout types unchanged: %j", (...codes) => {
      expect(lifeSplitPremiumReductionReview(contract(codes), original, period)).toBeNull();
    }
  );

  it("does not use a future endorsement or one after the deferred payout became due", () => {
    expect(lifeSplitPremiumReductionReview(contract(), original, "01.11.2022 - 30.11.2022")).toBeNull();
    expect(lifeSplitPremiumReductionReview(contract(), {
      ...original, lifePremiumChanges: [{ ...reduction, policyStartDate: "2024-01-01" }],
    }, "01.10.2026 - 31.10.2026")).toBeNull();
  });

  it("selects the latest applicable reduction independently of history order", () => {
    const older = { ...reduction, id: "older", annualPremium: 12000, premiumAmount: 1000, policyStartDate: "2021-12-01" };
    const newer = { ...reduction, previousAnnualPremium: 12000 };
    const future = { ...reduction, id: "future", annualPremium: 3600, policyStartDate: "2024-01-01" };
    for (const changes of [[older, newer, future], [future, newer, older]]) {
      const result = lifeSplitPremiumReductionReview(contract(), { ...original, lifePremiumChanges: changes }, period)!;
      expect(result.reference.change.id).toBe(reduction.id);
      expect(result.reference.annualPremium).toBe(6600);
    }
  });

  it("requires separate review when B36 and B48 fall under different endorsements", () => {
    const later = { ...reduction, id: "later", annualPremium: 3600, previousAnnualPremium: 6600, policyStartDate: "2024-01-01" };
    expect(lifeSplitPremiumReductionReview(contract(["B3601", "B4801"]), {
      ...original, lifePremiumChanges: [reduction, later],
    }, "01.12.2024 - 31.12.2024")).toBeNull();
  });

  it.each([
    { policyStartDate: null }, { policyStartDate: "invalid" }, { annualPremium: Number.NaN },
    { annualPremium: -600 }, { previousAnnualPremium: null }, { annualPremium: 20000 },
  ])("does not infer a reduction from invalid or incomplete history: %j", patch => {
    expect(lifeSplitPremiumReductionReview(contract(), {
      ...original, lifePremiumChanges: [{ ...reduction, ...patch }],
    }, period)).toBeNull();
  });

  it("does not select a premium based on closeness to the statement", () => {
    const result = lifeSplitPremiumReductionReview(contract(["B3601"], 18000), original, period)!;
    expect(result.reference.annualPremium).toBe(6600);
  });

  it("does not let an outdated matching endorsement hide the remaining difference", () => {
    const latest = { ...reduction, id: "latest", annualPremium: 5400, previousAnnualPremium: 6000, policyStartDate: "2023-01-01" };
    const older = { ...reduction, annualPremium: 6000 };
    const result = lifeSplitPremiumReductionReview(contract(), { ...original, lifePremiumChanges: [older, latest] }, period)!;
    expect(result.reference.annualPremium).toBe(5400);
    expect(result.systemContract.lifePremiumChanges).toEqual([latest]);
    expect(contract().annualPremium - result.reference.annualPremium).toBe(600);
  });

  it.each([
    { isRefresh: true }, { refreshCommissionBase: { calculationMonthlyPremium: 500 } },
    { entryType: "endorsement" }, { productKey: "cppAuto" }, { policyStartDate: null },
  ] satisfies Partial<MatchedSystemContract>[])("leaves unsupported reference contracts unchanged: %j", patch => {
    expect(lifeSplitPremiumReductionReview(contract(), { ...original, ...patch }, period)).toBeNull();
  });

  it("keeps ambiguous same-day changes and mixed increase histories for manual review", () => {
    const conflicting = { ...reduction, id: "conflict", annualPremium: 7200 };
    expect(lifeSplitPremiumReductionReview(contract(), { ...original, lifePremiumChanges: [reduction, conflicting] }, period)).toBeNull();
    const increase = { ...reduction, id: "increase", annualPremium: 24000, policyStartDate: "2021-01-01" };
    expect(lifeSplitPremiumReductionReview(contract(), { ...original, lifePremiumChanges: [increase, reduction] }, period)).toBeNull();
  });

  it("does not infer timing from an absent statement period", () => {
    expect(lifeSplitPremiumReductionReview(contract(), original)).toBeNull();
  });

  it("explains the reduction while retaining the remaining base warning", () => {
    const result = lifeSplitPremiumReductionReview(contract(), original, period)!;
    const html = renderToStaticMarkup(createElement(LifePremiumReductionNotice, { reference: result.reference })) +
      renderToStaticMarkup(createElement(LifePremiumBaseNotice, {
        kind: "mismatch", mismatch: { statementAnnualPremium: 6000, systemAnnualPremium: 6600, systemMonthlyPremium: 550, difference: -600 },
        monthlyDifference: -50, endorsement: null,
      }));
    const text = html.replaceAll("\u00a0", " ");
    expect(text).toContain("Zohledněno snížení pojistného dodatkem");
    expect(text).toContain("6 600 Kč ročně");
    expect(text).toContain("Nesoulad ročního pojistného");
    expect(text).toContain("-50 Kč měsíčně");
    expect(text).not.toContain("Základna odpovídá dodatku");
  });
});
