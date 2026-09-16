// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lifeSplitBaseComparisonSources, lifeSplitCommissionGroups } from "./statementLifeComparison";
import { lifeSplitCardSummary } from "./statementCardMath";
import { LifeSplitCardMetadata } from "./statementLifeCardPanels";
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
  productCode: "CPP_NEON", productLabel: "ČPP ŽP NEON", contractNumber: "test", client: "Testovací klient",
  signedAt: "13.11.2019", validFrom: "01.01.2020", rows, b36Payments: [], annualPremium: lifeSplitAnnualPremiumBase(rows),
});
const screenshotRows = [row("B104", 732, 2.90), row("B103", 11268, 44.62), row("B102", 12000, 47.52), row("B101", 12000, 47.52)];

describe("life statement bases and individual B commissions", () => {
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

describe("parsing the screenshot's four B commission rows", () => {
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
});
