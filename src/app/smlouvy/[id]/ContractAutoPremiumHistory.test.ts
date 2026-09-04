import { describe, expect, it } from "vitest";

import {
  buildStoredPremiumHistoryRows,
  initialAnnualPremiumFromStatementHistory,
  resolveAutoSignedAnnualPremiumValue,
  signedAnnualPremiumMatchesStatementChange,
} from "./ContractAutoPremiumHistory";

describe("auto premium history display helpers", () => {
  it("prefers the statement initial base for auto contracts created from statements", () => {
    expect(
      resolveAutoSignedAnnualPremiumValue({
        signedAnnualPremium: 9466,
        statementInitialAnnualPremium: 7400,
        firstKnownPreviousAnnualPremium: 7400,
        systemAnnualPremium: 9466,
        preferStatementInitialPremium: true,
      })
    ).toBe(7400);
  });

  it("keeps the signed premium first for manually created auto contracts", () => {
    expect(
      resolveAutoSignedAnnualPremiumValue({
        signedAnnualPremium: 9466,
        statementInitialAnnualPremium: 7400,
        firstKnownPreviousAnnualPremium: 7400,
        systemAnnualPremium: 9466,
        preferStatementInitialPremium: false,
      })
    ).toBe(9466);
  });

  it("uses the chronologically first initial statement base even when history is unordered", () => {
    expect(
      initialAnnualPremiumFromStatementHistory(
        [
          {
            premiumKind: "auto_initial",
            newAnnualPremium: 59_322,
            statementChronologyMs: 1_771_804_800_000,
            source: "own",
          },
          {
            premiumKind: "auto_initial",
            newAnnualPremium: 61_877,
            statementChronologyMs: 1_740_355_200_000,
            source: "own",
          },
        ],
        "annual",
        "cppAuto"
      )
    ).toBe(61_877);
  });

  it("keeps the first captured signing base over a later conflicting synthetic initial", () => {
    expect(
      initialAnnualPremiumFromStatementHistory(
        [
          {
            premiumKind: "auto_initial",
            newAnnualPremium: 12_724,
            statementChronologyMs: null,
            writtenAtMs: 1_782_733_953_339,
            source: "own",
          },
          {
            premiumKind: "auto_initial",
            newAnnualPremium: 14_229,
            statementChronologyMs: 1_782_172_800_000,
            writtenAtMs: 1_784_187_067_109,
            source: "own",
          },
          {
            premiumKind: "auto_change",
            anniversaryNumber: 1,
            previousAnnualPremium: 12_724,
            newAnnualPremium: 14_229,
            statementChronologyMs: 1_750_032_000_000,
            source: "own",
          },
        ],
        "annual",
        "allianzAuto"
      )
    ).toBe(12_724);
  });

  it("does not replace a single stored initial when a legacy renewal was already annualized", () => {
    expect(
      initialAnnualPremiumFromStatementHistory(
        [
          {
            premiumKind: "auto_initial",
            newPremium: 3_700,
            newAnnualPremium: 7_400,
            source: "own",
          },
          {
            premiumKind: "auto_change",
            anniversaryNumber: 1,
            previousPremium: 7_400,
            previousAnnualPremium: 7_400,
            newPremium: 7_850,
            newAnnualPremium: 7_850,
            source: "own",
          },
        ],
        "semiannual",
        "cppAuto"
      )
    ).toBe(7_400);
  });

  it("annualizes legacy payment-based initial rows for non-annual frequencies", () => {
    expect(
      initialAnnualPremiumFromStatementHistory(
        [
          {
            premiumKind: "auto_initial",
            newPremium: 1_622,
            newAnnualPremium: 1_622,
            statementChronologyMs: 1_761_177_600_000,
            source: "own",
          },
        ],
        "quarterly",
        "cppAuto"
      )
    ).toBe(6_488);
  });

  it("shows one normalized annual change for duplicate quarterly history rows", () => {
    const rows = buildStoredPremiumHistoryRows(
      [
        {
          key: "legacy-quarterly-row",
          premiumKind: "auto_change",
          statementId: "statement-65",
          statementNumber: "65",
          statementPeriod: "01.09.2025 - 30.09.2025",
          statementDate: "23.10.2025",
          statementChronologyMs: 1_761_177_600_000,
          anniversaryNumber: 1,
          anniversaryDate: "2025-08-20",
          previousPremium: 1_622,
          newPremium: 1_716,
          difference: 94,
          productCode: "CPP_ACPIV",
          commissionCode: "B101",
          rowId: "416477",
          source: "own",
        },
        {
          key: "incorrect-annual-row",
          premiumKind: "auto_change",
          statementId: "statement-65",
          statementNumber: "65",
          statementPeriod: "01.09.2025 - 30.09.2025",
          statementDate: "23.10.2025",
          statementChronologyMs: 1_761_177_600_000,
          anniversaryNumber: 1,
          anniversaryDate: "2025-08-20",
          previousPremium: 1_622,
          newPremium: 6_864,
          difference: 5_242,
          previousAnnualPremium: 1_622,
          newAnnualPremium: 6_864,
          differenceAnnual: 5_242,
          basePremiumPeriod: "payment",
          productCode: "CPP_ACPIV",
          commissionCode: "B101",
          rowId: "416477",
          source: "own",
        },
      ],
      "quarterly",
      "cppAuto"
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      previousAnnualPremium: 6_488,
      newAnnualPremium: 6_864,
      differenceAnnual: 376,
    });
  });

  it("does not multiply an explicit previous annual premium by the payment frequency again", () => {
    const rows = buildStoredPremiumHistoryRows(
      [
        {
          key: "semiannual-renewal",
          premiumKind: "auto_change",
          statementId: "statement-76",
          statementNumber: "76",
          statementPeriod: "01.07.2026 - 31.07.2026",
          anniversaryNumber: 1,
          anniversaryDate: "2026-07-09",
          previousPremium: 7_706,
          newPremium: 7_736,
          difference: 30,
          previousAnnualPremium: 7_706,
          newAnnualPremium: 7_736,
          differenceAnnual: 30,
          basePremiumPeriod: "payment",
          productCode: "CPP_ACPIVZ",
          commissionCode: "B101",
          rowId: "433751",
          source: "own",
        },
      ],
      "semiannual",
      "cppAuto"
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "increased",
      previousAnnualPremium: 7_706,
      newAnnualPremium: 7_736,
      differenceAnnual: 30,
    });
  });

  it("recognizes when the stored signed premium is actually a later statement change", () => {
    const history = [
      {
        premiumKind: "auto_initial",
        newAnnualPremium: 61_877,
        statementChronologyMs: 1_740_355_200_000,
        source: "own",
      },
      {
        premiumKind: "auto_change",
        previousAnnualPremium: 61_877,
        newAnnualPremium: 59_322,
        statementChronologyMs: 1_740_355_200_000,
        source: "own",
      },
    ];

    expect(
      signedAnnualPremiumMatchesStatementChange({
        signedAnnualPremium: 59_322,
        statementInitialAnnualPremium: 61_877,
        history,
        paymentFrequency: "annual",
        product: "cppAuto",
      })
    ).toBe(true);
    expect(
      signedAnnualPremiumMatchesStatementChange({
        signedAnnualPremium: 9_466,
        statementInitialAnnualPremium: 61_877,
        history,
        paymentFrequency: "annual",
        product: "cppAuto",
      })
    ).toBe(false);
    expect(
      signedAnnualPremiumMatchesStatementChange({
        signedAnnualPremium: 139_512,
        statementInitialAnnualPremium: 139_508,
        history: [
          {
            premiumKind: "auto_change",
            newAnnualPremium: 139_512,
            source: "own",
          },
        ],
        paymentFrequency: "quarterly",
        product: "cppAuto",
      })
    ).toBe(false);
  });
});
