"use client";

import { Snail, Zap } from "lucide-react";

import { type CommissionMode, type Position, type Product } from "../types/domain";
import { positionLabel } from "@/app/lib/formatters";

type CalculatorPositionModeSectionProps = {
  isVisible: boolean;
  product: Product;
  position: Position;
  allowedPositions: Position[];
  positionDisabled?: boolean;
  canChooseMode: boolean;
  mode: CommissionMode;
  isNeonHistoricalBySignedDate: boolean;
  onPositionChange: (value: Position) => void;
  onModeChange: (value: CommissionMode) => void;
};

export function CalculatorPositionModeSection({
  isVisible,
  product,
  position,
  allowedPositions,
  positionDisabled = false,
  canChooseMode,
  mode,
  isNeonHistoricalBySignedDate,
  onPositionChange,
  onModeChange,
}: CalculatorPositionModeSectionProps) {
  if (!isVisible) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Pozice
          </label>
          <select
            className={`h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900 ${
              positionDisabled ? "cursor-not-allowed bg-slate-50 text-slate-600" : ""
            }`}
            value={position}
            onChange={(event) => onPositionChange(event.target.value as Position)}
            disabled={positionDisabled}
          >
            {allowedPositions.map((item) => (
              <option key={item} value={item}>
                {positionLabel(item)}
              </option>
            ))}
          </select>
        </div>

        {canChooseMode && (
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Režim provize
            </label>
            <div
              className="grid h-10 grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-0.5 shadow-sm"
              role="radiogroup"
              aria-label="Režim provize"
            >
              {([
                {
                  value: "standard",
                  label: "Běžná",
                  icon: Snail,
                  iconClass: "text-slate-500",
                },
                {
                  value: "accelerated",
                  label: "Zrychlená",
                  icon: Zap,
                  iconClass: "text-amber-500",
                },
              ] satisfies {
                value: CommissionMode;
                label: string;
                icon: typeof Snail;
                iconClass: string;
              }[]).map((option) => {
                const active = mode === option.value;
                const Icon = option.icon;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onModeChange(option.value)}
                    className={`inline-flex h-9 items-center justify-center gap-2 rounded-[0.65rem] border px-3 text-sm font-semibold transition ${
                      active
                        ? "border-slate-900 bg-white text-slate-950 shadow-[0_4px_12px_rgba(15,23,42,0.1)]"
                        : "border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                    }`}
                    role="radio"
                    aria-checked={active}
                  >
                    <Icon
                      size={16}
                      strokeWidth={2.25}
                      className={active ? option.iconClass : "text-slate-400"}
                      aria-hidden="true"
                    />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {product === "neon" && isNeonHistoricalBySignedDate && (
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Režim provize
            </label>
            <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-500">
              Historický NEON bez režimu
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
