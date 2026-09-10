import styles from "./homeWidgets.module.css";
import { HeartPulse, Layers3, Trophy } from "lucide-react";
import { AnimatedMoney } from "./AnimatedNumbers";

import { type AppLanguage } from "@/lib/appLanguage";
import { type TeamLeaderboardEntry } from "../types";

type Props = {
  language: AppLanguage;
  loading: boolean;
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
    empty: "Pro zvolené období a typ produktu zatím nemá tým žádnou produkci.",
    premium: "Pojistné",
  },
};

export function TeamLeaderboardSection({
  language,
  loading,
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
  return (
    <section className={`${styles.card} ${isLiteUI ? "" : styles.elevated}`} data-fixed-box-theme="slate">
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
      {loading ? <div className={`${styles.empty} ${styles.loading}`} role="status"><span className={styles.spinner} aria-hidden="true" />{copy.loading}</div>
        : entries.length === 0 ? <p className={styles.empty}>{copy.empty}</p>
        : <ol className={styles.rankList}>
          {visibleEntries.map((row, index) => <li key={row.email} className={styles.rankRow}>
            <span className={styles.rankBadge}>{index + 1}</span>
            <div className="min-w-0"><div className={styles.rankName} title={row.name}>{row.name}</div><div className={styles.rankDetail}>{leaderboardLabel}</div></div>
            <div className={styles.rankAmount}><small>{copy.premium} · {lbProductFilter === "life" ? "měsíčně" : "ročně"}</small><strong><AnimatedMoney value={row.totalPremium} /></strong></div>
          </li>)}
        </ol>}
    </section>
  );
}
