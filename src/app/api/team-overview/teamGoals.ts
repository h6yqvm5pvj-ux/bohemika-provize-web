import type {
  Category,
  ProductionGoal,
  TeamProductionGoals,
} from "./teamOverview.types";

export const TEAM_GOAL_CATEGORIES: Category[] = [
  "life",
  "auto",
  "property",
  "business",
  "comfort",
  "other",
];

export type TeamGoalMetric = "contracts" | "monthlyPremium" | "annualPremium";

export const TEAM_GOAL_CATEGORY_METRICS: Record<Category, TeamGoalMetric> = {
  life: "monthlyPremium",
  auto: "annualPremium",
  property: "annualPremium",
  business: "annualPremium",
  travel: "annualPremium",
  foreigners: "annualPremium",
  comfort: "contracts",
  other: "annualPremium",
};

export const TEAM_GOAL_CATEGORY_LABELS: Record<Category, string> = {
  life: "Životní pojištění",
  auto: "Auta",
  property: "Majetek a odpovědnost občanů",
  business: "Podnikatelé",
  travel: "Cestovní pojištění",
  foreigners: "Cizinci",
  comfort: "Zlato",
  other: "Ostatní",
};

const MAX_GOAL_AMOUNT = 1_000_000_000;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const goalAmount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(MAX_GOAL_AMOUNT, Math.round(parsed * 100) / 100);
};

const finiteTimestamp = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};

export const emptyGoalCategories = (): Record<Category, number> => ({
  life: 0,
  auto: 0,
  property: 0,
  business: 0,
  travel: 0,
  foreigners: 0,
  comfort: 0,
  other: 0,
});

export const emptyProductionGoal = (): ProductionGoal => ({
  totalAnnualPremium: 0,
  categories: emptyGoalCategories(),
});

export function normalizeProductionGoal(value: unknown): ProductionGoal {
  const row = isPlainObject(value) ? value : {};
  const rawCategories = isPlainObject(row.categories) ? row.categories : {};
  const categories = emptyGoalCategories();
  TEAM_GOAL_CATEGORIES.forEach((category) => {
    const amount = goalAmount(rawCategories[category]);
    categories[category] =
      TEAM_GOAL_CATEGORY_METRICS[category] === "contracts"
        ? Math.round(amount)
        : amount;
  });

  return {
    totalAnnualPremium: goalAmount(row.totalAnnualPremium),
    categories,
  };
}

export function normalizeStoredTeamProductionGoals({
  value,
  yearMonth,
}: {
  value: unknown;
  yearMonth: string;
}): TeamProductionGoals {
  const row = isPlainObject(value) ? value : {};
  const memberRows = Array.isArray(row.memberGoals) ? row.memberGoals : [];
  const members: Record<string, ProductionGoal> = {};

  memberRows.forEach((memberRow) => {
    if (!isPlainObject(memberRow)) return;
    const email = normalizeEmail(memberRow.email);
    if (!email) return;
    members[email] = normalizeProductionGoal(memberRow);
  });

  return {
    yearMonth,
    team: normalizeProductionGoal(row.teamGoal),
    members,
    updatedAtMs: finiteTimestamp(row.updatedAtMs),
  };
}

export function normalizeTeamProductionGoalsInput({
  value,
  yearMonth,
  allowedMemberEmails,
}: {
  value: unknown;
  yearMonth: string;
  allowedMemberEmails: Iterable<string>;
}): TeamProductionGoals | null {
  if (!isPlainObject(value)) return null;
  const allowed = new Set(
    [...allowedMemberEmails].map((email) => normalizeEmail(email)).filter(Boolean)
  );
  const rawMembers = isPlainObject(value.members) ? value.members : {};
  const members: Record<string, ProductionGoal> = {};

  for (const [rawEmail, rawGoal] of Object.entries(rawMembers)) {
    const email = normalizeEmail(rawEmail);
    if (!email || !allowed.has(email)) return null;
    members[email] = normalizeProductionGoal(rawGoal);
  }

  return {
    yearMonth,
    team: normalizeProductionGoal(value.team),
    members,
    updatedAtMs: null,
  };
}

export const productionGoalsFirestorePayload = ({
  ownerEmail,
  goals,
  updatedAtMs,
  updatedBy,
}: {
  ownerEmail: string;
  goals: TeamProductionGoals;
  updatedAtMs: number;
  updatedBy: string;
}) => ({
  version: 1,
  ownerEmail: normalizeEmail(ownerEmail),
  yearMonth: goals.yearMonth,
  teamGoal: normalizeProductionGoal(goals.team),
  memberGoals: Object.entries(goals.members)
    .map(([email, goal]) => ({
      email: normalizeEmail(email),
      ...normalizeProductionGoal(goal),
    }))
    .filter((row) => row.email)
    .sort((left, right) => left.email.localeCompare(right.email)),
  updatedAtMs,
  updatedBy: normalizeEmail(updatedBy),
});
