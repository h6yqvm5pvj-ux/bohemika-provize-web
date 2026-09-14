import { describe, expect, it } from "vitest";
import { premiumBaseSourceKey, resolveAutoPremiumBasis, type PremiumBaseSource, type PremiumBaseResolution } from "./autoPremiumBasis";
import { confirmedPremiumHistoryPatch, premiumHistoryEntryFromStatementRow, type PremiumHistoryContract, type PremiumStatementHistoryEntry } from "@/app/api/commission-statements/premiumHistory";

const owner = "owner@example.test";
const contract: PremiumHistoryContract = { productKey: "cppAuto", frequencyRaw: "semiannual", inputAmount: 1145, policyStartDate: "2015-06-01" };
const source: PremiumBaseSource = { statementId: "june", statementNumber: "75", statementPeriod: "01.06.2026 - 30.06.2026", statementDate: "23.07.2026",
  statementOwnerEmail: owner, contractNumber: "999000111", rowId: "row", productCode: "CPP_ACPIII", commissionCode: "B121", source: "own", basePremium: 2536, validFrom: "01.06.2015" };
const confirmation = (period: "annual" | "payment", row = source): PremiumBaseResolution => ({ ...row,
  key: premiumBaseSourceKey(row, contract), productKey: "cppAuto", frequencyRaw: "semiannual", period,
  confirmedAtMs: 1, confirmedBy: owner, writtenBy: owner, statementChronologyMs: row.statementId === "june" ? Date.UTC(2026, 6, 23) : Date.UTC(2025, 11, 15), payoutMonthKey: null });
const previous = { ...source, statementId: "november", statementNumber: "67", statementPeriod: "01.11.2025 - 30.11.2025", statementDate: "15.12.2025", basePremium: 2441, commissionCode: "B120" };

describe("statement base units", () => {
  it.each([1145, 1268, 2536, 5072])("never chooses a unit by proximity to a stored premium of %s", inputAmount => {
    expect(resolveAutoPremiumBasis(source, { ...contract, inputAmount } as PremiumHistoryContract)).toMatchObject({ status: "ambiguous", annualIfAnnual: 2536, annualIfPayment: 5072 });
  });
  it.each([["annual", 2536, 1268], ["payment", 5072, 2536]] as const)("uses a confirmed %s base for exactly one row", (period, annualPremium, paymentPremium) => {
    expect(resolveAutoPremiumBasis(source, { ...contract, premiumStatementBaseResolutions: [confirmation(period)] }))
      .toMatchObject({ status: "resolved", period, annualPremium, paymentPremium });
  });
  it.each([
    { basePremium: 2537 }, { commissionCode: "B123" }, { source: "manager" as const },
    { statementOwnerEmail: "someone@example.test" }, { productCode: "CPP_ACPIV" },
  ])("does not reuse confirmation for changed source data %j", changes => {
    expect(resolveAutoPremiumBasis({ ...source, ...changes }, { ...contract, premiumStatementBaseResolutions: [confirmation("annual")] }).status).toBe("ambiguous");
  });
  it("does not reuse confirmation after changing payment frequency", () => {
    expect(resolveAutoPremiumBasis(source, { ...contract, frequencyRaw: "quarterly", premiumStatementBaseResolutions: [confirmation("annual")] }).status).toBe("ambiguous");
  });
  it("recognizes a re-upload by statement identity rather than its file hash", () => {
    expect(resolveAutoPremiumBasis({ ...source, statementId: "reuploaded" }, { ...contract, premiumStatementBaseResolutions: [confirmation("annual")] }).status).toBe("resolved");
  });
  it("does not guess a missing frequency", () => {
    expect(resolveAutoPremiumBasis(source, { ...contract, frequencyRaw: null }).status).toBe("invalid");
  });
  it("has only one annual value when payments are annual", () => {
    expect(resolveAutoPremiumBasis(source, { ...contract, frequencyRaw: "annual" })).toMatchObject({ status: "resolved", annualPremium: 2536, paymentPremium: 2536 });
  });
  it("does not write an unconfirmed base as premium history", () => {
    expect(premiumHistoryEntryFromStatementRow({ row: { ...source, premiumKind: "auto_change", productKey: "cppAuto", signedAt: null, validFrom: source.validFrom! },
      contract, statementId: source.statementId!, statementNumber: "75", statementDate: source.statementDate!, statementPeriod: source.statementPeriod!, statementChronologyMs: 1,
      payoutMonthKey: null, periodEndMs: null, nowMs: 1, writtenBy: owner })).toBeNull();
  });
  it.each([["payment", 4882, 5072, 190], ["annual", 2441, 2536, 95]] as const)("replaces the incorrect row and handles %s confirmations in either order", (period, previousAnnualPremium, newAnnualPremium, differenceAnnual) => {
    const bad: PremiumStatementHistoryEntry = { ...confirmation("annual"), key: "wrong-old-guess", premiumKind: "auto_change",
      statementId: "june", statementNumber: "75", statementPeriod: source.statementPeriod!, statementDate: source.statementDate!,
      anniversaryNumber: 11, anniversaryDate: "2026-06-01", previousPremium: 1145, previousAnnualPremium: 2290, newPremium: 1268, newAnnualPremium: 2536,
      difference: 123, differenceAnnual: 246, basePremiumPeriod: "annual", validFrom: source.validFrom!, writtenAtMs: 0 };
    for (const order of [[source, previous], [previous, source]]) {
      let working: PremiumHistoryContract = { ...contract, premiumStatementHistory: [bad] };
      for (const row of order) working = { ...working, ...confirmedPremiumHistoryPatch(working, confirmation(period, row), 2) };
      expect(working.premiumStatementHistory).toHaveLength(1);
      expect(working.premiumStatementHistory?.[0]).toMatchObject({ anniversaryNumber: 11, previousAnnualPremium, newAnnualPremium, differenceAnnual });
      const repeated = confirmedPremiumHistoryPatch(working, confirmation(period), 3);
      expect(repeated.premiumStatementHistory).toHaveLength(1);
      expect(repeated.premiumStatementBaseResolutions).toHaveLength(2);
    }
  });
  it("allows one statement to use annual and the next to use payment units", () => {
    const first = { ...contract, ...confirmedPremiumHistoryPatch(contract, confirmation("annual", previous), 2) };
    const result = confirmedPremiumHistoryPatch(first, confirmation("payment"), 3);
    expect(result.premiumStatementHistory[0]).toMatchObject({ previousAnnualPremium: 2441, newAnnualPremium: 5072, differenceAnnual: 2631 });
  });
  it("corrects a previously confirmed unit without adding a second history row", () => {
    let working = { ...contract, ...confirmedPremiumHistoryPatch(contract, confirmation("payment"), 2) };
    working = { ...working, ...confirmedPremiumHistoryPatch(working, confirmation("annual"), 3) };
    expect(working.premiumStatementBaseResolutions).toHaveLength(1);
    expect(working.premiumStatementHistory).toHaveLength(1);
    expect(working.premiumStatementHistory[0]).toMatchObject({ basePremiumPeriod: "annual", newAnnualPremium: 2536, newPremium: 1268 });
  });
});
