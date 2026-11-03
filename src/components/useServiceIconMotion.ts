"use client";

import { useEffect, useRef, useState } from "react";

export function useServiceIconMotion(enabled: boolean) {
  const regionRef = useRef<HTMLDivElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const region = regionRef.current;
    if (!enabled || !region) return;

    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
    let inView = false;
    const updatePreference = () => {
      let storedReduction = false;
      try { storedReduction = window.localStorage.getItem("settings.reduceMotion") === "1"; } catch { /* Storage is optional. */ }
      setAllowed(motion.matches && document.documentElement.dataset.motion !== "off" && !storedReduction);
    };
    const updateVisibility = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateVisibility();
    }, { threshold: 0.1 });
    const settings = new MutationObserver(updatePreference);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "settings.reduceMotion" || event.key === null) updatePreference();
    };

    observer.observe(region);
    settings.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    motion.addEventListener("change", updatePreference);
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("storage", onStorage);
    updatePreference();

    return () => {
      observer.disconnect();
      settings.disconnect();
      motion.removeEventListener("change", updatePreference);
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, [enabled]);

  return {
    regionRef,
    allowed: enabled && allowed,
    active: enabled && allowed && !paused,
    running: enabled && allowed && !paused && visible,
    toggle: () => setPaused(value => !value),
  };
}
