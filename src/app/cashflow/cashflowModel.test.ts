import { createHash } from "node:crypto";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeWorkerFixture, WORKER_FILTER_CASES } from "../../../scripts/cashflow-worker/fixtures";
import { REFERENCE_PROVENANCE, runReference } from "../../../scripts/cashflow-worker/reference";
import searchReference from "../../../scripts/cashflow-worker/search-reference.json";
import * as computation from "./computeCashflow";
import * as helpers from "./helpers";
import { formatCashflowItemCount } from "./cashflowLabels";
import { cashflowCanonicalJson } from "./shadowProtocol";
import { createCashflowModel, type CashflowDataset, type CashflowModel } from "./cashflowModel";
import type { CashflowItem } from "./types";
import type { CashflowViewOptions } from "./buildCashflowView";

const asOf = new Date(2026, 8, 12, 12);
const defaultOptions = WORKER_FILTER_CASES[0].options;
const digest = (value: unknown) => createHash("sha256").update(cashflowCanonicalJson(value)).digest("hex");
const dataset = (count = 30): CashflowDataset => ({ ...makeWorkerFixture(count, asOf), asOf });

// Frozen AST extraction of the baseline page callback. The pilot's reference
// test verifies exact regeneration; normal app tests need no sibling base tree.
if (searchReference.sourcePath !== "src/app/cashflow/page.tsx" ||
  searchReference.callbackName !== "contractSearchStats" ||
  searchReference.pageSha256 !== REFERENCE_PROVENANCE.sources["src/app/cashflow/page.tsx"] ||
  createHash("sha256").update(searchReference.callbackTypeScript).digest("hex") !== searchReference.callbackSha256) {
  throw new Error("Frozen baseline search-stat callback integrity check failed");
}
const statsJavaScript = ts.transpileModule(`(${searchReference.callbackTypeScript})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const legacySearchStats = new Function("filteredCashflowItems", "contractNumberSearchActive", "normalizeContractNumberSearch", `return ${statsJavaScript}`) as (
  items: CashflowItem[], active: boolean, normalize: typeof helpers.normalizeContractNumberSearch,
) => () => unknown;

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function assertView(model: CashflowModel, input: CashflowDataset, options: CashflowViewOptions) {
  const reference = runReference(input.snapshot, input.statements, options, input.asOf);
  const actual = model.view(options);
  const details = actual.months.map(month => model.month(month.key));
  expect(digest(details)).toBe(digest(reference.months));
  expect(digest(actual.months)).toBe(digest(reference.months.map(({ items, ...month }) => ({
    ...month, itemCountLabel: formatCashflowItemCount(items),
  }))));
  expect(actual.months.every(month => !Object.hasOwn(month, "items"))).toBe(true);
  expect(details.every(month => month?.items.every(item => item.date instanceof Date))).toBe(true);

  const searching = helpers.normalizeContractNumberSearch(options.contractNumberQuery).length > 0;
  // Search is evaluated before reconciliation/prediction, as in the page.
  const filtered = searching ? helpers.filterItemsByContractNumber(reference.items, options.contractNumberQuery) : [];
  const stats = legacySearchStats(filtered, searching, helpers.normalizeContractNumberSearch)();
  expect(digest(actual.contractSearchStats)).toBe(digest(stats));
  return actual;
}

describe("cashflow model with bounded last-stage caches", () => {
  for (const count of [30, 300, 1000]) {
    it.each(WORKER_FILTER_CASES)(`preserves every month field for ${count} contracts and $id`, ({ options }) => {
      const input = dataset(count);
      const before = digest(input);
      const model = createCashflowModel(input);
      assertView(model, input, options);
      expect(digest(input)).toBe(before);
      model.dispose();
    });
  }

  it("preserves the complete current detail across repeated filter transitions", () => {
    const input = dataset();
    const model = createCashflowModel(input);
    expect(model.month("2026-9")).toBeNull();
    for (const selected of [...WORKER_FILTER_CASES, ...WORKER_FILTER_CASES].reverse()) {
      assertView(model, input, selected.options);
    }
    model.view({ ...defaultOptions, contractNumberQuery: "no-such-contract" });
    expect(model.month("2026-9")).toBeNull();
    expect(model.month("missing")).toBeNull();
  });

  it("reuses generation for query/history/prediction and only retains the last scope combination", () => {
    const compute = vi.spyOn(computation, "computeCashflow");
    const group = vi.spyOn(helpers, "groupItemsByMonth");
    const predict = vi.spyOn(helpers, "applyIntelligentCashflowPrediction");
    const model = createCashflowModel(dataset());
    const first = model.view(defaultOptions);
    expect(model.view({ ...defaultOptions })).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(group).toHaveBeenCalledTimes(1);
    expect(predict).toHaveBeenCalledTimes(1);
    const query = { ...defaultOptions, contractNumberQuery: "100000" };
    const searched = model.view(query);
    const groupsAfterSearch = group.mock.calls.length;
    // The history flag has no effect on a search, so its downstream arrays stay shared.
    expect(model.view({ ...query, showPastYears: true })).toBe(searched);
    expect(group).toHaveBeenCalledTimes(groupsAfterSearch);
    model.view({ ...query, intelligentPredictionEnabled: true });
    model.view({ ...defaultOptions, showPastYears: true });
    expect(compute).toHaveBeenCalledTimes(1);
    model.view({ ...defaultOptions, scopeFilter: "team" });
    model.view(defaultOptions);
    expect(compute).toHaveBeenCalledTimes(3);
    model.view({ ...defaultOptions, productFilter: "auto" });
    model.view({ ...defaultOptions, productFilter: "auto", tipsterMode: true });
    expect(compute).toHaveBeenCalledTimes(5);
  });

  it("recomputes and matches the reference after contracts, statements and the date change", () => {
    const original = dataset();
    const originalModel = createCashflowModel(original);
    const originalHash = digest(originalModel.view(defaultOptions));
    const contractChanged = structuredClone(original);
    contractChanged.snapshot.ownEntries[0].items![0].amount += 111;
    contractChanged.snapshot.ownEntries[0].inputAmount = 9876;
    const statementChanged = structuredClone(original);
    statementChanged.statements[0].payoutTotal = (statementChanged.statements[0].payoutTotal ?? 0) + 4321;
    const dateChanged = { ...original, asOf: new Date(2027, 0, 1) };
    for (const changed of [contractChanged, statementChanged, dateChanged]) {
      const model = createCashflowModel(changed);
      assertView(model, changed, defaultOptions);
      expect(digest(model.view(defaultOptions))).not.toBe(originalHash);
      model.dispose();
    }
    expect(digest(originalModel.view(defaultOptions))).toBe(originalHash);
  });

  it("keeps each account model separate and releases its current view on dispose", () => {
    const first = dataset();
    const second = dataset();
    second.snapshot.email = "second@example.test";
    second.snapshot.ownEntries.forEach(item => { item.userEmail = second.snapshot.email; });
    second.snapshot.teamEntriesRaw.forEach(item => item.managerOverrides?.forEach(override => { override.email = second.snapshot.email; }));
    const firstModel = createCashflowModel(first);
    const secondModel = createCashflowModel(second);
    const firstView = assertView(firstModel, first, defaultOptions);
    const secondView = assertView(secondModel, second, defaultOptions);
    const key = firstView.months[0].key;
    expect(firstModel.month(key)?.items.some(item => item.ownerEmail === first.snapshot.email)).toBe(true);
    expect(secondModel.month(secondView.months[0].key)?.items.some(item => item.ownerEmail === second.snapshot.email)).toBe(true);
    firstModel.dispose();
    firstModel.dispose();
    expect(firstModel.month(key)).toBeNull();
    expect(() => firstModel.view(defaultOptions)).toThrow("disposed");
    expect(secondModel.month(secondView.months[0].key)).not.toBeNull();
  });

  it("clears the current month after a failed new view and recovers on the next request", () => {
    const input = dataset();
    const model = createCashflowModel(input);
    const first = model.view(defaultOptions);
    const key = first.months[0].key;
    vi.spyOn(helpers, "applyIntelligentCashflowPrediction").mockImplementationOnce(() => { throw new Error("Calculation unavailable"); });
    const changed = { ...defaultOptions, intelligentPredictionEnabled: true };
    expect(() => model.view(changed)).toThrow("Calculation unavailable");
    expect(model.month(key)).toBeNull();
    assertView(model, input, changed);
  });

  it("returns the original count labels and first matching contract summary", () => {
    const item = (id: string, overrides: Partial<CashflowItem> = {}): CashflowItem => ({
      id, date: new Date(2026, 9, 25), amount: 10, productKey: "cppAuto", ownerEmail: "advisor@example.test", entryId: id,
      contractNumber: "AB 12", clientName: "Synthetic client", inputAmount: 5000, frequency: "annual", contractStatus: "storno", ...overrides,
    });
    const items = [item("one"), item("payment1", { isSubscriptionPayment: true, productKey: "subscription" }), item("payment2", { productKey: "subscription" })];
    vi.spyOn(computation, "computeCashflow").mockReturnValue(items);
    const model = createCashflowModel(dataset());
    const initial = model.view({ ...defaultOptions, scopeFilter: "own" });
    expect(initial.months[0].itemCountLabel).toBe("1 provize · 2 platby");
    const searched = model.view({ ...defaultOptions, contractNumberQuery: "AB12" });
    expect(searched.contractSearchStats).toEqual({
      itemCount: 3, contractCount: 1,
      summary: { productKey: "cppAuto", clientName: "Synthetic client", inputAmount: 5000, frequency: "annual", contractStatus: "storno" },
    });
  });

  it("freezes its version date and rejects invalid dataset dates", () => {
    const input = dataset();
    const model = createCashflowModel(input);
    const expected = digest(model.view(defaultOptions));
    const heldDate = input.asOf;
    input.asOf = new Date(2040, 0, 1);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2040, 0, 1));
    expect(digest(model.view(defaultOptions))).toBe(expected);
    expect(() => createCashflowModel({ ...input, asOf: new Date(Number.NaN) })).toThrow("valid calculation date");
    expect(heldDate).toEqual(asOf);
  });
});
