import { DataFreshness } from "./DataFreshness";
import styles from "./homeWidgets.module.css";
import { BarChart3, HeartPulse, Layers3, Trophy } from "lucide-react";
import { AnimatedMoney } from "./AnimatedNumbers";

import { type AppLanguage } from "@/lib/appLanguage";
import { type TeamLeaderboardEntry } from "../types";

type Props = {
  language: AppLanguage;
  loading: boolean;
  updatedAt?: number | null;
  error?: string | null;
  entries: TeamLeaderboardEntry[];
  leaderboardLabel: string;
  lbProductFilter: "life" | "other";
  lbRange: "month" | "sixMonths" | "year";
  onProductFilterChange: (val: "life" | "other") => void;
  onRangeChange: (val: "month" | "sixMonths" | "year") => void;
  isLiteUI: boolean;
};

const TEAM_LEADERBOARD_COPY: Record<
  AppLanguage,
  {
    kicker: string;
    title: string;
    life: string;
    other: string;
    month: string;
    sixMonths: string;
    year: string;
    loading: string;
    empty: string;
    premium: string;
  }
> = {
  cs: {
    kicker: "Týmový výkon",
    title: "Žebříček týmu",
    life: "Život",
    other: "Vedlejší produkty",
    month: "Tento měsíc",
    sixMonths: "6M",
    year: "12M",
    loading: "Načítám týmovou produkci…",
    empty: "Zatím bez produkce pro toto období.",
    premium: "Pojistné",
  },
};

export function TeamLeaderboardSection({
  language,
  loading,
  updatedAt,
  error,
  entries,
  leaderboardLabel,
  lbProductFilter,
  lbRange,
  onProductFilterChange,
  onRangeChange,
  isLiteUI,
}: Props) {
  const copy = TEAM_LEADERBOARD_COPY[language];
  const visibleEntries = entries.slice(0, 10);
  const leadingPremium = Math.max(0, ...visibleEntries.map(row => Number.isFinite(row.totalPremium) ? row.totalPremium : 0));
  const isEmpty = entries.length === 0 && !(error && !updatedAt) && !(loading && !updatedAt);
  const freshness = <DataFreshness updatedAt={updatedAt} refreshing={loading} error={error} />;
  return (
    <section className={`${styles.card} ${styles.leaderboard} ${isLiteUI ? "" : styles.elevated}`} data-fixed-box-theme="slate" data-empty={isEmpty} aria-label={copy.title}>
      <h2 className={styles.title}><span className={styles.icon}><Trophy aria-hidden="true" /></span>{copy.title}</h2>
      <div className={styles.filters}>
        <div className={styles.chips} role="group" aria-label="Typ produktu">
          <button type="button" aria-pressed={lbProductFilter === "life"} aria-label={copy.life} title={copy.life} onClick={() => onProductFilterChange("life")}><HeartPulse size={14} aria-hidden="true" />{copy.life}</button>
          <button type="button" aria-pressed={lbProductFilter === "other"} aria-label={copy.other} title={copy.other} onClick={() => onProductFilterChange("other")}><Layers3 size={14} aria-hidden="true" />Vedlejší</button>
        </div>
        <div className={styles.chips} role="group" aria-label="Období žebříčku">
          <button type="button" onClick={() => onRangeChange("month")} aria-pressed={lbRange === "month"}>{copy.month}</button>
          <button type="button" onClick={() => onRangeChange("sixMonths")} aria-pressed={lbRange === "sixMonths"}>{copy.sixMonths}</button>
          <button type="button" onClick={() => onRangeChange("year")} aria-pressed={lbRange === "year"}>{copy.year}</button>
        </div>
      </div>
      {!isEmpty && freshness}
      {error && !updatedAt ? null : loading && !updatedAt ? <div className={`${styles.empty} ${styles.loading}`} role="status"><span className={styles.spinner} aria-hidden="true" />{copy.loading}</div>
        : isEmpty ? <>
          <p className={styles.leaderboardEmpty}><BarChart3 size={16} aria-hidden="true" /><span>{copy.empty}</span></p>
          <div className={styles.emptyFreshness}>{freshness}</div>
        </>
        : <>
          <div className={styles.rankLegend}><span>{leaderboardLabel}</span><span>{copy.premium} · {lbProductFilter === "life" ? "měsíčně" : "ročně"}</span></div>
          <ol className={styles.rankList}>
            {visibleEntries.map((row, index) => <li key={row.email} className={styles.rankRow}>
              <span className={styles.rankBadge}>{index + 1}</span>
              <div className={styles.rankName} title={row.name}>{row.name}</div>
              <div className={styles.rankAmount}><strong><AnimatedMoney value={row.totalPremium} animate={!isLiteUI} /></strong></div>
              <div className={styles.rankTrack} aria-hidden="true"><span style={{ width: `${leadingPremium > 0 && Number.isFinite(row.totalPremium) ? Math.max(0, row.totalPremium) / leadingPremium * 100 : 0}%` }} /></div>
            </li>)}
          </ol>
        </>}
    </section>
  );
}
