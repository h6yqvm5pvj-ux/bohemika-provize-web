import { describe, expect, it } from "vitest";
import { combineOwnerProduction, summarizeOwnerProduction } from "./productionSummary";
import type { EntryDoc } from "./useHomeData";

const day = (month: number, date = 1) => new Date(2026, month - 1, date).getTime();
const window = { from: day(8), split: day(9), to: day(10) };
const entry = (id: string, patch: Partial<EntryDoc> = {}): EntryDoc => ({
  id, contractSignedDate: day(9, 10), createdAt: day(9, 12), productKey: "cppAuto",
  inputAmount: 1000, frequencyRaw: "quarterly", items: [{ code: "A101", title: "Provize", amount: 100 }], ...patch,
});

describe("monthly production arithmetic", () => {
  it("preserves signing precedence, created-date fallback, inherited exclusion and half-open boundaries", () => {
    const result = summarizeOwnerProduction([
      entry("current"), entry("previous", { contractSignedDate: window.from }),
      entry("fallback", { contractSignedDate: null }),
      entry("old-import", { contractSignedDate: day(7) }),
      entry("future", { contractSignedDate: window.to }),
      entry("inherited", { acquisitionType: "inherited" }),
      entry("no-date", { contractSignedDate: null, createdAt: null }),
    ], window);
    expect(result.current).toMatchObject({ count: 2, immediate: 200, premiums: { lifeMonthly: 0, otherAnnual: 8000 } });
    expect(result.previous).toMatchObject({ count: 1, immediate: 100, premiums: { lifeMonthly: 0, otherAnnual: 4000 } });
  });
  it("keeps snapshot manager commissions separate and uses total only when items are absent", () => {
    const result = summarizeOwnerProduction([entry("a", { managerOverrides: [
      { email: "Boss@example.test", items: [{ code: "A101", title: "Provize", amount: 30 }], total: 999 },
      { email: "boss@example.test", total: 999 }, { email: "another@example.test", total: 400 },
    ] }), entry("b", { managerOverrides: [{ email: "boss@example.test", total: 20 }] })], window);
    const owners = [{ email: "owner@example.test", name: "Poradce", summary: result }];
    expect(combineOwnerProduction(owners, "boss@example.test", "team").current.immediate).toBe(50);
    expect(combineOwnerProduction(owners, "missing@example.test", "team").current.immediate).toBe(0);
    expect(combineOwnerProduction(owners, "owner@example.test", "my").current.immediate).toBe(200);
    expect(JSON.stringify(combineOwnerProduction(owners, "boss@example.test", "team"))).not.toContain("another@example.test");
  });
  it("retains the distinct premium-card and leaderboard rules for life, other products and gold", () => {
    const result = summarizeOwnerProduction([
      entry("life", { productKey: "flexi", inputAmount: 1200, frequencyRaw: "annual" }),
      entry("auto"), entry("gold", { productKey: "comfortcc", inputAmount: 500, frequencyRaw: "monthly" }),
    ], window);
    expect(result.current.premiums).toEqual({ lifeMonthly: 1200, otherAnnual: 4000 });
    expect(result.current.leaderboard).toEqual({ life: 1200, other: 10000, hasLife: true, hasOther: true });
  });
  it("moves the entire contribution between months after a signing-date correction", () => {
    const before = summarizeOwnerProduction([entry("a")], window);
    const after = summarizeOwnerProduction([entry("a", { contractSignedDate: day(8, 31) })], window);
    expect(after.previous).toEqual(before.current);
    expect(after.current.count).toBe(0);
  });
  it("handles Czech DST and December/January using the supplied exact calendar boundaries", () => {
    const period = { from: Date.parse("2026-12-01T00:00:00+01:00"), split: Date.parse("2027-01-01T00:00:00+01:00"), to: Date.parse("2027-02-01T00:00:00+01:00") };
    const result = summarizeOwnerProduction([entry("dec", { contractSignedDate: period.split - 1 }), entry("jan", { contractSignedDate: period.split })], period);
    expect(result.current.count).toBe(1);
    expect(result.previous.count).toBe(1);
  });
});
