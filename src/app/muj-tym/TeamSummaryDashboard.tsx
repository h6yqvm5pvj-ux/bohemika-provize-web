import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  FileCheck2,
  Minus,
  TrendingUp,
  UsersRound,
} from "lucide-react";

import { formatMoney as formatMoneyValue } from "@/app/lib/formatters";
import type { ProductionGoal } from "@/app/api/team-overview/teamOverview.types";
import { ProductionGoalProgress } from "./ProductionGoalProgress";
import { TeamAttentionPanel } from "./TeamAttentionPanel";
import {
  teamDashboardTrendPercent,
  type TeamAttentionItem,
  type TeamDashboardSummary,
} from "./teamDashboard";

type TeamSummaryDashboardProps = {
  summary: TeamDashboardSummary;
  statsUnavailable: boolean;
  contractScope: "all" | "active";
  onContractScopeChange: (scope: "all" | "active") => void;
  attentionItems: TeamAttentionItem[];
  teamGoal: ProductionGoal;
  canEditGoals: boolean;
  onEditGoals: () => void;
  onOpenMember: (email: string) => void;
};

const metricMoney = (value: number): string =>
  formatMoneyValue(value, { nonPositiveAsEmpty: true }) || "0 Kč";

const metricAmount = (value: number): string =>
  metricMoney(value).replace(/\s+Kč$/, "");

const monthLabel = (date: Date): string =>
  new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" }).format(date);

const comparisonPeriodLabel = (now: Date): string => {
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousLastDay = new Date(
    previousMonth.getFullYear(),
    previousMonth.getMonth() + 1,
    0
  ).getDate();
  const previousDay = Math.min(now.getDate(), previousLastDay);
  const currentMonth = new Intl.DateTimeFormat("cs-CZ", { month: "numeric" }).format(now);
  const previousMonthLabel = new Intl.DateTimeFormat("cs-CZ", {
    month: "numeric",
  }).format(previousMonth);

  return `1.–${now.getDate()}. ${currentMonth} proti 1.–${previousDay}. ${previousMonthLabel}`;
};

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  const trend = teamDashboardTrendPercent(current, previous);
  const direction = trend == null ? "new" : trend > 0 ? "up" : trend < 0 ? "down" : "flat";
  const Icon =
    direction === "up"
      ? ArrowUpRight
      : direction === "down"
        ? ArrowDownRight
        : Minus;
  const label = trend == null ? "Nové" : `${trend > 0 ? "+" : ""}${trend} %`;
  const className =
    direction === "up" || direction === "new"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : direction === "down"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-bold ${className}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
      {label}
    </span>
  );
}

export function TeamSummaryDashboard({
  summary,
  statsUnavailable,
  contractScope,
  onContractScopeChange,
  attentionItems,
  teamGoal,
  canEditGoals,
  onEditGoals,
  onOpenMember,
}: TeamSummaryDashboardProps) {
  const now = new Date();
  const activeShare =
    summary.advisors > 0
      ? Math.min(100, Math.round((summary.activeAdvisors / summary.advisors) * 100))
      : 0;

  return (
    <section className="overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_24px_58px_rgba(76,29,149,0.10)]">
      <div className="relative overflow-hidden border-b border-violet-200/30 bg-[linear-gradient(135deg,#2e1065_0%,#6d28d9_58%,#8b5cf6_100%)] px-4 py-5 text-white sm:px-6">
        <span className="pointer-events-none absolute -right-16 -top-24 h-48 w-48 rounded-full bg-white/16 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-24 -left-16 h-44 w-44 rounded-full bg-fuchsia-300/18 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-100/75">
              Souhrnný dashboard
            </div>
            <h2 className="mt-1 text-3xl font-black tracking-tight !text-white sm:text-4xl">
              Celý tým
            </h2>
            <p className="mt-1 text-sm font-semibold !text-violet-100/85">
              Výsledky za {monthLabel(now)}
            </p>
          </div>

          <div
            className="inline-flex w-fit rounded-full border border-white/20 bg-white/10 p-1 backdrop-blur"
            role="group"
            aria-label="Rozsah smluv v týmovém souhrnu"
          >
            <button
              type="button"
              onClick={() => onContractScopeChange("all")}
              aria-pressed={contractScope === "all"}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                contractScope === "all"
                  ? "bg-white text-violet-900 shadow-sm"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              Všechny
            </button>
            <button
              type="button"
              onClick={() => onContractScopeChange("active")}
              aria-pressed={contractScope === "active"}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                contractScope === "active"
                  ? "bg-white text-violet-900 shadow-sm"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              Aktivní smlouvy
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 bg-[linear-gradient(180deg,#ffffff_0%,#fbfaff_100%)] p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="flex min-h-52 flex-col rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_10px_24px_rgba(76,29,149,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <FileCheck2 className="h-4.5 w-4.5" strokeWidth={2.2} aria-hidden="true" />
              </span>
              {!statsUnavailable ? (
                <TrendBadge
                  current={summary.current.contracts}
                  previous={summary.previousToDate.contracts}
                />
              ) : null}
            </div>
            <div className="mt-4 text-[11px] font-black uppercase leading-4 tracking-[0.12em] text-slate-500">
              Smlouvy · tento měsíc
            </div>
            <div className="mt-1.5 text-4xl font-black leading-none tabular-nums text-slate-950">
              {statsUnavailable ? "—" : summary.current.contracts}
            </div>
            <div className="mt-auto pt-4">
              <p className="rounded-xl bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-500">
                Minule ke stejnému dni:{" "}
                <span className="font-black text-slate-700">
                  {statsUnavailable ? "—" : `${summary.previousToDate.contracts} smluv`}
                </span>
              </p>
            </div>
          </article>

          <article className="flex min-h-52 flex-col rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_10px_24px_rgba(76,29,149,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <TrendingUp className="h-4.5 w-4.5" strokeWidth={2.2} aria-hidden="true" />
              </span>
              {!statsUnavailable ? (
                <TrendBadge
                  current={summary.current.annualPremium}
                  previous={summary.previousToDate.annualPremium}
                />
              ) : null}
            </div>
            <div className="mt-4 text-[11px] font-black uppercase leading-4 tracking-[0.12em] text-slate-500">
              Produkce · tento měsíc
            </div>
            <div
              className="mt-1.5 flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-slate-950"
              title={
                statsUnavailable
                  ? undefined
                  : metricMoney(summary.current.annualPremium)
              }
            >
              <span className="min-w-0 text-2xl font-black leading-none tracking-tight tabular-nums">
                {statsUnavailable ? "—" : metricAmount(summary.current.annualPremium)}
              </span>
              {!statsUnavailable ? (
                <span className="shrink-0 text-sm font-black text-slate-500">Kč</span>
              ) : null}
            </div>
            <div className="mt-auto pt-4">
              <p className="rounded-xl bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-500">
                Minule ke stejnému dni:{" "}
                <span className="font-black text-slate-700">
                  {statsUnavailable
                    ? "—"
                    : metricMoney(summary.previousToDate.annualPremium)}
                </span>
              </p>
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                Roční pojistné
              </p>
            </div>
          </article>

          <article className="flex min-h-52 flex-col rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_10px_24px_rgba(76,29,149,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <UsersRound className="h-4.5 w-4.5" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="shrink-0 whitespace-nowrap rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700">
                24 h
              </span>
            </div>
            <div className="mt-4 text-[11px] font-black uppercase leading-4 tracking-[0.12em] text-slate-500">
              Aktivní poradci
            </div>
            <div className="mt-1.5 flex items-baseline gap-2 text-slate-950">
              <span className="text-4xl font-black leading-none tabular-nums">
                {statsUnavailable ? "—" : summary.activeAdvisors}
              </span>
              <span className="text-sm font-bold text-slate-500">
                z {statsUnavailable ? "—" : summary.advisors}
              </span>
            </div>
            <div className="mt-auto pt-4">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span>Aktivita týmu</span>
                <span>{statsUnavailable ? "—" : `${activeShare} %`}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-sky-500 transition-[width] duration-500"
                  style={{ width: `${statsUnavailable ? 0 : activeShare}%` }}
                />
              </div>
            </div>
          </article>

          <article className="relative flex min-h-52 flex-col overflow-hidden rounded-2xl border border-violet-700 bg-[linear-gradient(135deg,#4c1d95_0%,#6d28d9_100%)] p-4 text-white shadow-[0_16px_34px_rgba(76,29,149,0.22)]">
            <span className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-white/16 blur-2xl" />
            <div className="relative z-10 flex items-start justify-between gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">
                <CalendarRange className="h-4.5 w-4.5" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-bold text-white/85">
                odhad
              </span>
            </div>
            <div className="relative z-10 mt-4 text-[11px] font-black uppercase leading-4 tracking-[0.12em] !text-violet-100/75">
              Odhad konce měsíce
            </div>
            <div className="relative z-10 mt-1.5 flex items-baseline gap-2 whitespace-nowrap !text-white">
              <span className="text-4xl font-black leading-none tabular-nums">
                {statsUnavailable ? "—" : summary.projected.contracts}
              </span>
              {!statsUnavailable ? (
                <span className="text-base font-black !text-violet-100">smluv</span>
              ) : null}
            </div>
            <div className="relative z-10 mt-auto pt-4">
              <p className="rounded-xl bg-white/10 px-2.5 py-2 text-xs font-semibold !text-violet-50">
                Odhad ročního pojistného:{" "}
                <span className="font-black !text-white">
                  {statsUnavailable
                    ? "—"
                    : metricMoney(summary.projected.annualPremium)}
                </span>
              </p>
            </div>
          </article>
        </div>

        <TeamAttentionPanel
          items={attentionItems}
          onOpenDetail={onOpenMember}
          statsUnavailable={statsUnavailable}
        />

        <ProductionGoalProgress
          title="Měsíční cíl celého týmu"
          subtitle="Skutečnost, zbývající objem a odhad podle aktuálního tempa."
          goal={teamGoal}
          currentByCategory={summary.currentByCategory}
          projectedByCategory={summary.projectedByCategory}
          canEdit={canEditGoals}
          onEdit={onEditGoals}
          statsUnavailable={statsUnavailable}
        />

        <div className="flex flex-col gap-2 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-xs font-semibold text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2">
            <Activity className="h-4 w-4 text-violet-600" strokeWidth={2.2} aria-hidden="true" />
            Srovnání stejného období: {comparisonPeriodLabel(now)}
          </span>
          <span>
            Odhad vychází z tempa za {summary.elapsedDays} z {summary.daysInMonth} dní.
          </span>
        </div>
      </div>
    </section>
  );
}
