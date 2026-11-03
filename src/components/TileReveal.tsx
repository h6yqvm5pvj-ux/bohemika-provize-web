"use client";

import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";

import styles from "./tileReveal.module.css";

type TileRevealProps = {
  images: readonly string[];
  headline: ReactNode;
  children?: ReactNode;
  className?: string;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (value: number) => 1 - (1 - clamp(value)) ** 3;
const easeInOut = (value: number) => {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
};

/** Decorative scroll choreography; all text and actions also work without it. */
export default function TileReveal({ images, headline, children, className = "" }: TileRevealProps) {
  const regionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tilesRef = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const region = regionRef.current;
    const stage = stageRef.current;
    const grid = gridRef.current;
    if (!region || !stage || !grid || !images.length || typeof IntersectionObserver === "undefined") return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const shortScreen = window.matchMedia("(max-height: 600px)");
    let visible = false;
    let enabled = false;
    let frame: number | undefined;

    const cancelFrame = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
    };

    const update = () => {
      frame = undefined;
      if (!enabled || !visible || document.hidden) return;
      const regionBox = region.getBoundingClientRect();
      const stageHeight = stage.offsetHeight;
      const stageWidth = stage.offsetWidth;
      const stickyTop = Number.parseFloat(getComputedStyle(stage).top) || 0;
      const progress = clamp((stickyTop - regionBox.top) / Math.max(1, regionBox.height - stageHeight));
      const zoom = easeInOut((progress - .34) / .64);
      // Finish the spread at the sticky boundary so there is no long empty tail.
      const spread = easeInOut((progress - .74) / .26) ** 3;
      const opacity = 1 - easeInOut((progress - .94) / .06);
      const gridWidth = grid.offsetWidth;

      grid.style.transform = `translate(-50%, -50%) scale(${1 + zoom * .8})`;
      grid.style.opacity = String(opacity);
      stage.style.setProperty("--tile-content-opacity", String(.68 + easeInOut((progress - .6) / .3) * .32));
      stage.style.setProperty("--tile-content-offset", `${(1 - easeInOut((progress - .6) / .3)) * 10}px`);
      region.dataset.progress = progress.toFixed(3);

      tilesRef.current.forEach((tile, index) => {
        if (!tile) return;
        const column = index % 3;
        const row = Math.floor(index / 3);
        const direction = column % 2 === 0 ? -1 : 1;
        const entry = easeOut((progress - (direction < 0 ? 2 - row : row) * .035) / .28);
        const flyIn = direction * stageHeight * 1.35 * (1 - entry);
        const x = (column - 1) * (stageWidth * .72 + gridWidth / 3) * spread;
        const exitDirection = row === 0 ? -1 : 1;
        const y = flyIn + (column === 1 ? exitDirection * (stageHeight + gridWidth / 3) * spread : (row - 1) * stageHeight * .7 * spread);
        const rotation = (column - 1) * (1 - entry) * 8 + (column - 1) * spread * 7;
        tile.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;
        tile.style.opacity = String(.24 + entry * .5);
      });
    };

    const schedule = () => {
      if (enabled && visible && !document.hidden && frame === undefined) frame = window.requestAnimationFrame(update);
    };

    const reconcileMotion = () => {
      let reduced = media.matches || document.documentElement.dataset.motion === "off";
      try {
        reduced ||= window.localStorage.getItem("settings.reduceMotion") === "1";
      } catch {
        // Browser storage is optional; system and current-page preferences still apply.
      }
      enabled = !reduced && !shortScreen.matches;
      if (enabled) {
        region.dataset.animated = "true";
        schedule();
      } else {
        cancelFrame();
        delete region.dataset.animated;
        delete region.dataset.progress;
        grid.style.removeProperty("transform");
        grid.style.removeProperty("opacity");
        stage.style.removeProperty("--tile-content-opacity");
        stage.style.removeProperty("--tile-content-offset");
        tilesRef.current.forEach(tile => {
          tile?.style.removeProperty("transform");
          tile?.style.removeProperty("opacity");
        });
      }
    };
    const onVisibility = () => {
      if (document.hidden) cancelFrame();
      else schedule();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "settings.reduceMotion" || event.key === null) reconcileMotion();
    };
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule();
      else cancelFrame();
    }, { rootMargin: "100px 0px" });
    const preference = new MutationObserver(reconcileMotion);
    intersection.observe(region);
    preference.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    media.addEventListener("change", reconcileMotion);
    shortScreen.addEventListener("change", reconcileMotion);
    reconcileMotion();

    return () => {
      cancelFrame();
      intersection.disconnect();
      preference.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      media.removeEventListener("change", reconcileMotion);
      shortScreen.removeEventListener("change", reconcileMotion);
      delete region.dataset.animated;
    };
  }, [images.length]);

  return (
    <section ref={regionRef} className={`${styles.reveal} ${className}`} data-tile-reveal="">
      <div ref={stageRef} className={styles.stage} data-tile-stage="">
        <div className={styles.backdrop} aria-hidden="true" />
        <div ref={gridRef} className={styles.grid} aria-hidden="true">
          {images.slice(0, 9).map((image, index) => (
            <div key={`${image}-${index}`} ref={node => { tilesRef.current[index] = node; }} className={styles.tile}>
              <Image src={image} alt="" fill sizes="(max-width: 760px) 40vw, 360px" draggable={false} />
            </div>
          ))}
        </div>
        <div className={styles.scrim} aria-hidden="true" />
        <div className={styles.copy}>
          <div className={styles.headline}>{headline}</div>
          {children ? <div className={styles.content}>{children}</div> : null}
        </div>
        <span className={styles.edgeLine} aria-hidden="true" />
      </div>
    </section>
  );
}
