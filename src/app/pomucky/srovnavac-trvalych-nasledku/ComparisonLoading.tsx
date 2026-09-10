import { LoaderCircle } from "lucide-react";
import { ComparisonIllustration } from "./ComparisonIllustration";
import styles from "./comparison.module.css";

export function ComparisonLoading({ compact = false, title = "Načítám srovnávač", description = "Připravuji produkty a přehled pojistného plnění." }: { compact?: boolean; title?: string; description?: string }) {
  return <div className={styles.loader} data-compact={compact} role="status" aria-live="polite"><div><span className={styles.eyebrow}><LoaderCircle size={16} className={styles.spinner} aria-hidden="true" /> Trvalé následky</span><h2>{title}</h2><p>{description}</p><div className={styles.loadingTrack} aria-hidden="true"><i /></div></div>{!compact && <div className={styles.loaderArt}><ComparisonIllustration /></div>}</div>;
}
