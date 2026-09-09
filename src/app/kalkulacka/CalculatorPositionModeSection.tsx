"use client";

import { BriefcaseBusiness, Snail, Zap } from "lucide-react";
import styles from "./calculatorForm.module.css";

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
    <section className={`${styles.card} ${styles.fields}`}>
      <h2 className={styles.sectionHeading}>
        <span className={styles.sectionIcon}><BriefcaseBusiness size={18} strokeWidth={1.7} aria-hidden="true" /></span>
        Nastavení provize
      </h2>
      <div className={styles.fieldGrid}>
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Pozice
          </label>
          <select
            className={`h-10 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700 ${
              positionDisabled ? "cursor-not-allowed bg-slate-50 text-slate-600" : ""
            }`}
            aria-label="Pozice"
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
              className={styles.commissionMode}
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
                  iconClass: "text-violet-600",
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
                    className={styles.commissionModeButton}
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
            <div className="flex h-10 items-center rounded-xl border border-violet-100 bg-white/80 px-3 text-xs font-semibold text-slate-500">
              Historický NEON bez režimu
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
