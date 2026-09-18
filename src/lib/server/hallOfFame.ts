import { createHash } from "node:crypto";
import type { AggregateMetrics, Category } from "@/app/api/team-overview/teamOverview.types";
import type { HallCategory, HallPeriod, HallPeriodRange, HallPeriodResult, HallRankings, HallRow } from "@/app/sin-slavy/hallOfFame.types";

export type HallMember = { email: string; name: string; profileAvatar: string };
export type HallStats = { categoryMetrics: Partial<Record<Category, AggregateMetrics>> };
export type HallProductionEntry = { id: string; ownerEmail: string; category: Category; annualPremium: number; signedDate: string };
export const HALL_PERIOD_MONTHS: Record<HallPeriod, number> = { month: 1, "3months": 3, "6months": 6, year: 12 };
const dayFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" });
export const hallDayKey = (date: Date) => dayFormatter.format(date);

/** Calendar months through today, consistently in the application's Czech timezone. */
export function hallPeriodRanges(now: Date): Record<HallPeriod, HallPeriodRange> {
  const endDate = hallDayKey(now);
  const [year, month] = endDate.split("-").map(Number);
  return Object.fromEntries(Object.entries(HALL_PERIOD_MONTHS).map(([key, months]) => {
    const start = new Date(Date.UTC(year, month - months, 1));
    return [key, { key, startDate: start.toISOString().slice(0, 10), endDate }];
  })) as Record<HallPeriod, HallPeriodRange>;
}

/** Build every selectable period in one pass; switching periods needs no new database scan. */
export function buildHallRankingsForPeriods(members: HallMember[], entries: HallProductionEntry[], now: Date): Record<HallPeriod, HallPeriodResult> {
  return buildHallRankingsFromStats(members, aggregateHallEntries(entries, now), now);
}

export type HallPeriodStats = Record<HallPeriod, Record<string, HallStats>>;

export function aggregateHallEntries(entries: HallProductionEntry[], now: Date): HallPeriodStats {
  const ranges = hallPeriodRanges(now);
  const periods = Object.keys(ranges) as HallPeriod[];
  const stats = Object.fromEntries(periods.map((key) => [key, {}])) as Record<HallPeriod, Record<string, HallStats>>;
  const seen = new Set<string>();
  for (const entry of entries) {
    const owner = entry.ownerEmail.trim().toLowerCase();
    const id = `${owner}/${entry.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const period of periods) {
      const range = ranges[period];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.signedDate) || entry.signedDate < range.startDate || entry.signedDate > range.endDate) continue;
      const member = stats[period][owner] ??= { categoryMetrics: {} };
      const metric = member.categoryMetrics[entry.category] ??= { contracts: 0, annualPremium: 0, monthlyPremium: 0 };
      metric.contracts += 1;
      metric.annualPremium += amount(entry.annualPremium);
    }
  }
  return stats;
}

export function buildHallRankingsFromStats(members: HallMember[], stats: HallPeriodStats, now: Date): Record<HallPeriod, HallPeriodResult> {
  const ranges = hallPeriodRanges(now);
  const periods = Object.keys(ranges) as HallPeriod[];
  return Object.fromEntries(periods.map((key) => [key, { rankings: buildHallRankings(members, stats[key]), period: ranges[key] }])) as Record<HallPeriod, HallPeriodResult>;
}

const CATEGORIES: Record<HallCategory, Category[]> = {
  life: ["life"], auto: ["auto"], property: ["property", "travel", "foreigners", "other"], business: ["business"], gold: ["comfort"],
};
const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
export const hallParticipantId = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);

/** Only leaderboard fields leave the server; ownership and contacts stay private. */
export function buildHallRankings(
  members: HallMember[],
  stats: Record<string, HallStats | undefined>
): HallRankings {
  const unique = [...new Map(members.map((member) => [member.email.trim().toLowerCase(), member])).entries()];
  return Object.fromEntries(Object.entries(CATEGORIES).map(([category, sources]) => {
    const rows = unique.map(([email, member]) => {
      const metrics = sources.map((source) => stats[email]?.categoryMetrics?.[source]);
      return {
        id: hallParticipantId(email), name: member.name, profileAvatar: member.profileAvatar,
        contracts: metrics.reduce((sum, metric) => sum + amount(metric?.contracts), 0),
        annualPremium: metrics.reduce((sum, metric) => sum + amount(metric?.annualPremium), 0),
      };
    }).filter((row) => row.contracts > 0 || row.annualPremium > 0)
      .sort((a, b) => b.annualPremium - a.annualPremium || b.contracts - a.contracts || a.name.localeCompare(b.name, "cs") || a.id.localeCompare(b.id));
    const leader = rows[0]?.annualPremium ?? 0;
    return [category, rows.map((row, index): HallRow => ({ ...row, rank: index + 1, leaderRatioPct: leader > 0 ? Math.min(100, Math.round(row.annualPremium / leader * 100)) : 0 }))];
  })) as HallRankings;
}
