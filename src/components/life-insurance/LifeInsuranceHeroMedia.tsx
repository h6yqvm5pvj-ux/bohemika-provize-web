"use client";

import { Pause, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import styles from "./lifeInsuranceTheme.module.css";

const POSTER = "/images/life-insurance/family-protection-hero-v1.webp";
const SCULPTURE = "/images/life-insurance/family-protection-sculpture-v2.webp";
const VIDEO = "/videos/life-insurance/family-protection-light-loop-v1.mp4";
const COPY = {
  cs: { label: "Animace úvodu", play: "Přehrát animaci", still: "Zobrazit obrázek" },
  en: { label: "Intro animation", play: "Play animation", still: "Show still image" },
  uk: { label: "Анімація вступу", play: "Відтворити анімацію", still: "Показати зображення" },
} as const;

type DataSavingConnection = EventTarget & { saveData?: boolean };

export function LifeInsuranceHeroMedia({ locale, presentation = false }: { locale: OnlineCardLocale; presentation?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaId = useId();
  const [choice, setChoice] = useState<"auto" | "play" | "still">("auto");
  const [canAutoplay, setCanAutoplay] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [visible, setVisible] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const animate = !failed && !blocked && (!presentation || !reducedMotion) && (choice === "play" || (choice === "auto" && canAutoplay));
  const showVideo = !presentation && animate && visible;
  const copy = COPY[locale];

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const motion = window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)");
    const reduction = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: DataSavingConnection }).connection;
    let inView = false;
    const updateAutoplay = () => {
      let storedReduction = false;
      try { storedReduction = window.localStorage.getItem("settings.reduceMotion") === "1"; } catch { /* Storage is optional. */ }
      const reduced = reduction.matches || document.documentElement.dataset.motion === "off" || storedReduction;
      setReducedMotion(reduced);
      setCanAutoplay(motion.matches && !connection?.saveData && !reduced);
    };
    const updateVisibility = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateVisibility();
    }, { threshold: 0.1 });
    const settingsObserver = new MutationObserver(updateAutoplay);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "settings.reduceMotion" || event.key === null) updateAutoplay();
    };
    observer.observe(root);
    settingsObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    motion.addEventListener("change", updateAutoplay);
    reduction.addEventListener("change", updateAutoplay);
    connection?.addEventListener("change", updateAutoplay);
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("storage", onStorage);
    updateAutoplay();
    return () => {
      observer.disconnect();
      settingsObserver.disconnect();
      motion.removeEventListener("change", updateAutoplay);
      reduction.removeEventListener("change", updateAutoplay);
      connection?.removeEventListener("change", updateAutoplay);
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("storage", onStorage);
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
    <div
      className={styles.heroMedia}
      ref={rootRef}
      data-sculpture={presentation || undefined}
      data-animated={presentation ? animate && visible : undefined}
    >
      <div id={mediaId} className={styles.heroArtwork} aria-hidden="true">
        <Image
          src={presentation ? SCULPTURE : POSTER}
          alt=""
          fill
          sizes={presentation ? "(max-width: 767px) 280px, (max-width: 1100px) 40vw, 520px" : "(max-width: 767px) 280px, 360px"}
          loading="eager"
          fetchPriority="high"
          unoptimized
          draggable={false}
        />
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
      {!failed && (!presentation || !reducedMotion) ? <button
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
