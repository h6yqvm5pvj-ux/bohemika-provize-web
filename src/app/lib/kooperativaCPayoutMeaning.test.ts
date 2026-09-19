import { describe, expect, it } from "vitest";
import { describeKooperativaCPayout } from "./kooperativaCPayoutMeaning";

const source = { code: "C102", amount: 1065.13, status: "paid", writtenBy: "advisor@example.test", statementPeriod: "01.08.2025 - 31.08.2025", payoutMonthKey: "2025-9" };
const meaning = (patch: Partial<typeof source> = {}, policyStartDate: unknown = "2024-05-03") =>
  describeKooperativaCPayout({ product: "kooperativaAuto", policyStartDate, payout: { ...source, ...patch } });

describe("Kooperativa C payout presentation evidence", () => {
  it("recognizes both positive payments after the first anniversary as possible renewals", () => {
    expect(meaning()).toMatchObject({ kind: "subsequentCandidate", label: "Pravděpodobná následná provize" });
    expect(meaning({ code: "C103", amount: 965.98, statementPeriod: "01.02.2026 - 28.02.2026", payoutMonthKey: "2026-3" })?.kind).toBe("subsequentCandidate");
  });
  it("does not infer the policy year or installment from the C counter", () => {
    expect(meaning({ code: "C111" }, "2025-05-03")?.kind).toBe("unknown");
    expect(meaning({ code: "C101" })?.kind).toBe("subsequentCandidate");
  });
  it("uses the statement period instead of a delayed payment date", () => {
    expect(meaning({ statementPeriod: "01.04.2025 - 30.04.2025" })?.kind).toBe("unknown");
  });
  it.each([undefined, null, "invalid-date", new Date(NaN)])("does not infer a renewal without a valid start date (%s)", date => {
    expect(describeKooperativaCPayout({ product: "kooperativaAuto", policyStartDate: date, payout: source })?.kind).toBe("unknown");
  });
  it.each([0, -20, NaN])("does not classify a nonpositive or invalid amount as a renewal (%s)", amount => {
    expect(meaning({ amount })?.kind).not.toBe("subsequentCandidate");
  });
  it("keeps same-recipient reversals distinct from a positive renewal", () => {
    expect(meaning({ status: "storno" })?.kind).toBe("correction");
    const correction = { ...source, amount: -100, status: "storno" };
    expect(describeKooperativaCPayout({ product: "kooperativaAuto", policyStartDate: "2024-05-03", payout: source, payouts: [source, correction] })?.kind).toBe("correction");
    expect(describeKooperativaCPayout({ product: "kooperativaAuto", policyStartDate: "2024-05-03", payout: source, payouts: [source, { ...correction, writtenBy: "other@example.test" }] })?.kind).toBe("subsequentCandidate");
  });
  it("requires a valid date and treats the start of a statement month conservatively", () => {
    expect(meaning({ statementPeriod: "31.02.2026 - 31.03.2026" })?.kind).toBe("unknown");
    expect(meaning({ statementPeriod: "01.05.2025 - 31.05.2025" })?.kind).toBe("unknown");
  });
  it("can use a known payout month when no statement period is present", () => {
    expect(meaning({ statementPeriod: "", payoutMonthKey: "2025-9" })?.kind).toBe("subsequentCandidate");
    expect(meaning({ statementPeriod: "", payoutMonthKey: "2025-13" })?.kind).toBe("unknown");
  });
  it.each(["cppAuto", "koopflotila", "conseqzenit"])("does not reclassify codes for %s", product => {
    expect(describeKooperativaCPayout({ product, policyStartDate: "2024-05-03", payout: source })).toBeNull();
  });
});
