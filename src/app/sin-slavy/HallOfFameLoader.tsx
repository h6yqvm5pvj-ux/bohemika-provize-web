import Image from "next/image";
import { Sparkle } from "lucide-react";
import styles from "./hallOfFame.module.css";

export function HallOfFameLoader() {
  return (
    <div className={styles.loading} role="status" aria-live="polite" aria-atomic="true">
      <div className={styles.loadingScene} aria-hidden="true">
        <span className={styles.loadingHalo} />
        <span className={styles.loadingOrbit} />
        <Sparkle className={styles.loadingSparkle} size={21} strokeWidth={1.4} />
        <Sparkle className={styles.loadingSparkleSmall} size={14} strokeWidth={1.5} />
        <div className={styles.loadingPodium}>
          <span data-place="2">2</span>
          <span data-place="1">1</span>
          <span data-place="3">3</span>
        </div>
        <div className={styles.loadingTrophy}>
          <Image src="/illustrations/team/hall-trophy-modern-transparent-v2.webp" alt="" width={144} height={144} sizes="144px" />
          <span className={styles.trophyBrand} />
        </div>
      </div>
      <span className={styles.loadingEyebrow}>Síň slávy</span>
      <h2>Chystáme stupně vítězů<span aria-hidden="true">…</span></h2>
      <p>Načítáme výsledky za zvolené období.</p>
      <div className={styles.loadingTrack} aria-hidden="true"><span /></div>
    </div>
  );
}
