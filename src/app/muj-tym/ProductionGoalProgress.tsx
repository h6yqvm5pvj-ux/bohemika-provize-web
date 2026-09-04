import { CheckCircle2, Flag, Settings2, Sparkles } from "lucide-react";

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
    <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_14px_32px_rgba(76,29,149,0.07)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-violet-700">
            <Flag className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            Cíle a predikce
          </div>
          <h3 className="mt-1 text-xl font-black text-slate-950">{title}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="ui-focus inline-flex items-center justify-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800 transition hover:border-violet-300 hover:bg-violet-100"
          >
            <Settings2 className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
            Nastavit cíle
          </button>
        ) : null}
      </div>

      {configuredRows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 px-4 py-5 text-center">
          <Sparkles className="mx-auto h-5 w-5 text-violet-500" aria-hidden="true" />
          <div className="mt-2 text-sm font-bold text-slate-800">
            Pro tento měsíc zatím není nastavený cíl.
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="ui-focus mt-3 rounded-full bg-violet-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-violet-800"
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
          <div className="mt-1 text-xs font-semibold text-slate-500">
            Aktuální plnění a predikci se nepodařilo načíst.
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
                Nastavené cíle
              </div>
              <div className="mt-1 text-lg font-black tabular-nums text-slate-950">
                {categoryCount(configuredRows.length)}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-emerald-700">
                Splněno
              </div>
              <div className="mt-1 text-lg font-black tabular-nums text-emerald-800">
                {completedPercent} %
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-amber-700">
                Zbývá splnit
              </div>
              <div className="mt-1 text-lg font-black tabular-nums text-amber-900">
                {remainingCategories > 0
                  ? `${remainingCategories} z ${configuredRows.length}`
                  : "Vše splněno"}
              </div>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-violet-700">
                Odhad výsledku
              </div>
              <div className="mt-1 text-lg font-black tabular-nums text-violet-900">
                {projectedPercent} %
              </div>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-600">
              <span>Průměrné plnění nastavených kategorií</span>
              <span>{completedPercent} %</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  completedPercent >= 100 ? "bg-emerald-500" : "bg-violet-600"
                }`}
                style={{ width: `${Math.min(100, completedPercent)}%` }}
              />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              Rozpad podle produktů
            </div>
            {categoryRows.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {categoryRows.map((row) => {
                  const progress = percentOf(row.current, row.target);
                  return (
                    <div
                      key={row.category}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <GoalCategoryIcon category={row.category} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-slate-900">
                              {row.label}
                            </div>
                            <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
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
                          <span className="shrink-0 text-xs font-black tabular-nums text-violet-700">
                            {row.target > 0 ? `${progress} %` : "—"}
                          </span>
                        )}
                      </div>
                      {row.target > 0 ? (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${
                              progress >= 100 ? "bg-emerald-500" : "bg-violet-500"
                            }`}
                            style={{ width: `${Math.min(100, progress)}%` }}
                          />
                        </div>
                      ) : null}
                      <div className="mt-1.5 text-[10px] font-semibold text-slate-400">
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
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">
                Zatím není produkce ani cíle v jednotlivých kategoriích.
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
