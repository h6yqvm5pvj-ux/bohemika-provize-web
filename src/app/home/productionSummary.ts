import type { EntryDoc } from "./useHomeData";
import { entrySignedDate, normalizeToAnnual } from "./homeUtils";
import { summarizeProductionPremiums, type ProductionPremiums } from "./productionPremiums";
import { isInheritedContract } from "@/app/lib/inheritedContracts";
import { sumImmediateCommissionItems } from "@/app/lib/commissionTotals";

export type ProductionWindow = { from: number; split: number; to: number };
export type ProductionMonth = { count: number; immediate: number; premiums: ProductionPremiums };
export type MonthlyLeaderboardRow = { email: string; name: string | null; life: number; other: number; hasLife: boolean; hasOther: boolean };
export type HomeProductionSummary = {
  current: ProductionMonth;
  previous: ProductionMonth;
  leaderboard: MonthlyLeaderboardRow[];
};
export type OwnerProductionMonth = ProductionMonth & {
  managers: Record<string, number>;
  leaderboard: { life: number; other: number; hasLife: boolean; hasOther: boolean };
};
export type OwnerProductionSummary = { current: OwnerProductionMonth; previous: OwnerProductionMonth };

export function isHomeProductionSummary(value: unknown): value is HomeProductionSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as HomeProductionSummary;
  return [summary.current, summary.previous].every(month => month && Number.isSafeInteger(month.count) && month.count >= 0
    && Number.isFinite(month.immediate) && month.premiums && Number.isFinite(month.premiums.lifeMonthly) && Number.isFinite(month.premiums.otherAnnual))
    && Array.isArray(summary.leaderboard) && summary.leaderboard.every(row => row && typeof row.email === "string"
      && (row.name === null || typeof row.name === "string") && Number.isFinite(row.life) && Number.isFinite(row.other) && typeof row.hasLife === "boolean" && typeof row.hasOther === "boolean");
}

const emptyMonth = (): OwnerProductionMonth => ({
  count: 0, immediate: 0, premiums: { lifeMonthly: 0, otherAnnual: 0 },
  managers: {}, leaderboard: { life: 0, other: 0, hasLife: false, hasOther: false },
});

/** Shared arithmetic with the existing home view; no position-based recalculation. */
export function summarizeOwnerProduction(entries: readonly EntryDoc[], window: ProductionWindow): OwnerProductionSummary {
  const current = emptyMonth();
  const previous = emptyMonth();
  for (const entry of entries) {
    if (isInheritedContract(entry)) continue;
    const signed = entrySignedDate(entry)?.getTime();
    if (signed == null || signed < window.from || signed >= window.to) continue;
    const month = signed < window.split ? previous : current;
    month.count += 1;
    month.immediate += sumImmediateCommissionItems(entry.items ?? []);
    // Preserve the first snapshot per manager, just like Array.find in the UI.
    const seen = new Set<string>();
    for (const override of entry.managerOverrides ?? []) {
      const email = (override.email ?? "").toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      const items = override.items ?? [];
      const amount = items.length ? sumImmediateCommissionItems(items)
        : Number.isFinite(override.total) ? override.total! : 0;
      month.managers[email] = (month.managers[email] ?? 0) + amount;
    }
    const amount = entry.inputAmount;
    if (typeof amount === "number" && Number.isFinite(amount) && amount !== 0) {
      // These are the existing leaderboard categories, distinct from premium cards.
      const life = ["neon", "flexi", "maximaMaxEfekt", "pillowInjury"].includes(entry.productKey ?? "");
      if (life) { month.leaderboard.life += amount; month.leaderboard.hasLife = true; }
      else { month.leaderboard.other += normalizeToAnnual(amount, entry.frequencyRaw); month.leaderboard.hasOther = true; }
    }
  }
  current.premiums = summarizeProductionPremiums(entries, new Date(window.split), new Date(window.to));
  previous.premiums = summarizeProductionPremiums(entries, new Date(window.from), new Date(window.split));
  return { current, previous };
}

export function combineOwnerProduction(
  owners: { email: string; name: string | null; summary: OwnerProductionSummary }[],
  viewerEmail: string,
  scope: "my" | "team",
): HomeProductionSummary {
  const month = (key: "current" | "previous"): ProductionMonth => owners.reduce((total, owner) => {
    const value = owner.summary[key];
    total.count += value.count;
    total.immediate += scope === "my" ? value.immediate : value.managers[viewerEmail] ?? 0;
    total.premiums.lifeMonthly += value.premiums.lifeMonthly;
    total.premiums.otherAnnual += value.premiums.otherAnnual;
    return total;
  }, { count: 0, immediate: 0, premiums: { lifeMonthly: 0, otherAnnual: 0 } });
  return {
    current: month("current"), previous: month("previous"),
    leaderboard: scope === "team" ? owners.map(({ email, name, summary }) => ({ email, name, ...summary.current.leaderboard })) : [],
  };
}
