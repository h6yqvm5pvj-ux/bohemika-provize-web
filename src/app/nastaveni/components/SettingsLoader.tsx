import { Settings2 } from "lucide-react";
import styles from "./settingsLoader.module.css";

export function SettingsLoader() {
  return (
    <div className={styles.loader} role="status" aria-live="polite" aria-label="Načítání nastavení">
      <div className={styles.header} aria-hidden="true">
        <div className={styles.illustration}>
          <span className={styles.orbit} />
          <Settings2 size={25} strokeWidth={1.5} />
        </div>
        <div>
          <p className={styles.title}>Připravuji nastavení</p>
          <p className={styles.description}>Profil a předvolby budou za chvíli připravené.</p>
        </div>
      </div>
      <div className={styles.preview} aria-hidden="true">
        <div className={styles.profile}>
          <span className={styles.avatar} />
          <div className={styles.identity}><i /><i /></div>
        </div>
        <div className={styles.fields}>
          {[0, 1, 2, 3].map(index => (
            <div className={styles.field} key={index}>
              <span className={styles.label} />
              <span className={styles.input}><i /></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
