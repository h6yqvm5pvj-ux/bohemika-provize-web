export type HallCategory = "life" | "auto" | "property" | "gold";
export type HallRow = {
  id: string;
  rank: number;
  name: string;
  profileAvatar: string;
  contracts: number;
  annualPremium: number;
  leaderRatioPct: number;
};
export type HallRankings = Record<HallCategory, HallRow[]>;
export type HallPeriod = "month" | "3months" | "6months" | "year";
export type HallPeriodRange = { key: HallPeriod; startDate: string; endDate: string };
export type HallOfFameResponse = {
  ok: true;
  rankings: HallRankings;
  currentUserId: string;
  updatedAtMs: number;
  period: HallPeriodRange;
};
