import { ChartNoAxesColumnIncreasing, LoaderCircle, WalletCards } from "lucide-react";
import { HomeLoaderScene } from "./HomeLoaderScene";
import styles from "./homeLoading.module.css";

type Props = {
  title: string;
  description: string;
  accentLabel: string;
  visual: "money" | "production";
};

export function LoadingProgressPanel({ title, description, accentLabel, visual }: Props) {
  const production = visual === "production";
  const Icon = production ? ChartNoAxesColumnIncreasing : WalletCards;

  return (
    <div className={`${styles.panel} ${production ? styles.production : styles.payout}`} role="status" aria-live="polite">
      <div className={styles.layout}>
        <div className={styles.copy}>
          <div className={styles.eyebrow}>
            <span className={styles.icon}><Icon size={18} strokeWidth={1.7} aria-hidden="true" /></span>
            <span>{accentLabel}</span>
            <LoaderCircle className={styles.spinner} size={14} aria-hidden="true" />
          </div>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.description}>{description}</p>
        </div>
        <HomeLoaderScene type={production ? "production" : "payout"} />
      </div>
      <div className={styles.footer} aria-hidden="true">
        <span className={styles.dot} /> Načítání probíhá
        <span className={styles.track}><i /></span>
      </div>
    </div>
  );
}
