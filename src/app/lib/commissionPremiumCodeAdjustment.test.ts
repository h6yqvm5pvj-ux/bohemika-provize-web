import { describe, expect, it } from "vitest";
import { projectConfirmedPremiumHistory, premiumCodeProjection, premiumCodeProjectionFromReceipts } from "./commissionPremiumCodeAdjustment";
import { premiumBaseSourceKey, previousConfirmedAutoAnnualPremium } from "./autoPremiumBasis";
import { premiumHistoryEntryFromStatementRow } from "@/app/api/commission-statements/premiumHistory";
const owner = "adviser@example.test";
const entry = { productKey: "cppAuto" as const, frequencyRaw: "annual" as const, policyStartDate: "2020-06-08",
  commissionPayoutCodeAdjustment: { kind: "cpp-auto-annual-sequence-offset" as const, writtenBy: owner, fromPayoutMonthKey: "2021-8", confirmedAtMs: 1 } };
const history = [
  { commissionCode: "A101", premiumKind: "auto_initial", anniversaryDate: "2020-06-08", anniversaryNumber: 0, newAnnualPremium: 3000, writtenBy: owner, payoutMonthKey: "2020-7" },
  { commissionCode: "A102", premiumKind: "auto_initial", anniversaryDate: "2020-06-08", anniversaryNumber: 0, newAnnualPremium: 3200, writtenBy: owner, payoutMonthKey: "2021-8" },
  { commissionCode: "B101", premiumKind: "auto_change", anniversaryDate: "2021-06-08", anniversaryNumber: 1, newAnnualPremium: 3500, writtenBy: owner, payoutMonthKey: "2022-7" },
  { commissionCode: "B102", premiumKind: "auto_change", anniversaryDate: "2022-06-08", anniversaryNumber: 2, newAnnualPremium: 3400, writtenBy: owner, payoutMonthKey: "2023-6" },
  { commissionCode: "B105", premiumKind: "auto_change", anniversaryDate: "2025-06-08", anniversaryNumber: 5, newAnnualPremium: 4000, writtenBy: owner, payoutMonthKey: "2026-6" },
];
describe("premium history for confirmed provider code shifts", () => {
  it("recomputes the insured year and premium deltas, including decreases and a missing stored year", () => {
    const before = structuredClone(history);
    const projected = projectConfirmedPremiumHistory(entry, history, [{ code: "B104", amount: 100, status: "paid", writtenBy: owner, payoutMonthKey: "2025-7", statementBaseAmount: 3800 }]);
    expect(projected[1]).toMatchObject({ commissionCode: "A102", resolvedCommissionCode: "B101", premiumKind: "auto_change", anniversaryDate: "2021-06-08", anniversaryNumber: 1, previousAnnualPremium: 3000, differenceAnnual: 200 });
    expect(projected[2]).toMatchObject({ anniversaryDate: "2022-06-08", previousAnnualPremium: 3200, differenceAnnual: 300 });
    expect(projected[3]).toMatchObject({ anniversaryDate: "2023-06-08", previousAnnualPremium: 3500, differenceAnnual: -100 });
    expect(projected[4]).toMatchObject({ anniversaryDate: "2026-06-08", previousAnnualPremium: 3800, differenceAnnual: 200 });
    expect(history).toEqual(before);
    expect(projectConfirmedPremiumHistory({ ...entry, productKey: "neon" }, history)).toBe(history);
  });
  it("does not substitute an older known premium when the immediately preceding year is missing", () => {
    const sparse = [history[0], history[2]];
    expect(projectConfirmedPremiumHistory(entry, sparse)[1]).toMatchObject({ anniversaryDate: "2022-06-08", previousAnnualPremium: null, differenceAnnual: null });
  });
  it("does not borrow premiums or code corrections from a different recipient", () => {
    const foreignInitial = { ...history[0], writtenBy: "other@example.test" };
    const projected = projectConfirmedPremiumHistory(entry, [foreignInitial, history[1]]);
    expect(projected[1]).toMatchObject({ resolvedCommissionCode: "B101", previousAnnualPremium: null, differenceAnnual: null });
    expect(premiumCodeProjectionFromReceipts({ commissionCode: "A102", statementId: "synthetic", source: "own" }, owner, [{ code: "B101", statementCode: "A102", statementId: "synthetic", writtenBy: "other@example.test" }])).toEqual({});
  });
  it("keeps manual base-confirmation source identities and orders the corrected A102 before the next B receipt", () => {
    const contract = { productKey: "cppAuto" as const, frequencyRaw: "annual" as const };
    const raw = { contractNumber: "TEST-001", rowId: "synthetic", productCode: "CPP_ACPIV", productKey: "cppAuto" as const, frequencyRaw: "annual" as const,
      commissionCode: "A102", source: "own" as const, basePremium: 3200, statementId: "synthetic", statementOwnerEmail: owner };
    const resolved = { ...raw, resolvedCommissionCode: "B101" };
    expect(premiumBaseSourceKey(raw, contract)).toBe(premiumBaseSourceKey(resolved, contract));
    expect(previousConfirmedAutoAnnualPremium({ ...raw, commissionCode: "B101", resolvedCommissionCode: "B102", basePremium: 3500, rowId: "next" }, contract, [resolved])).toBe(3200);
    expect(premiumCodeProjection(entry, { commissionCode: "A102", statementDate: "23.08.2021", statementOwnerEmail: owner }).resolvedCommissionCode).toBe("B101");
  });
  it("imports a mislabelled A102 as the first anniversary change without rewriting its source code", () => {
    const context = { statementId: "synthetic", statementNumber: "SYNTHETIC", statementPeriod: "01.07.2021 - 31.07.2021", statementDate: "23.08.2021", payoutMonthKey: "2021-8", periodEndMs: Date.UTC(2021, 6, 31), statementChronologyMs: Date.UTC(2021, 7, 23), nowMs: 1, writtenBy: owner };
    const result = premiumHistoryEntryFromStatementRow({ ...context, contract: { ...entry, inputAmount: 3000, premiumStatementHistory: [{ ...history[0], key: "initial", newPremium: 3000 }] }, row: {
      premiumKind: "auto_initial", rowId: "synthetic", contractNumber: "TEST-001", productCode: "CPP_ACPIV", productKey: "cppAuto", commissionCode: "A102", basePremium: 3200, signedAt: "08.06.2020", validFrom: "08.06.2020", source: "own",
    } });
    expect(result).toMatchObject({ commissionCode: "A102", resolvedCommissionCode: "B101", premiumKind: "auto_change", anniversaryDate: "2021-06-08", previousAnnualPremium: 3000, newAnnualPremium: 3200, differenceAnnual: 200 });
  });

  it("moves the later semiannual B101 premium to its B103 anniversary and suppresses the second-half B104 as a change", () => {
    const contract = { productKey: "cppAuto" as const, frequencyRaw: "semiannual" as const, inputAmount: 4000, policyStartDate: "2023-03-21",
      items: [{ code: "B101", title: "Následná provize", amount: 480 }] };
    const payouts = [
      { code: "B102", amount: 960, sourceBaseAmount: 8000, payoutMonthKey: "2024-10" },
      { code: "B101", amount: 500, sourceBaseAmount: 4200, payoutMonthKey: "2025-5" },
      { code: "B103", amount: 500, sourceBaseAmount: 4200, payoutMonthKey: "2025-10" },
    ].map(row => ({ ...row, status: "paid", writtenBy: owner }));
    const rows = payouts.map((payout, index) => ({ commissionCode: payout.code, premiumKind: "auto_change",
      anniversaryDate: index === 2 ? "2025-03-21" : "2024-03-21", anniversaryNumber: index === 2 ? 2 : 1,
      payoutMonthKey: payout.payoutMonthKey, writtenBy: owner, newAnnualPremium: index ? 8400 : 8000 }));
    expect(projectConfirmedPremiumHistory(contract, rows, payouts)).toEqual([
      expect.objectContaining({ commissionCode: "B102", anniversaryDate: "2024-03-21", newAnnualPremium: 8000 }),
      expect.objectContaining({ commissionCode: "B101", resolvedCommissionCode: "B103", anniversaryDate: "2025-03-21",
        previousAnnualPremium: 8000, newAnnualPremium: 8400, differenceAnnual: 400 }),
    ]);
  });

  it("excludes mislabelled quarterly rows from the anniversary history while retaining the source statement", () => {
    const contract = { productKey: "cppAuto" as const, frequencyRaw: "quarterly" as const, policyStartDate: "2023-02-08",
      commissionPayoutCodeAdjustment: { kind: "cpp-auto-quarterly-sequence-offset" as const,
        writtenBy: owner, confirmedAtMs: 1, sourceStatementIds: ["s1", "s2", "s3", "s4"] } };
    const records = [
      { ...history[0], anniversaryDate: "2023-02-08", newAnnualPremium: 4000 },
      { ...history[1], statementId: "s1", commissionCode: "B101", premiumKind: "auto_change", newAnnualPremium: 3600 },
      { ...history[1], statementId: "s4", commissionCode: "B104", premiumKind: "auto_change", newAnnualPremium: 3600 },
    ];
    expect(projectConfirmedPremiumHistory(contract, records)).toEqual([
      records[0],
      expect.objectContaining({ commissionCode: "B104", resolvedCommissionCode: "B101", statementId: "s4",
        anniversaryDate: "2024-02-08", previousAnnualPremium: 4000, differenceAnnual: -400, difference: -100 }),
    ]);
    expect(records[1].commissionCode).toBe("B101");
  });
});
