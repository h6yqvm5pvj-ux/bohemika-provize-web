// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatementContractBrowser, filterStatementBrowserItems, sortStatementBrowserItems, useStatementBrowserItems, type StatementBrowserItem } from "./StatementContractBrowser";
import { statementContractReview } from "./statementContractReview";
import { StatementContractList } from "./StatementContractList";
import { StatementContractCard } from "./StatementContractCard";
import { StornoContractsSectionPanel } from "./statementStornoPanels";
import type { SystemMatchPresentation } from "./statementSystemMatchUi";
import type { ParsedStatement } from "./statementTypes";

const items: StatementBrowserItem[] = [
  { key: "life:1", searchText: "Žaneta Nováková 001 ČPP NEON", amount: 1000, issueCount: 0, unpaired: false },
  { key: "other:2", searchText: "Petr Malý 002 Allianz Auto", amount: 250, issueCount: 2, unpaired: false },
  { key: "other:3", searchText: "Ivana Nováková 003 ČPP DOMEX", amount: 500, issueCount: 0, unpaired: true },
];

function Category({ entries }: { entries: StatementBrowserItem[] }) {
  const { items: visible } = useStatementBrowserItems(entries);
  return visible.length > 0 ? <div data-category>{visible.map(item => <span key={item.key} data-contract>{item.searchText}</span>)}</div> : null;
}

const reviewItems: StatementBrowserItem[] = ["ok", "increase", "decrease", "commission-error", "ok", "increase", "review", "higher"].map((status, index) => ({
  key: String(index), searchText: `Žaneta ${index}`, amount: 100 + index, unpaired: false,
  issueCount: status === "commission-error" ? 1 : 0,
  review: statementContractReview({ matched: true, unpaired: false, issueCount: status === "commission-error" ? 1 : 0,
    comparisons: status === "review" ? [] : [{ status: status === "commission-error" || status === "higher" ? "diff" : "ok",
      expectedAmount: 100, statementAmount: status === "higher" ? 140 : status === "commission-error" ? 60 : 100 }], hasWarnings: false,
    premiumChange: status === "increase" || status === "decrease" ? status : undefined }),
}));

function ReviewCategory({ entries }: { entries: StatementBrowserItem[] }) {
  // Sections create their own rows; the browser supplies their shared review metadata.
  const { items: visible } = useStatementBrowserItems(entries.map(item => ({ key: item.key, searchText: item.searchText, amount: item.amount, issueCount: item.issueCount, unpaired: item.unpaired })));
  return <StatementContractList showFilters={false} items={visible.map(item => ({ ...item,
    render: () => <StatementContractCard client={item.searchText} contractNumber={item.key} products="Testovací produkt" commission={item.amount}
      verified={item.review?.verified} reviewSummary={item.review?.summary} badges="Podrobná kontrola"><p>Detail {item.key}</p></StatementContractCard>,
  }))} />;
}

describe("statement review navigation", () => {
  let root: Root;
  let container: HTMLDivElement;
  const button = (label: string) => Array.from(container.querySelectorAll("button")).find(element => element.textContent?.includes(label))!;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("combines accent-insensitive search terms with review status without changing source data", () => {
    expect(filterStatementBrowserItems(items, "novakova cpp", "all").map(item => item.key)).toEqual(["life:1", "other:3"]);
    expect(filterStatementBrowserItems(items, "  NOVÁKOVÁ  ", "unpaired").map(item => item.key)).toEqual(["other:3"]);
    expect(filterStatementBrowserItems(items, "", "issues").map(item => item.key)).toEqual(["other:2", "other:3"]);
    expect(items).toHaveLength(3);
  });

  it("groups identical badges stably before pagination without mutating the source", () => {
    const before = reviewItems.map(item => item.key);
    expect(sortStatementBrowserItems(reviewItems).map(item => item.key)).toEqual(["3", "1", "5", "2", "7", "0", "4", "6"]);
    expect(reviewItems.map(item => item.key)).toEqual(before);
    expect(filterStatementBrowserItems(reviewItems, "zaneta", "increase").map(item => item.key)).toEqual(["1", "5"]);
    expect(filterStatementBrowserItems(reviewItems, "4", "ok").map(item => item.key)).toEqual(["4"]);
    expect(filterStatementBrowserItems(reviewItems, "", "ok").map(item => item.key)).toEqual(["0", "4"]);
    const overlapping = { ...reviewItems[3], review: statementContractReview({ matched: true, unpaired: false, issueCount: 1,
      comparisons: [{ status: "diff" }], hasWarnings: false, premiumChange: "increase" }) };
    expect(filterStatementBrowserItems([overlapping], "", "increase")).toHaveLength(1);
    expect(filterStatementBrowserItems([overlapping], "", "commission-error")).toHaveLength(1);
    expect(filterStatementBrowserItems([overlapping], "", "ok")).toHaveLength(0);
  });

  it("filters and counts by actual review results and keeps section rows in badge groups", async () => {
    await act(async () => root.render(<StatementContractBrowser items={reviewItems}><ReviewCategory entries={reviewItems} /></StatementContractBrowser>));
    const numbers = () => Array.from(container.querySelectorAll("article button")).map(item => item.querySelector('[class*="contractNumber"]')?.textContent);
    expect(numbers()).toEqual(["Smlouva 3", "Smlouva 1", "Smlouva 5", "Smlouva 2", "Smlouva 7", "Smlouva 0", "Smlouva 4", "Smlouva 6"]);
    expect(button("Navýšení").textContent).toContain("2");
    await act(async () => button("Navýšení").click());
    expect(numbers()).toEqual(["Smlouva 1", "Smlouva 5"]);
    expect(container.querySelector("article button")?.textContent).toContain("Pojistné navýšeno");
    expect(container.querySelector("article button svg.lucide-trending-up")).not.toBeNull();
    await act(async () => button("Ponížení").click());
    expect(numbers()).toEqual(["Smlouva 2"]);
    await act(async () => button("Špatná provize").click());
    expect(numbers()).toEqual(["Smlouva 3"]);
    expect(container.querySelector("article button")?.textContent).toContain("Špatná provize");
    await act(async () => button("Vyšší provize").click());
    expect(numbers()).toEqual(["Smlouva 7"]);
    expect(container.querySelector("article button")?.textContent).toContain("Vyšší provize");
    await act(async () => button("K prověření").click());
    expect(numbers()).toEqual(["Smlouva 3"]);
    await act(async () => button("Vše OK").click());
    expect(numbers()).toEqual(["Smlouva 0", "Smlouva 4"]);
    expect(container.querySelector("article button")?.textContent).toContain("Vše sedí");
    await act(async () => button("Zrušit filtry").click());
    expect(container.querySelectorAll("article")).toHaveLength(reviewItems.length);
  });

  it("filters all categories together, includes unpaired contracts for review, and restores the full list", async () => {
    await act(async () => root.render(<StatementContractBrowser items={items}><Category entries={items.slice(0, 1)} /><Category entries={items.slice(1)} /></StatementContractBrowser>));
    expect(container.querySelectorAll("[data-contract]")).toHaveLength(3);
    await act(async () => button("K prověření").click());
    expect(container.querySelectorAll("[data-contract]")).toHaveLength(2);
    expect(container.querySelectorAll("[data-category]")).toHaveLength(1);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("750,00 Kč");
    await act(async () => button("Bez propojení").click());
    expect(container.querySelectorAll("[data-contract]")).toHaveLength(1);
    expect(container.querySelector("[data-contract]")?.textContent).toContain("Ivana");
    await act(async () => button("Zrušit filtry").click());
    expect(container.querySelectorAll("[data-contract]")).toHaveLength(3);

    const input = container.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "nenalezeno");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll("[data-contract]")).toHaveLength(0);
    expect(container.textContent).toContain("Žádná smlouva neodpovídá výběru.");
    await act(async () => button("Zobrazit všechny smlouvy").click());
    expect(input.value).toBe("");
    expect(container.querySelectorAll("[data-contract]")).toHaveLength(3);
  });

  it("keeps long lists compact while making every contract and its detail reachable", async () => {
    const entries = Array.from({ length: 31 }, (_, index) => ({
      key: String(index), searchText: `Klient ${index + 1}`, amount: index + 1, issueCount: 0, unpaired: false,
      hasA101: index === 30,
      render: () => <StatementContractCard client={`Klient ${index + 1}`} contractNumber={`TEST-${index + 1}`} products="Testovací produkt" badges="K prověření" commission={index + 1}><p>Podrobnosti smlouvy {index + 1}</p></StatementContractCard>,
    }));
    await act(async () => root.render(<StatementContractList items={entries} enableA101Filter showFilters={false} />));
    expect(container.querySelectorAll("article")).toHaveLength(15);
    expect(button("Předchozí").disabled).toBe(true);
    await act(async () => button("Další").click());
    expect(container.querySelector("article")?.textContent).toContain("TEST-16");
    await act(async () => button("Další").click());
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(button("Další").disabled).toBe(true);
    await act(async () => { container.querySelector("article button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(container.textContent).toContain("Podrobnosti smlouvy 31");
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.querySelector("nav")).toBeNull();
    expect(container.textContent).toContain("TEST-31");
    await act(async () => button("Zrušit filtry").click());
    expect(container.querySelector("article")?.textContent).toContain("TEST-1");
    expect(container.querySelectorAll("article")).toHaveLength(15);
  });

  it("groups badges before pagination and resets the page when combining status and A101 filters", async () => {
    const entries = Array.from({ length: 32 }, (_, index) => {
      const review = statementContractReview({ matched: true, unpaired: false, issueCount: 0, comparisons: [{ status: "ok" }],
        hasWarnings: false, premiumChange: index % 2 === 1 ? "increase" : undefined });
      return { key: String(index), searchText: `Testovací klient ${index}`, amount: 100, issueCount: 0, unpaired: false,
        review, hasA101: index === 0 || index === 31,
        render: () => <article data-status={review.status}>Smlouva {index}</article> };
    });
    await act(async () => root.render(<StatementContractList items={entries} enableA101Filter />));
    const states = () => Array.from(container.querySelectorAll("article")).map(item => item.getAttribute("data-status"));
    expect(states()).toEqual(Array(15).fill("increase"));
    await act(async () => button("Další").click());
    expect(states()).toEqual(["increase", ...Array(14).fill("ok")]);
    await act(async () => button("Vše OK").click());
    expect(states()).toEqual(Array(15).fill("ok"));
    expect(button("Předchozí").disabled).toBe(true);
    await act(async () => button("Navýšení").click());
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(states()).toEqual(["increase"]);
    expect(container.querySelector("article")?.textContent).toBe("Smlouva 31");
    expect(container.querySelector("nav")).toBeNull();
  });

  it("keeps storno details and discrepancy selection accessible without nesting controls", async () => {
    const onToggleMarked = vi.fn();
    const statement: ParsedStatement = {
      fileName: "test.html", header: { advisorNumber: null, period: null, statementNumber: null, statementDate: null }, payoutTotal: null, commissionRows: [], deductionRows: [],
      stornoRows: [], otherPayments: [{ description: "Testovací vratka", contractNumber: "TEST-42", amount: -150, isStorno: true, isB36Half: false }],
      contractStatusRules: [], managerCommissions: [], lifeSplitContracts: [], otherProductContracts: [], unmatchedB36Payments: [], parseWarnings: [],
    };
    const presentation: SystemMatchPresentation = {
      matchedSystemContract: () => null, systemMatchHistoryLabel: () => "", dedupeEquivalentSystemContracts: contracts => contracts,
      systemMatchHasSingleFamilyHistory: () => false, sortSystemContractTimeline: contracts => contracts,
      statementProductMatchesSystemProduct: () => true, systemContractTimelinePositionMismatch: () => null,
      systemContractIsEndorsement: () => false, positionLabel: () => "", systemContractPosition: () => null,
    };
    await act(async () => root.render(<StornoContractsSectionPanel statement={statement} matchesByContractNumber={{}} presentation={presentation} markingControls={{ markingMode: true, markedItems: {}, onToggleMarked, statementKey: "test", statementLabel: "Testovací výpis" }} />));
    await act(async () => button("Storna").click());
    expect(button("Nespárované").getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("article")).toBeNull();
    await act(async () => button("Nespárované").click());
    const rowToggle = container.querySelector<HTMLButtonElement>("article button")!;
    expect(rowToggle.getAttribute("aria-expanded")).toBe("false");
    expect(rowToggle.textContent).toContain("TEST-42");
    expect(rowToggle.textContent).toContain("-150,00");
    expect(rowToggle.querySelector("input, a, button")).toBeNull();
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => checkbox.click());
    expect(onToggleMarked).toHaveBeenCalledWith(expect.objectContaining({ contractNumber: "TEST-42", amount: -150 }), true);
    expect(rowToggle.getAttribute("aria-expanded")).toBe("false");
    await act(async () => rowToggle.click());
    expect(rowToggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Testovací vratka");
  });

  it("shows one understandable review result in a row and preserves technical badges in its detail", async () => {
    await act(async () => root.render(<StatementContractCard client="Testovací klient" contractNumber="TEST-1" products="Testovací produkt" commission={100} reviewSummary={{ label: "K prověření", tone: "warn" }} badges={<><span>A101</span><span>B0301</span><span>Rozdíl v základně</span></>}><p>Podrobné porovnání</p></StatementContractCard>));
    const rowToggle = container.querySelector("button")!;
    expect(rowToggle.textContent).toContain("K prověření");
    expect(rowToggle.textContent).not.toContain("A101");
    await act(async () => rowToggle.click());
    expect(rowToggle.textContent).toContain("A101");
    expect(rowToggle.textContent).toContain("B0301");
    expect(container.textContent).toContain("Podrobné porovnání");
  });
});
