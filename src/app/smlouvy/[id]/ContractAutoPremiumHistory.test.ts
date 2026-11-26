import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildStoredPremiumHistoryRows,
  ContractAutoPremiumHistory,
  initialAnnualPremiumFromStatementHistory,
  resolveAutoSignedAnnualPremiumValue,
  signedAnnualPremiumMatchesStatementChange,
} from "./ContractAutoPremiumHistory";

describe("auto premium history display helpers", () => {
  it.each([true, false, null])("shows the Neuron indexation setting without inventing future premium changes: %s", value => {
    const html = renderToStaticMarkup(createElement(ContractAutoPremiumHistory, {
      product: "domexneuron", premiumIndexationEnabled: value,
      policyStartDate: "2026-10-12", signedAnnualPremium: 4800,
      systemAnnualPremium: 4800, paymentFrequency: "semiannual", statements: [],
    }));
    expect(html).toContain("Historie pojistného");
    expect(html).toContain(value === true ? "Valorizace: ANO" : value === false ? "Valorizace: NE" : "Valorizace: neurčena");
    expect(html).not.toContain("Valorizace · 1. výročí");
    if (value === true) expect(html).toContain("posledního potvrzeného pojistného");
  });

  it("labels a confirmed Neuron indexation with its premiums, anniversary and statement source", () => {
    const storedHistory = [{
      key: "indexation-1", premiumKind: "auto_change" as const, changeReason: "indexation" as const,
      anniversaryNumber: 1, anniversaryDate: "2027-10-12", validFrom: "2026-10-12",
      previousPremium: 2400, newPremium: 2520,
      previousAnnualPremium: 4800, newAnnualPremium: 5040, differenceAnnual: 240,
      basePremiumPeriod: "payment" as const, source: "own" as const,
      statementId: "statement-1", statementNumber: "SYNTH-001", commissionCode: "B101",
    }];
    expect(buildStoredPremiumHistoryRows(storedHistory, "semiannual", "domexneuron")[0]).toMatchObject({
      changeReason: "indexation", previousAnnualPremium: 4800, newAnnualPremium: 5040, differenceAnnual: 240,
    });
    const html = renderToStaticMarkup(createElement(ContractAutoPremiumHistory, {
      product: "domexneuron", premiumIndexationEnabled: true, storedHistory,
      systemAnnualPremium: 5040, signedAnnualPremium: 4800, statements: [], paymentFrequency: "semiannual",
    }));
    expect(html).toContain("Valorizace · 1. výročí");
    expect(html).toContain("Pojistné při jednotlivých výročích");
    expect(html).toContain("Zdroj pojistného");
  });

  it("shows annual and per-payment premiums throughout a semiannual contract history", () => {
    const html = renderToStaticMarkup(createElement(ContractAutoPremiumHistory, {
      product: "cppAuto",
      contractNumber: "1234567890",
      policyStartDate: "2022-03-14",
      signedAnnualPremium: 6_098,
      systemAnnualPremium: 3_402,
      paymentFrequency: "semiannual",
      statements: [],
      storedHistory: [{
        key: "change-2023", premiumKind: "auto_change", anniversaryNumber: 1,
        anniversaryDate: "2023-03-14", previousPremium: 3_049, newPremium: 1_701,
        difference: -1_348, previousAnnualPremium: 6_098, newAnnualPremium: 3_402,
        differenceAnnual: -2_696, basePremiumPeriod: "payment", source: "own",
        commissionCode: "B101", productCode: "CPP_1C_II",
      }],
    }));

    expect(html).toContain("Při sjednání");
    expect(html).toMatch(/3\.049,00 Kč \/ pololetní platba/);
    expect(html).toMatch(/1\.701,00 Kč \/ pololetní platba/);
    expect(html).toMatch(/-1\.348,00 Kč \/ pololetní platba/);
    expect(html).toMatch(/6\.098,00 Kč ročně/);
    expect(html).toMatch(/3\.402,00 Kč ročně/);
    expect(html).toContain("-44,21 %");
    expect(html).toContain('data-trend="decreased"');
  });

  it.each([
    { previous: 13_362, current: 13_943, percent: "+4,35 %", trend: "increased" },
    { previous: 12_000, current: 10_800, percent: "-10,00 %", trend: "decreased" },
  ])("shows $percent against the preceding premium and omits duplicate annual-payment differences", ({ previous, current, percent, trend }) => {
    const html = renderToStaticMarkup(createElement(ContractAutoPremiumHistory, {
      product: "cppAuto", contractNumber: "1234567890", policyStartDate: "2022-06-29",
      signedAnnualPremium: 10_000, systemAnnualPremium: current, paymentFrequency: "annual", statements: [],
      storedHistory: [{ key: "change", premiumKind: "auto_change", anniversaryNumber: 2,
        anniversaryDate: "2024-06-29", previousAnnualPremium: previous, newAnnualPremium: current,
        basePremiumPeriod: "annual", source: "own", commissionCode: "B102", productCode: "CPP_1C_II" }],
    }));
    expect(html).toContain(`Změna oproti předchozímu ročnímu pojistnému: ${percent}`);
    expect(html).toContain(`data-trend="${trend}"`);
    expect(html).toMatch(/[+-][\d.,]+ Kč ročně/);
    expect(html).not.toMatch(/[+-][\d.,]+ Kč \/ roční platba/);
  });

  it("shows shared premium changes without another viewer's statement details", () => {
    const html = renderToStaticMarkup(createElement(ContractAutoPremiumHistory, {
      product: "domexneuron", premiumIndexationEnabled: true,
      policyStartDate: "2026-10-12", signedAnnualPremium: 4800,
      systemAnnualPremium: 4801, paymentFrequency: "annual", statements: [],
      premiumIndexationHistory: [{ effectiveDate: "2027-10-12", paymentPremium: 4801 }],
    }));
    expect(html).toContain("Valorizace · 1. výročí");
    expect(html).toContain("Pojistné zvýšeno");
    expect(html).not.toContain("Zobrazit výpis");
  });

  it("keeps an accessible source once when the same change is also shared as premium-only facts", () => {
    const html = renderToStaticMarkup(createElement(ContractAutoPremiumHistory, {
      product: "domexneuron", premiumIndexationEnabled: true,
      policyStartDate: "2026-10-12", signedAnnualPremium: 4800,
      systemAnnualPremium: 5040, paymentFrequency: "annual", statements: [],
      premiumIndexationHistory: [{ effectiveDate: "2027-10-12", paymentPremium: 5040 }],
      storedHistory: [{
        key: "indexation-1", premiumKind: "auto_change", changeReason: "indexation",
        anniversaryNumber: 1, anniversaryDate: "2027-10-12", newPremium: 5040,
        previousPremium: 4800, statementId: "own-synthetic-source", basePremiumPeriod: "annual",
      }],
    }));
    expect(html.match(/Valorizace · 1. výročí/g)).toHaveLength(1);
  });

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

  it("keeps a manually confirmed original premium ahead of conflicting statement bases", () => {
    expect(resolveAutoSignedAnnualPremiumValue({ signedAnnualPremium: 15552,
      signedAnnualPremiumOverride: 15552, statementInitialAnnualPremium: 29244,
      preferStatementInitialPremium: true })).toBe(15552);
    const html = renderToStaticMarkup(createElement(ContractAutoPremiumHistory, {
      product: "cppAuto", signedAnnualPremium: 15552, signedAnnualPremiumOverride: 15552,
      statementInitialAnnualPremium: 29244, preferStatementInitialPremium: true,
      systemAnnualPremium: 15552, paymentFrequency: "quarterly", statements: [],
      storedHistory: [{ premiumKind: "auto_initial", newAnnualPremium: 29244,
        newPremium: 7311, basePremiumPeriod: "payment", commissionCode: "A101" },
        { premiumKind: "auto_change", anniversaryNumber: 2, anniversaryDate: "2026-06-12",
          previousAnnualPremium: 15552, newAnnualPremium: 13036, previousPremium: 3888,
          newPremium: 3259, basePremiumPeriod: "payment", commissionCode: "B105" }],
    })).replace(/\u00a0/g, " ");
    expect(html).toContain("15.552");
    expect(html).toContain("3.888");
    expect(html).toContain("13.036");
    expect(html).toContain("2.516");
    expect(html).not.toContain("29.244");
  });

  it.each([null, 0, -1, NaN, Infinity])("ignores an invalid original premium override: %s", value => {
    expect(resolveAutoSignedAnnualPremiumValue({ signedAnnualPremiumOverride: value,
      statementInitialAnnualPremium: 7400, preferStatementInitialPremium: true })).toBe(7400);
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
