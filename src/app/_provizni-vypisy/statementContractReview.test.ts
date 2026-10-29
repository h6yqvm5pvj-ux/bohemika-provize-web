import { describe, expect, it } from "vitest";
import { statementContractReview } from "./statementContractReview";

const clean = { unpaired: false, matched: true, comparisons: [{ status: "ok" as const }], baseComparisons: [{ annualDifference: 0 }], issueCount: 0, hasWarnings: false };

describe("shared statement review for badges, sorting and filters", () => {
  it("requires a verified comparison before classifying a contract as all OK", () => {
    expect(statementContractReview(clean)).toMatchObject({ status: "ok", verified: true, hasCommissionError: false });
    for (const patch of [{ comparisons: [] }, { hasWarnings: true }, { matched: false }, { baseComparisons: [{ annualDifference: Number.NaN }] }]) {
      expect(statementContractReview({ ...clean, ...patch })).toMatchObject({ status: "review", verified: false });
    }
  });

  it.each(["increase", "decrease"] as const)("retains %s as a filter fact when a commission error takes badge priority", premiumChange => {
    const review = statementContractReview({ ...clean, premiumChange, issueCount: 1, comparisons: [{ status: "diff" }] });
    expect(review).toMatchObject({ status: "commission-error", hasCommissionError: true, premiumChange, verified: false,
      summary: { label: "Špatná provize", tone: "error" } });
  });

  it.each(["increase", "decrease"] as const)("does not treat an ordinary %s as all OK or as a commission error", premiumChange => {
    expect(statementContractReview({ ...clean, premiumChange })).toMatchObject({ status: premiumChange, verified: false, hasCommissionError: false,
      summary: { trend: premiumChange, tone: premiumChange === "increase" ? "ok" : "warn" } });
  });

  it("preserves pairing and non-monetary warnings without calling them a wrong commission", () => {
    expect(statementContractReview({ ...clean, issueCount: 1 })).toMatchObject({ status: "issues", hasCommissionError: false });
    expect(statementContractReview({ ...clean, unpaired: true })).toMatchObject({ status: "unpaired", verified: false });
    expect(statementContractReview({ ...clean, comparisons: [{ status: "missing_expected" }] })).toMatchObject({ status: "commission-error", verified: false });
  });

  it("accepts a higher payment as a positive result while retaining its actual difference", () => {
    const higher = { status: "diff" as const, expectedAmount: 100, statementAmount: 140 };
    expect(statementContractReview({ ...clean, comparisons: [higher] })).toMatchObject({ status: "higher", hasCommissionError: false,
      hasHigherCommission: true, summary: { label: "Vyšší provize", tone: "ok" } });
    expect(statementContractReview({ ...clean, issueCount: 1, comparisons: [higher, { status: "diff", expectedAmount: 100, statementAmount: 60 }] }))
      .toMatchObject({ status: "commission-error", hasCommissionError: true, hasHigherCommission: true });
    expect(higher).toEqual({ status: "diff", expectedAmount: 100, statementAmount: 140 });
  });

  it("labels settled corrections without hiding unrelated unresolved rows on the same contract", () => {
    expect(statementContractReview({ ...clean, corrected: true, comparisons: [], hasWarnings: true }))
      .toMatchObject({ status: "corrected", verified: false, hasCommissionError: false,
        summary: { label: "Opraveno navazujícím výpisem", tone: "ok" } });
    expect(statementContractReview({ ...clean, corrected: true, issueCount: 1, comparisons: [{ status: "diff" }] }))
      .toMatchObject({ status: "commission-error", hasCommissionError: true });
    expect(statementContractReview({ ...clean, corrected: true, issueCount: 1 }))
      .toMatchObject({ status: "issues" });
  });
});
