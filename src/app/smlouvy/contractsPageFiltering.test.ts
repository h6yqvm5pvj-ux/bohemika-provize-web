import type { ContractDoc as ApiContract } from "@/app/api/contracts/_lib/contractsApi.types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAREER_POSITIONS } from "@/app/lib/careerPositions";
import { PRODUCT_CATALOG, PRODUCT_ORDER } from "@/app/lib/productCatalog";
import { contractMatchesListFilters, parseContractListFilters } from "@/app/api/contracts/_lib/contractsApi.listFilters";
import { CATEGORY_DEFS, INSTITUTION_DEFS, PRODUCT_CATEGORY_MAP } from "./contractsPageFilters";
import { filterDisplayedContracts } from "./contractsPageFiltering";
import { emptyContractFilterSelection } from "./contractFilterSelection";
import type { ContractsListFilters, DisplayedContract } from "./contractsPageTypes";

const owner = "advisor@example.test";
const contract = (id: string, values: Partial<DisplayedContract> = {}): DisplayedContract => ({
  id, userEmail: owner, productKey: "cppAuto", clientName: "Žaneta Nováková", contractNumber: "AB 12/34",
  contractSignedDate: "2025-09-20", policyStartDate: "2025-09-20", paid: false, ...values,
});
const filters = (patch: Partial<ContractsListFilters> = {}): ContractsListFilters => ({ ...emptyContractFilterSelection(), query: "", ...patch });
function matching(items: DisplayedContract[], patch: Partial<ContractsListFilters> = {}) {
  return filterDisplayedContracts(items, filters(patch), true).map(item => item.id);
}
const cases: [string, Partial<ContractsListFilters>, Record<string, string>, string[]][] = [
  ["latest", {}, {}, ["active", "paid", "storno", "matured", "expired", "replacement", "travel", "new", "distant", "unknown"]],
  ["active", { showActiveOnly: true }, { activeOnly: "1" }, ["active", "paid", "replacement", "travel", "new", "distant", "unknown"]],
  ["unpaid", { showUnpaidOnly: true }, { unpaidOnly: "1" }, ["active", "replacement", "travel", "new", "distant", "unknown"]],
  ["replacement", { showRefreshOnly: true }, { refreshOnly: "1" }, ["replacement"]],
  ["storno", { showStornoOnly: true }, { stornoOnly: "1" }, ["storno"]],
  ["matured", { showMaturedOnly: true }, { maturedOnly: "1" }, ["matured", "expired"]],
  ["both ended states", { showStornoOnly: true, showMaturedOnly: true }, { stornoOnly: "1", maturedOnly: "1" }, ["storno", "matured", "expired"]],
  ["anniversary", { filterMode: "anniversary" }, { mode: "anniversary" }, ["active", "paid", "replacement"]],
  ["anniversary AND name search", { filterMode: "anniversary", query: "zaneta" }, { mode: "anniversary", q: "zaneta" }, ["active", "paid", "replacement"]],
  ["anniversary AND unpaid AND replacement", { filterMode: "anniversary", showUnpaidOnly: true, showRefreshOnly: true }, { mode: "anniversary", unpaidOnly: "1", refreshOnly: "1" }, ["replacement"]],
];
let items: DisplayedContract[];
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T12:00:00+02:00"));
  items = [contract("active"), contract("paid", { paid: true }), contract("storno", { status: "storno" }),
    contract("matured", { status: "dozita" }), contract("expired", { policyEndDate: "2026-09-12" }),
    contract("replacement", { refreshOriginalContractNumber: "OLD-123" }), contract("travel", { productKey: "cppcestovko" }),
    contract("new", { policyStartDate: "2026-09-20" }), contract("distant", { policyStartDate: "2025-03-01" }),
    contract("unknown", { productKey: undefined, paid: undefined }),
  ];
});
afterEach(() => vi.useRealTimers());

describe("contract filter results in the page and API", () => {
  it.each(CAREER_POSITIONS)("filters the saved signing position %s in both the page and API", position => {
    const values = [...CAREER_POSITIONS.map(value => contract(value, { position: value })), contract("missing")];
    expect(matching(values, { selectedPositions: [position] })).toEqual([position]);
    const server = parseContractListFilters(new URLSearchParams({ positions: position }));
    expect(values.filter(item => contractMatchesListFilters(item as ApiContract, server)).map(item => item.id)).toEqual([position]);
  });

  it("combines multiple signing positions with search, insurer, payment and adviser filters", () => {
    const values = [contract("p2", { position: "poradce2" }), contract("m4", { position: "manazer4" }),
      contract("p5", { position: "poradce5" }), contract("paid", { position: "poradce2", paid: true }),
      contract("other", { position: "poradce2", productKey: "allianzAuto" }),
      contract("other-name", { position: "poradce2", clientName: "Jana Černá" }), contract("missing")];
    expect(matching(values, { selectedPositions: ["poradce2", "manazer4"], query: "novakova", showUnpaidOnly: true, selectedInstitutions: ["cpp"], selectedSubordinates: [owner] })).toEqual(["p2", "m4"]);
    const server = parseContractListFilters(new URLSearchParams({ positions: "poradce2, manazer4,poradce2,invalid", q: "novakova", unpaidOnly: "1", institutions: "cpp" }));
    expect([...server.positions]).toEqual(["poradce2", "manazer4"]);
    expect(values.filter(item => contractMatchesListFilters(item as ApiContract, server, owner)).map(item => item.id)).toEqual(["p2", "m4"]);
    expect(matching(values)).toContain("missing");
  });

  it.each(cases)("%s", (_name, selection, query, expected) => {
    expect(matching(items, selection)).toEqual(expected);
    const parsed = parseContractListFilters(new URLSearchParams(query));
    expect(items.filter(item => contractMatchesListFilters(item as ApiContract, parsed, owner)).map(item => item.id)).toEqual(expected);
  });

  it.each(CATEGORY_DEFS)("matches the complete $label category in the page and API", category => {
    const products = PRODUCT_ORDER.map(productKey => contract(productKey, { productKey }));
    const expected = PRODUCT_ORDER.filter(product => PRODUCT_CATEGORY_MAP[category.id].includes(product));
    expect(expected.length).toBeGreaterThan(0);
    expect(matching(products, { selectedCategories: [category.id] })).toEqual(expected);
    const server = parseContractListFilters(new URLSearchParams({ categories: category.id }));
    expect(products.filter(item => contractMatchesListFilters(item as ApiContract, server)).map(item => item.id)).toEqual(expected);
  });

  it("assigns every product to exactly one user-facing category, including liability, business and foreigners", () => {
    for (const product of PRODUCT_ORDER) expect(Object.values(PRODUCT_CATEGORY_MAP).filter(list => list.includes(product))).toHaveLength(1);
    expect(PRODUCT_CATEGORY_MAP.property).toEqual(expect.arrayContaining(["zamex", "koopodzam", "domex"]));
    expect(PRODUCT_CATEGORY_MAP.business).toEqual(expect.arrayContaining(["cppsimplex", "cppPPRs", "cppPPRbez", "kooppmop"]));
    expect(PRODUCT_CATEGORY_MAP.foreigners).toEqual(["maxcizinkomplex"]);
  });

  it.each(INSTITUTION_DEFS)("matches every product from $label in the page and API", institution => {
    const products = PRODUCT_ORDER.map(productKey => contract(productKey, { productKey }));
    const expected = PRODUCT_ORDER.filter(product => PRODUCT_CATALOG[product].institutionId === institution.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(matching(products, { selectedInstitutions: [institution.id] })).toEqual(expected);
    const server = parseContractListFilters(new URLSearchParams({ institutions: institution.id }));
    expect(products.filter(item => contractMatchesListFilters(item as ApiContract, server)).map(item => item.id)).toEqual(expected);
  });

  it("uses OR within a group and AND across product, institution, adviser and payment groups", () => {
    const products = [contract("cpp-auto"), contract("cpp-domex", { productKey: "domex" }), contract("other-product", { productKey: "neon" }),
      contract("other-institution", { productKey: "allianzAuto" }), contract("other-adviser", { adviserEmail: "other@example.test" }), contract("paid", { paid: true })];
    expect(matching(products, { selectedCategories: ["auto", "property"], selectedInstitutions: ["cpp", "csob"], selectedSubordinates: [owner], showUnpaidOnly: true })).toEqual(["cpp-auto", "cpp-domex"]);
  });

  it("matches advisers by normalized owner identity and only restricts team scope", () => {
    const values = [contract("one", { adviserEmail: " Advisor@Example.Test " }), contract("two", { userEmail: "two@example.test" })];
    expect(matching(values, { selectedSubordinates: [owner] })).toEqual(["one"]);
    expect(filterDisplayedContracts(values, filters({ selectedSubordinates: [owner] }), false)).toHaveLength(2);
  });

  it("preserves grouped replacement markers and search tokens from endorsements", () => {
    const grouped = contract("group", { groupedHasRefresh: true, searchClientTokens: ["old client"], searchContractCompactTokens: ["other123"] });
    expect(matching([grouped], { showRefreshOnly: true, query: "other123" })).toEqual(["group"]);
    expect(matching([grouped], { query: "old client" })).toEqual(["group"]);
  });

  it("orders anniversaries nearest first, includes today and day 90, and rejects day 91", () => {
    const day = (offset: number) => { const date = new Date(2026, 8, 13 + offset, 12); date.setFullYear(date.getFullYear() - 1); return date; };
    const values = [contract("day90", { policyStartDate: day(90) }), contract("day91", { policyStartDate: day(91) }), contract("today", { policyStartDate: day(0) }), contract("tomorrow", { policyStartDate: day(1) })];
    expect(matching(values, { filterMode: "anniversary" })).toEqual(["today", "tomorrow", "day90"]);
  });
});
