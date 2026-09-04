export type TeamDashboardMetrics = {
  contracts: number;
  annualPremium: number;
  monthlyPremium: number;
};

export type TeamDashboardCategory =
  | "life"
  | "auto"
  | "property"
  | "business"
  | "travel"
  | "foreigners"
  | "comfort"
  | "other";

export const TEAM_DASHBOARD_CATEGORIES: TeamDashboardCategory[] = [
  "life",
  "auto",
  "property",
  "business",
  "comfort",
  "foreigners",
  "travel",
  "other",
];

export type TeamDashboardMember = {
  email: string;
  name?: string | null;
  phoneNumber?: string | null;
  accountType?: "advisor" | "tipster" | null;
};

export type TeamDashboardContractStats = {
  month?: number | null;
  previousMonthToDate?: number | null;
  monthMetrics?: Partial<TeamDashboardMetrics> | null;
  previousMonthToDateMetrics?: Partial<TeamDashboardMetrics> | null;
  monthCategoryMetrics?: Partial<
    Record<TeamDashboardCategory, Partial<TeamDashboardMetrics>>
  > | null;
};

export type TeamDashboardSummary = {
  advisors: number;
  activeAdvisors: number;
  current: TeamDashboardMetrics;
  previousToDate: TeamDashboardMetrics;
  projected: TeamDashboardMetrics;
  currentByCategory: Record<TeamDashboardCategory, TeamDashboardMetrics>;
  projectedByCategory: Record<TeamDashboardCategory, TeamDashboardMetrics>;
  elapsedDays: number;
  daysInMonth: number;
};

export type TeamAttentionItem = {
  email: string;
  name: string;
  phoneNumber: string | null;
  reasons: string[];
  priority: number;
};

const finiteNonNegative = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizedMetrics = (
  metrics: Partial<TeamDashboardMetrics> | null | undefined,
  fallbackContracts: number
): TeamDashboardMetrics => ({
  contracts: finiteNonNegative(metrics?.contracts) || finiteNonNegative(fallbackContracts),
  annualPremium: finiteNonNegative(metrics?.annualPremium),
  monthlyPremium: finiteNonNegative(metrics?.monthlyPremium),
});

const addMetrics = (
  target: TeamDashboardMetrics,
  source: TeamDashboardMetrics
): void => {
  target.contracts += source.contracts;
  target.annualPremium += source.annualPremium;
  target.monthlyPremium += source.monthlyPremium;
};

const emptyMetrics = (): TeamDashboardMetrics => ({
  contracts: 0,
  annualPremium: 0,
  monthlyPremium: 0,
});

const emptyCategoryMetrics = (): Record<
  TeamDashboardCategory,
  TeamDashboardMetrics
> =>
  Object.fromEntries(
    TEAM_DASHBOARD_CATEGORIES.map((category) => [category, emptyMetrics()])
  ) as Record<TeamDashboardCategory, TeamDashboardMetrics>;

export const teamDashboardTrendPercent = (
  current: number,
  previous: number
): number | null => {
  if (previous <= 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
};

export function buildTeamDashboardSummary({
  members,
  contractCounts,
  lastActive,
  now = new Date(),
  activeWithinMs = 24 * 60 * 60 * 1000,
}: {
  members: TeamDashboardMember[];
  contractCounts: Record<string, TeamDashboardContractStats | undefined>;
  lastActive: Record<string, number | null | undefined>;
  now?: Date;
  activeWithinMs?: number;
}): TeamDashboardSummary {
  const advisorEmails = Array.from(
    new Set(
      members
        .filter((member) => member.accountType !== "tipster")
        .map((member) => member.email.trim().toLowerCase())
        .filter(Boolean)
    )
  );
  const current: TeamDashboardMetrics = {
    contracts: 0,
    annualPremium: 0,
    monthlyPremium: 0,
  };
  const previousToDate: TeamDashboardMetrics = {
    contracts: 0,
    annualPremium: 0,
    monthlyPremium: 0,
  };
  const currentByCategory = emptyCategoryMetrics();

  advisorEmails.forEach((email) => {
    const stats = contractCounts[email];
    addMetrics(current, normalizedMetrics(stats?.monthMetrics, stats?.month ?? 0));
    addMetrics(
      previousToDate,
      normalizedMetrics(
        stats?.previousMonthToDateMetrics,
        stats?.previousMonthToDate ?? 0
      )
    );
    TEAM_DASHBOARD_CATEGORIES.forEach((category) => {
      addMetrics(
        currentByCategory[category],
        normalizedMetrics(stats?.monthCategoryMetrics?.[category], 0)
      );
    });
  });

  const nowMs = now.getTime();
  const activeAdvisors = advisorEmails.filter((email) => {
    const timestamp = Number(lastActive[email]);
    return (
      Number.isFinite(timestamp) &&
      timestamp > 0 &&
      nowMs - timestamp >= 0 &&
      nowMs - timestamp <= activeWithinMs
    );
  }).length;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsedDays = Math.max(1, Math.min(now.getDate(), daysInMonth));
  const projectionFactor = daysInMonth / elapsedDays;
  const projectedByCategory = emptyCategoryMetrics();
  TEAM_DASHBOARD_CATEGORIES.forEach((category) => {
    const metrics = currentByCategory[category];
    projectedByCategory[category] = {
      contracts: Math.round(metrics.contracts * projectionFactor),
      annualPremium:
        Math.round(metrics.annualPremium * projectionFactor * 100) / 100,
      monthlyPremium:
        Math.round(metrics.monthlyPremium * projectionFactor * 100) / 100,
    };
  });

  return {
    advisors: advisorEmails.length,
    activeAdvisors,
    current,
    previousToDate,
    projected: {
      contracts: Math.round(current.contracts * projectionFactor),
      annualPremium: Math.round(current.annualPremium * projectionFactor * 100) / 100,
      monthlyPremium:
        Math.round(current.monthlyPremium * projectionFactor * 100) / 100,
    },
    currentByCategory,
    projectedByCategory,
    elapsedDays,
    daysInMonth,
  };
}

export function buildTeamAttentionItems({
  members,
  contractCounts,
  lastActive,
  currentUserEmail,
  now = new Date(),
}: {
  members: TeamDashboardMember[];
  contractCounts: Record<string, TeamDashboardContractStats | undefined>;
  lastActive: Record<string, number | null | undefined>;
  currentUserEmail?: string | null;
  now?: Date;
}): TeamAttentionItem[] {
  const ownEmail = String(currentUserEmail ?? "").trim().toLowerCase();
  const nowMs = now.getTime();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  return members
    .filter((member) => member.accountType !== "tipster")
    .map((member) => {
      const email = member.email.trim().toLowerCase();
      if (!email || email === ownEmail) return null;
      const stats = contractCounts[email];
      const currentContracts = finiteNonNegative(
        stats?.monthMetrics?.contracts ?? stats?.month
      );
      const previousContracts = finiteNonNegative(
        stats?.previousMonthToDateMetrics?.contracts ??
          stats?.previousMonthToDate
      );
      const timestamp = Number(lastActive[email]);
      const inactive =
        !Number.isFinite(timestamp) || timestamp <= 0 || nowMs - timestamp > fourteenDaysMs;
      const reasons: string[] = [];
      let priority = 0;

      if (currentContracts === 0) {
        reasons.push("Bez smlouvy tento měsíc");
        priority += 3;
      }
      if (
        previousContracts >= 2 &&
        currentContracts < previousContracts * 0.7
      ) {
        reasons.push(
          `Pokles produkce o ${Math.round(
            ((previousContracts - currentContracts) / previousContracts) * 100
          )} %`
        );
        priority += 2;
      }
      if (inactive) {
        reasons.push("Bez aktivity déle než 14 dní");
        priority += 2;
      }
      if (reasons.length === 0) return null;

      return {
        email,
        name: String(member.name ?? "").trim() || email,
        phoneNumber: String(member.phoneNumber ?? "").trim() || null,
        reasons,
        priority,
      } satisfies TeamAttentionItem;
    })
    .filter((item): item is TeamAttentionItem => item != null)
    .sort(
      (left, right) =>
        right.priority - left.priority || left.name.localeCompare(right.name, "cs")
    );
}
