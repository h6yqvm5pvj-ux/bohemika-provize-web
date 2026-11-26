import { describe, expect, it } from "vitest";
import { projectAcquisitionInstallmentReceipts } from "./acquisitionInstallmentCoverage";
const schedule = [101, 102, 103, 104].map(code => ({ code: `A${code}`, codes: [`A${code}`, `A${code - 100}`, `AC${code}`], amount: 135.8 }));
type TestReceipt = { code: string; amount: number; key: string; status: string; expectedAmount?: number; differenceReason?: string;
  statementId?: string; sourceBaseAmount?: number; systemBaseAmount?: number; payoutMonthKey?: string };
const receipts = (): TestReceipt[] => [
  { code: "A101", amount: 135.8, key: "first", status: "paid" },
  { code: "A102", amount: 271.59, expectedAmount: 135.8, key: "double", status: "difference", differenceReason: "commission_amount_mismatch", statementId: "synthetic-statement" },
  { code: "A103", amount: 135.8, key: "third", status: "paid" },
];
describe("acquisition installment coverage", () => {
  it("covers A104 from the doubled A102, preserves provenance, cents, and immutable source records", () => {
    const source = receipts(); const before = structuredClone(source);
    const projected = projectAcquisitionInstallmentReceipts(source, schedule);
    expect(projected.find(record => record.code === "A104")).toMatchObject({ amount: 135.79, expectedAmount: 135.8, status: "paid", statementId: "synthetic-statement", installmentCoverageNote: expect.stringContaining("A102") });
    expect(projected.find(record => record.code === "A102")).toMatchObject({ amount: 135.8, installmentCoverageNote: expect.stringContaining("271,59") });
    expect(projected.reduce((sum, record) => sum + Math.round(record.amount * 100), 0)).toBe(54319);
    expect(source).toEqual(before);
  });
  it("covers an earlier missing installment from a later doubled code", () => {
    const source = receipts().map(record => record.code === "A102" ? { ...record, code: "A104" } : record);
    expect(projectAcquisitionInstallmentReceipts(source, schedule).find(record => record.code === "A102")?.amount).toBe(135.79);
  });
  const quarterlySchedule = schedule.map(part => ({ ...part, amount: 124.32 }));
  const quarterlyReceipts = (amount = 248.64, sourceBaseAmount = 2220): TestReceipt[] => [
    { code: "A101", key: "first", amount: 123.2, status: "paid", sourceBaseAmount: 1100 },
    { code: "A102", key: "second", amount: 124.32, status: "paid", sourceBaseAmount: 1110 },
    { code: "APZ103", key: "combined", amount, status: "difference", expectedAmount: 124.32,
      differenceReason: "premium_base_mismatch", sourceBaseAmount, systemBaseAmount: 1100 },
  ];

  it.each([238.64, 248.64, 258.64])("covers two installments at %s Kč with an exact two-installment base", amount => {
    const source = quarterlyReceipts(amount);
    const projected = projectAcquisitionInstallmentReceipts(source, quarterlySchedule);
    expect(projected.slice(2)).toEqual(["A103", "A104"].map(code => expect.objectContaining({
      code, installmentSourceCode: "APZ103", amount: amount / 2, expectedAmount: 124.32,
      differenceReason: null, status: "paid",
    })));
    expect(projected[0]).toBe(source[0]);
    expect(projected[1]).toBe(source[1]);
  });

  it.each([[238.63, 2220], [258.65, 2220], [248.64, 2219.99], [248.64, 2220.01], [248.64, 3330]])(
    "keeps the installment unallocated at %s Kč with a base of %s Kč", (amount, base) => {
      const source = quarterlyReceipts(amount, base);
      expect(projectAcquisitionInstallmentReceipts(source, quarterlySchedule)).toBe(source);
    },
  );

  it("covers three consecutive installments when the exact base and commission match their count", () => {
    const [first, , donor] = quarterlyReceipts(371.96, 3330);
    const source = [first, { ...donor, code: "A102", systemBaseAmount: 1110 }];
    const projected = projectAcquisitionInstallmentReceipts(source, quarterlySchedule);
    expect(projected.slice(1).map(record => record.code)).toEqual(["A102", "A103", "A104"]);
    expect(projected.slice(1).reduce((total, record) => total + Math.round(record.amount * 100), 0)).toBe(37196);
  });

  it("does not allocate a portion of a combined receipt to a separately recorded installment", () => {
    const source = [...quarterlyReceipts(), { code: "A104", key: "separate", amount: 124.32, status: "paid" }];
    expect(projectAcquisitionInstallmentReceipts(source, quarterlySchedule)).toBe(source);
  });

  const monthlySchedule = Array.from({ length: 12 }, (_, index) => ({
    code: `A${101 + index}`, codes: [`A${101 + index}`], amount: 124.32,
    commissionPeriod: `2025-${String(index + 1).padStart(2, "0")}-01`,
  }));
  const bundle = (index: number, periods: number, month: number): TestReceipt => ({
    code: `A${100 + index}`, key: `bundle-${index}`, amount: periods * 124.32,
    sourceBaseAmount: periods * 1110, systemBaseAmount: 1110, expectedAmount: 124.32,
    status: "difference", differenceReason: "premium_base_mismatch", payoutMonthKey: `2025-${month}`,
  });

  it("applies two independent combined payments without filling unrelated open installments", () => {
    const reversal = { code: "A107", key: "reversal", amount: -124.32, status: "storno" };
    const source = [quarterlyReceipts()[0], bundle(3, 2, 3), bundle(6, 3, 6), reversal];
    const projected = projectAcquisitionInstallmentReceipts(source, monthlySchedule);
    expect(projected.filter(receipt => receipt.installmentSourceCode).map(receipt => [receipt.code, receipt.installmentSourceCode]))
      .toEqual([["A103", "A103"], ["A102", "A103"], ["A106", "A106"], ["A104", "A106"], ["A105", "A106"]]);
    expect(projected.map(receipt => receipt.code).sort()).toEqual(monthlySchedule.slice(0, 7).map(part => part.code));
    expect(projected).toContain(reversal);
    expect(projected.reduce((sum, receipt) => sum + Math.round(receipt.amount * 100), 0))
      .toBe(source.reduce((sum, receipt) => sum + Math.round(receipt.amount * 100), 0));
  });

  it("leaves overlapping claims open when both receipts could cover the same installment", () => {
    const source = [bundle(1, 2, 3), bundle(3, 2, 3)];
    expect(projectAcquisitionInstallmentReceipts(source, monthlySchedule)).toBe(source);
  });

  it("leaves a receipt open when either adjoining period could be covered", () => {
    const source = [bundle(3, 2, 4)];
    expect(projectAcquisitionInstallmentReceipts(source, monthlySchedule)).toBe(source);
  });

  it("keeps the earlier A102 and A103 settlement when a triple arrives under A104", () => {
    const source = [quarterlyReceipts()[0], bundle(4, 3, 4)];
    const projected = projectAcquisitionInstallmentReceipts(source, monthlySchedule.slice(0, 4));
    expect(projected.filter(receipt => receipt.installmentSourceCode === "A104").map(receipt => receipt.code))
      .toEqual(["A104", "A102", "A103"]);
  });

  it("preserves an advance payment whose base and amount cover the entire schedule", () => {
    const projected = projectAcquisitionInstallmentReceipts([bundle(1, 4, 1)], monthlySchedule.slice(0, 4));
    expect(projected.map(receipt => receipt.code)).toEqual(["A101", "A102", "A103", "A104"]);
    expect(projected.every(receipt => receipt.installmentSourceCode === "A101")).toBe(true);
  });

  it.each([
    (source: ReturnType<typeof receipts>) => source.slice(1),
    (source: ReturnType<typeof receipts>) => source.map(record => record.code === "A102" ? { ...record, expectedAmount: 271.59 } : record),
    (source: ReturnType<typeof receipts>) => source.map(record => record.code === "A102" ? { ...record, amount: 200 } : record),
    (source: ReturnType<typeof receipts>) => source.map(record => record.code === "A102" ? { ...record, amount: 300 } : record),
    (source: ReturnType<typeof receipts>) => [...source, { code: "A102", key: "reversal", amount: -135.8, status: "storno" }],
    (source: ReturnType<typeof receipts>) => source.map(record => record.code === "A102" ? { ...record, differenceReason: "career_mismatch" } : record),
    (source: ReturnType<typeof receipts>) => source.map(record => record.code === "A102" ? { ...record, differenceReason: "premium_base_mismatch" } : record),
    (source: ReturnType<typeof receipts>) => [...source, { code: "A101-A104", key: "ambiguous", amount: 10, status: "paid" }],
  ])("does not infer settlement for incomplete, excessive, reversed or ambiguous evidence %#", transform => {
    const source = transform(receipts());
    expect(projectAcquisitionInstallmentReceipts(source, schedule)).toBe(source);
  });
});
