"use client";

import { type CommissionMode, type Position, type Product } from "../types/domain";
import { positionLabel } from "@/app/lib/formatters";

type CalculatorPositionModeSectionProps = {
  isVisible: boolean;
  product: Product;
  position: Position;
  allowedPositions: Position[];
  timelineHintText: string | null;
  timelineHintWarning: boolean;
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
  timelineHintText,
  timelineHintWarning,
  canChooseMode,
  mode,
  isNeonHistoricalBySignedDate,
  onPositionChange,
  onModeChange,
}: CalculatorPositionModeSectionProps) {
  if (!isVisible) return null;

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <label className="block text-sm font-medium">Sjednána jako (pozice)</label>
        <select
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
          value={position}
          onChange={(event) => onPositionChange(event.target.value as Position)}
        >
          {allowedPositions.map((item) => (
            <option key={item} value={item}>
              {positionLabel(item)}
            </option>
          ))}
        </select>
        {timelineHintText && (
          <p className={`text-[11px] ${timelineHintWarning ? "text-amber-700" : "text-slate-500"}`}>
            {timelineHintText}
          </p>
        )}
      </div>

      {canChooseMode && (
        <div className="space-y-1">
          <label className="block text-sm font-medium">Režim provize</label>
          <select
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
            value={mode}
            onChange={(event) => onModeChange(event.target.value as CommissionMode)}
          >
            <option value="accelerated">Zrychlený</option>
            <option value="standard">Běžný</option>
          </select>
          <p className="text-[11px] text-slate-400">
            Předvyplněno tvým režimem, ale můžeš přepnout pro tuto konkrétní smlouvu.
          </p>
        </div>
      )}

      {product === "neon" && isNeonHistoricalBySignedDate && (
        <div className="space-y-1">
          <label className="block text-sm font-medium">Režim provize</label>
          <p className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
            U NEON smluv sjednaných od 01.10.2019 do 30.06.2024 se režim zrychlený/běžný nepoužívá.
          </p>
        </div>
      )}
    </section>
  );
}
