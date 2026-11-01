import { useEffect, useRef, type PointerEvent } from "react";

const motionEnabled = () => document.documentElement.dataset.motion !== "off"
  && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/** Pointer movement only updates a local visual surface, at most once per frame. */
export function useHallSpatialTilt() {
  const frame = useRef<number | null>(null);
  const bounds = useRef<DOMRect | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
  }, []);

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || !motionEnabled()) return;
    const element = event.currentTarget;
    const rect = bounds.current ??= element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      if (!element.isConnected || !motionEnabled()) return;
      element.style.setProperty("--tilt-x", `${((0.5 - y) * 7).toFixed(2)}deg`);
      element.style.setProperty("--tilt-y", `${((x - 0.5) * 9).toFixed(2)}deg`);
      element.style.setProperty("--glow-x", `${(x * 100).toFixed(1)}%`);
      element.style.setProperty("--glow-y", `${(y * 100).toFixed(1)}%`);
    });
  }

  function reset(event: PointerEvent<HTMLElement>) {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    bounds.current = null;
    for (const property of ["--tilt-x", "--tilt-y", "--glow-x", "--glow-y"]) {
      event.currentTarget.style.removeProperty(property);
    }
  }

  return { onPointerMove, onPointerLeave: reset, onPointerCancel: reset };
}
