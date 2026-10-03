import { FileText, LoaderCircle } from "lucide-react";
import styles from "./contractsListLoader.module.css";

export function ContractsListLoader() {
  return (
    <div className={styles.loader} role="status" aria-live="polite" aria-label="Načítání smluv">
      <div className={styles.header} aria-hidden="true">
        <div className={styles.document}>
          <FileText size={26} strokeWidth={1.5} />
          <span className={styles.indicator}><LoaderCircle size={14} /></span>
        </div>
        <div className={styles.copy}>
          <p className={styles.title}>Připravuji přehled smluv</p>
          <p className={styles.description}>Za chvíli bude vše na svém místě.</p>
        </div>
        <span className={styles.dots}><i /><i /><i /></span>
      </div>
      <div className={styles.preview} aria-hidden="true">
        {[0, 1, 2, 3].map(index => (
          <div className={styles.card} key={index}>
            <span className={styles.logo} />
            <div className={styles.identity}><i /><i /><i /></div>
            <span className={styles.badge} />
            <div className={styles.amount}><i /><i /></div>
            <div className={styles.date}><i /><i /></div>
            <span className={styles.action} />
          </div>
        ))}
      </div>
    </div>
  );
}
