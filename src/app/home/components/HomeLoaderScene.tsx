import styles from "./homeLoading.module.css";

type Props = { type: "production" | "payout" };
const bars = [34, 56, 44, 76, 62, 90, 71, 100];

export function HomeLoaderScene({ type }: Props) {
  return type === "production" ? (
    <div className={styles.chartScene} aria-hidden="true">
      <div className={styles.chartHeader}><span /><i /></div>
      <div className={styles.chart}>
        {bars.map((height, index) => (
          <span key={index} style={{ height: `${height}%`, animationDelay: `${index * -0.22}s` }} />
        ))}
      </div>
      <div className={styles.chartLabels}><i /><i /><i /><i /></div>
    </div>
  ) : (
    <div className={styles.payoutScene} aria-hidden="true">
      <div className={styles.amountSkeleton}><span /><i>Kč</i></div>
      <div className={styles.payoutBreakdown}>
        <div><span>Hrubá výplata</span><i /></div>
        <div><span>Storno fond</span><i /></div>
      </div>
    </div>
  );
}
