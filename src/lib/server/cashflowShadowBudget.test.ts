import { describe, expect, it } from "vitest";

import type { CashflowSnapshot } from "@/app/cashflow/computeCashflow";
import type { EntryDoc } from "@/app/cashflow/types";
import { isCashflowShadowWithinBudget } from "./cashflowShadowBudget";

const asOf = new Date("2026-09-12T12:00:00Z");
const snapshot = (patch: Partial<CashflowSnapshot> = {}): CashflowSnapshot => ({
  email: "viewer@example.test", myPosition: null, myCommissionMode: null,
  hasAnyTeam: false, ownEntries: [], teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [], ...patch,
});
const entry = (patch: Partial<EntryDoc> = {}): EntryDoc => ({
  id: "contract", productKey: "cppAuto", policyStartDate: "2026-09-01", ...patch,
});
const entries = (count: number, patch: Partial<EntryDoc> = {}) =>
  Array.from({ length: count }, (_, id) => entry({ id: String(id), ...patch }));

describe("server cashflow shadow resource budget", () => {
  it("accepts ordinary portfolios without changing their contents", () => {
    const input = snapshot({ ownEntries: entries(150), tipPayouts: [{ id: "tip", amount: 10 }] });
    const before = structuredClone(input);
    expect(isCashflowShadowWithinBudget(input, asOf)).toBe(true);
    expect(input).toEqual(before);
    expect(isCashflowShadowWithinBudget(snapshot(), asOf)).toBe(true);
  });

  it("estimates historical monthly expansion instead of using only source row counts", () => {
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(100) }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(100, { policyStartDate: "2000-01-01" }) }), asOf)).toBe(false);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(200) }), asOf)).toBe(false);
  });

  it("uses the earliest source date, even when a newer policy date is present", () => {
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(100, {
      policyStartDate: "2026-09-01", contractSignedDate: "2000-01-01",
    }) }), asOf)).toBe(false);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(100, {
      createdAt: { seconds: Date.parse("2000-01-01") / 1000, nanoseconds: 0 },
    }) }), asOf)).toBe(false);
  });

  it("budgets team rows for both possible generation paths and life review additions", () => {
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(100) }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ teamEntriesRaw: entries(100) }), asOf)).toBe(false);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(110, { productKey: "neon" }) }), asOf)).toBe(false);
  });

  it("accounts for up to 120 forecasts plus the actual subscription payment", () => {
    expect(isCashflowShadowWithinBudget(snapshot({ subscriptionPayments: Array.from({ length: 206 }, () => ({})) }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ subscriptionPayments: Array.from({ length: 207 }, () => ({})) }), asOf)).toBe(false);
    expect(isCashflowShadowWithinBudget(snapshot({ tipPayouts: Array.from({ length: 25_000 }, () => ({})) }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ tipPayouts: Array.from({ length: 25_001 }, () => ({})) }), asOf)).toBe(false);
  });

  it.each(["invalid", "1800-01-01", "+275760-09-01", new Date(NaN), { seconds: 1e308 }])("rejects malformed or extreme dates: %j", value => {
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: [entry({ policyStartDate: value })] }), asOf)).toBe(false);
  });

  it.each([101, 1e308, Infinity, NaN, -1])("rejects unbounded life duration %s before shared helper loops", durationYears => {
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: [entry({ productKey: "flexi", durationYears })] }), asOf)).toBe(false);
  });

  it("accepts bounded legacy dates/durations and missing optional dates", () => {
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: [entry({ policyStartDate: null, durationYears: 100, durationMonths: 1_200 })] }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: [entry({ policyStartDate: "1. 2. 2020" })] }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: [entry({ durationMonths: 1_201 })] }), asOf)).toBe(false);
  });

  it("caps nested arrays and counts split commissions in the expansion estimate", () => {
    const items = Array.from({ length: 4 }, () => ({ title: "Provize", amount: 1 }));
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(50, { items }) }), asOf)).toBe(false);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: [entry({ items: Array.from({ length: 129 }, () => ({ title: "Provize", amount: 1 })) })] }), asOf)).toBe(false);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: [entry({ commissionPayouts: Array.from({ length: 501 }, () => ({})) })] }), asOf)).toBe(false);
    expect(isCashflowShadowWithinBudget(snapshot({ teamEntriesRaw: [entry({ managerOverrides: Array.from({ length: 21 }, () => ({ email: null, position: null, commissionMode: null, items: [], total: 0 })) })] }), asOf)).toBe(false);
  });

  it("uses manager commission parts for team expansion, not only contract parts", () => {
    const managerOverrides: EntryDoc["managerOverrides"] = [{
      email: "viewer@example.test", position: null, commissionMode: null, total: 4,
      items: Array.from({ length: 4 }, () => ({ title: "Provize", amount: 1 })),
    }];
    expect(isCashflowShadowWithinBudget(snapshot({ teamEntriesRaw: entries(25, { managerOverrides }) }), asOf)).toBe(false);
  });

  it("bounds payout matching work even when output size alone fits", () => {
    const commissionPayouts = Array.from({ length: 500 }, () => ({}));
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(6, { commissionPayouts }) }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(7, { commissionPayouts }) }), asOf)).toBe(false);
  });

  it("rejects invalid reference time and malformed legacy arrays", () => {
    expect(isCashflowShadowWithinBudget(snapshot(), new Date(NaN))).toBe(false);
    expect(isCashflowShadowWithinBudget(snapshot(), new Date("2500-01-01"))).toBe(false);
    const malformed = entry({ items: {} as EntryDoc["items"] });
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: [malformed] }), asOf)).toBe(false);
  });
});
