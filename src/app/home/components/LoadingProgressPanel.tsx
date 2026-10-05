import { ChartNoAxesColumnIncreasing, FileText, Layers3, ShieldCheck, WalletCards } from "lucide-react";
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
  const features = production
    ? [{ label: "Smlouvy", icon: FileText }, { label: "Provize", icon: WalletCards }, { label: "Přehled", icon: Layers3 }]
    : [{ label: "Provize", icon: WalletCards }, { label: "Storno fond", icon: ShieldCheck }];

  return (
    <div className={`${styles.panel} ${production ? styles.production : styles.payout}`} role="status" aria-live="polite" aria-atomic="true">
      <div className={styles.header} aria-hidden="true">
        <span className={styles.eyebrow}><Icon size={15} strokeWidth={1.7} />{accentLabel}</span>
        <span className={styles.live}><i /> Načítáme</span>
      </div>
      <div className={styles.layout}>
        <HomeLoaderScene type={production ? "production" : "payout"} />
        <div className={styles.copy}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.description}>{description}</p>
          <div className={styles.loading} aria-hidden="true">
            <span className={styles.track}><i /></span>
            <span className={styles.activity}><span className={styles.dots}><i /><i /><i /></span>Načítání probíhá</span>
          </div>
        </div>
      </div>
      <div className={styles.footer} aria-hidden="true">
        {features.map(({ label, icon: FeatureIcon }) => <span key={label}><FeatureIcon size={13} strokeWidth={1.7} />{label}</span>)}
      </div>
    </div>
  );
}
