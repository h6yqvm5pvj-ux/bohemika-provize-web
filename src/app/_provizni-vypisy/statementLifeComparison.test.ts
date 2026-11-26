// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lifeSplitBaseComparisonSources, lifeSplitCommissionGroups, lifeSplitFlexiIncreaseComparisons, lifeSplitFlexiIncreaseRowsWithoutBase, lifeSplitFlexiIncreaseStatus, lifeStatementCommissionsMatch, neonRefreshCareStatementBase } from "./statementLifeComparison";
import { matchFlexiIncreaseByCommission } from "@/app/lib/lifeStatementMatching";
import { calculateFlexi } from "@/app/lib/productFormulas/flexi";
import { lifeSplitCardSummary } from "./statementCardMath";
import { LifeSplitCardMetadata } from "./statementLifeCardPanels";
import { AmountComparisonPanel } from "./statementAmountComparisonPanel";
import { comparisonStatus } from "./statementCommissionComparisons";
import { classifyLifeSplitCommissionCode, lifeSplitAnnualPremiumBase, parseStatementHtml } from "./statementParsing";
import type { CommissionRow, LifeSplitContractPreview } from "./statementTypes";

const row = (type: string, base: number, commission = 2.90): CommissionRow => ({
  id: `${type}-${base}`, contractNumber: "test", product: "CPP_NEON", type, base, commission,
  lifeSplitKind: classifyLifeSplitCommissionCode(type).kind,
  lifeSplitLabel: classifyLifeSplitCommissionCode(type).label, reserveFund: 0.43,
  career: "6", percent: "0,40%", signedAt: "13.11.2019", validFrom: "01.01.2020",
  client: "Testovací klient", detailUrl: null, role: "Z",
});
const contract = (rows: CommissionRow[]): LifeSplitContractPreview => ({
  productCode: "CPP_NEON", productLabel: "ČPP Životní pojištění NEON", contractNumber: "test", client: "Testovací klient",
  signedAt: "13.11.2019", validFrom: "01.01.2020", rows, b36Payments: [], annualPremium: lifeSplitAnnualPremiumBase(rows),
});
const screenshotRows = [row("B104", 732, 2.90), row("B103", 11268, 44.62), row("B102", 12000, 47.52), row("B101", 12000, 47.52)];

describe("life statement bases and individual B commissions", () => {
  it("requires an actual matching amount comparison and no unrecognized paid items", () => {
    const paid = row("B3601", 2400, 6120);
    const comparison = { key: "b3601", label: "B3601", expectedAmount: 6122.4, statementAmount: 6120,
      difference: -2.4, status: comparisonStatus(6120, 6122.4) };
    expect(lifeStatementCommissionsMatch([paid], [comparison])).toBe(true);
    expect(lifeStatementCommissionsMatch([paid], [])).toBe(false);
    expect(lifeStatementCommissionsMatch([paid], [comparison, { ...comparison, status: "diff" }])).toBe(false);
    expect(lifeStatementCommissionsMatch([paid, row("UNKNOWN", 2400)], [comparison])).toBe(false);
  });

  it("accepts the policy premium only for the corroborated care payout of a REFRESH", () => {
    const system = { productKey: "neon" as const, isRefresh: true, inputAmount: 1000, calculationInputAmount: 800 };
    const care = { ...row("B201", 12_000), product: "CPP_NEONRF" };
    const risk = { ...row("A101", 9_600), product: "CPP_NEONRF" };
    const otherCare = { ...row("B202", 10_000), product: "CPP_NEONRF" };
    const nonCare = { ...row("B101", 12_000), product: "CPP_NEONRF" };
    const sources = lifeSplitBaseComparisonSources(contract([care, risk, otherCare, nonCare]), system);
    expect(sources.map(source => [source.label, source.systemMonthlyPremiumOverride])).toEqual([
      ["Základna B201", 1000], ["Základna A101", undefined], ["Základna B202", undefined], ["Základna B101", undefined],
    ]);
    expect(neonRefreshCareStatementBase(system, care)).toMatchObject({ monthly: 1000, annual: 12_000, multiplier: 1.25 });
    expect(neonRefreshCareStatementBase(system, { ...care, commission: -100 })).toBeNull();
    expect(neonRefreshCareStatementBase({ ...system, isRefresh: false }, care)).toBeNull();
  });

  it("selects the same NEON base for every payout in the statement period", () => {
    const source = contract([row("A101", 6000), row("B101", 6000), row("B201", 6000), row("B4801", 6000)]);
    const system = { productKey: "neon" as const, inputAmount: 500, neonCorrection: { annualAmount: 840 } };
    expect(lifeSplitBaseComparisonSources(source, system, "1. 12. 2021 – 31. 12. 2021").map(item => item.systemMonthlyPremiumOverride))
      .toEqual(Array(4).fill(undefined));
    expect(lifeSplitBaseComparisonSources(source, system, "1. 1. 2022 – 31. 1. 2022").map(item => item.systemMonthlyPremiumOverride))
      .toEqual(Array(4).fill(500));
  });
  it.each([screenshotRows, [...screenshotRows].reverse()].map(rows => ({ rows })))("does not promote one of several B bases to the whole contract", ({ rows }) => {
    const source = contract(rows);
    expect(source.annualPremium).toBe(0);
    expect(lifeSplitCardSummary(source)).toMatchObject({ monthlyPremium: null, total: 142.56 });
    const bases = lifeSplitBaseComparisonSources(source);
    expect(bases).toHaveLength(4);
    expect(bases).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Základna B104", base: 732 }),
      expect.objectContaining({ label: "Základna B103", base: 11268 }),
      expect.objectContaining({ label: "Základna B102", base: 12000 }),
      expect.objectContaining({ label: "Základna B101", base: 12000 }),
    ]));
    const groups = lifeSplitCommissionGroups(source, "subsequent");
    expect(groups).toHaveLength(4);
    expect(groups.every(group => group.rows.length === 1)).toBe(true);
    expect(groups.find(group => group.code === "B104")!.rows[0].lifeSplitLabel).toBe("Následná provize B104");
    const html = renderToStaticMarkup(createElement(LifeSplitCardMetadata, { contract: source, monthlyPremium: null }));
    expect(html).toContain("Různé podle položek");
    expect(html).not.toContain("Investiční složka");
    expect(html).not.toContain("939");
  });

  it.each([600, 732, 2999.99, 3000, 12000])("keeps a %s CZK subsequent base in the review", base => {
    const source = contract([row("B104", base)]);
    expect(lifeSplitBaseComparisonSources(source)).toEqual([
      { key: "life-premium-base", label: "Základna B104", base },
    ]);
    expect(lifeSplitCommissionGroups(source, "subsequent")[0].rows).toEqual(source.rows);
  });

  it("retains both payouts and bases when the same B code occurs twice", () => {
    const source = contract([row("B101", 732), row("B101", 12000, 47.52)]);
    expect(lifeSplitCommissionGroups(source, "subsequent")).toEqual([{ code: "B101", rows: source.rows }]);
    expect(lifeSplitBaseComparisonSources(source)).toHaveLength(2);
  });

  it("separates different care commission codes", () => {
    expect(lifeSplitCommissionGroups(contract([row("B201", 12000), row("B202", 12000)]), "care").map(group => group.code)).toEqual(["B201", "B202"]);
  });

  it("prefers an explicit initial risk base over subsequent bases and excludes A201 from the base", () => {
    const source = contract([row("A201", 60000), row("B101", 600), row("B0301", 12000)]);
    expect(source.annualPremium).toBe(12000);
    expect(lifeSplitBaseComparisonSources(source).map(item => item.base)).toEqual([600, 12000]);
    expect(lifeSplitCardSummary(source).total).toBeCloseTo(8.70);
  });

  it("does not invent a base for conflicting initial rows or investment-only rows", () => {
    expect(contract([row("A101", 12000), row("B0301", 6000)]).annualPremium).toBe(0);
    expect(lifeSplitBaseComparisonSources(contract([row("A201", 60000)]))).toEqual([]);
    expect(lifeSplitBaseComparisonSources(contract([]))).toEqual([]);
  });
});

describe("life commission comparison after HTML import", () => {
  const rowsDescriptor = Object.getOwnPropertyDescriptor(HTMLTableSectionElement.prototype, "rows");
  beforeAll(() => {
    if (!rowsDescriptor) Object.defineProperty(HTMLTableSectionElement.prototype, "rows", {
      configurable: true,
      get(this: HTMLTableSectionElement) { return this.querySelectorAll(":scope > tr"); },
    });
  });
  afterAll(() => { if (!rowsDescriptor) Reflect.deleteProperty(HTMLTableSectionElement.prototype, "rows"); });

  it("preserves all four bases and the 142.56 CZK payout through HTML import", () => {
    const rows = screenshotRows.map((r, i) => `<tr>${[
      i + 1, "1234567890", r.signedAt, r.validFrom, r.client, r.role,
      r.product, r.type, r.base, "", r.percent, r.career, r.commission, r.reserveFund,
    ].map(value => `<td>${value}</td>`).join("")}</tr>`).join("");
    const parsed = parseStatementHtml(`<section id="provize"><table><tbody>${rows}</tbody></table></section>`, "test.html");
    expect(parsed.lifeSplitContracts).toHaveLength(1);
    const source = parsed.lifeSplitContracts[0];
    expect(source.annualPremium).toBe(0);
    expect(source.rows.map(r => r.base)).toEqual([732, 11268, 12000, 12000]);
    expect(lifeSplitCommissionGroups(source, "subsequent")).toHaveLength(4);
    expect(lifeSplitCardSummary(source).total).toBeCloseTo(142.56);
  });

  it("shows both FLEXI payout comparisons without using the zero value as a premium base", () => {
    const rows = [["NB0301", "0,00", "312,05"], ["NV101", "", "1 304,20"]].map(([code, base, payout], index) =>
      `<tr>${[index + 1, "1234567890", "15.03.2025", "01.04.2025", "Testovací klient", "Z", "KOOP_FLEXI", code, base, "", "", "10", payout, 0]
        .map(value => `<td>${value}</td>`).join("")}</tr>`).join("");
    const parsed = parseStatementHtml(`<section id="provize"><table><tbody>${rows}</tbody></table></section>`, "test.html");
    const source = parsed.lifeSplitContracts[0];
    const original = { id: "root", adviserEmail: "advisor@example.test", productKey: "flexi" as const, policyStartDate: "2025-04-01" };
    const endorsement = { ...original, id: "addon", entryType: "endorsement", policyStartDate: "2026-02-01",
      previousInputAmount: 396, newInputAmount: 618, items: calculateFlexi(222, "poradce10").items };
    const matched = matchFlexiIncreaseByCommission([original, endorsement], lifeSplitFlexiIncreaseRowsWithoutBase(source));
    expect(matched?.id).toBe("addon");
    const comparisons = lifeSplitFlexiIncreaseComparisons(source, matched!).map(part => ({
      ...part, difference: part.statementAmount - part.expectedAmount,
      status: comparisonStatus(part.statementAmount, part.expectedAmount),
    }));
    expect(comparisons).toEqual([
      expect.objectContaining({ label: "NB0301", statementAmount: 312.05, expectedAmount: 312.06, status: "ok" }),
      expect.objectContaining({ label: "NV101", statementAmount: 1304.20, expectedAmount: 1304.20, status: "ok" }),
    ]);
    expect(lifeSplitBaseComparisonSources(source)).toEqual([]);
    expect(lifeSplitFlexiIncreaseStatus(source, comparisons)).toBe("matched");
    expect(lifeSplitFlexiIncreaseStatus(source, comparisons.slice(0, 1))).toBe("pending");
    const html = renderToStaticMarkup(createElement(AmountComparisonPanel, { comparisons, positionComparison: {
      systemPosition: "poradce10", rows: source.rows,
    } }));
    expect(html).toContain("Vše sedí");
    expect(html).toContain("NB0301");
    expect(html).toContain("NV101");
  });
});
