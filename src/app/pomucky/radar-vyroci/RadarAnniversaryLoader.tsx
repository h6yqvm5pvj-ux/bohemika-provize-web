import { CalendarDays, FileText, Radar, Users } from "lucide-react";
import styles from "./RadarAnniversaryLoader.module.css";

export function RadarAnniversaryLoader() {
  return (
    <section className={styles.shell} aria-busy="true" aria-labelledby="radar-loading-title">
      <div className={styles.copy}>
        <div className={styles.label}><span><Radar size={19} /></span> Radar výročí</div>
        <h1 id="radar-loading-title">Výročí pod kontrolou.</h1>
        <p className={styles.description}>Načítám smlouvy a jejich nejbližší výročí do přehledu klientů.</p>
        <div className={styles.status} role="status"><span className={styles.pulse} /> Připravuji vaše portfolio…</div>
        <div className={styles.track} aria-hidden="true"><span /></div>
        <div className={styles.tags} aria-hidden="true"><span><FileText size={14} /> Smlouvy</span><span><CalendarDays size={14} /> Výročí</span><span><Users size={14} /> Klienti</span></div>
      </div>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.radar}>
          <span className={styles.sweep} />
          <i className={styles.ring} /><i className={styles.ring} /><i className={styles.ring} />
          <span className={styles.center}><Radar size={30} strokeWidth={1.6} /></span>
          <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
          <span className={styles.calendar}><CalendarDays size={22} /></span>
        </div>
        <div className={styles.preview}>
          <div className={styles.previewHeading}><span>Nejbližší výročí</span><span className={styles.dots}>•••</span></div>
          {[0, 1, 2].map(row => <div className={styles.row} key={row}><span className={styles.avatar}><FileText size={15} /></span><span className={styles.lines}><i /><i /></span><span className={styles.date} /></div>)}
        </div>
      </div>
    </section>
  );
}
