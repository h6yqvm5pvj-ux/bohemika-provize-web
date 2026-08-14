import { type CommissionMode, type Position } from "@/app/types/domain";

export type LeaderboardProductFilter = "life" | "other";
export type LeaderboardRange = "month" | "sixMonths" | "year";
export type ChartMode = "personal" | "team" | "combined" | "specific";
export type PerformanceMode = "default" | "lite";
export type HomeSection =
  | "gold"
  | "summary"
  | "expectedPayout"
  | "goal"
  | "leaderboard"
  | "chart"
  | "quickActions";

export type TeamLeaderboardEntry = {
  email: string;
  name: string;
  totalPremium: number;
};

export type HomeWidgets = {
  productionSummary: boolean;
  expectedPayout: boolean;
  monthlyGoal: boolean;
  teamLeaderboard: boolean;
  productionChart: boolean;
  goldWidget: boolean;
  quickActions: boolean;
};

export type QuickAction = { key: string; title: string; href: string; category?: string; description?: string };

export type UserSettingsPayload = {
  homeLayout?: HomeSection[];
  homeWidgets?: HomeWidgets;
  homePerformanceMode?: PerformanceMode;
  homeQuickActions?: QuickAction[];
};

export type UserMetaBasic = {
  position?: Position;
  commissionMode?: CommissionMode | null;
  monthlyGoal?: number | null;
  managerEmail?: string | null;
};
