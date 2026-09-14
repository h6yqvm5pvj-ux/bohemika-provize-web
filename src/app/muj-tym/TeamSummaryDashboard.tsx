import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
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
import styles from "./team.module.css";
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
  return (
    <span className={styles.trend} data-direction={direction}>
      <Icon size={12} strokeWidth={2} aria-hidden="true" />
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
    <section className={styles.summary} aria-label="Přehled výsledků týmu">
      <div className={styles.summaryHeader}>
        <div>
          <h2 className={styles.summaryTitle}>Tým v kostce</h2>
          <div className={styles.period}>
            <CalendarDays size={13} aria-hidden="true" />
            <span>{monthLabel(now)}</span>
          </div>
        </div>
        <div className={styles.scope} role="group" aria-label="Rozsah smluv v týmovém souhrnu">
          <button type="button" onClick={() => onContractScopeChange("all")} aria-pressed={contractScope === "all"}>
            Všechny smlouvy
          </button>
          <button type="button" onClick={() => onContractScopeChange("active")} aria-pressed={contractScope === "active"}>
            Aktivní smlouvy
          </button>
        </div>
      </div>

      <div className={styles.metrics}>
        <article className={styles.metric}>
          <div className={styles.metricTop}>
            <span className={styles.metricIcon}><FileCheck2 size={17} aria-hidden="true" /></span>
            {!statsUnavailable ? <TrendBadge current={summary.current.contracts} previous={summary.previousToDate.contracts} /> : null}
          </div>
          <h3 className={styles.metricLabel}>Smlouvy tento měsíc</h3>
          <div className={styles.metricValue}>{statsUnavailable ? "—" : summary.current.contracts}</div>
          <p className={styles.metricFoot}>Minule ke stejnému dni<br /><strong>{statsUnavailable ? "—" : `${summary.previousToDate.contracts} smluv`}</strong></p>
        </article>

        <article className={styles.metric}>
          <div className={styles.metricTop}>
            <span className={styles.metricIcon} data-tone="green"><TrendingUp size={17} aria-hidden="true" /></span>
            {!statsUnavailable ? <TrendBadge current={summary.current.annualPremium} previous={summary.previousToDate.annualPremium} /> : null}
          </div>
          <h3 className={styles.metricLabel}>Produkce · roční pojistné</h3>
          <div className={`${styles.metricValue} ${styles.moneyValue}`} title={statsUnavailable ? undefined : metricMoney(summary.current.annualPremium)}>
            {statsUnavailable ? "—" : metricAmount(summary.current.annualPremium)}
            {!statsUnavailable ? <small>Kč</small> : null}
          </div>
          <p className={styles.metricFoot}>Minule ke stejnému dni<br /><strong>{statsUnavailable ? "—" : metricMoney(summary.previousToDate.annualPremium)}</strong></p>
        </article>

        <article className={styles.metric}>
          <div className={styles.metricTop}>
            <span className={styles.metricIcon}><UsersRound size={17} aria-hidden="true" /></span>
            <span className={styles.metricTag}>24 h</span>
          </div>
          <h3 className={styles.metricLabel}>Aktivní poradci</h3>
          <div className={styles.metricValue}>
            {statsUnavailable ? "—" : summary.activeAdvisors}
            <small>z {statsUnavailable ? "—" : summary.advisors}</small>
          </div>
          <div className={styles.metricFoot}>
            <div className={styles.activityLine}><span>Aktivita týmu</span><strong>{statsUnavailable ? "—" : `${activeShare} %`}</strong></div>
            <div className={styles.track}><span style={{ width: `${statsUnavailable ? 0 : activeShare}%` }} /></div>
          </div>
        </article>

        <article className={`${styles.metric} ${styles.featured}`}>
          <div className={styles.metricTop}>
            <span className={styles.metricIcon}><CalendarRange size={17} aria-hidden="true" /></span>
            <span className={styles.metricTag}>odhad</span>
          </div>
          <h3 className={styles.metricLabel}>Na konci měsíce</h3>
          <div className={styles.metricValue}>
            {statsUnavailable ? "—" : summary.projected.contracts}
            {!statsUnavailable ? <small>smluv</small> : null}
          </div>
          <p className={styles.metricFoot}>Odhad ročního pojistného<br /><strong>{statsUnavailable ? "—" : metricMoney(summary.projected.annualPremium)}</strong></p>
        </article>
      </div>

      <ProductionGoalProgress
        title="Kam tento měsíc míříme"
        subtitle="Plnění společných cílů a výhled podle aktuálního tempa."
        goal={teamGoal}
        currentByCategory={summary.currentByCategory}
        projectedByCategory={summary.projectedByCategory}
        canEdit={canEditGoals}
        onEdit={onEditGoals}
        statsUnavailable={statsUnavailable}
      />

      <TeamAttentionPanel items={attentionItems} onOpenDetail={onOpenMember} statsUnavailable={statsUnavailable} />

      <div className={styles.note}>
        <span><Activity size={12} aria-hidden="true" /> Srovnání: {comparisonPeriodLabel(now)}</span>
        <span>Odhad vychází z tempa za {summary.elapsedDays} z {summary.daysInMonth} dní.</span>
      </div>
    </section>
  );
}
