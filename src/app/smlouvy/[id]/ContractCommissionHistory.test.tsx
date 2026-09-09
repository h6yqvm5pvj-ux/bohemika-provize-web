import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContractCommissionHistory } from "./ContractCommissionHistory";

describe("life commission payout history", () => {
  it.each([600, 19_884])("uses the actual base (%s CZK) to display old B101 differences", (base) => {
    const html = renderToStaticMarkup(createElement(ContractCommissionHistory, {
      product: "neon", riskAnnualBase: 19_884,
      payouts: [{ code: "B101", status: "difference", amount: 2.38, expectedAmount: 78.74, difference: -76.36, detail: `Základna výpisu ${base},00 Kč.` }],
    }));
    if (base === 600) {
      expect(html).toContain("Investiční složka");
      expect(html).not.toContain(">Rozdíl<");
    } else {
      expect(html).not.toContain("Investiční složka");
      expect(html).toContain(">Rozdíl<");
    }
  });

  it("keeps investment storno marked as storno", () => {
    const html = renderToStaticMarkup(createElement(ContractCommissionHistory, {
      product: "neon", riskAnnualBase: 19_884,
      payouts: [{ code: "B101", status: "storno", amount: -2.38, statementBaseAmount: 600 }],
    }));
    expect(html).toContain(">Storno<");
    expect(html).not.toContain(">Vyplaceno<");
  });
});
