"use client";

import { useLayoutEffect, useRef } from "react";

export const CASHFLOW_CURVE_REVEAL_MS = 3400;

/** Arm the decorative reveal before paint; the static chart is the fallback. */
export function useCashflowChartReveal() {
  const plotRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!plot || typeof IntersectionObserver === "undefined" || typeof window.matchMedia !== "function") return;

    const reduction = window.matchMedia("(prefers-reduced-motion: reduce)");
    let started = false;
    let inView = false;
    const observer = new IntersectionObserver(entries => {
      const entry = entries.find(candidate => candidate.target === plot);
      if (!entry) return;
      inView = entry.isIntersecting && entry.intersectionRatio >= .4;
      startIfVisible();
    }, { threshold: .4, rootMargin: "0px 0px -24px 0px" });

    const complete = () => {
      started = true;
      plot.dataset.curveReveal = "complete";
      observer.disconnect();
    };
    const startIfVisible = () => {
      if (!started && inView && !document.hidden) {
        started = true;
        plot.dataset.curveReveal = "running";
        observer.disconnect();
      }
    };
    const reconcilePreference = () => {
      let reduced = reduction.matches || document.documentElement.dataset.motion === "off";
      try { reduced ||= window.localStorage.getItem("settings.reduceMotion") === "1"; } catch { /* Storage is optional. */ }
      if (reduced) complete();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "settings.reduceMotion" || event.key === null) reconcilePreference();
    };
    const onVisibility = () => {
      plot.dataset.curvePaused = String(document.hidden);
      startIfVisible();
    };
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target instanceof Element && event.target.hasAttribute("data-curve-reveal-mask")) complete();
    };
    const preferences = new MutationObserver(reconcilePreference);

    plot.dataset.curveReveal = "waiting";
    onVisibility();
    reconcilePreference();
    if (!started) observer.observe(plot);
    preferences.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    reduction.addEventListener("change", reconcilePreference);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    plot.addEventListener("animationend", onAnimationEnd);

    return () => {
      observer.disconnect();
      preferences.disconnect();
      reduction.removeEventListener("change", reconcilePreference);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      plot.removeEventListener("animationend", onAnimationEnd);
      delete plot.dataset.curveReveal;
      delete plot.dataset.curvePaused;
    };
  }, []);

  return plotRef;
}
