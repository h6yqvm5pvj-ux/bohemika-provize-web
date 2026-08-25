import { describe, expect, it } from "vitest";

import {
  buildPrintableDiscrepancyItems,
  discrepancyIssueKey,
  discrepancyScopeLabel,
  discrepancySeverityLabel,
  hasFiniteNumber,
  manualDiscrepancyToIssue,
  markedDiscrepancyKey,
  matchingAutoIssuesForMarkedItem,
  statementBusinessIdentityKey,
  statementDiscrepancyKey,
  statementDiscrepancyLabel,
} from "./statementDiscrepancies";
import type {
  ManualDiscrepancyItem,
  ParsedStatement,
  StatementDiscrepancyIssue,
} from "./statementTypes";

const minimalStatement = (
  overrides: Partial<ParsedStatement> = {}
): ParsedStatement => ({
  fileName: "vypis.html",
  header: {
    advisorNumber: null,
    period: "07/2026",
    statementNumber: "123",
    statementDate: "31. 07. 2026",
  },
  payoutTotal: null,
  commissionRows: [],
  deductionRows: [],
  stornoRows: [],
  otherPayments: [],
  contractStatusRules: [],
  managerCommissions: [],
  lifeSplitContracts: [],
  otherProductContracts: [],
  unmatchedB36Payments: [],
  parseWarnings: [],
  ...overrides,
});

const issue = (
  key: string,
  overrides: Partial<StatementDiscrepancyIssue> = {}
): StatementDiscrepancyIssue => ({
  key,
  statementKey: "statement-1",
  source: "auto",
  severity: "warning",
  category: "Test",
  scope: "my",
  contractNumber: "1234/AB",
  client: "Klient",
  product: "Produkt",
  title: "Kontrola",
  details: [],
  ...overrides,
});

const manualItem = (
  overrides: Partial<ManualDiscrepancyItem> = {}
): ManualDiscrepancyItem => ({
  key: "manual-1",
  statementKey: "statement-1",
  selected: true,
  contractNumber: " 777 ",
  client: " Jana  Novakova ",
  product: " NEON ",
  title: " Ruční  kontrola ",
  note: " poznámka ",
  amountText: " 1 234 Kč ",
  ...overrides,
});

describe("statement business identity", () => {
  it("treats renamed copies of the same statement as one statement", () => {
    const first = minimalStatement({ fileName: "vypis-15.html" });
    const renamed = minimalStatement({ fileName: "vypis-15-kopie.html" });

    expect(statementBusinessIdentityKey(renamed)).toBe(statementBusinessIdentityKey(first));
    expect(statementDiscrepancyKey(renamed)).not.toBe(statementDiscrepancyKey(first));
  });

  it("keeps statements of two advisors separate", () => {
    const first = minimalStatement({
      header: { ...minimalStatement().header, advisorNumber: "1001" },
    });
    const second = minimalStatement({
      header: { ...minimalStatement().header, advisorNumber: "1002" },
    });

    expect(statementBusinessIdentityKey(second)).not.toBe(statementBusinessIdentityKey(first));
  });
});

describe("statement discrepancy helpers", () => {
  it("builds stable statement labels and keys", () => {
    const statement = minimalStatement();

    expect(statementDiscrepancyKey(statement)).toBe(
      "vypis-123::31. 07. 2026::07/2026::vypis.html"
    );
    expect(statementDiscrepancyLabel(statement)).toBe("Výpis 123 · 07/2026");
  });

  it("normalizes issue keys and display labels", () => {
    expect(discrepancyIssueKey(" statement ", null, " contract  1 ")).toBe(
      "statement::contract 1"
    );
    expect(hasFiniteNumber(10)).toBe(true);
    expect(hasFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(discrepancySeverityLabel("error")).toBe("K opravě");
    expect(discrepancyScopeLabel("team")).toBe("Týmová smlouva");
  });

  it("converts manual discrepancy items into printable issues", () => {
    expect(manualDiscrepancyToIssue(manualItem())).toMatchObject({
      key: "manual-1",
      statementKey: "statement-1",
      source: "manual",
      severity: "warning",
      category: "Ručně označeno",
      contractNumber: "777",
      client: "Jana Novakova",
      product: "NEON",
      title: "Ruční kontrola",
      details: ["Částka / rozdíl: 1 234 Kč"],
      manualAmountText: "1 234 Kč",
    });
  });

  it("selects auto and manual items for print output", () => {
    const printable = buildPrintableDiscrepancyItems(
      [issue("auto-hidden"), issue("auto-visible")],
      {
        "auto-hidden": { selected: false, note: "ignorovat" },
        "auto-visible": { note: " ověřeno " },
      },
      [
        manualItem({ key: "manual-visible" }),
        manualItem({ key: "manual-hidden", selected: false }),
      ]
    );

    expect(printable.map((item) => item.key)).toEqual([
      "auto-visible",
      "manual-visible",
    ]);
    expect(printable[0].note).toBe("ověřeno");
    expect(printable[1]).toMatchObject({
      source: "manual",
      selected: true,
      note: "poznámka",
    });
  });

  it("builds normalized marked keys", () => {
    expect(
      markedDiscrepancyKey({
        statementKey: "statement-1",
        scope: null,
        category: " Výpis ",
        contractNumber: " 12 34 / ab ",
        fallback: "row-1",
      })
    ).toBe("statement-1::marked::statement::Výpis::1234/AB");

    expect(
      markedDiscrepancyKey({
        statementKey: "statement-1",
        scope: "tip",
        category: "TIP",
        contractNumber: "",
        fallback: "row-1",
      })
    ).toBe("statement-1::marked::tip::TIP::row-1");
  });

  it("matches marked items to auto issues by statement, contract and scope", () => {
    const matches = matchingAutoIssuesForMarkedItem(
      {
        key: "marked-1",
        statementKey: "statement-1",
        statementLabel: "Výpis 1",
        category: "Test",
        scope: "my",
        contractNumber: " 12 34 / ab ",
        client: "Klient",
        product: "Produkt",
        title: "Kontrola",
        amount: null,
        details: [],
      },
      [
        issue("same-scope"),
        issue("neutral-scope", { scope: null }),
        issue("different-scope", { scope: "team" }),
        issue("different-statement", { statementKey: "statement-2" }),
        issue("different-contract", { contractNumber: "999" }),
      ]
    );

    expect(matches.map((item) => item.key)).toEqual([
      "same-scope",
      "neutral-scope",
    ]);
  });
});
