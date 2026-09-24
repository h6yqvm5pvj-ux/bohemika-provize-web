"use client";

import { Pause, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import styles from "./OnlineCardMinimal.module.css";

const POSTER = "/images/online-card-hero/glass-growth-poster-v1.webp";
const VIDEO = "/videos/online-card-hero/glass-growth-loop-v1.mp4";
const COPY = {
  cs: { pause: "Pozastavit animaci", play: "Přehrát animaci" },
  en: { pause: "Pause animation", play: "Play animation" },
  uk: { pause: "Призупинити анімацію", play: "Відтворити анімацію" },
} as const;

type DataSavingConnection = EventTarget & { saveData?: boolean };

export function OnlineCardHeroVisual({ locale }: { locale: OnlineCardLocale }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const artworkId = useId();
  const [choice, setChoice] = useState<"auto" | "play" | "still">("auto");
  const [canAutoplay, setCanAutoplay] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const animate = !failed && !blocked && (choice === "play" || (choice === "auto" && canAutoplay));
  const showVideo = animate && visible;
  const copy = COPY[locale];

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const connection = (navigator as Navigator & { connection?: DataSavingConnection }).connection;
    let inView = false;
    const updateAutoplay = () => setCanAutoplay(motion.matches && !connection?.saveData && document.documentElement.dataset.motion !== "off");
    const updateVisibility = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateVisibility();
    }, { threshold: 0.1 });
    const settingsObserver = new MutationObserver(updateAutoplay);
    observer.observe(root);
    settingsObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    motion.addEventListener("change", updateAutoplay);
    connection?.addEventListener("change", updateAutoplay);
    document.addEventListener("visibilitychange", updateVisibility);
    updateAutoplay();
    return () => {
      observer.disconnect();
      settingsObserver.disconnect();
      motion.removeEventListener("change", updateAutoplay);
      connection?.removeEventListener("change", updateAutoplay);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!showVideo || !video) return;
    let current = true;
    video.play().catch(() => {
      if (current) setBlocked(true);
    });
    return () => {
      current = false;
      video.pause();
    };
  }, [showVideo]);

  return (
    <div className={styles.heroScene} ref={rootRef} data-playing={showVideo && ready}>
      <div id={artworkId} className={styles.heroArtwork} aria-hidden="true">
        <Image src={POSTER} alt="" fill sizes="(max-width: 760px) 144px, (max-width: 1000px) 360px, 680px" preload draggable={false} />
        {showVideo ? <video
          ref={videoRef}
          className={styles.heroVideo}
          data-ready={ready}
          src={VIDEO}
          poster={POSTER}
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          tabIndex={-1}
          onPlaying={() => setReady(true)}
          onError={() => setFailed(true)}
        /> : null}
      </div>
      <div className={styles.heroMark} aria-hidden="true">
        <Image src="/icons/bohemika-chrome-symbol.png" alt="" fill sizes="(max-width: 760px) 60px, 220px" preload draggable={false} />
        <span className={styles.heroMarkReflection} />
      </div>
      {!failed ? <button
        type="button"
        className={styles.heroMotionToggle}
        aria-label={animate ? copy.pause : copy.play}
        title={animate ? copy.pause : copy.play}
        aria-controls={artworkId}
        onClick={() => {
          setReady(false);
          setBlocked(false);
          setChoice(animate ? "still" : "play");
        }}
      >
        {animate ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </button> : null}
    </div>
  );
}
