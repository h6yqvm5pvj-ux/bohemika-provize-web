import { useId, type CSSProperties } from "react";
import { CalendarDays, CalendarRange, Check, Layers3, Wallet } from "lucide-react";

import styles from "./CashflowInitialLoader.module.css";

type CashflowInitialLoaderProps = {
  completing: boolean;
  tipsterMode?: boolean;
  progress: number;
  stageText?: string | null;
  detailText?: string | null;
};

const MONTHS = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];
const STEPS = ["Načtení dat", "Výpočet provizí", "Sestavení kalendáře"];

export function CashflowInitialLoader({
  completing,
  tipsterMode = false,
  progress,
  stageText,
  detailText,
}: CashflowInitialLoaderProps) {
  const titleId = useId();
  const visibleProgress = completing
    ? 100
    : Math.max(0, Math.min(99, Math.round(Number.isFinite(progress) ? progress : 0)));
  const visibleStageText = completing
    ? "Hotovo. Otevírám kalendář."
    : stageText || (tipsterMode ? "Načítám TIP provize" : "Načítám provize");
  const currentStep = visibleProgress < 88 ? 0 : visibleProgress < 98 ? 1 : 2;
  const filledMonths = Math.floor((visibleProgress / 100) * MONTHS.length);

  return (
    <section className={styles.scene} aria-labelledby={titleId} data-complete={completing}>
      <header className={styles.header} aria-hidden="true">
        <span className={styles.sectionLabel}>
          <CalendarRange size={16} strokeWidth={1.8} />
          {tipsterMode ? "Provizní kalendář TIPŮ" : "Provizní kalendář"}
        </span>
        <span className={styles.liveLabel}>
          {completing ? <Check size={13} /> : <span className={styles.liveDot} />}
          {completing ? "Připraveno" : "Načítání"}
        </span>
      </header>

      <div className={styles.content}>
        <div className={styles.illustration} aria-hidden="true">
          <div className={styles.orbit} />
          <div className={styles.calendarStack}>
            <div className={styles.calendar}>
              <span className={`${styles.binding} ${styles.bindingLeft}`} />
              <span className={`${styles.binding} ${styles.bindingRight}`} />
              <div className={styles.calendarHeader}>
                <div>
                  <span className={styles.calendarEyebrow}>Měsíc po měsíci</span>
                  <span className={styles.calendarTitle}>Přehled provizí</span>
                </div>
                <span className={styles.calendarIcon}><CalendarDays size={21} strokeWidth={1.6} /></span>
              </div>
              <div className={styles.months}>
                {MONTHS.map((month, index) => (
                  <div
                    key={month}
                    className={styles.month}
                    data-filled={index < filledMonths}
                    data-current={!completing && index === filledMonths}
                    style={{ "--month-delay": `${index * 110}ms` } as CSSProperties}
                  >
                    <span className={styles.monthName}>{month}</span>
                    <span className={styles.monthAmount} />
                    <span className={styles.monthMarker} />
                  </div>
                ))}
              </div>
              <div className={styles.calendarFoot}><span /><span /><span /></div>
            </div>
          </div>

          <div className={`${styles.floatingCard} ${styles.contractCard}`}>
            <span className={styles.cardIcon}><Layers3 size={17} strokeWidth={1.7} /></span>
            <div><span className={styles.cardLabel}>{tipsterMode ? "Vaše tipy" : "Vaše smlouvy"}</span><span className={styles.skeletonLine} /></div>
            <span className={styles.cardSignal}>{visibleProgress >= 88 ? <Check size={12} /> : <span />}</span>
          </div>
          <div className={`${styles.floatingCard} ${styles.payoutCard}`}>
            <span className={styles.cardIcon}><Wallet size={17} strokeWidth={1.7} /></span>
            <div><span className={styles.cardLabel}>Výplaty provizí</span><span className={styles.skeletonLine} /></div>
            <span className={styles.payoutDots}><i /><i /><i /></span>
          </div>
        </div>

        <div className={styles.copy}>
          <h1 id={titleId}>{tipsterMode ? "TIP provize pod kontrolou." : "Provize pod kontrolou."}<br /><span>Měsíc po měsíci.</span></h1>
          <p>Připravujeme přehled výplat a očekávaných provizí.</p>
        </div>

        <div className={styles.loading}>
          <div className={styles.progressHeading}>
            <p className={styles.stage} role="status" aria-live="polite" aria-atomic="true">
              {completing ? <Check size={14} aria-hidden="true" /> : <span className={styles.loadingDots} aria-hidden="true"><i /><i /><i /></span>}
              <span>{visibleStageText}</span>
            </p>
            <span className={styles.percent} aria-hidden="true">{visibleProgress}<span> %</span></span>
          </div>
          <div
            className={styles.track}
            role="progressbar"
            aria-label="Načítání provizního kalendáře"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={visibleProgress}
            aria-valuetext={`${visibleProgress} % · ${visibleStageText}`}
          >
            <span className={styles.fill} style={{ width: `${visibleProgress}%` }} />
          </div>
          <p className={styles.detail}>{!completing && detailText ? detailText : "\u00a0"}</p>
        </div>
      </div>

      <ol className={styles.steps} aria-label="Postup přípravy kalendáře">
        {STEPS.map((step, index) => {
          const done = completing || index < currentStep;
          return (
            <li key={step} className={styles.step} data-done={done} aria-current={!completing && index === currentStep ? "step" : undefined}>
              <span className={styles.stepNumber} aria-hidden="true">{done ? <Check size={12} strokeWidth={2.2} /> : index + 1}</span>
              <span>{step}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
