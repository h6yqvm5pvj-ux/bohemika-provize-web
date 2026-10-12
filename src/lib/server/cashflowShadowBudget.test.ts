import { describe, expect, it } from "vitest";

import type { CashflowComputationOptions, CashflowSnapshot } from "@/app/cashflow/computeCashflow";
import type { EntryDoc } from "@/app/cashflow/types";
import { cashflowShadowBudgetFailure, isCashflowShadowWithinBudget } from "./cashflowShadowBudget";

const asOf = new Date("2026-09-12T12:00:00Z");
const snapshot = (patch: Partial<CashflowSnapshot> = {}): CashflowSnapshot => ({
  email: "viewer@example.test", myPosition: null, myCommissionMode: null,
  hasAnyTeam: false, ownEntries: [], teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [], ...patch,
});
const entry = (patch: Partial<EntryDoc> = {}): EntryDoc => ({
  id: "contract", productKey: "cppAuto", frequencyRaw: "monthly", policyStartDate: "2026-09-01", ...patch,
});
const entries = (count: number, patch: Partial<EntryDoc> = {}) =>
  Array.from({ length: count }, (_, id) => entry({ id: String(id), ...patch }));
const selection = (patch: Partial<CashflowComputationOptions> = {}): CashflowComputationOptions => ({
  scopeFilter: "team", productFilter: "all", tipsterMode: false, ...patch,
});
const managerOverrides: EntryDoc["managerOverrides"] = [{ email: "viewer@example.test",
  position: "manazer8", commissionMode: "standard", total: 1, items: [{ title: "Okamžitá provize", amount: 1 }] }];

describe("server cashflow shadow resource budget", () => {
  it("bounds only generated team paths while preserving the legacy whole-portfolio estimate", () => {
    const input = snapshot({
      ownEntries: entries(1_000, { userEmail: "viewer@example.test", productKey: "neon" }),
      teamEntriesRaw: entries(300, { userEmail: "member@example.test", productKey: "neon", managerOverrides }),
      subscriptionPayments: Array.from({ length: 207 }, () => ({})),
    });
    const before = structuredClone(input);
    expect(cashflowShadowBudgetFailure(input, asOf, true)).toBe("output_estimate");
    expect(cashflowShadowBudgetFailure(input, asOf, true, selection())).toBeNull();
    expect(cashflowShadowBudgetFailure(input, asOf, true, selection({ scopeFilter: "own" }))).toBe("output_estimate");
    expect(cashflowShadowBudgetFailure(input, asOf, true, selection({ scopeFilter: "combined" }))).toBe("output_estimate");
    expect(input).toEqual(before);
  });

  it("keeps the same 25,000-item cap for the selected team generation path", () => {
    const make = (count: number) => snapshot({ teamEntriesRaw: entries(count, {
      userEmail: "member@example.test", productKey: "neon", managerOverrides,
    }) });
    expect(cashflowShadowBudgetFailure(make(454), asOf, true, selection())).toBeNull();
    expect(cashflowShadowBudgetFailure(make(455), asOf, true, selection())).toBe("output_estimate");
    expect(cashflowShadowBudgetFailure(make(455), asOf, false, selection())).toBeNull();
  });

  it("includes own contracts found only in team rows and both paths in combined views", () => {
    const input = snapshot({ teamEntriesRaw: entries(300, {
      userEmail: " VIEWER@EXAMPLE.TEST ", productKey: "neon", managerOverrides,
    }) });
    expect(cashflowShadowBudgetFailure(input, asOf, true, selection({ scopeFilter: "own" }))).toBeNull();
    expect(cashflowShadowBudgetFailure(input, asOf, true, selection())).toBeNull();
    expect(cashflowShadowBudgetFailure(input, asOf, true, selection({ scopeFilter: "combined" }))).toBe("output_estimate");
  });

  it("selects products and ignores team rows without the current viewer's override", () => {
    const input = snapshot({ teamEntriesRaw: entries(500, { userEmail: "member@example.test", productKey: "neon",
      managerOverrides: [{ ...managerOverrides[0], email: "other@example.test" }] }) });
    expect(cashflowShadowBudgetFailure(input, asOf, true, selection())).toBeNull();
    input.teamEntriesRaw.forEach(entry => { entry.managerOverrides = managerOverrides; });
    expect(cashflowShadowBudgetFailure(input, asOf, true, selection({ productFilter: "auto" }))).toBeNull();
    expect(cashflowShadowBudgetFailure(input, asOf, true, selection({ productFilter: "life" }))).toBe("output_estimate");
    expect(cashflowShadowBudgetFailure(input, asOf, true, selection({ productFilter: "tip" }))).toBeNull();
    expect(cashflowShadowBudgetFailure(input, asOf, true, selection({ tipsterMode: true }))).toBeNull();
  });

  it.each([
    { policyStartDate: "invalid" }, { durationYears: 101 },
    { items: {} as EntryDoc["items"] }, { commissionPayouts: Array.from({ length: 501 }, () => ({})) },
  ])("still rejects malformed source rows excluded from generation (%j)", changed => {
    const input = snapshot({ ownEntries: [entry(changed)] });
    expect(cashflowShadowBudgetFailure(input, asOf, true, selection())).not.toBeNull();
    expect(cashflowShadowBudgetFailure(input, asOf, true, selection({ productFilter: "tip" }))).not.toBeNull();
  });

  it("bounds full source and nested input size even when no contracts are generated", () => {
    expect(cashflowShadowBudgetFailure(snapshot({ ownEntries: entries(25_001) }), asOf, true,
      selection({ productFilter: "tip" }))).toBe("source_rows");
    expect(cashflowShadowBudgetFailure(snapshot({ ownEntries: entries(80, {
      items: Array.from({ length: 128 }, () => ({ title: "Provize", amount: 1 })),
    }) }), asOf, true, selection())).toBe("nested_rows");
    expect(cashflowShadowBudgetFailure(snapshot({ tipPayouts: Array.from({ length: 25_001 }, () => ({})) }),
      asOf, true, selection())).toBe("source_rows");
  });

  it("still rejects excessive payout matching for a selected override", () => {
    const input = snapshot({ teamEntriesRaw: entries(7, { userEmail: "member@example.test", managerOverrides,
      commissionPayouts: Array.from({ length: 500 }, () => ({})),
    }) });
    expect(cashflowShadowBudgetFailure(input, asOf, false, selection())).toBe("payout_matching");
  });

  it("distinguishes workload limits from malformed data using only fixed codes", () => {
    expect(cashflowShadowBudgetFailure(snapshot(), asOf)).toBeNull();
    expect(cashflowShadowBudgetFailure(snapshot(), new Date(NaN))).toBe("reference_time");
    expect(cashflowShadowBudgetFailure(snapshot({ ownEntries: entries(25_001) }), asOf)).toBe("source_rows");
    expect(cashflowShadowBudgetFailure(snapshot({ ownEntries: entries(205) }), asOf)).toBe("output_estimate");
    expect(cashflowShadowBudgetFailure(snapshot({ ownEntries: entries(7, {
      commissionPayouts: Array.from({ length: 500 }, () => ({})),
    }) }), asOf)).toBe("payout_matching");
    expect(cashflowShadowBudgetFailure(snapshot({ ownEntries: [entry({ policyStartDate: "invalid" })] }), asOf)).toBe("date_range");
    expect(cashflowShadowBudgetFailure(snapshot({ ownEntries: [entry({ durationYears: 101 })] }), asOf)).toBe("duration");
    expect(cashflowShadowBudgetFailure(snapshot({ ownEntries: [entry({ items: {} as EntryDoc["items"] })] }), asOf)).toBe("entry_shape");
  });
  it("preserves rejection when malformed source lists make the expansion estimate non-finite", () => {
    const input = snapshot({ ownEntries: [entry()], subscriptionPayments: {} as CashflowSnapshot["subscriptionPayments"] });
    expect(isCashflowShadowWithinBudget(input, asOf)).toBe(false);
    expect(cashflowShadowBudgetFailure(input, asOf)).toBe("output_estimate");
  });
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
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(200) }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(205) }), asOf)).toBe(false);
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
    expect(isCashflowShadowWithinBudget(snapshot({ teamEntriesRaw: entries(100) }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ teamEntriesRaw: entries(105) }), asOf)).toBe(false);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(110, { productKey: "neon" }) }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(454, { productKey: "neon" }) }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(455, { productKey: "neon" }) }), asOf)).toBe(false);
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

  it("caps nested arrays and avoids multiplying aggregated auto commissions", () => {
    const items = Array.from({ length: 4 }, () => ({ title: "Provize", amount: 1 }));
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(50, { items }) }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(50, { productKey: "comfortcc", items }) }), asOf)).toBe(false);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: [entry({ items: Array.from({ length: 129 }, () => ({ title: "Provize", amount: 1 })) })] }), asOf)).toBe(false);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: [entry({ commissionPayouts: Array.from({ length: 501 }, () => ({})) })] }), asOf)).toBe(false);
    expect(isCashflowShadowWithinBudget(snapshot({ teamEntriesRaw: [entry({ managerOverrides: Array.from({ length: 21 }, () => ({ email: null, position: null, commissionMode: null, items: [], total: 0 })) })] }), asOf)).toBe(false);
  });

  it("retains the conservative fallback for unreviewed manager commission schedules", () => {
    const managerOverrides: EntryDoc["managerOverrides"] = [{
      email: "viewer@example.test", position: null, commissionMode: null, total: 4,
      items: Array.from({ length: 4 }, () => ({ title: "Provize", amount: 1 })),
    }];
    expect(isCashflowShadowWithinBudget(snapshot({ teamEntriesRaw: entries(25, { productKey: "comfortcc", managerOverrides }) }), asOf)).toBe(false);
  });

  it("bounds payout matching work even when output size alone fits", () => {
    const commissionPayouts = Array.from({ length: 500 }, () => ({}));
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(6, { commissionPayouts }) }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(7, { commissionPayouts }) }), asOf)).toBe(false);
  });

  it("budgets annual products annually even when premium payments are monthly", () => {
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(1_000, { productKey: "pillowAuto" }) }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(1_000, { frequencyRaw: "annual" }) }), asOf)).toBe(true);
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: entries(1_000) }), asOf)).toBe(false);
  });

  it("charges life reviews only when enabled, with a conservative default", () => {
    const input = snapshot({ ownEntries: entries(1_000, { productKey: "neon" }) });
    expect(cashflowShadowBudgetFailure(input, asOf)).toBe("output_estimate");
    expect(cashflowShadowBudgetFailure(input, asOf, true)).toBe("output_estimate");
    expect(cashflowShadowBudgetFailure(input, asOf, false)).toBeNull();
  });

  it("counts large split life commissions from manager overrides", () => {
    const managerOverrides: EntryDoc["managerOverrides"] = [{
      email: "viewer@example.test", position: null, commissionMode: null, total: 128,
      items: Array.from({ length: 128 }, () => ({ title: "Provize", amount: 1 })),
    }];
    expect(cashflowShadowBudgetFailure(snapshot({ teamEntriesRaw: entries(50, { productKey: "flexi", managerOverrides }) }), asOf)).toBeNull();
    expect(cashflowShadowBudgetFailure(snapshot({ teamEntriesRaw: entries(75, { productKey: "flexi", managerOverrides }) }), asOf)).toBeNull();
    expect(cashflowShadowBudgetFailure(snapshot({ teamEntriesRaw: entries(76, { productKey: "flexi", managerOverrides }) }), asOf)).toBe("output_estimate");
  });

  it("bounds saved payout associations and their quadratic matching work", () => {
    const cashflowPayoutMatches = Array.from({ length: 500 }, () => ({
      payoutKey: "synthetic", payoutSignature: "synthetic", plannedCode: "B101", plannedMonthKey: "2026-09",
      plannedPeriodStart: "2026-09-01", plannedFrequency: "monthly" as const,
      writtenBy: "viewer@example.test", writtenAtMs: 1, actorEmail: "viewer@example.test",
    }));
    expect(cashflowShadowBudgetFailure(snapshot({ ownEntries: entries(6, { cashflowPayoutMatches }) }), asOf)).toBeNull();
    expect(cashflowShadowBudgetFailure(snapshot({ ownEntries: entries(7, { cashflowPayoutMatches }) }), asOf)).toBe("payout_matching");
    expect(cashflowShadowBudgetFailure(snapshot({ ownEntries: [entry({ cashflowPayoutMatches: [...cashflowPayoutMatches, cashflowPayoutMatches[0]] })] }), asOf)).toBe("entry_shape");
    expect(cashflowShadowBudgetFailure(snapshot({ ownEntries: [entry({ cashflowPayoutMatches: {} as EntryDoc["cashflowPayoutMatches"] })] }), asOf)).toBe("entry_shape");
  });

  it("rejects invalid reference time and malformed legacy arrays", () => {
    expect(isCashflowShadowWithinBudget(snapshot(), new Date(NaN))).toBe(false);
    expect(isCashflowShadowWithinBudget(snapshot(), new Date("2500-01-01"))).toBe(false);
    const malformed = entry({ items: {} as EntryDoc["items"] });
    expect(isCashflowShadowWithinBudget(snapshot({ ownEntries: [malformed] }), asOf)).toBe(false);
  });
});
