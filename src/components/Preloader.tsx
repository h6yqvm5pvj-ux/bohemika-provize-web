"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import styles from "./preloader.module.css";

type PreloaderProps = {
  loading?: boolean;
  loadingText?: string;
  brand?: string;
  theme?: "app" | "online-card";
  /** Minimum time on screen before the reveal, in milliseconds. */
  duration?: number;
  position?: "fixed" | "absolute";
  onComplete?: () => void;
};

const STAIR_COUNT = 10;
const DEFAULT_DURATION_MS = 1_500;
// Keep in sync with the text fade, panel duration and stagger in the CSS module.
const REVEAL_DURATION_MS = 960;

/** A single opening per mount. The page stays rendered beneath the stairs. */
export default function Preloader({
  loading = false,
  loadingText = "Připravuji tvůj prostor…",
  brand = "Bohemka.App",
  theme = "app",
  duration = DEFAULT_DURATION_MS,
  position = "fixed",
  onComplete,
}: PreloaderProps) {
  const [phase, setPhase] = useState<"loading" | "revealing" | "complete">("loading");
  const overlayRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef<number | null>(null);
  const revealStartedAt = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  const complete = phase === "complete";

  useLayoutEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useLayoutEffect(() => {
    if (complete || !overlayRef.current) return;
    // Hidden in server HTML so a disabled script or failed hydration cannot
    // permanently cover the public card. Activate before the client paints.
    overlayRef.current.dataset.active = "true";
    startedAt.current = Date.now();

    if (position !== "fixed") return;
    const root = document.documentElement;
    const body = document.body;
    const rootOverflow = root.style.overflow;
    const bodyOverflow = body.style.overflow;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    const overlay = overlayRef.current;
    let restoreFocus = document.activeElement;
    const focusOverlay = () => overlay.focus({ preventScroll: true });
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && !overlay.contains(event.target)) {
        restoreFocus = event.target;
        focusOverlay();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") event.preventDefault();
    };
    // Hidden links and buttons must not be activated from the keyboard either.
    document.addEventListener("focusin", onFocus);
    document.addEventListener("keydown", onKeyDown, true);
    focusOverlay();
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("keydown", onKeyDown, true);
      root.style.overflow = rootOverflow;
      body.style.overflow = bodyOverflow;
      if ((document.activeElement === overlay || document.activeElement === body)
        && restoreFocus instanceof HTMLElement && restoreFocus.isConnected) {
        restoreFocus.focus({ preventScroll: true });
      }
    };
  }, [complete, position]);

  useEffect(() => {
    if (complete) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;

    const schedule = () => {
      window.clearTimeout(timer);
      let reduceMotion = media.matches || document.documentElement.dataset.motion === "off";
      try {
        reduceMotion ||= window.localStorage.getItem("settings.reduceMotion") === "1";
      } catch {
        // Storage may be disabled; the system and in-page preferences still apply.
      }
      if (overlayRef.current) overlayRef.current.dataset.reducedMotion = String(reduceMotion);

      // Once the reveal starts, finish it even if background data refreshes.
      if (loading && phase === "loading") return;
      const minimumDuration = Number.isFinite(duration) ? Math.max(0, duration) : DEFAULT_DURATION_MS;
      const remaining = phase === "loading"
        ? Math.max(0, minimumDuration - (Date.now() - (startedAt.current ?? Date.now())))
        : Math.max(0, REVEAL_DURATION_MS - (Date.now() - (revealStartedAt.current ?? Date.now())));

      // Timers also complete when CSS animations are disabled or animationend
      // does not fire. Reduced motion skips both the delay and moving panels.
      timer = window.setTimeout(() => {
        if (phase === "loading" && !reduceMotion) {
          revealStartedAt.current = Date.now();
          setPhase("revealing");
        } else {
          setPhase("complete");
          onCompleteRef.current?.();
        }
      }, reduceMotion ? 0 : remaining);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "settings.reduceMotion" || event.key === null) schedule();
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    media.addEventListener("change", schedule);
    window.addEventListener("storage", onStorage);
    schedule();

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      media.removeEventListener("change", schedule);
      window.removeEventListener("storage", onStorage);
    };
  }, [complete, duration, loading, phase]);

  if (complete) return null;

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      data-phase={phase}
      data-theme={theme}
      style={{ position }}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy={loading}
      tabIndex={-1}
      data-preloader=""
    >
      <div className={styles.stairs} aria-hidden="true">
        {Array.from({ length: STAIR_COUNT }, (_, index) => (
          <span key={index} className={styles.stair} style={{ "--stair-index": index } as CSSProperties} />
        ))}
      </div>
      <div className={styles.content}>
        <span className={styles.brand}>{brand}</span>
        <div className={styles.message}>
          <span className={styles.mark} aria-hidden="true"><i /><i /><i /><i /></span>
          <p className={styles.text}>{loadingText}</p>
          <span className={styles.line} aria-hidden="true"><i /></span>
        </div>
        <span className={styles.signature} aria-hidden="true">{brand}</span>
      </div>
    </div>
  );
}
