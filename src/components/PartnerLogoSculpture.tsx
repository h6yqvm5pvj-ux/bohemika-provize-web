import Image from "next/image";
import { useId, type CSSProperties } from "react";
import styles from "./OnlineCardMinimal.module.css";

type PartnerLogoSculptureProps = {
  src: string;
  label: string;
  imageClassName: string;
  index: number;
};

// Reuse the original alpha and artwork on every plane to preserve brand lettering.
const DEPTH_PLANES = [6, 5, 4, 3, 2, 1];

export function PartnerLogoSculpture({ src, label, imageClassName, index }: PartnerLogoSculptureProps) {
  const alphaFilterId = useId();
  const imageProps = {
    src,
    width: 160,
    height: 66,
    sizes: "(max-width: 480px) 160px, (max-width: 760px) 140px, 180px",
    draggable: false,
  } as const;

  return (
    <span className={styles.partnerLogoStage}>
      <svg width="0" height="0" aria-hidden="true" focusable="false" className={styles.partnerLogoFilters}>
        <defs>
          <filter id={alphaFilterId} colorInterpolationFilters="sRGB">
            <feComponentTransfer>
              {/* Suppress near-transparent source noise before stacking the depth planes. */}
              <feFuncA type="gamma" amplitude="1" exponent="3" offset="0" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      <span className={styles.partnerLogoSculpture} style={{ "--logo-delay": `${index * -0.73}s`, "--logo-alpha-filter": `url("#${alphaFilterId}")` } as CSSProperties}>
        <span className={styles.partnerLogoShadow} aria-hidden="true">
          <Image {...imageProps} alt="" className={imageClassName} />
        </span>
        {DEPTH_PLANES.map(depth => (
          <span key={depth} className={styles.partnerLogoDepth} style={{ "--logo-depth": depth } as CSSProperties} aria-hidden="true">
            <Image {...imageProps} alt="" className={imageClassName} />
          </span>
        ))}
        <span className={styles.partnerLogoFace}>
          <Image {...imageProps} alt={label} className={imageClassName} />
        </span>
        <span className={styles.partnerLogoSheen} aria-hidden="true">
          <Image {...imageProps} alt="" className={imageClassName} />
        </span>
      </span>
    </span>
  );
}
