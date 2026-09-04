import { describe, expect, it } from "vitest";

import {
  buildTeamAttentionItems,
  buildTeamDashboardSummary,
  teamDashboardTrendPercent,
} from "./teamDashboard";

describe("team dashboard summary", () => {
  it("aggregates advisors without counting tipster-attributed contracts twice", () => {
    const now = new Date(2026, 8, 10, 12);
    const summary = buildTeamDashboardSummary({
      members: [
        { email: "manager@example.com", accountType: "advisor" },
        { email: "advisor@example.com", accountType: "advisor" },
        { email: "tipster@example.com", accountType: "tipster" },
      ],
      contractCounts: {
        "manager@example.com": {
          month: 2,
          previousMonthToDate: 1,
          monthMetrics: { contracts: 2, annualPremium: 24_000 },
          previousMonthToDateMetrics: { contracts: 1, annualPremium: 10_000 },
          monthCategoryMetrics: {
            life: { contracts: 2, annualPremium: 24_000 },
          },
        },
        "advisor@example.com": {
          month: 3,
          previousMonthToDate: 4,
          monthMetrics: { contracts: 3, annualPremium: 36_000 },
          previousMonthToDateMetrics: { contracts: 4, annualPremium: 40_000 },
          monthCategoryMetrics: {
            auto: { contracts: 3, annualPremium: 36_000 },
          },
        },
        "tipster@example.com": {
          month: 2,
          monthMetrics: { contracts: 2, annualPremium: 20_000 },
        },
      },
      lastActive: {
        "manager@example.com": now.getTime() - 60_000,
        "advisor@example.com": now.getTime() - 25 * 60 * 60 * 1000,
      },
      now,
    });

    expect(summary).toMatchObject({
      advisors: 2,
      activeAdvisors: 1,
      current: { contracts: 5, annualPremium: 60_000 },
      previousToDate: { contracts: 5, annualPremium: 50_000 },
      projected: { contracts: 15, annualPremium: 180_000 },
      currentByCategory: {
        life: { contracts: 2, annualPremium: 24_000 },
        auto: { contracts: 3, annualPremium: 36_000 },
      },
      projectedByCategory: {
        life: { contracts: 6, annualPremium: 72_000 },
        auto: { contracts: 9, annualPremium: 108_000 },
      },
      elapsedDays: 10,
      daysInMonth: 30,
    });
  });

  it("falls back to count fields and describes a new result without infinity", () => {
    const summary = buildTeamDashboardSummary({
      members: [{ email: "advisor@example.com", accountType: "advisor" }],
      contractCounts: {
        "advisor@example.com": { month: 2, previousMonthToDate: 0 },
      },
      lastActive: {},
      now: new Date(2026, 1, 28),
    });

    expect(summary.current.contracts).toBe(2);
    expect(summary.projected.contracts).toBe(2);
    expect(teamDashboardTrendPercent(2, 0)).toBeNull();
    expect(teamDashboardTrendPercent(0, 0)).toBe(0);
    expect(teamDashboardTrendPercent(12, 10)).toBe(20);
  });

  it("prioritizes inactive advisors without production and excludes the manager", () => {
    const now = new Date(2026, 8, 10, 12);
    const items = buildTeamAttentionItems({
      members: [
        { email: "manager@example.com", name: "Manager", accountType: "advisor" },
        {
          email: "inactive@example.com",
          name: "Inactive Advisor",
          phoneNumber: "+420 777 111 222",
          accountType: "advisor",
        },
        { email: "active@example.com", name: "Active Advisor", accountType: "advisor" },
        { email: "tipster@example.com", name: "Tipster", accountType: "tipster" },
      ],
      contractCounts: {
        "inactive@example.com": { month: 0, previousMonthToDate: 4 },
        "active@example.com": { month: 3, previousMonthToDate: 3 },
      },
      lastActive: {
        "inactive@example.com": now.getTime() - 15 * 24 * 60 * 60 * 1000,
        "active@example.com": now.getTime() - 60_000,
      },
      currentUserEmail: "manager@example.com",
      now,
    });

    expect(items).toEqual([
      {
        email: "inactive@example.com",
        name: "Inactive Advisor",
        phoneNumber: "+420 777 111 222",
        priority: 7,
        reasons: [
          "Bez smlouvy tento měsíc",
          "Pokles produkce o 100 %",
          "Bez aktivity déle než 14 dní",
        ],
      },
    ]);
  });
});
