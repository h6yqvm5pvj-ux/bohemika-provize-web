import { useCallback, useEffect, useRef, useState } from "react";

import { formatMoney } from "../homeUtils";

type NumberAnimation = {
  initial: number;
  target: number;
  duration: number;
  animate: boolean;
  publish: (value: number) => void;
};

/** Only active animations subscribe to browser preferences and visibility. */
function startNumberAnimation({ initial, target, duration, animate, publish }: NumberAnimation) {
  const destination = Number.isFinite(target) ? Math.round(target) : 0;
  const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reduced = () => {
    if (document.hidden || motion?.matches || document.documentElement.dataset.motion === "off") return true;
    try { return window.localStorage.getItem("settings.reduceMotion") === "1"; }
    catch { return false; } // Storage is optional.
  };

  if (!animate || !Number.isFinite(duration) || duration <= 0 || initial === destination || reduced()) {
    publish(destination);
    return;
  }

  let frame: number | undefined;
  let start: number | undefined;
  let active = true;
  const cleanup = () => {
    active = false;
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    observer.disconnect();
    motion?.removeEventListener("change", reconcile);
    document.removeEventListener("visibilitychange", reconcile);
    window.removeEventListener("storage", onStorage);
  };
  const finish = () => { cleanup(); publish(destination); };
  const reconcile = () => { if (active && reduced()) finish(); };
  const onStorage = (event: StorageEvent) => {
    if (event.key === "settings.reduceMotion" || event.key === null) reconcile();
  };
  const observer = new MutationObserver(reconcile);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  motion?.addEventListener("change", reconcile);
  document.addEventListener("visibilitychange", reconcile);
  window.addEventListener("storage", onStorage);

  const step = (timestamp: number) => {
    frame = undefined;
    if (!active) return;
    if (document.hidden) { finish(); return; }
    start ??= timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    if (progress >= 1) { finish(); return; }
    const eased = 1 - Math.pow(1 - progress, 3);
    publish(Math.round(initial + (destination - initial) * eased));
    frame = window.requestAnimationFrame(step);
  };
  frame = window.requestAnimationFrame(step);
  return cleanup;
}

function useNumberAnimation(target: number, duration: number, animate: boolean, publish: (value: number) => void) {
  const current = useRef(0);
  useEffect(() => startNumberAnimation({
    initial: current.current, target, duration, animate,
    publish: value => { current.current = value; publish(value); },
  }), [target, duration, animate, publish]);
}

export function useAnimatedNumber(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  useNumberAnimation(target, duration, true, setValue);
  return value;
}

const numberFormatter = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });
const formatNumber = (value: number) => numberFormatter.format(value);
const formatMoneyWithoutCurrency = (value: number) => formatMoney(value, { currencyLabel: "" });

type AnimatedValueProps = { value: number; duration: number; animate: boolean; format: (value: number) => string };

function AnimatedValue({ value, duration, animate, format }: AnimatedValueProps) {
  const element = useRef<HTMLSpanElement>(null);
  const publish = useCallback((next: number) => {
    const text = format(next);
    if (element.current && element.current.textContent !== text) element.current.textContent = text;
  }, [format]);
  useNumberAnimation(value, duration, animate, publish);
  // React owns this span; only the animation changes its text. Keeping its
  // React child constant preserves the current value on unrelated re-renders.
  return <span ref={element}>{format(0)}</span>;
}

export function AnimatedNumber({ value, duration = 800, animate = true }: {
  value: number;
  duration?: number;
  animate?: boolean;
}) {
  return <AnimatedValue value={value} duration={duration} animate={animate} format={formatNumber} />;
}

export function AnimatedMoney({ value, duration = 800, currencyClassName, animate = true }: {
  value: number;
  duration?: number;
  currencyClassName?: string;
  animate?: boolean;
}) {
  if (currencyClassName) {
    return <span>
      <AnimatedValue value={value} duration={duration} animate={animate} format={formatMoneyWithoutCurrency} />
      <span className={currencyClassName}>Kč</span>
    </span>;
  }
  return <AnimatedValue value={value} duration={duration} animate={animate} format={formatMoney} />;
}
