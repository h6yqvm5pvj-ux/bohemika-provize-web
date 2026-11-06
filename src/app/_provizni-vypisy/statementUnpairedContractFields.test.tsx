// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatementContractBrowser } from "./StatementContractBrowser";
import { classifyLifeSplitCommissionCode, resolveStatementProduct } from "./statementParsing";
import { UnpairedContractsSectionPanel } from "./statementProductSections";
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
  category: "productCode" in contract ? "life" as const : resolveStatementProduct(contract.rows[0].product).category,
  amount: contract.rows.reduce((sum, item) => sum + item.commission, 0), issueCount: 0,
  render: () => <article data-contract={contract.contractNumber}>{contract.contractNumber}</article>,
}));

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

  it("groups every unpaired contract once in the requested order and preserves counts and totals", async () => {
    const contracts = [
      other("AUTO", "A101", "CPP_ACPIII", 200),
      other("TRAVEL", "A101", "CPP_CS6", 600),
      life("LIFE", "B101", 100),
      other("INVESTMENT", "A201", "INVESTIKA", 700),
      other("PROPERTY", "A101", "CPP_DOMX", 300),
      other("FOREIGNERS", "A101", "MAX_CIZIN", 500),
      other("BUSINESS", "A101", "CPP_SIMPLE", 400),
      other("UNKNOWN", "A101", "TEST_UNKNOWN", 800),
      other("OTHER-LIFE", "A101", "KOO_PRANI", 50),
    ];
    const items = listItems(contracts);
    items.push({ ...listItems([other("PENSION", "A101", "TEST_PENSION", 900)])[0], category: "pension" });
    await act(async () => root.render(<StatementContractBrowser items={items}><UnpairedContractsSectionPanel items={items} /></StatementContractBrowser>));
    const panel = container.querySelector('section[aria-label="Smlouvy mimo Bohemka.App"]')!;
    const header = () => panel.querySelector(":scope > button")!.textContent!.replaceAll("\u00a0", " ");
    expect(header()).toContain("10 smluv");
    expect(header()).toContain("4 550,00 Kč");
    await act(async () => button("Smlouvy mimo Bohemka.App").click());
    const sections = [...panel.querySelectorAll("section[aria-label]")];
    expect(sections.map(section => section.getAttribute("aria-label"))).toEqual([
      "Životní pojištění", "Auta", "Majetek a odpovědnost", "Cizinci", "Cestovní pojištění", "Investice", "Ostatní produkty",
    ]);
    expect(sections[0].textContent).toContain("2 smlouvy");
    expect(sections[0].textContent).toContain("150,00");
    expect(sections[2].textContent).toContain("2 smlouvy");
    expect(sections[2].textContent).toContain("700,00");
    expect(visibleContracts()).toEqual([]);
    for (const section of sections) {
      await act(async () => section.querySelector<HTMLButtonElement>(":scope > button")!.click());
    }
    expect(visibleContracts()).toEqual(["LIFE", "OTHER-LIFE", "AUTO", "PROPERTY", "BUSINESS", "FOREIGNERS", "TRAVEL", "INVESTMENT", "UNKNOWN", "PENSION"]);
    expect(container.querySelectorAll("button button, button input")).toHaveLength(0);

    await act(async () => button("Vše OK").click());
    expect(container.querySelector('section[aria-label="Smlouvy mimo Bohemka.App"]')).toBeNull();
    await act(async () => button("Bez propojení").click());
    await act(async () => button("Smlouvy mimo Bohemka.App").click());
    expect(container.querySelectorAll('section[aria-label="Smlouvy mimo Bohemka.App"] section')).toHaveLength(7);
    expect(items).toHaveLength(10);
  });

  it("shows and filters every contract within each expanded product section", async () => {
    const contracts = [
      ...Array.from({ length: 30 }, (_, index) => life(`DEFERRED-${index}`, "B101")),
      life("LIFE-A101", "A101", 1000),
      other("OTHER-LIFE-A101", "APZ101", "KOOP_FLEXI", 2000),
      other("AUTO-A101", "A101", "CPP_1C_II", 3000),
    ];
    const items = listItems(contracts);
    await act(async () => root.render(<StatementContractBrowser items={items}><UnpairedContractsSectionPanel items={items} /></StatementContractBrowser>));
    await act(async () => button("Bez propojení").click());
    await act(async () => button("Smlouvy mimo Bohemka.App").click());
    await act(async () => button("Životní pojištění").click());
    expect(visibleContracts()).toHaveLength(32);
    expect(visibleContracts().slice(-2)).toEqual(["LIFE-A101", "OTHER-LIFE-A101"]);
    expect(container.querySelector("nav")).toBeNull();

    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.parentElement?.textContent).toContain("2");
    await act(async () => checkbox.click());
    expect(visibleContracts()).toEqual(["LIFE-A101", "OTHER-LIFE-A101"]);
    expect(container.querySelector("nav")).toBeNull();
    const summary = container.querySelectorAll('[role="status"]')[1]?.textContent?.replaceAll("\u00a0", " ");
    expect(summary).toContain("Zobrazeno 2 z 32 smluv");
    expect(summary).toContain("3 000,00 Kč");

    await act(async () => button("Auta").click());
    const autoCheckbox = container.querySelector<HTMLInputElement>('section[aria-label="Auta"] input[type="checkbox"]')!;
    expect(autoCheckbox.parentElement?.textContent).toContain("1");
    await act(async () => autoCheckbox.click());
    expect(visibleContracts()).toEqual(["LIFE-A101", "OTHER-LIFE-A101", "AUTO-A101"]);

    await act(async () => button("Zrušit filtry").click());
    await act(async () => button("Smlouvy mimo Bohemka.App").click());
    await act(async () => button("Životní pojištění").click());
    expect(visibleContracts()).toHaveLength(32);
    expect(visibleContracts()[0]).toBe("DEFERRED-0");
    expect(items).toHaveLength(33);
  });
});
