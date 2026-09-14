import { describe, expect, it } from "vitest";
import { calculateCppAuto } from "@/app/lib/productFormulas";
import { calculateProjection, defaultSettings, finiteNumber, goalProgress, normalizeSettings, projectionCsv, readDraft } from "./projectionModel";

const defaults = () => defaultSettings("poradce3", new Date(2026, 8, 1));
const autoPlan = () => ({ ...defaults(), production: { life: 0, auto: 12000, property: 0 } });

describe("projection planner", () => {
  it.each([0, 8, 11])("projects full years from start month %i without dropping the final months", month => {
    const settings = { ...autoPlan(), startMonth: `2026-${String(month + 1).padStart(2, "0")}`, horizon: 15 as const };
    const result = calculateProjection(settings);
    const immediate = calculateCppAuto(12000, "annual", settings.position).total;
    expect(result.months).toHaveLength(180);
    expect(result.years).toHaveLength(15);
    expect(result.months[0].date).toEqual(new Date(2026, month, 1));
    expect(result.months.at(-1)?.date).toEqual(new Date(2026, month + 179, 1));
    expect(result.months[0].total).toBe(0);
    expect(result.months[1].total).toBeCloseTo(immediate);
    expect(result.years[0].total).toBeCloseTo(11 * immediate);
    expect(result.years[1].total).toBeCloseTo(23 * immediate);
    expect(result.years.every(year => year.months.length === 12)).toBe(true);
  });

  it("keeps monthly, yearly, cumulative, product and own/team totals consistent", () => {
    const result = calculateProjection({ ...defaults(), mode: "team", managerProduction: { life: 5000, auto: 12000, property: 4000 }, members: [{ id: "one", name: "Poradce", position: "poradce1", production: { life: 3000, auto: 5000, property: 2500 } }] });
    expect(result.total).toBeGreaterThan(0);
    expect(result.total).toBeCloseTo(result.years.reduce((sum, year) => sum + year.total, 0));
    expect(result.total).toBeCloseTo(result.months.at(-1)!.cumulative);
    for (const month of result.months) {
      expect(month.total).toBeCloseTo(month.life + month.auto + month.property);
      expect(month.total).toBeCloseTo(month.own + month.team);
    }
  });

  it("applies new-production growth only after 12 months and separately from renewals", () => {
    const settings = { ...autoPlan(), growth: 10 };
    const result = calculateProjection(settings);
    const commission = calculateCppAuto(12000, "annual", settings.position).total;
    expect(result.months[12].total).toBeCloseTo(commission);
    expect(result.months[13].total).toBeCloseTo(commission * 2.1);
    const declining = calculateProjection({ ...settings, growth: -20 });
    expect(declining.months[13].total).toBeCloseTo(commission * 1.8);
  });

  it("applies annual churn to renewals without reducing the first payout", () => {
    const settings = { ...autoPlan(), storno: { life: 0 as const, auto: 5 as const, property: 0 as const } };
    const result = calculateProjection(settings);
    const commission = calculateCppAuto(12000, "annual", settings.position).total;
    expect(result.months[1].total).toBeCloseTo(commission);
    expect(result.months[13].total).toBeCloseTo(commission * 1.95);
    expect(result.months[25].total).toBeCloseTo(commission * (1 + .95 + .95 ** 2));
  });

  it("makes the former automatic premium increases opt-in", () => {
    const settings = autoPlan();
    expect(settings.care).toBe(false);
    const normal = calculateProjection(settings);
    const care = calculateProjection({ ...settings, care: true });
    expect(care.years[0].total).toBe(normal.years[0].total);
    expect(care.years[1].total).toBeGreaterThan(normal.years[1].total);
  });

  it("counts only manager differential commissions, never the advisor's full payout", () => {
    const settings = autoPlan();
    const result = calculateProjection({ ...settings, mode: "team", managerPosition: "manazer4", members: [{ id: "one", name: "", position: "poradce1", production: settings.production }] });
    const manager = calculateCppAuto(12000, "annual", "manazer4").total;
    const advisor = calculateCppAuto(12000, "annual", "poradce1").total;
    expect(result.months[1].own).toBe(0);
    expect(result.months[1].team).toBeCloseTo(manager - advisor);
    const samePosition = calculateProjection({ ...settings, mode: "team", managerPosition: "manazer4", members: [{ id: "one", name: "", position: "manazer4", production: settings.production }] });
    expect(samePosition.total).toBe(0);
    const higherPosition = calculateProjection({ ...settings, mode: "team", managerPosition: "manazer4", members: [{ id: "one", name: "", position: "manazer10", production: settings.production }] });
    expect(higherPosition.total).toBe(0);
  });

  it("applies life commission mode and includes immediate life payouts", () => {
    const settings = { ...defaults(), production: { life: 5000, auto: 0, property: 0 } };
    const accelerated = calculateProjection(settings);
    const standard = calculateProjection({ ...settings, commissionMode: "standard" });
    expect(accelerated.months[1].life).toBeGreaterThan(0);
    expect(standard.months[1].life).toBeGreaterThan(0);
    expect(accelerated.months[1].life).not.toBe(standard.months[1].life);
  });

  it("has no invented output for zero production", () => {
    const result = calculateProjection(defaults());
    expect(result.total).toBe(0);
    expect(goalProgress(result, 50000)).toMatchObject({ reached: null, requiredScale: null, percent: 0 });
  });

  it("waits for 12 actual months before marking an income goal reached", () => {
    const result = calculateProjection(defaults());
    result.months.forEach(month => { month.total = 1000; });
    expect(goalProgress(result, 1000).reached).toEqual(result.months[11].date);
    expect(goalProgress(result, 2000).requiredScale).toBe(2);
    expect(goalProgress(result, 0).reached).toBeNull();
    result.months.forEach((month, index) => { month.total = index === 1 ? 10000 : 0; });
    expect(goalProgress(result, 1000).reached).toBeNull();
  });

  it("exports all months and comparison amounts with Czech Excel separators", () => {
    const result = calculateProjection(autoPlan());
    const csv = projectionCsv(result, result);
    const rows = csv.split("\r\n");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(rows).toHaveLength(121);
    expect(rows[1]).toBe("2026-09;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00");
    expect(rows.at(-1)?.startsWith("2036-08;")).toBe(true);
    expect(rows.every(row => row.split(";").length === 10)).toBe(true);
  });
});

describe("local projection drafts", () => {
  it("recovers safely from invalid, outdated or malformed drafts", () => {
    const initial = defaults();
    expect(readDraft("broken", initial)).toEqual({ settings: initial, baseline: null });
    expect(readDraft('{"version":0}', initial).settings).toEqual(initial);
    const normalized = normalizeSettings({ production: { life: Infinity, auto: -500, property: "1 000,5" }, position: "toString", managerPosition: "poradce1", startMonth: "2026-99", horizon: 100, members: Array(25).fill({}), storno: { life: 999 }, growth: 500 }, initial);
    expect(normalized.production).toEqual({ life: 0, auto: 0, property: 1000.5 });
    expect(normalized.position).toBe(initial.position);
    expect(normalized.managerPosition).toBe(initial.managerPosition);
    expect(normalized.startMonth).toBe(initial.startMonth);
    expect(normalized.horizon).toBe(10);
    expect(normalized.members).toHaveLength(20);
    expect(normalized.growth).toBe(30);
    expect(normalized.storno.life).toBe(0);
    expect(finiteNumber("NaN")).toBe(0);
  });

  it("restores independently saved settings and a named comparison", () => {
    const settings = autoPlan();
    const baseline = { name: "Původní plán", settings: { ...settings, growth: 5 } };
    const restored = readDraft(JSON.stringify({ version: 1, settings, baseline }), defaults());
    expect(restored).toEqual({ settings, baseline });
    restored.settings.production.auto = 100;
    expect(restored.baseline?.settings.production.auto).toBe(12000);
  });
});
