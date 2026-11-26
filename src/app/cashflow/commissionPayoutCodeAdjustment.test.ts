import { describe, expect, it } from "vitest";
import { generateCashflow } from "./generator";
import { applyAutoCommissionForecasts } from "./autoCommissionForecast";
import type { EntryDoc } from "./types";
const writer = "adviser@example.test";
const fixture = (): EntryDoc => ({ id: "synthetic", userEmail: writer, source: "own", productKey: "cppAuto", frequencyRaw: "annual",
  policyStartDate: "2020-07-08", contractSignedDate: "2020-07-07",
  items: [{ title: "Okamžitá provize", code: "A101", amount: 100 }, { title: "Následná provize", code: "B101", amount: 100 }],
  commissionPayoutCodeAdjustment: { kind: "cpp-auto-annual-sequence-offset", writtenBy: writer, fromPayoutMonthKey: "2021-6", confirmedAtMs: 1 },
  commissionPayouts: ["A101", "A102", "B101", "B102", "B103", "B104", "B105"].map((code, index) => ({
    code, key: `source-${index}`, amount: 100 + index, writtenBy: writer, status: "paid", payoutMonthKey: `${2020 + index}-6`,
  })),
});
describe("cashflow for a confirmed shifted provider code sequence", () => {
  it.each([false, true])("pairs only the confirmed ČPP underwriting A201 receipt with the first commission (amendment: %s)", amended => {
    const receipt = { code: "A201", key: "approved-receipt", statementId: "source-statement",
      writtenBy: writer, payoutMonthKey: "2026-11", amount: 70, expectedAmount: 90, status: "difference" };
    const entry: EntryDoc = {
      ...fixture(), productKey: "cppPPRs", policyStartDate: "2026-10-15", contractSignedDate: "2026-10-07",
      items: [{ title: "Okamžitá provize (z platby)", code: "A101", amount: 90 }],
      commissionPayoutCodeAdjustment: { kind: "cpp-pprs-acquisition-a201", payoutKey: receipt.key,
        statementId: receipt.statementId, writtenBy: writer, confirmedAtMs: 1 },
      ...(amended ? { paymentFrequencyChanges: [{ effectiveDate: "2027-10-15", frequency: "quarterly" as const }] } : {}),
      commissionPayouts: [receipt, { ...receipt, key: "another-receipt", amount: 10 }],
    };
    const before = structuredClone(entry);
    const rows = generateCashflow([entry], 1, writer, new Date(2026, 10, 24));
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.commissionPayoutKey === receipt.key)).toMatchObject({
      commissionCode: "A101", commissionPeriodStart: "2026-10-15", amount: 70, predictedAmount: 90, payoutStatus: "paid",
      commissionCodeCorrectionNote: expect.stringContaining("A201"),
    });
    expect(rows.find(row => row.commissionPayoutKey === "another-receipt")).toMatchObject({
      commissionCode: "A201", isStatementOnly: true,
    });
    expect(generateCashflow([entry], 1, "other@example.test", new Date(2026, 10, 24))
      .some(row => row.payoutStatus === "paid")).toBe(false);
    expect(entry).toEqual(before);
  });

  it.each([true, false])("settles B106 in 2026 and predicts B107 for 2027 (manual correction: %s)", manual => {
    const entry = fixture();
    if (!manual) delete entry.commissionPayoutCodeAdjustment; const before = structuredClone(entry);
    const generated = generateCashflow([entry], 10, writer, new Date(2026, 10, 23));
    expect(generated.find(row => row.commissionCode === "B101")).toMatchObject({ payoutStatus: "paid", amount: 101, commissionPeriodStart: "2021-07-08", commissionCodeCorrectionNote: expect.stringContaining("A102 → B101") });
    expect(generated.find(row => row.commissionCode === "B106")).toMatchObject({ payoutStatus: "paid", amount: 106, commissionPeriodStart: "2026-07-08" });
    expect(generated.filter(row => row.payoutStatus === "paid")).toHaveLength(7);
    expect(generated.filter(row => row.payoutStatus === "paid").reduce((sum, row) => sum + row.amount, 0)).toBe(721);
    const forecast = applyAutoCommissionForecasts(generated, [entry]);
    expect(forecast.find(row => row.commissionCode === "B107")).toMatchObject({ commissionPeriodStart: "2027-07-08" });
    expect(forecast.find(row => row.commissionCode === "B106")?.payoutStatus).toBe("paid");
    expect(entry).toEqual(before);
  });
  it.each(["domex", "maxdomov"] as const)("matches the corrected annual property payouts to individual years for %s", productKey => {
    const entry = fixture();
    delete entry.commissionPayoutCodeAdjustment;
    entry.productKey = productKey;
    entry.items![1].title = "Následná provize (z platby)";
    const rows = generateCashflow([entry], 10, writer, new Date(2026, 10, 23));
    expect(rows.find(row => row.commissionCode === "B106")).toMatchObject({
      payoutStatus: "paid", commissionPeriodStart: "2026-07-08", amount: 106,
      commissionCodeCorrectionNote: expect.stringContaining("B105 → B106"),
    });
    expect(rows.filter(row => row.payoutStatus === "paid")).toHaveLength(7);
  });

  it("does not apply the adjustment to another viewer's payouts", () => {
    const entry = fixture();
    expect(generateCashflow([entry], 10, "other@example.test", new Date(2026, 10, 23)).some(row => row.commissionCodeCorrectionNote)).toBe(false);
  });

  it("assigns confirmed quarterly payouts to their contractual periods and preserves the ledger", () => {
    const entry: EntryDoc = {
      ...fixture(), frequencyRaw: "quarterly", policyStartDate: "2023-02-08", contractSignedDate: "2023-02-08",
      paymentFrequencyChanges: [{ effectiveDate: "2025-06-01", frequency: "quarterly", annualPremium: 3600, baseAnnualPremium: 4000 }],
      commissionPayoutCodeAdjustment: {
        kind: "cpp-auto-quarterly-sequence-offset", writtenBy: writer, confirmedAtMs: 1,
        sourceStatementIds: ["s1", "s2", "s3", "s4"],
      },
      commissionPayouts: ["A101", "B101", "B102", "B103", "B104"].map((code, index) => ({
        code, key: `source-${index}`, statementId: `s${index}`, writtenBy: writer, status: "paid",
        amount: index ? 80 : 100, payoutMonthKey: ["2023-4", "2023-7", "2023-10", "2024-1", "2024-6"][index],
      })),
    };
    const before = structuredClone(entry);
    const rows = generateCashflow([entry], 1, writer, new Date(2025, 10, 23));
    expect(rows.filter(row => row.payoutStatus === "paid").map(row => [
      row.commissionCode, row.commissionPeriodStart, row.amount,
    ])).toEqual([
      ["A101", "2023-02-08", 100], ["A102", "2023-05-08", 80], ["A103", "2023-08-08", 80],
      ["A104", "2023-11-08", 80], ["B101", "2024-02-08", 80],
    ]);
    expect(rows.find(row => row.commissionCode === "B102")?.payoutStatus).toBeUndefined();
    expect(generateCashflow([entry], 1, "other@example.test", new Date(2025, 10, 23))
      .some(row => row.commissionCodeCorrectionNote)).toBe(false);
    expect(entry).toEqual(before);
  });
});
