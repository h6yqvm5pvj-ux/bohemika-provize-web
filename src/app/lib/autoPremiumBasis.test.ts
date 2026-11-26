import { describe, expect, it } from "vitest";
import { premiumBaseSourceKey, previousConfirmedAutoAnnualPremium, resolveAutoPremiumBasis, type PremiumBaseSource, type PremiumBaseResolution } from "./autoPremiumBasis";
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
  it("ignores stale Kooperativa renewal bases including old unit confirmations", () => {
    const koopContract = { ...contract, productKey: "kooperativaAuto" as const };
    const current = { ...source, productCode: "KOO_NAMIRU", commissionCode: "C103", basePremium: 1200 };
    const prior = { ...current, rowId: "prior-koop", commissionCode: "C102", basePremium: 1100 };
    const confirmed: PremiumBaseResolution = { ...prior, key: premiumBaseSourceKey(prior, koopContract),
      productKey: "kooperativaAuto", frequencyRaw: "semiannual", period: "payment", confirmedAtMs: 1,
      confirmedBy: owner, writtenBy: owner, statementChronologyMs: 1, payoutMonthKey: null };
    expect(previousConfirmedAutoAnnualPremium(current, { ...koopContract, premiumStatementBaseResolutions: [confirmed] })).toBeNull();
    expect(resolveAutoPremiumBasis(current, koopContract)).toEqual({ status: "invalid" });
    expect(resolveAutoPremiumBasis({ ...current, commissionCode: "A101" }, koopContract))
      .toMatchObject({ status: "resolved", period: "payment", annualPremium: 2400 });
  });

  it.each([1145, 1268, 2536, 5072])("uses the frequency payment rule regardless of a stored premium of %s", inputAmount => {
    expect(resolveAutoPremiumBasis(source, { ...contract, inputAmount } as PremiumHistoryContract)).toMatchObject({
      status: "resolved", period: "payment", annualPremium: 5072, annualIfAnnual: 2536, annualIfPayment: 5072, resolvedBy: "product-rule",
    });
  });
  it.each(["allianzAuto", "pillowAuto"] as const)("treats %s statement bases as annual even for semiannual contracts", productKey => {
    expect(resolveAutoPremiumBasis(source, { ...contract, productKey })).toMatchObject({ status: "resolved", period: "annual", annualPremium: 2536, paymentPremium: 1268, resolvedBy: "product-rule" });
  });
  it("keeps Allianz and Pillow statement units annual despite an old payment override", () => {
    const allianzContract = { ...contract, productKey: "allianzAuto" as const };
    const allianzSource = { ...source, productKey: "allianzAuto" as const, frequencyRaw: "semiannual" as const };
    const oldOverride: PremiumBaseResolution = { ...allianzSource, key: premiumBaseSourceKey(allianzSource, allianzContract),
      productKey: "allianzAuto", frequencyRaw: "semiannual", period: "payment", confirmedAtMs: 1,
      confirmedBy: owner, writtenBy: owner, statementChronologyMs: 1, payoutMonthKey: null };
    expect(resolveAutoPremiumBasis(allianzSource, { ...allianzContract, premiumStatementBaseResolutions: [oldOverride] }))
      .toMatchObject({ status: "resolved", period: "annual", annualPremium: 2536, resolvedBy: "product-rule" });
  });
  it.each([["annual", 2536, 1268], ["payment", 5072, 2536]] as const)("uses a confirmed %s base for exactly one row", (period, annualPremium, paymentPremium) => {
    expect(resolveAutoPremiumBasis(source, { ...contract, premiumStatementBaseResolutions: [confirmation(period)] }))
      .toMatchObject({ status: "resolved", period, annualPremium, paymentPremium });
  });
  it.each([
    { basePremium: 2537 }, { commissionCode: "B123" }, { source: "manager" as const },
    { statementOwnerEmail: "someone@example.test" }, { productCode: "CPP_ACPIV" },
  ])("does not reuse confirmation for changed source data %j", changes => {
    expect(resolveAutoPremiumBasis({ ...source, ...changes }, { ...contract, premiumStatementBaseResolutions: [confirmation("annual")] }))
      .toMatchObject({ status: "resolved", period: "payment", resolvedBy: "product-rule" });
  });
  it("does not reuse confirmation after changing payment frequency", () => {
    expect(resolveAutoPremiumBasis(source, { ...contract, frequencyRaw: "quarterly", premiumStatementBaseResolutions: [confirmation("annual")] }))
      .toMatchObject({ status: "resolved", period: "payment", annualPremium: 10144, resolvedBy: "product-rule" });
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
  it("uses the product rule to write premium history without manual confirmation", () => {
    expect(premiumHistoryEntryFromStatementRow({ row: { ...source, premiumKind: "auto_change", productKey: "cppAuto", signedAt: null, validFrom: source.validFrom! },
      contract, statementId: source.statementId!, statementNumber: "75", statementDate: source.statementDate!, statementPeriod: source.statementPeriod!, statementChronologyMs: 1,
      payoutMonthKey: null, periodEndMs: null, nowMs: 1, writtenBy: owner })).toMatchObject({
        basePremiumPeriod: "payment", newAnnualPremium: 5072, newPremium: 2536, differenceAnnual: 2782,
      });
  });
  it("uses the 3,049 Kč semiannual payment as the initial annual premium of 6,098 Kč", () => {
    expect(premiumHistoryEntryFromStatementRow({
      row: { ...source, premiumKind: "auto_initial", commissionCode: "A101", basePremium: 3049,
        productKey: "cppAuto", signedAt: "14.03.2022", validFrom: "14.03.2022" },
      contract: { ...contract, inputAmount: 1145, policyStartDate: "2022-03-14" },
      statementId: "initial-2022", statementNumber: "1", statementDate: "20.03.2022",
      statementPeriod: "01.03.2022 - 31.03.2022", statementChronologyMs: Date.UTC(2022, 2, 31),
      payoutMonthKey: "2022-03", periodEndMs: Date.UTC(2022, 2, 31), nowMs: 1, writtenBy: owner,
    })).toMatchObject({ premiumKind: "auto_initial", basePremiumPeriod: "payment", newPremium: 3049, newAnnualPremium: 6098 });
  });
  it("uses the latest payment in each semiannual year as the prior annual premium", () => {
    const amounts = [
      ["A101", 3049], ["A102", 3049],
      ["B101", 1701], ["B102", 1701],
      ["B103", 1769], ["B104", 1769],
      ["B105", 1869], ["B106", 1869],
      ["B107", 1983], ["B108", 1983],
    ] as const;
    const rows = amounts.map(([commissionCode, basePremium], index) => ({ ...source,
      rowId: `row-${index}`, commissionCode, basePremium, productKey: "cppAuto" as const, frequencyRaw: "semiannual" as const }));
    const anniversaryRows = [
      { index: 2, previousAnnualPremium: 6098, newAnnualPremium: 3402 },
      { index: 4, previousAnnualPremium: 3402, newAnnualPremium: 3538 },
      { index: 6, previousAnnualPremium: 3538, newAnnualPremium: 3738 },
      { index: 8, previousAnnualPremium: 3738, newAnnualPremium: 3966 },
    ];

    for (const expected of anniversaryRows) {
      const current = rows[expected.index];
      const basis = resolveAutoPremiumBasis(current, contract);
      expect(basis).toMatchObject({ status: "resolved", period: "payment", annualPremium: expected.newAnnualPremium });
      expect(previousConfirmedAutoAnnualPremium(current, contract, rows)).toBe(expected.previousAnnualPremium);
    }
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
