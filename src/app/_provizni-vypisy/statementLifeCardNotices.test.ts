import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LifeCommissionBaseDifferenceNotice, LifePremiumBaseNotice, lifePremiumBaseNoticeKind } from "./statementLifeCardNotices";

describe("lifePremiumBaseNoticeKind", () => {
  it("does not show a premium-base notice without a mismatch", () => {
    expect(
      lifePremiumBaseNoticeKind({
        hasPremiumMismatch: false,
        isRefreshMissingOriginal: true,
        hasPremiumIncrease: false,
        hasEndorsement: true,
      })
    ).toBeNull();
  });

  it("shows the REFRESH explanation for a missing original contract", () => {
    expect(
      lifePremiumBaseNoticeKind({
        hasPremiumMismatch: true,
        isRefreshMissingOriginal: true,
        hasPremiumIncrease: false,
        hasEndorsement: false,
      })
    ).toBe("refresh-missing-original");
  });

  it("shows a regular mismatch when there is no special explanation", () => {
    expect(
      lifePremiumBaseNoticeKind({
        hasPremiumMismatch: true,
        isRefreshMissingOriginal: false,
        hasPremiumIncrease: false,
        hasEndorsement: false,
      })
    ).toBe("mismatch");
  });

  it("prefers the endorsement explanation even for a premium increase", () => {
    expect(
      lifePremiumBaseNoticeKind({
        hasPremiumMismatch: true,
        isRefreshMissingOriginal: false,
        hasPremiumIncrease: true,
        hasEndorsement: true,
      })
    ).toBe("endorsement");
  });

  it("does not duplicate a premium-increase explanation without an endorsement", () => {
    expect(
      lifePremiumBaseNoticeKind({
        hasPremiumMismatch: true,
        isRefreshMissingOriginal: false,
        hasPremiumIncrease: true,
        hasEndorsement: false,
      })
    ).toBeNull();
  });
});

describe("life premium-base warning copy", () => {
  const message = "Roční základna pojistného sice nesedí, ale provize je správná!";
  const mismatch = { statementAnnualPremium: 7200, systemAnnualPremium: 8400, systemMonthlyPremium: 700, difference: -1200 };
  const annualWarning = (commissionsMatch: boolean) => renderToStaticMarkup(createElement(LifePremiumBaseNotice, {
    kind: "mismatch", mismatch, monthlyDifference: -100, endorsement: null, commissionsMatch,
  }));
  const refreshWarning = (commissionsMatch: boolean) => renderToStaticMarkup(createElement(LifeCommissionBaseDifferenceNotice, {
    differences: [{ label: "Základna B201", statementAnnualPremiumBase: 7200, systemAnnualPremiumBase: 8400 }], commissionsMatch,
  }));

  it.each([annualWarning, refreshWarning])("shows a short orange message when the amounts match", renderWarning => {
    const html = renderWarning(true);
    expect(html).toContain("bg-amber-50");
    expect(html).toContain(message);
    expect(html).not.toContain("Kč ročně");
  });

  it.each([annualWarning, refreshWarning])("retains the detailed warning when a commission has no verified match", renderWarning => {
    const html = renderWarning(false);
    expect(html).not.toContain(message);
    expect(html).toContain("Kč ročně");
  });
});
