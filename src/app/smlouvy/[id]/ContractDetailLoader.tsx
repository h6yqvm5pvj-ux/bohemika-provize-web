import { ChartNoAxesColumnIncreasing, FileText, History, LoaderCircle } from "lucide-react";
import styles from "./contractDetailLoader.module.css";

export function ContractDetailLoader() {
  return (
    <main className={styles.surface}>
      <section className={styles.panel} role="status" aria-live="polite">
        <div className={styles.scene} aria-hidden="true">
          <div className={styles.orbit} />
          <div className={styles.backPaper} />
          <div className={styles.paper}>
            <FileText size={27} strokeWidth={1.6} />
            <span className={styles.paperTitle} />
            <span className={styles.paperLine} />
            <span className={styles.paperLine} />
            <div className={styles.paperFields}><i /><i /></div>
            <div className={styles.paperFooter}><i /><i /></div>
          </div>
          <span className={styles.chartBadge}><ChartNoAxesColumnIncreasing size={22} strokeWidth={1.7} /></span>
          <span className={styles.historyBadge}><History size={20} strokeWidth={1.7} /></span>
        </div>
        <p className={styles.eyebrow}>DETAIL SMLOUVY</p>
        <h1 className={styles.title}>Načítám smlouvu</h1>
        <p className={styles.description}>Připravuji údaje o smlouvě,<br />provize a historii na jednom místě.</p>
        <div className={styles.activity} aria-hidden="true">
          <LoaderCircle size={16} />
          <span>Načítání probíhá</span>
        </div>
        <div className={styles.track} aria-hidden="true"><span /></div>
      </section>
    </main>
  );
}
