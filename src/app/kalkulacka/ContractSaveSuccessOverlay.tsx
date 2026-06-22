"use client";

import { type CSSProperties } from "react";
import { CheckCircle2 } from "lucide-react";

const CONFETTI_COLORS = [
  "#c084fc",
  "#a855f7",
  "#22c55e",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#60a5fa",
];

const CONFETTI_PIECES = Array.from({ length: 52 }, (_, index) => {
  const angle = (index / 52) * Math.PI * 2;
  const radius = 118 + (index % 9) * 18;
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius - 26 - (index % 4) * 8),
    rotate: ((index * 53) % 360) - 180,
    delayMs: (index % 10) * 22,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    shapeClass:
      index % 5 === 0
        ? "h-2.5 w-2.5 rounded-full"
        : index % 3 === 0
          ? "h-2 w-4 rounded-[3px]"
          : "h-3 w-1.5 rounded-[2px]",
  };
});

type ContractSaveSuccessOverlayProps = {
  visible: boolean;
  celebrationKey: number;
};

export function ContractSaveSuccessOverlay({
  visible,
  celebrationKey,
}: ContractSaveSuccessOverlayProps) {
  if (!visible) return null;

  return (
    <div
      key={celebrationKey}
      className="admin-create-celebration pointer-events-none fixed inset-0 z-[120] flex items-center justify-center px-4"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="absolute inset-0 bg-slate-950/24 backdrop-blur-[5px]" />
      <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2">
        {CONFETTI_PIECES.map((piece, index) => (
          <span
            key={`${piece.x}-${piece.y}-${index}`}
            className={`admin-create-confetti-piece absolute left-1/2 top-1/2 ${piece.shapeClass}`}
            style={
              {
                "--admin-confetti-x": `${piece.x}px`,
                "--admin-confetti-y": `${piece.y}px`,
                "--admin-confetti-rotate": `${piece.rotate}deg`,
                "--admin-confetti-color": piece.color,
                animationDelay: `${piece.delayMs}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="admin-create-success-stage relative flex min-h-[260px] flex-col items-center justify-center px-4 text-center">
        <span className="admin-create-success-aura absolute inset-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full" />
        <span className="admin-create-success-orbit absolute left-1/2 top-1/2 h-[210px] w-[210px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
        <span className="admin-create-success-check relative mb-5 inline-flex h-24 w-24 items-center justify-center rounded-full !text-emerald-100">
          <CheckCircle2 size={56} strokeWidth={2.4} aria-hidden="true" />
        </span>
        <p className="admin-create-success-kicker text-[12px] font-semibold uppercase tracking-[0.32em]">
          Hotovo
        </p>
        <p className="admin-create-success-title mt-2 font-bold tracking-[-0.02em]">
          Smlouva sepsána !
        </p>
      </div>
    </div>
  );
}
