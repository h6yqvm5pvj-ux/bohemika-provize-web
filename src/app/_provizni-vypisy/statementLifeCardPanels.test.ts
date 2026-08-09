import { describe, expect, it } from "vitest";

import { statementRefreshConversionMessage } from "./statementLifeCardPanels";

describe("statement refresh conversion panel", () => {
  it("keeps a conversion result message", () => {
    expect(
      statementRefreshConversionMessage({
        message: "Smlouva byla převedena na REFRESH podle výpisu.",
        statementId: "statement-1",
      })
    ).toBe("Smlouva byla převedena na REFRESH podle výpisu.");
  });

  it("explains whether a statement must be processed before conversion", () => {
    expect(statementRefreshConversionMessage({ message: null, statementId: "statement-1" })).toContain(
      "Ruční převod nastaví REFRESH režim"
    );
    expect(statementRefreshConversionMessage({ message: null, statementId: null })).toContain(
      "Nejdřív zpracuj výpis"
    );
  });
});
