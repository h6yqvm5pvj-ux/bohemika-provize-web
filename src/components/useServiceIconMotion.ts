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
    const updatePreference = () => setAllowed(motion.matches && document.documentElement.dataset.motion !== "off");
    const updateVisibility = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateVisibility();
    }, { threshold: 0.1 });
    const settings = new MutationObserver(updatePreference);

    observer.observe(region);
    settings.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    motion.addEventListener("change", updatePreference);
    document.addEventListener("visibilitychange", updateVisibility);
    updatePreference();

    return () => {
      observer.disconnect();
      settings.disconnect();
      motion.removeEventListener("change", updatePreference);
      document.removeEventListener("visibilitychange", updateVisibility);
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
