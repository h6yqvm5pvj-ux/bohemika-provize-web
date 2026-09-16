import { describe, expect, it } from "vitest";

import { statementRefreshConversionMessage } from "./statementLifeCardPanels";

describe("statement refresh conversion panel", () => {
  it("keeps a conversion result message", () => {
    expect(
      statementRefreshConversionMessage({
        message: "Smlouva byla převedena na REFRESH podle výpisu.",
        statementId: "statement-1",
        riskAnnualBase: 6757,
      })
    ).toBe("Smlouva byla převedena na REFRESH podle výpisu.");
  });

  it("explains the immediate conversion and separate payout processing", () => {
    expect(statementRefreshConversionMessage({ message: null, statementId: "statement-1", riskAnnualBase: 6757 })).toContain(
      "přepočítá provize z rizikové základny"
    );
    expect(statementRefreshConversionMessage({ message: null, statementId: null, riskAnnualBase: 6757 })).toContain(
      "Provize z výpisu se zapíšou až při jeho zpracování."
    );
  });
});
