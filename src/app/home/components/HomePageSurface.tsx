"use client";

import { type ReactNode } from "react";
import { ProductionBackdrop } from "./ProductionBackdrop";
import styles from "./HomePageSurface.module.css";

type Props = {
  isLiteUI: boolean;
  className?: string;
  children: ReactNode;
};

/** Static artwork covers the home page with a viewport-sized canvas. */
export function HomePageSurface({ isLiteUI, className = "", children }: Props) {
  return (
    <div className={`${styles.surface} ${className}`} data-home-surface="">
      <div className={styles.background} aria-hidden="true">
        <div className={styles.viewport} data-home-artwork-viewport="">
          <ProductionBackdrop enabled={!isLiteUI} running={false} className={styles.artwork} />
        </div>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
