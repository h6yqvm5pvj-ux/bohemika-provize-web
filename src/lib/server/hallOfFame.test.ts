import { describe, expect, it } from "vitest";
import { buildHallRankings, buildHallRankingsForPeriods, hallParticipantId, hallPeriodRanges, type HallProductionEntry } from "./hallOfFame";
import type { ContractStats } from "@/app/api/team-overview/teamOverview.types";
const stat = (annualPremium: number, contracts: number) => ({ categoryMetrics: { life: { annualPremium, contracts, monthlyPremium: annualPremium / 12 } } }) as ContractStats;
const members = [
  { email: "a@example.test", name: "Anna", profileAvatar: "" },
  { email: "b@example.test", name: "Boris", profileAvatar: "" },
  { email: "c@example.test", name: "Cyril", profileAvatar: "" },
];
describe("global hall rankings", () => {
  it("ranks everyone by premium, then count, without exposing contact or hierarchy data", () => {
    const rows = buildHallRankings(members, { "a@example.test": stat(100, 1), "b@example.test": stat(300, 1), "c@example.test": stat(300, 2) }).life;
    expect(rows.map((row) => [row.name, row.rank])).toEqual([["Cyril", 1], ["Boris", 2], ["Anna", 3]]);
    expect(rows[2].leaderRatioPct).toBe(33);
    expect(Object.keys(rows[0]).sort()).toEqual(["annualPremium", "contracts", "id", "leaderRatioPct", "name", "profileAvatar", "rank"].sort());
    expect(JSON.stringify(rows)).not.toContain("@example.test");
  });
  it("deduplicates identities and handles absent, invalid, and zero production", () => {
    const rankings = buildHallRankings([...members, members[0]], { "a@example.test": stat(0, 2), "b@example.test": stat(NaN, -1) });
    expect(rankings.life).toHaveLength(1);
    expect(rankings.life[0]).toMatchObject({ contracts: 2, annualPremium: 0, leaderRatioPct: 0 });
    expect(rankings.auto).toEqual([]);
    expect(hallParticipantId(" A@EXAMPLE.TEST ")).toBe(hallParticipantId("a@example.test"));
  });
});


describe("hall calendar periods", () => {
  it("uses Prague's local month and crosses year boundaries correctly", () => {
    const ranges = hallPeriodRanges(new Date("2025-12-31T23:30:00Z"));
    expect(ranges.month).toEqual({ key: "month", startDate: "2026-01-01", endDate: "2026-01-01" });
    expect(ranges["3months"]).toEqual({ key: "3months", startDate: "2025-10-01", endDate: "2025-12-31" });
    expect(ranges["6months"]).toEqual({ key: "6months", startDate: "2025-07-01", endDate: "2025-12-31" });
    expect(ranges.year).toEqual({ key: "year", startDate: "2025-01-01", endDate: "2025-12-31" });
    expect(hallPeriodRanges(new Date("2024-02-29T12:00:00Z")).month.endDate).toBe("2024-02-29");
    expect(hallPeriodRanges(new Date("2026-03-31T22:30:00Z")).month.startDate).toBe("2026-04-01");
  });
  it("includes boundary dates, excludes old and future entries, and deduplicates within each period", () => {
    const entry = (id: string, signedDate: string): HallProductionEntry => ({ id, signedDate, ownerEmail: members[0].email, category: "life", annualPremium: 100 });
    const current = entry("current", "2026-09-14");
    const results = buildHallRankingsForPeriods(members, [
      current, current, entry("month", "2026-09-01"), entry("quarter", "2026-06-01"),
      entry("before-quarter", "2026-05-31"), entry("half", "2026-03-01"),
      entry("before-half", "2026-02-28"), entry("year", "2025-09-01"), entry("completed-end", "2026-08-31"),
      entry("old", "2025-08-31"), entry("future", "2026-09-15"), entry("invalid", ""),
    ], new Date("2026-09-14T12:00:00Z"));
    expect(Object.values(results).map((result) => result.rankings.life[0].contracts)).toEqual([2, 2, 4, 6]);
    expect(results.year.rankings.life[0].annualPremium).toBe(600);
    expect(Object.keys(results.month.rankings)).toEqual(["life", "auto", "property", "business"]);
  });
  it("uses the same completed periods throughout November while the current month advances", () => {
    const ranges = hallPeriodRanges(new Date("2026-11-03T09:25:00Z"));
    expect(ranges).toEqual({
      month: { key: "month", startDate: "2026-11-01", endDate: "2026-11-03" },
      "3months": { key: "3months", startDate: "2026-08-01", endDate: "2026-10-31" },
      "6months": { key: "6months", startDate: "2026-05-01", endDate: "2026-10-31" },
      year: { key: "year", startDate: "2025-11-01", endDate: "2026-10-31" },
    });
    const monthEnd = hallPeriodRanges(new Date("2026-11-30T12:00:00Z"));
    for (const period of ["3months", "6months", "year"] as const) expect(monthEnd[period]).toEqual(ranges[period]);
    expect(monthEnd.month.endDate).toBe("2026-11-30");
  });
  it("includes leap day and switches completed periods at Czech midnight", () => {
    const before = hallPeriodRanges(new Date("2024-02-29T22:59:59Z"));
    const after = hallPeriodRanges(new Date("2024-02-29T23:00:00Z"));
    expect(before["3months"]).toEqual({ key: "3months", startDate: "2023-11-01", endDate: "2024-01-31" });
    expect(after["3months"]).toEqual({ key: "3months", startDate: "2023-12-01", endDate: "2024-02-29" });
    expect(after.month).toEqual({ key: "month", startDate: "2024-03-01", endDate: "2024-03-01" });
  });
});
