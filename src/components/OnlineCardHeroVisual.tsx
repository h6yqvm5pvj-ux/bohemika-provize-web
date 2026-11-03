"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import styles from "./OnlineCardMinimal.module.css";

export function OnlineCardHeroVisual() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const applyStoredMotion = () => {
      if (!sceneRef.current) return;
      try {
        sceneRef.current.dataset.motion = window.localStorage.getItem("settings.reduceMotion") === "1" ? "off" : "on";
      } catch {
        // System and page preferences still work when storage is unavailable.
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "settings.reduceMotion" || event.key === null) applyStoredMotion();
    };
    applyStoredMotion();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div ref={sceneRef} className={styles.heroScene} aria-hidden="true">
      <div className={styles.heroArtwork}>
        <Image
          src="/icons/bohemika-chrome-symbol.png"
          alt=""
          width={1024}
          height={1536}
          sizes="(max-width: 760px) 320px, (max-width: 1100px) 45vw, 600px"
          loading="eager"
          fetchPriority="high"
          draggable={false}
        />
      </div>
    </div>
  );
}
