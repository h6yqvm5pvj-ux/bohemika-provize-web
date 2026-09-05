"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type PullPhase = "idle" | "pulling" | "ready" | "refreshing";

const PULL_SLOP_PX = 8;
const PULL_TRIGGER_PX = 76;
const MAX_INDICATOR_OFFSET_PX = 22;

const getDocumentScrollTop = () =>
  Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop);

const findScrollableParent = (target: Element): HTMLElement | null => {
  let current = target.parentElement;

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const canScrollVertically =
      /(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 1;

    if (canScrollVertically) return current;
    current = current.parentElement;
  }

  return null;
};

export function MobilePullToRefresh() {
  const [phase, setPhase] = useState<PullPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [indicatorOffset, setIndicatorOffset] = useState(0);
  const gestureRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    scrollParent: HTMLElement | null;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    scrollParent: null,
  });
  const readyRef = useRef(false);
  const refreshingRef = useRef(false);
  const reloadTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.add("mobile-app-shell");
    body.classList.add("mobile-app-shell");

    const resetPull = () => {
      gestureRef.current.active = false;
      gestureRef.current.scrollParent = null;
      readyRef.current = false;
      setProgress(0);
      setIndicatorOffset(0);
      setPhase("idle");
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1 || getDocumentScrollTop() > 0) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          '[data-pull-to-refresh="off"], [role="dialog"], [aria-modal="true"], input, textarea, select, [contenteditable="true"]'
        )
      ) {
        return;
      }

      const scrollParent = findScrollableParent(target);
      if (scrollParent && scrollParent.scrollTop > 0) return;

      const touch = event.touches[0];
      gestureRef.current = {
        active: true,
        startX: touch.clientX,
        startY: touch.clientY,
        scrollParent,
      };
      readyRef.current = false;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (!gesture.active || refreshingRef.current || event.touches.length !== 1) return;

      if (getDocumentScrollTop() > 0 || (gesture.scrollParent?.scrollTop ?? 0) > 0) {
        resetPull();
        return;
      }

      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        resetPull();
        return;
      }

      if (deltaY <= PULL_SLOP_PX) {
        readyRef.current = false;
        setProgress(0);
        setIndicatorOffset(0);
        setPhase("idle");
        return;
      }
      if (event.cancelable) event.preventDefault();

      const nextProgress = Math.min(
        1,
        (deltaY - PULL_SLOP_PX) / (PULL_TRIGGER_PX - PULL_SLOP_PX)
      );
      const isReady = deltaY >= PULL_TRIGGER_PX;
      readyRef.current = isReady;
      setProgress(nextProgress);
      setIndicatorOffset(Math.min(MAX_INDICATOR_OFFSET_PX, nextProgress * MAX_INDICATOR_OFFSET_PX));
      setPhase(isReady ? "ready" : "pulling");
    };

    const handleTouchEnd = () => {
      if (!gestureRef.current.active || refreshingRef.current) return;

      if (!readyRef.current) {
        resetPull();
        return;
      }

      gestureRef.current.active = false;
      readyRef.current = false;
      refreshingRef.current = true;
      setProgress(1);
      setIndicatorOffset(12);
      setPhase("refreshing");
      reloadTimerRef.current = window.setTimeout(() => window.location.reload(), 220);
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", resetPull, { passive: true });

    return () => {
      root.classList.remove("mobile-app-shell");
      body.classList.remove("mobile-app-shell");
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", resetPull);
      if (reloadTimerRef.current !== null) window.clearTimeout(reloadTimerRef.current);
    };
  }, []);

  const label =
    phase === "refreshing"
      ? "Obnovuji…"
      : phase === "ready"
        ? "Pusť pro obnovení"
        : "Táhni dolů pro obnovení";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={phase === "idle"}
      className="pointer-events-none fixed left-1/2 top-[max(0.65rem,env(safe-area-inset-top))] z-[200] lg:hidden"
      style={{
        opacity: phase === "idle" ? 0 : 1,
        transform: `translate3d(-50%, ${indicatorOffset}px, 0)`,
        transition:
          phase === "pulling" || phase === "ready"
            ? "opacity 100ms ease-out"
            : "opacity 180ms ease, transform 180ms ease",
      }}
    >
      <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-slate-200/90 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.22)] backdrop-blur-md">
        <RefreshCw
          className={`h-4 w-4 text-violet-600 ${phase === "refreshing" ? "animate-spin" : ""}`}
          style={phase === "refreshing" ? undefined : { transform: `rotate(${progress * 220}deg)` }}
          aria-hidden="true"
        />
        <span>{label}</span>
      </div>
    </div>
  );
}
