"use client";

import { Pause, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import styles from "./lifeInsuranceTheme.module.css";

const POSTER = "/images/life-insurance/family-protection-hero-v1.webp";
const VIDEO = "/videos/life-insurance/family-protection-light-loop-v1.mp4";
const COPY = {
  cs: { label: "Animace úvodu", play: "Přehrát animaci", still: "Zobrazit obrázek" },
  en: { label: "Intro animation", play: "Play animation", still: "Show still image" },
  uk: { label: "Анімація вступу", play: "Відтворити анімацію", still: "Показати зображення" },
} as const;

type DataSavingConnection = EventTarget & { saveData?: boolean };

export function LifeInsuranceHeroMedia({ locale }: { locale: OnlineCardLocale }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaId = useId();
  const [choice, setChoice] = useState<"auto" | "play" | "still">("auto");
  const [canAutoplay, setCanAutoplay] = useState(false);
  const [visible, setVisible] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const animate = !failed && !blocked && (choice === "play" || (choice === "auto" && canAutoplay));
  const showVideo = animate && visible;
  const copy = COPY[locale];

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const motion = window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)");
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
    <div className={styles.heroMedia} ref={rootRef}>
      <div id={mediaId} className={styles.heroArtwork} aria-hidden="true">
        <Image src={POSTER} alt="" fill priority unoptimized draggable={false} />
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
      {!failed ? <button
        type="button"
        className={styles.heroMotionToggle}
        aria-label={copy.label}
        aria-pressed={animate}
        aria-controls={mediaId}
        onClick={() => {
          setReady(false);
          setBlocked(false);
          setChoice(animate ? "still" : "play");
        }}
      >
        {animate ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        {animate ? copy.still : copy.play}
      </button> : null}
    </div>
  );
}
