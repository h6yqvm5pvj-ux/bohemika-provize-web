import { useEffect, useState } from "react";

import { formatMoney } from "../homeUtils";

export function useAnimatedNumber(target: number, duration = 800): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame: number;
    let start: number | null = null;
    const initial = value;
    const diff = target - initial;

    if (diff === 0) return;

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = initial + diff * eased;
      setValue(Math.round(current));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

export function AnimatedNumber({
  value,
  duration = 800,
}: {
  value: number;
  duration?: number;
}) {
  const animated = useAnimatedNumber(value, duration);
  return (
    <span>
      {animated.toLocaleString("cs-CZ", {
        maximumFractionDigits: 0,
      })}
    </span>
  );
}

export function AnimatedMoney({
  value,
  duration = 800,
}: {
  value: number;
  duration?: number;
}) {
  const animated = useAnimatedNumber(value, duration);
  return <span>{formatMoney(animated)}</span>;
}
