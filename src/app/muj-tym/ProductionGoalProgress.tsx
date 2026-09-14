import { CheckCircle2, Target, Settings2, Sparkles } from "lucide-react";

import {
  TEAM_GOAL_CATEGORIES,
  TEAM_GOAL_CATEGORY_METRICS,
  TEAM_GOAL_CATEGORY_LABELS,
} from "@/app/api/team-overview/teamGoals";
import type { ProductionGoal } from "@/app/api/team-overview/teamOverview.types";
import { formatMoney as formatMoneyValue } from "@/app/lib/formatters";
import type {
  TeamDashboardCategory,
  TeamDashboardMetrics,
} from "./teamDashboard";
import { GoalCategoryIcon } from "./GoalCategoryIcon";
import styles from "./team.module.css";

type ProductionGoalProgressProps = {
  title: string;
  subtitle: string;
  goal: ProductionGoal;
  currentByCategory: Record<TeamDashboardCategory, TeamDashboardMetrics>;
  projectedByCategory: Record<TeamDashboardCategory, TeamDashboardMetrics>;
  canEdit: boolean;
  onEdit: () => void;
  statsUnavailable?: boolean;
};

const money = (value: number): string =>
  formatMoneyValue(value, { nonPositiveAsEmpty: true }) || "0 Kč";

const percentOf = (value: number, target: number): number =>
  target > 0 ? Math.round((value / target) * 100) : 0;

const metricValue = (
  category: TeamDashboardCategory,
  metrics: TeamDashboardMetrics
): number => metrics[TEAM_GOAL_CATEGORY_METRICS[category]];

const contractUnit = (value: number): string => {
  const rounded = Math.round(value);
  if (rounded === 1) return "smlouva";
  if (rounded >= 2 && rounded <= 4) return "smlouvy";
  return "smluv";
};

const formatMetric = (
  category: TeamDashboardCategory,
  value: number
): string =>
  TEAM_GOAL_CATEGORY_METRICS[category] === "contracts"
    ? `${Math.round(value).toLocaleString("cs-CZ")} ${contractUnit(value)}`
    : money(value);

const averageProgress = (
  rows: Array<{ target: number; value: number }>
): number => {
  if (rows.length === 0) return 0;
  const total = rows.reduce(
    (sum, row) => sum + Math.min(100, percentOf(row.value, row.target)),
    0
  );
  return Math.round(total / rows.length);
};

const categoryCount = (count: number): string => {
  if (count === 1) return "1 kategorie";
  if (count >= 2 && count <= 4) return `${count} kategorie`;
  return `${count} kategorií`;
};

export function ProductionGoalProgress({
  title,
  subtitle,
  goal,
  currentByCategory,
  projectedByCategory,
  canEdit,
  onEdit,
  statsUnavailable = false,
}: ProductionGoalProgressProps) {
  const categoryRows = TEAM_GOAL_CATEGORIES.map((category) => ({
    category,
    label: TEAM_GOAL_CATEGORY_LABELS[category],
    target: goal.categories[category] ?? 0,
    current: metricValue(category, currentByCategory[category]),
    projected: metricValue(category, projectedByCategory[category]),
  })).filter((row) => row.target > 0 || row.current > 0);
  const configuredRows = categoryRows.filter((row) => row.target > 0);
  const completedPercent = averageProgress(
    configuredRows.map((row) => ({ target: row.target, value: row.current }))
  );
  const projectedPercent = averageProgress(
    configuredRows.map((row) => ({ target: row.target, value: row.projected }))
  );
  const remainingCategories = configuredRows.filter(
    (row) => row.current < row.target
  ).length;

  return (
    <section className={styles.panel}>
      <div className={styles.goalsHeader}>
        <div className={styles.panelTitleGroup}>
          <span className={styles.panelIcon}><Target size={19} aria-hidden="true" /></span>
          <div>
            <h3 className={styles.panelTitle}>{title}</h3>
            <p className={styles.panelDescription}>{subtitle}</p>
          </div>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className={styles.contactAction}
          >
            <Settings2 className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
            Nastavit cíle
          </button>
        ) : null}
      </div>

      {configuredRows.length === 0 ? (
        <div className={`${styles.empty} mt-5`}>
          <Sparkles className="mx-auto h-5 w-5 text-violet-500" aria-hidden="true" />
          <div className="mt-2 text-sm font-bold text-slate-800">
            Pro tento měsíc zatím není nastavený cíl.
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className={`${styles.primaryAction} mt-3`}
            >
              Nastavit měsíční cíl
            </button>
          ) : null}
        </div>
      ) : statsUnavailable ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-sm font-bold text-slate-800">
            Nastaveno: {categoryCount(configuredRows.length)}
          </div>
          <div className="mt-1 text-xs font-semibold text-[#806b8d]">
            Aktuální plnění a predikci se nepodařilo načíst.
          </div>
        </div>
      ) : (
        <>
          <div className={styles.goalStats}>
            <div className={styles.goalStat}>
              <div className="text-[10px] font-bold  text-[#806b8d]">
                Nastavené cíle
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-slate-950">
                {categoryCount(configuredRows.length)}
              </div>
            </div>
            <div className={styles.goalStat} data-tone="green">
              <div className="text-[10px] font-bold  text-emerald-700">
                Splněno
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-800">
                {completedPercent} %
              </div>
            </div>
            <div className={styles.goalStat} data-tone="amber">
              <div className="text-[10px] font-bold  text-amber-700">
                Zbývá splnit
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-amber-900">
                {remainingCategories > 0
                  ? `${remainingCategories} z ${configuredRows.length}`
                  : "Vše splněno"}
              </div>
            </div>
            <div className={styles.goalStat}>
              <div className="text-[10px] font-bold  text-[#826397]">
                Odhad výsledku
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-violet-900">
                {projectedPercent} %
              </div>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between gap-3 text-xs font-bold text-[#7c648d]">
              <span>Průměrné plnění nastavených kategorií</span>
              <span className="shrink-0">{completedPercent} %</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  completedPercent >= 100 ? "bg-emerald-500" : "bg-[#a384c6]"
                }`}
                style={{ width: `${Math.min(100, completedPercent)}%` }}
              />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#806b8d]">
              Rozpad podle produktů
            </div>
            {categoryRows.length > 0 ? (
              <div className={styles.goalCategories}>
                {categoryRows.map((row) => {
                  const progress = percentOf(row.current, row.target);
                  return (
                    <div
                      key={row.category}
                      className={styles.goalCategory}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <GoalCategoryIcon category={row.category} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-[#685375]">
                              {row.label}
                            </div>
                            <div className="mt-0.5 text-[11px] font-semibold text-[#806b8d]">
                              {formatMetric(row.category, row.current)} /{" "}
                              {row.target > 0
                                ? formatMetric(row.category, row.target)
                                : "bez cíle"}
                            </div>
                          </div>
                        </div>
                        {row.target > 0 && progress >= 100 ? (
                          <CheckCircle2
                            className="h-5 w-5 shrink-0 text-emerald-500"
                            strokeWidth={2.2}
                            aria-label="Cíl splněn"
                          />
                        ) : (
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-[#826397]">
                            {row.target > 0 ? `${progress} %` : "—"}
                          </span>
                        )}
                      </div>
                      {row.target > 0 ? (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${
                              progress >= 100 ? "bg-emerald-500" : "bg-[#b295d0]"
                            }`}
                            style={{ width: `${Math.min(100, progress)}%` }}
                          />
                        </div>
                      ) : null}
                      <div className="mt-1.5 text-[10px] font-semibold text-[#857190]">
                        {row.target > 0
                          ? `Zbývá: ${formatMetric(
                              row.category,
                              Math.max(0, row.target - row.current)
                            )} · `
                          : ""}
                        Odhad: {formatMetric(row.category, row.projected)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-[#806b8d]">
                Zatím není produkce ani cíle v jednotlivých kategoriích.
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
