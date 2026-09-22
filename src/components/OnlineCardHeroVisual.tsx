import Image from "next/image";
import styles from "./OnlineCardMinimal.module.css";

export function OnlineCardHeroVisual() {
  return (
    <div className={styles.heroScene} aria-hidden="true">
      <Image
        src="/images/online-card-hero/bohemika-metal-logo-protection-v1.webp"
        alt=""
        fill
        priority
        unoptimized
        draggable={false}
      />
    </div>
  );
}
