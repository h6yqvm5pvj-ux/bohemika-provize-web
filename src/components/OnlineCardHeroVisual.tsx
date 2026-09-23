import Image from "next/image";
import styles from "./OnlineCardMinimal.module.css";

export function OnlineCardHeroVisual() {
  return (
    <div className={styles.heroScene} aria-hidden="true">
      <Image
        src="/icons/bohemika-chrome-symbol.png"
        alt=""
        fill
        sizes="(max-width: 760px) 60px, (max-width: 1000px) 220px, 300px"
        preload
        draggable={false}
      />
    </div>
  );
}
