"use client";

import { MapPin, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, type PointerEvent } from "react";
import type { OnlineCardHeroArtwork } from "@/lib/onlineCardHeroArtwork";
import styles from "./OnlineCardMinimal.module.css";

type OnlineCardHeroVisualProps = {
  artwork: OnlineCardHeroArtwork | null;
  location: string;
  promise: string;
};

export function OnlineCardHeroVisual({ artwork, location, promise }: OnlineCardHeroVisualProps) {
  const figureRef = useRef<HTMLElement>(null);
  const frameRef = useRef<number | null>(null);

  const resetArtwork = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const figure = figureRef.current;
    if (!figure) return;
    delete figure.dataset.interacting;
    for (const property of ["--art-x", "--art-y", "--art-shift-x", "--art-shift-y"]) {
      figure.style.removeProperty(property);
    }
  };

  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inView = false;
    const updateMotion = () => {
      const running = inView && !document.hidden && !motionPreference.matches && document.documentElement.dataset.motion !== "off";
      figure.dataset.motion = running ? "running" : "paused";
      if (!running) resetArtwork();
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateMotion();
    }, { threshold: 0 });
    const motionSettingObserver = new MutationObserver(updateMotion);
    observer.observe(figure);
    motionSettingObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    document.addEventListener("visibilitychange", updateMotion);
    motionPreference.addEventListener("change", updateMotion);
    return () => {
      observer.disconnect();
      motionSettingObserver.disconnect();
      document.removeEventListener("visibilitychange", updateMotion);
      motionPreference.removeEventListener("change", updateMotion);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const moveArtwork = (event: PointerEvent<HTMLElement>) => {
    const figure = event.currentTarget;
    if (event.pointerType !== "mouse" || figure.dataset.motion !== "running") return;
    const { clientX, clientY } = event;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const bounds = figure.getBoundingClientRect();
      const x = Math.max(-0.5, Math.min(0.5, (clientX - bounds.left) / bounds.width - 0.5));
      const y = Math.max(-0.5, Math.min(0.5, (clientY - bounds.top) / bounds.height - 0.5));
      figure.dataset.interacting = "true";
      figure.style.setProperty("--art-x", `${x * 18}deg`);
      figure.style.setProperty("--art-y", `${y * -14}deg`);
      figure.style.setProperty("--art-shift-x", `${x * 12}px`);
      figure.style.setProperty("--art-shift-y", `${y * 10}px`);
      frameRef.current = null;
    });
  };

  return (
    <figure
      ref={figureRef}
      className={styles.heroArt}
      data-motion="paused"
      onPointerMove={moveArtwork}
      onPointerLeave={resetArtwork}
      onPointerCancel={resetArtwork}
    >
      <div className={styles.artOrbit} aria-hidden="true" />
      <div className={styles.artOrbitInner} aria-hidden="true" />
      <span className={styles.artSpark} aria-hidden="true" />
      <div className={styles.artFloat}>
        <div className={[styles.heroImage, artwork ? "" : styles.heroImageFallback].join(" ")}>
          <Image
            src={artwork?.src || "/icons/bhmkwhite.png"}
            alt={artwork?.alt || "Bohemika"}
            fill
            sizes="(max-width: 760px) calc(100vw - 64px), (max-width: 1300px) 42vw, 490px"
            priority
            draggable={false}
          />
          {artwork ? <Image
            src={artwork.src}
            alt=""
            aria-hidden="true"
            fill
            sizes="(max-width: 760px) calc(100vw - 64px), (max-width: 1300px) 42vw, 490px"
            className={styles.artSheen}
            draggable={false}
          /> : null}
        </div>
      </div>
      {location ? <div className={styles.artLocation}><MapPin aria-hidden="true" /><span>{location}</span></div> : null}
      <div className={styles.artPromise}>
        <span className={styles.artPromiseIcon}><ShieldCheck aria-hidden="true" /></span>
        <span><small>Bohemika a.s.</small><strong>{promise}</strong></span>
      </div>
    </figure>
  );
}
