import { ArrowDown, Medal, Target, Trophy } from "lucide-react";
import { formatMoney } from "@/app/lib/formatters";
import type { HallCategory, HallRow } from "./hallOfFame.types";
import styles from "./hallOfFame.module.css";

type Props = {
  rows: HallRow[];
  currentUserId: string;
  category: HallCategory;
  onFindMe: () => void;
};

const CATEGORY_LABELS: Record<HallCategory, string> = {
  life: "Životní pojištění",
  auto: "Auto",
  property: "Majetek a odpovědnost",
  business: "Podnikatelé",
};

export function HallPersonalPosition({ rows, currentUserId, category, onFindMe }: Props) {
  const myIndex = rows.findIndex(row => row.id === currentUserId);
  const myRow = myIndex >= 0 ? rows[myIndex] : null;
  const nextRow = myIndex > 0 ? rows[myIndex - 1] : null;
  const isLeader = myIndex === 0;
  const divisor = category === "life" ? 12 : 1;
  const premiumLabel = category === "life" ? "Měsíční pojistné" : "Roční pojistné";
  const gap = nextRow && myRow ? Math.max(0, nextRow.annualPremium - myRow.annualPremium) / divisor : 0;
  // Amounts in the rest of the hall use whole crowns. Round the target up so
  // that a positive difference never appears as an already reached zero.
  const gapLabel = formatMoney(Math.ceil(gap));
  const progress = nextRow && myRow && nextRow.annualPremium > 0
    ? Math.min(100, Math.max(0, myRow.annualPremium / nextRow.annualPremium * 100))
    : isLeader ? 100 : 0;

  return (
    <section className={styles.personal} aria-label="Tvoje umístění">
      <div className={styles.personalIntro}>
        <div className={styles.personalRank}>
          {myRow ? <strong>{myRow.rank}<span>.</span></strong> : <Medal size={27} aria-hidden="true" />}
        </div>
        <div className={styles.personalIdentity}>
          <span className={styles.personalEyebrow}>Tvůj přehled</span>
          <h2>Tvoje umístění</h2>
          <p className={styles.personalCategory}>{CATEGORY_LABELS[category]} · {myRow
            ? `${myRow.rank}. místo z ${rows.length.toLocaleString("cs-CZ")}`
            : "Zatím bez umístění"}</p>
        </div>
        {myRow && <button type="button" className={styles.personalAction} onClick={onFindMe}>
          Najít mě v žebříčku <ArrowDown size={14} aria-hidden="true" />
        </button>}
      </div>

      <div className={styles.personalMetrics}>
        <div className={styles.personalMetric}>
          <p className={styles.personalMetricLabel}>Tvoje produkce</p>
          <strong className={styles.personalMetricValue}>{formatMoney((myRow?.annualPremium ?? 0) / divisor)}</strong>
          <p className={styles.personalMetricHint}>{premiumLabel}</p>
        </div>
        <div className={styles.personalMetric}>
          <p className={styles.personalMetricLabel}>Počet smluv</p>
          <strong className={styles.personalMetricValue}>{(myRow?.contracts ?? 0).toLocaleString("cs-CZ")}</strong>
          <p className={styles.personalMetricHint}>Ve zvoleném období</p>
        </div>
      </div>

      <div className={styles.personalGoal}>
        <p className={styles.personalGoalLabel}>{isLeader ? <Trophy size={14} aria-hidden="true" /> : <Target size={14} aria-hidden="true" />}
          {nextRow ? `Další meta · ${nextRow.rank}. místo` : isLeader ? "První příčka je tvoje" : "Tvůj další krok"}
        </p>
        <strong className={styles.personalGoalValue}>{nextRow
          ? gap > 0 ? gapLabel : "Stejná produkce"
          : isLeader ? "Jsi na vrcholu" : "Začni první smlouvou"}</strong>
        <p className={styles.personalGoalHint}>{nextRow
          ? gap > 0 ? `k dorovnání produkce · ${premiumLabel.toLocaleLowerCase("cs-CZ")}` : "O pořadí rozhodují další kritéria."
          : isLeader ? "Ve vybrané kategorii vedeš žebříček." : "V této kategorii zatím nemáš produkci."}</p>
        {myRow && <div className={styles.personalProgress} aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>}
      </div>
    </section>
  );
}
