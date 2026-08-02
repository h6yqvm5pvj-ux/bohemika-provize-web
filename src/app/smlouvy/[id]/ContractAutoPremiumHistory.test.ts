import { describe, expect, it } from "vitest";

import { resolveAutoSignedAnnualPremiumValue } from "./ContractAutoPremiumHistory";

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
});
