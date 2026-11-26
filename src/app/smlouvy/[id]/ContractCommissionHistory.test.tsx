import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContractCommissionHistory, payoutAlertMessage } from "./ContractCommissionHistory";
import { InvestmentPayoutMatchingDialog, investmentStatementMonth } from "./InvestmentPayoutMatchingDialog";

describe("life commission payout history", () => {
  it("labels investment payouts as recorded amounts and offers matching from the archive", () => {
    const html = renderToStaticMarkup(createElement(ContractCommissionHistory, {
      product: "investikaRealitniFond",
      viewerEmail: "adviser@example.test", contractOwnerEmail: "adviser@example.test",
      payouts: [
        { code: "BC180", title: "INVESTIKA · BC180", amount: 10, status: "difference" },
        { code: "BC184", title: "EFEKTIKA · BC184", amount: -10, status: "storno" },
      ],
      canRebuildFromStatements: true, onRebuildFromStatements: () => {},
    }));
    expect(html).toContain("Spárovat provize");
    expect(html).toContain("Provizní výpisy u smlouvy");
    expect(html).toContain(">Vyplaceno<");
    expect(html).toContain(">Storno<");
    expect(html).toContain(">INVESTIKA<");
    expect(html).toContain(">EFEKTIKA<");
    expect(html).not.toContain(">Rozdíl<");
  });

  it("shows Czech months and marks investment matching complete only after saving", () => {
    const months = [Date.UTC(2023, 0, 31), Date.UTC(2023, 1, 28)].map(investmentStatementMonth);
    expect(months).toEqual(["Leden 2023", "Únor 2023"]);
    const view = { scanned: 2, total: 2, months };
    const saving = renderToStaticMarkup(createElement(InvestmentPayoutMatchingDialog, {
      view: { ...view, phase: "saving" }, onClose: () => {},
    }));
    expect(saving).toContain("99 %");
    expect(saving).toContain("Leden 2023");
    expect(saving).toContain("Únor 2023");
    const complete = renderToStaticMarkup(createElement(InvestmentPayoutMatchingDialog, {
      view: { ...view, phase: "complete", message: "Párování dokončeno." }, onClose: () => {},
    }));
    expect(complete).toContain("100 %");
    expect(complete).toContain("Párování dokončeno.");
  });

  it("shows the original and corrected provider codes without changing the amount", () => {
    const html = renderToStaticMarkup(createElement(ContractCommissionHistory, {
      product: "cppAuto", viewerEmail: "adviser@example.test", contractOwnerEmail: "adviser@example.test",
      payouts: [{ code: "B101", statementCode: "A102", status: "paid", amount: 255.85, writtenBy: "adviser@example.test",
        commissionCodeCorrectionNote: "Oprava kódu výpisu A102 → B101.", statementId: "synthetic", statementPeriod: "01.05.2021 - 31.05.2021" }],
    }));
    expect(html).toContain("A102 → B101");
    expect(html).toContain("255,85");
    expect(html).toContain("Oprava kódu výpisu");
  });
  it("describes each deferred increase and retains the original NB codes", () => {
    const html = renderToStaticMarkup(createElement(ContractCommissionHistory, {
      product: "neon",
      payouts: [
        { code: "NB3601", status: "paid", amount: 75 },
        { code: "NB4801", status: "paid", amount: 15 },
      ],
    }));
    expect(html).toContain(">NB3601<");
    expect(html).toContain("Provize za navýšení po 3 letech");
    expect(html).toContain(">NB4801<");
    expect(html).toContain("Provize za navýšení po 4 letech");
  });
  it.each([600, 19_884])("uses the actual base (%s CZK) to display old B101 differences", (base) => {
    const html = renderToStaticMarkup(createElement(ContractCommissionHistory, {
      product: "neon",
      payouts: [{ code: "B101", status: "difference", amount: 2.38, expectedAmount: 78.74, difference: -76.36, detail: `Základna výpisu ${base},00 Kč.` }],
    }));
    expect(html).not.toContain("Investiční složka");
    expect(html).toContain(">Rozdíl<");
  });

  it("keeps a small-base storno marked as storno", () => {
    const html = renderToStaticMarkup(createElement(ContractCommissionHistory, {
      product: "neon",
      payouts: [{ code: "B101", status: "storno", amount: -2.38, statementBaseAmount: 600 }],
    }));
    expect(html).toContain(">Storno<");
    expect(html).not.toContain(">Vyplaceno<");
  });

  it("explains that an unusually high auto B payout may include a missed earlier installment", () => {
    expect(payoutAlertMessage({
      code: "B104", status: "difference", amount: 160, expectedAmount: 80,
      difference: 80, differenceReason: "commission_amount_mismatch",
    }, "cppAuto")).toMatchObject({
      title: "Vyšší následná provize než očekává výpočet",
      body: expect.stringContaining("v předchozích kódech nechybí výplata"),
      tone: "warning",
    });
  });
});
