import { getImageProps } from "next/image";
import styles from "./OnlineCardMinimal.module.css";

export function OnlineCardHeroVisual() {
  const { props: desktop } = getImageProps({
    src: "/images/online-card-hero/bohemika-growth-panorama-v2.webp",
    alt: "",
    width: 2172,
    height: 724,
    sizes: "(max-width: 1100px) 1280px, (max-width: 1480px) calc(100vw - 40px), 1440px",
    loading: "eager",
    fetchPriority: "high",
  });
  const { props: mobile } = getImageProps({
    src: "/images/online-card-hero/bohemika-growth-reflections-v2.webp",
    alt: "",
    width: 1672,
    height: 941,
    sizes: "(max-width: 760px) calc(100vw - 20px), calc(100vw - 40px)",
  });

  return (
    <div className={styles.heroScene} aria-hidden="true">
      <picture className={styles.heroArtwork}>
        <source media="(max-width: 1000px)" srcSet={mobile.srcSet} sizes={mobile.sizes} width={1672} height={941} />
        {/* getImageProps supplies Next.js optimization for both art-directed sources. */}
        <img {...desktop} alt="" draggable={false} />
      </picture>
    </div>
  );
}
