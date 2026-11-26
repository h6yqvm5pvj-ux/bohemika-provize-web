import { describe, expect, it } from "vitest";
import { projectConfirmedCommissionCodes, type CommissionPayoutCodeAdjustment } from "./commissionPayoutCodeAdjustment";
const writer = "adviser@example.test";
const rule: CommissionPayoutCodeAdjustment = { kind: "cpp-auto-annual-sequence-offset", writtenBy: writer, fromPayoutMonthKey: "2021-6", confirmedAtMs: 1 };
const entry = { productKey: "cppAuto" as const, frequencyRaw: "annual", commissionPayoutCodeAdjustment: rule };
const receipts = [
  { key: "initial", code: "A101", amount: 100, writtenBy: writer, payoutMonthKey: "2020-8" },
  { key: "wrong-initial", code: "A102", amount: 120, writtenBy: writer, payoutMonthKey: "2021-6" },
  { key: "first-subsequent", code: "B101", amount: 140, writtenBy: writer, payoutMonthKey: "2022-7" },
  { key: "last", code: "B105", amount: 180, writtenBy: writer, payoutMonthKey: "2026-6" },
];
describe("confirmed contract-specific commission code adjustments", () => {
  it("corrects the sequence while retaining immutable source identity, amounts and payment dates", () => {
    const before = structuredClone(receipts);
    const projected = projectConfirmedCommissionCodes(entry, receipts);
    expect(projected.map(row => row.code)).toEqual(["A101", "B101", "B102", "B106"]);
    expect(projected.map(row => row.statementCode)).toEqual([undefined, "A102", "B101", "B105"]);
    expect(projected.map(row => [row.key, row.amount, row.payoutMonthKey])).toEqual(receipts.map(row => [row.key, row.amount, row.payoutMonthKey]));
    expect(receipts).toEqual(before);
    expect(projectConfirmedCommissionCodes(entry, projected)).toEqual(projected);
  });
  it("keeps the old confirmed offset scoped to the recipient and the annual non-life schedule", () => {
    expect(projectConfirmedCommissionCodes({ ...entry, commissionPayoutCodeAdjustment: undefined }, receipts).map(row => row.code)).toEqual(["A101", "B101", "B101", "B105"]);
    expect(projectConfirmedCommissionCodes({ ...entry, productKey: "neon" }, receipts)).toBe(receipts);
    expect(projectConfirmedCommissionCodes({ ...entry, frequencyRaw: "quarterly" }, receipts)).toBe(receipts);
    const foreign = receipts.map(row => ({ ...row, writtenBy: "other@example.test" }));
    expect(projectConfirmedCommissionCodes(entry, foreign).map(row => row.code)).toEqual(["A101", "B101", "B101", "B105"]);
    expect(projectConfirmedCommissionCodes(entry, [{ ...receipts[2], payoutMonthKey: "2020-6" }])[0].code).toBe("B101");
  });
  it.each([null, {}, { ...rule, confirmedAtMs: NaN }, { ...rule, fromPayoutMonthKey: "2021-13" }, { ...rule, kind: "unknown" }])("rejects malformed adjustment metadata %#", commissionPayoutCodeAdjustment => {
    expect(projectConfirmedCommissionCodes({ ...entry, commissionPayoutCodeAdjustment }, receipts).map(row => row.code)).toEqual(["A101", "B101", "B101", "B105"]);
  });
  it("applies the same correction to future receipts and their reversals", () => {
    const future = [{ ...receipts[3], code: "B106", amount: -180, status: "storno", payoutMonthKey: "2027-6" }];
    expect(projectConfirmedCommissionCodes(entry, future)[0]).toMatchObject({ code: "B107", statementCode: "B106", amount: -180, status: "storno" });
  });
});


describe("automatic annual non-life sequence", () => {
  const annual = { frequencyRaw: "annual", policyStartDate: "2020-06-15" };

  it.each(["cppAuto", "kooperativaAuto", "domex", "allianzmujdomov", "maxdomov", "zamex"] as const)(
    "projects A102 and the shifted renewal series for %s without an override", productKey => {
      const indexed = projectConfirmedCommissionCodes({ ...annual, productKey }, receipts);
      expect(indexed.map(row => row.code)).toEqual(["A101", "B101", "B102", "B106"]);
      expect(indexed.map(row => row.amount)).toEqual(receipts.map(row => row.amount));
      expect(indexed[3]).toMatchObject({ statementCode: "B105", key: "last", payoutMonthKey: "2026-6" });
    },
  );

  it("keeps normally numbered B rows and excludes a second payout from an already covered period from the shift", () => {
    const datedFirst = { ...receipts[2], payoutMonthKey: "2021-7" };
    const namedSecond = { ...receipts[2], code: "B102", key: "named-second" };
    const indexed = projectConfirmedCommissionCodes({ ...annual, productKey: "domex" }, [
      receipts[1], datedFirst, receipts[2], namedSecond,
    ]);
    expect(indexed.map(row => row.code)).toEqual(["B101", "B101", "B101", "B102"]);
    expect(indexed[2]).not.toHaveProperty("statementCode");
  });

  it("will not infer a B offset from another recipient's A102 or an unrelated payout", () => {
    const cases = [{ ...receipts[1], writtenBy: "manager@example.test" }, receipts[2],
      { ...receipts[3], payoutMonthKey: "2028-7" }];
    expect(projectConfirmedCommissionCodes({ ...annual, productKey: "cppAuto" }, cases).map(row => row.code))
      .toEqual(["B101", "B101", "B105"]);
  });

  it("keeps valid codes on life, non-annual and changed-frequency contracts", () => {
    expect(projectConfirmedCommissionCodes({ ...annual, productKey: "neon", commissionPayoutCodeAdjustment: rule }, receipts)).toBe(receipts);
    expect(projectConfirmedCommissionCodes({ ...annual, productKey: "domex", frequencyRaw: "semiannual" }, receipts)).toBe(receipts);
    expect(projectConfirmedCommissionCodes({ ...annual, productKey: "cppAuto", paymentFrequencyChanges: [{ frequency: "quarterly" }] }, receipts)).toBe(receipts);
  });

  it("recognizes provider aliases and does not shift later B codes when A102 was fully reversed", () => {
    const initialAlias = { ...receipts[1], code: "AC102" };
    const laterAlias = { ...receipts[2], code: "BC1" };
    const contract = { ...annual, productKey: "cppAuto" as const };
    expect(projectConfirmedCommissionCodes(contract, [initialAlias, laterAlias]).map(row => row.code))
      .toEqual(["B101", "B102"]);
    const reversal = { ...initialAlias, amount: -initialAlias.amount, status: "storno", payoutMonthKey: "2021-9" };
    expect(projectConfirmedCommissionCodes(contract, [initialAlias, reversal, laterAlias]).map(row => row.code))
      .toEqual(["B101", "B101", "BC1"]);
  });

  it("uses the positively reconciled code for a later reversal, without moving the reversal date", () => {
    const reversal = { ...receipts[2], key: "reversal", amount: -140, status: "storno", payoutMonthKey: "2023-9" };
    const projected = projectConfirmedCommissionCodes({ ...annual, productKey: "cppAuto" }, [...receipts, reversal]);
    expect(projected.at(-1)).toMatchObject({ code: "B102", statementCode: "B101", amount: -140, payoutMonthKey: "2023-9" });
  });
});
