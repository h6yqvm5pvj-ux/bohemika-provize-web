import { describe, expect, it } from "vitest";
import { describeKooperativaCPayout, isKooperativaCPayout } from "./kooperativaCPayoutMeaning";

const source = { code: "C102", amount: 1065.13, status: "paid", writtenBy: "advisor@example.test", statementPeriod: "01.08.2025 - 31.08.2025", payoutMonthKey: "2025-9" };
const meaning = (patch: Partial<typeof source> = {}, policyStartDate: unknown = "2024-05-03") =>
  describeKooperativaCPayout({ product: "kooperativaAuto", policyStartDate, payout: { ...source, ...patch } });

describe("Kooperativa C payout meaning", () => {
  it.each(["C101", "C102", "C103", "C111"])("recognizes %s as the corresponding subsequent commission", code => {
    expect(meaning({ code })).toMatchObject({ kind: "subsequent", label: "Následná provize" });
    expect(meaning({ code })?.explanation).toContain(`B${code.slice(1)}`);
  });
  it.each([undefined, null, "invalid-date", new Date(NaN), "2026-05-03"])("uses the code independently of policy dates (%s)", date => {
    expect(describeKooperativaCPayout({ product: "kooperativaAuto", policyStartDate: date, payout: source })?.kind).toBe("subsequent");
  });
  it("does not guess meaning from statement or payout timing", () => {
    expect(meaning({ statementPeriod: "31.02.2026 - 31.03.2026", payoutMonthKey: "2025-13" })?.kind).toBe("subsequent");
    expect(meaning({ statementPeriod: "01.04.2025 - 30.04.2025" })?.kind).toBe("subsequent");
  });
  it.each([0, NaN, Infinity])("keeps invalid or zero amount %s out of positive payout presentation", amount => {
    expect(meaning({ amount })?.kind).toBe("unknown");
  });
  it("keeps negative and storno rows as separate corrections", () => {
    expect(meaning({ status: "storno" })?.kind).toBe("correction");
    expect(meaning({ amount: -100 })?.kind).toBe("correction");
  });
  it("describes a positive subsequent payment with a same-recipient correction without reclassifying the payment", () => {
    const correction = { ...source, amount: -100, status: "storno" };
    const result = describeKooperativaCPayout({ product: "kooperativaAuto", policyStartDate: "2024-05-03", payout: source, payouts: [source, correction] });
    expect(result?.kind).toBe("subsequent");
    expect(result?.explanation).toContain("samostatná oprava");
    const otherRecipient = describeKooperativaCPayout({ product: "kooperativaAuto", policyStartDate: "2024-05-03", payout: source, payouts: [source, { ...correction, writtenBy: "other@example.test" }] });
    expect(otherRecipient?.kind).toBe("subsequent");
    expect(otherRecipient?.explanation).not.toContain("samostatná oprava");
  });
  it.each(["cppAuto", "koopflotila", "conseqzenit"])("does not reclassify codes for %s", product => {
    expect(describeKooperativaCPayout({ product, policyStartDate: "2024-05-03", payout: source })).toBeNull();
    expect(isKooperativaCPayout(product, source.code)).toBe(false);
  });
  it("uses the same case and whitespace normalization as payout comparison", () => {
    expect(isKooperativaCPayout("kooperativaAuto", " c 102 ")).toBe(true);
    expect(meaning({ code: " c 102 " })?.explanation).toContain("B102");
  });
});
