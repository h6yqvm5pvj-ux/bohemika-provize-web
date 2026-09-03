import { describe, expect, it } from "vitest";

import {
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
        "annual"
      )
    ).toBe(61_877);
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
        history,
        paymentFrequency: "annual",
      })
    ).toBe(true);
    expect(
      signedAnnualPremiumMatchesStatementChange({
        signedAnnualPremium: 9_466,
        history,
        paymentFrequency: "annual",
      })
    ).toBe(false);
  });
});
