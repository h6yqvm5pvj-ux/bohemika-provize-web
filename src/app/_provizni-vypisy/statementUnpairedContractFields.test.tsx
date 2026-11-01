// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatementContractBrowser, useStatementBrowserItems } from "./StatementContractBrowser";
import { StatementContractList } from "./StatementContractList";
import { classifyLifeSplitCommissionCode } from "./statementParsing";
import { statementUnpairedContractFields } from "./statementUnpairedContractFields";
import type { CommissionRow, LifeSplitContractPreview, OtherProductContractPreview } from "./statementTypes";

const row = (type: string, product = "CPP_N_LIFE", commission = 100): CommissionRow => ({
  id: "synthetic-row", detailUrl: null, contractNumber: "TEST-1", client: "Testovací klient",
  signedAt: "01.10.2026", validFrom: "01.11.2026", role: "S", product, type,
  base: 12000, percent: "1%", career: "100", commission, reserveFund: 0,
  lifeSplitKind: classifyLifeSplitCommissionCode(type).kind, lifeSplitLabel: "Testovací provize",
});
const life = (contractNumber: string, type: string, commission = 100): LifeSplitContractPreview => ({
  contractNumber, client: "Testovací životní klient", productCode: "CPP_N_LIFE", productLabel: "ČPP NEON",
  signedAt: "01.10.2026", validFrom: "01.11.2026", annualPremium: 12000,
  rows: [row(type, "CPP_N_LIFE", commission)], b36Payments: [],
});
const other = (contractNumber: string, type: string, product = "CPP_1C_II", commission = 100): OtherProductContractPreview => ({
  key: contractNumber, contractNumber, client: "Testovací další klient", signedAt: "01.10.2026", validFrom: "01.11.2026",
  rows: [row(type, product, commission)], b36Payments: [],
});
const listItems = (contracts: Array<LifeSplitContractPreview | OtherProductContractPreview>) => contracts.map(contract => ({
  ...statementUnpairedContractFields(contract),
  amount: contract.rows.reduce((sum, item) => sum + item.commission, 0), issueCount: 0,
  render: () => <article data-contract={contract.contractNumber}>{contract.contractNumber}</article>,
}));

function UnpairedList({ items }: { items: ReturnType<typeof listItems> }) {
  const { items: visible, inBrowser } = useStatementBrowserItems(items);
  return <StatementContractList items={visible} enableA101Filter showFilters={!inBrowser} />;
}

describe("A101 filtering of unpaired statement contracts", () => {
  let root: Root;
  let container: HTMLDivElement;
  const button = (label: string) => [...container.querySelectorAll("button")].find(item => item.textContent?.includes(label))!;
  const visibleContracts = () => [...container.querySelectorAll("article")].map(item => item.getAttribute("data-contract"));

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it.each(["A101", " a101 ", "A 101", "AP101", "AZ101", "APZ101", "NV101", "A101-A104"])(
    "includes life and other contracts with the existing A101 alias %s", code => {
      expect(statementUnpairedContractFields(life("LIFE", code)).hasA101).toBe(true);
      expect(statementUnpairedContractFields(other("OTHER", code)).hasA101).toBe(true);
    },
  );

  it.each(["B101", "B0301", "A201", "A102", "A101suffix", "", "UNKNOWN"])(
    "keeps contracts containing only %s out of the A101 selection", code => {
      expect(statementUnpairedContractFields(life("LIFE", code)).hasA101).toBe(false);
      expect(statementUnpairedContractFields(other("OTHER", code)).hasA101).toBe(false);
    },
  );

  it("reads every statement row without inferring A101 from the client or contract number", () => {
    const contract = life("A101-IN-NUMBER", "B0301");
    contract.client = "A101 v názvu klienta";
    expect(statementUnpairedContractFields(contract).hasA101).toBe(false);
    contract.rows.push(row("A101"));
    expect(statementUnpairedContractFields(contract).hasA101).toBe(true);
    contract.rows = [];
    expect(statementUnpairedContractFields(contract).hasA101).toBe(false);
  });

  it("preserves section keys, search fields and source rows", () => {
    const contract = life("TEST-LIFE", "A101");
    const before = structuredClone(contract);
    expect(statementUnpairedContractFields(contract)).toMatchObject({
      key: "life:TEST-LIFE-CPP_N_LIFE", unpaired: true, hasA101: true,
      searchText: "Testovací životní klient TEST-LIFE ČPP NEON CPP_N_LIFE",
    });
    expect(statementUnpairedContractFields(other("TEST-OTHER", "A101")).key).toBe("other:TEST-OTHER");
    expect(contract).toEqual(before);
  });

  it("includes split life A101 beyond the current page together with other unpaired A101 contracts", async () => {
    const contracts = [
      ...Array.from({ length: 30 }, (_, index) => life(`DEFERRED-${index}`, "B101")),
      life("LIFE-A101", "A101", 1000),
      other("OTHER-LIFE-A101", "APZ101", "KOOP_FLEXI", 2000),
      other("AUTO-A101", "A101", "CPP_1C_II", 3000),
    ];
    const items = listItems(contracts);
    await act(async () => root.render(<StatementContractBrowser items={items}><UnpairedList items={items} /></StatementContractBrowser>));
    await act(async () => button("Bez propojení").click());
    expect(visibleContracts()).toHaveLength(15);
    await act(async () => button("Další").click());
    expect(visibleContracts()[0]).toBe("DEFERRED-15");

    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.parentElement?.textContent).toContain("3");
    await act(async () => checkbox.click());
    expect(visibleContracts()).toEqual(["LIFE-A101", "OTHER-LIFE-A101", "AUTO-A101"]);
    expect(container.querySelector("nav")).toBeNull();
    const summary = container.querySelectorAll('[role="status"]')[1]?.textContent?.replaceAll("\u00a0", " ");
    expect(summary).toContain("Zobrazeno 3 z 33 smluv");
    expect(summary).toContain("6 000,00 Kč");

    await act(async () => button("Zrušit filtry").click());
    expect(visibleContracts()).toHaveLength(15);
    expect(visibleContracts()[0]).toBe("DEFERRED-0");
    expect(items).toHaveLength(33);
  });
});
