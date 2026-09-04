import { describe, expect, it } from "vitest";

import type { Category, ContractStats } from "@/app/api/team-overview/teamOverview.types";

import {
  buildTeamOverviewReadModelDocuments,
  TEAM_OVERVIEW_MODEL_VERSION,
} from "./teamOverviewReadModel";

const categories = (life: number): Record<Category, number> => ({
  life,
  auto: 0,
  property: 0,
  business: 0,
  travel: 0,
  foreigners: 0,
  comfort: 0,
  other: 0,
});

const stats = ({ total, month, previousMonth }: {
  total: number;
  month: number;
  previousMonth: number;
}): ContractStats => ({
  total,
  month,
  previousMonth,
  previousMonthToDate: previousMonth,
  monthMetrics: { contracts: month, annualPremium: month * 1_200, monthlyPremium: month * 100 },
  previousMonthMetrics: {
    contracts: previousMonth,
    annualPremium: previousMonth * 1_200,
    monthlyPremium: previousMonth * 100,
  },
  previousMonthToDateMetrics: {
    contracts: previousMonth,
    annualPremium: previousMonth * 1_200,
    monthlyPremium: previousMonth * 100,
  },
  monthCategoryMetrics: {
    life: { contracts: month, annualPremium: month * 1_200, monthlyPremium: month * 100 },
    auto: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    property: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    business: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    travel: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    foreigners: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    comfort: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    other: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
  },
  categories: categories(total),
  categoryMetrics: {
    life: { contracts: total, annualPremium: total * 1_200, monthlyPremium: total * 100 },
    auto: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    property: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    business: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    travel: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    foreigners: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    comfort: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    other: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
  },
  institutionMetrics: {
    Test: { contracts: total, annualPremium: total * 1_200, monthlyPremium: total * 100 },
  },
  institutionByCategory: {
    life: {
      Test: { contracts: total, annualPremium: total * 1_200, monthlyPremium: total * 100 },
    },
    auto: {},
    property: {},
    business: {},
    travel: {},
    foreigners: {},
    comfort: {},
    other: {},
  },
});

describe("team overview read-model documents", () => {
  it("zapíše aktivní součty a metriky do všech příslušných dokumentů", () => {
    const documents = buildTeamOverviewReadModelDocuments({
      ownerEmail: "advisor@example.com",
      stat: stats({ total: 5, month: 3, previousMonth: 2 }),
      activeStat: stats({ total: 3, month: 2, previousMonth: 1 }),
      yearMonth: "2026-08",
      previousMonth: "2026-07",
      updatedAtMs: 123_456,
    });

    expect(documents.totals.version).toBe(TEAM_OVERVIEW_MODEL_VERSION);
    expect(documents.totals.activeContractStats).toMatchObject({
      total: 3,
      categories: { life: 3 },
      institutionMetrics: { Test: { contracts: 3 } },
    });
    expect(documents.currentMonth).toMatchObject({
      activeMonthCount: 2,
      activePreviousMonthToDateCount: 1,
      activePreviousMonthToDateMetrics: {
        contracts: 1,
        annualPremium: 1_200,
        monthlyPremium: 100,
      },
      activeMonthMetrics: { contracts: 2, annualPremium: 2_400, monthlyPremium: 200 },
      activeMonthCategoryMetrics: {
        life: { contracts: 2, annualPremium: 2_400, monthlyPremium: 200 },
      },
    });
    expect(documents.previousMonth).toMatchObject({
      activeMonthCount: 1,
      activeMonthMetrics: { contracts: 1, annualPremium: 1_200, monthlyPremium: 100 },
    });
  });
});
