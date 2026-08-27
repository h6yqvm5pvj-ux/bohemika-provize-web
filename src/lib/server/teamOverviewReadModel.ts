import type { AggregateMetrics, ContractStats } from "@/app/api/team-overview/teamOverview.types";

export const TEAM_OVERVIEW_MODEL_VERSION = 5;

const finiteNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const emptyAggregateMetrics = (): AggregateMetrics => ({
  contracts: 0,
  annualPremium: 0,
  monthlyPremium: 0,
});

export function buildTeamOverviewReadModelDocuments({
  ownerEmail,
  stat,
  activeStat,
  yearMonth,
  previousMonth,
  updatedAtMs,
}: {
  ownerEmail: string;
  stat: ContractStats;
  activeStat: ContractStats;
  yearMonth: string;
  previousMonth: string;
  updatedAtMs: number;
}) {
  return {
    totals: {
      version: TEAM_OVERVIEW_MODEL_VERSION,
      ownerEmail,
      total: finiteNumber(stat.total),
      categories: stat.categories,
      categoryMetrics: stat.categoryMetrics,
      institutionMetrics: stat.institutionMetrics,
      institutionByCategory: stat.institutionByCategory,
      activeContractStats: {
        total: finiteNumber(activeStat.total),
        categories: activeStat.categories,
        categoryMetrics: activeStat.categoryMetrics,
        institutionMetrics: activeStat.institutionMetrics,
        institutionByCategory: activeStat.institutionByCategory,
      },
      updatedAtMs,
    },
    currentMonth: {
      version: TEAM_OVERVIEW_MODEL_VERSION,
      ownerEmail,
      yearMonth,
      monthCount: finiteNumber(stat.month),
      previousMonthToDateCount: finiteNumber(stat.previousMonthToDate),
      monthMetrics: stat.monthMetrics ?? emptyAggregateMetrics(),
      activeMonthCount: finiteNumber(activeStat.month),
      activePreviousMonthToDateCount: finiteNumber(activeStat.previousMonthToDate),
      activeMonthMetrics: activeStat.monthMetrics ?? emptyAggregateMetrics(),
      updatedAtMs,
    },
    previousMonth: {
      version: TEAM_OVERVIEW_MODEL_VERSION,
      ownerEmail,
      yearMonth: previousMonth,
      monthCount: finiteNumber(stat.previousMonth),
      monthMetrics: stat.previousMonthMetrics ?? emptyAggregateMetrics(),
      activeMonthCount: finiteNumber(activeStat.previousMonth),
      activeMonthMetrics: activeStat.previousMonthMetrics ?? emptyAggregateMetrics(),
      updatedAtMs,
    },
  };
}
