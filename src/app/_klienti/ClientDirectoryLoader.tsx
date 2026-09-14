import { Check, FileText, Mail, UserRound } from "lucide-react";
import styles from "./clientDirectoryLoader.module.css";

export function ClientDirectoryLoader({ loadedContracts = 0 }: { loadedContracts?: number }) {
  return <div className={styles.loader} role="status" aria-label="Načítání klientů" aria-live="polite">
    <div className={styles.content}>
      <div className={styles.scene} aria-hidden="true">
        <div className={styles.halo} />
        <div className={styles.orbit} />
        <svg className={styles.connections} viewBox="0 0 300 240" fill="none">
          <path d="M58 166C58 205 146 219 157 163M245 58C207 23 155 35 152 93" />
        </svg>
        <div className={styles.backCard} />
        <div className={styles.profileCard}>
          <span className={styles.avatar}><UserRound size={28} strokeWidth={1.5} /></span>
          <span className={styles.nameLine} />
          <span className={styles.detailLine} />
          <span className={styles.cardDivider} />
          <span className={styles.cardFooter}><FileText size={13} /><i /><i /></span>
          <span className={styles.verified}><Check size={15} strokeWidth={2.5} /></span>
        </div>
        <div className={styles.document}><FileText size={23} strokeWidth={1.6} /><i /><i /></div>
        <div className={styles.contact}><Mail size={20} strokeWidth={1.6} /></div>
      </div>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>Všechno na jednom místě</span>
        <h2>Připravuji přehled klientů</h2>
        <p>Načítám kontakty a přiřazené smlouvy.<br className={styles.desktopBreak} /> Za chvíli bude vše připravené.</p>
        <div className={styles.activity}>
          <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
          <span>{loadedContracts ? `První propojení · ${loadedContracts.toLocaleString("cs-CZ")} smluv` : "Načítám smlouvy…"}</span>
        </div>
        <div className={styles.track} aria-hidden="true"><span /></div>
      </div>
    </div>
    <div className={styles.preview} aria-hidden="true">
      {[0, 1, 2].map((index) => <div key={index} className={styles.previewRow}>
        <span className={styles.previewAvatar} />
        <span className={styles.previewName}><i /><i /></span>
        <span className={styles.previewContact}><i /><i /></span>
        <span className={styles.previewBadge} />
      </div>)}
    </div>
  </div>;
}
