import { formatMoney } from "../helpers";
import { BrainCircuit, CalendarRange, CircleHelp } from "lucide-react";
import styles from "../cashflowToolbar.module.css";

type CashflowHeaderProps = {
  totalCashflow: number;
  hasPaidMonthTotals?: boolean;
  forecastYears: number;
  intelligentPredictionEnabled: boolean;
  showPastYears: boolean;
  onTogglePastYears: () => void;
  onOpenPredictionInfo: () => void;
  onOpenHelp: () => void;
  tipsterMode?: boolean;
};

export function CashflowHeader({
  totalCashflow,
  hasPaidMonthTotals = false,
  forecastYears,
  intelligentPredictionEnabled,
  showPastYears,
  onTogglePastYears,
  onOpenPredictionInfo,
  onOpenHelp,
  tipsterMode = false,
}: CashflowHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <h1>{tipsterMode ? "Provizní kalendář TIPŮ" : "Provizní kalendář"}</h1>
        <p>{tipsterMode
          ? "Provize ze sjednaných tipů v jednom přehledu."
          : "Výplaty provizí a výhled na další měsíce."}</p>
      </div>

      <div className={styles.total}>
        <span className={styles.totalLabel}>{tipsterMode
          ? "Celkem očekávané TIP provize"
          : hasPaidMonthTotals ? "Celkem cashflow" : "Celkem očekávané cashflow"}</span>
        <strong className={styles.totalAmount}>{formatMoney(totalCashflow)}</strong>
        <p className={styles.totalPeriod}>{showPastYears
          ? `Včetně minulých let · výhled na ${forecastYears} let`
          : `Letošní rok + výhled na ${forecastYears} let`}</p>
        {intelligentPredictionEnabled && !tipsterMode && <span className={styles.predictionNote}>S inteligentní predikcí</span>}
      </div>

      <div className={`${styles.actions} ${tipsterMode ? styles.tipsterActions : ""}`}>
        {!tipsterMode && <button type="button" onClick={onOpenPredictionInfo}
          className={`${styles.action} ${intelligentPredictionEnabled ? styles.actionActive : ""}`}>
          <BrainCircuit size={15} aria-hidden="true" />
          {intelligentPredictionEnabled ? "Predikce zapnutá" : "Inteligentní predikce"}
        </button>}
        <button type="button" onClick={onTogglePastYears} aria-pressed={showPastYears}
          className={`${styles.action} ${showPastYears ? styles.actionActive : ""}`}>
          <CalendarRange size={15} aria-hidden="true" />Předchozí roky
        </button>
        <button type="button" onClick={onOpenHelp}
          aria-label="Otevřít nápovědu k proviznímu kalendáři" title="Nápověda"
          className={`${styles.action} ${styles.help}`}>
          <CircleHelp size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
