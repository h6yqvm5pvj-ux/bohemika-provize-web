"use client";

import { SlidersHorizontal } from "lucide-react";

import {
  type MaxCizinKomplexVariant,
  type PaymentFrequency,
  type Product,
} from "../types/domain";
import {
  defaultFrequencyText,
  durationMonthsRange,
  durationRange,
  normalizedDurationMonths,
  shouldShowDuration,
  shouldShowDurationMonths,
  titleForFrequency,
} from "./calculatorHelpers";

type MaxCizinOption = {
  id: MaxCizinKomplexVariant;
  label: string;
};

type CalculatorDurationAndFrequencySectionProps = {
  product: Product;
  durationHelp: string | null;
  durationHelpOpen: boolean;
  durationYears: number | null;
  durationMonths: number | null;
  missingFields: string[];
  maxCizinKomplexVariant: MaxCizinKomplexVariant;
  maxCizinOptions: MaxCizinOption[];
  hasFrequencyPicker: boolean;
  isLifeProduct: boolean;
  frequency: PaymentFrequency;
  allowedFrequencies: PaymentFrequency[];
  onToggleDurationHelp: () => void;
  onDurationYearsChange: (value: number | null) => void;
  onDurationMonthsChange: (value: number | null) => void;
  onMaxCizinVariantChange: (value: MaxCizinKomplexVariant) => void;
  onFrequencyChange: (value: PaymentFrequency) => void;
};

export function CalculatorDurationAndFrequencySection({
  product,
  durationHelp,
  durationHelpOpen,
  durationYears,
  durationMonths,
  missingFields,
  maxCizinKomplexVariant,
  maxCizinOptions,
  hasFrequencyPicker,
  isLifeProduct,
  frequency,
  allowedFrequencies,
  onToggleDurationHelp,
  onDurationYearsChange,
  onDurationMonthsChange,
  onMaxCizinVariantChange,
  onFrequencyChange,
}: CalculatorDurationAndFrequencySectionProps) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {shouldShowDuration(product) && (
        <div className="space-y-1">
          <label className="block text-sm font-medium">
            <span className="inline-flex items-center gap-2">
              Doba trvání smlouvy
              {durationHelp && (
                <button
                  type="button"
                  onClick={onToggleDurationHelp}
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-900 transition hover:bg-slate-100"
                  aria-expanded={durationHelpOpen}
                  aria-label="Zobrazit nápovědu k době trvání smlouvy"
                >
                  Info
                </button>
              )}
            </span>
          </label>
          {durationHelp && durationHelpOpen && (
            <p className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
              {durationHelp}
            </p>
          )}
          <input
            type="number"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
            value={durationYears ?? ""}
            onChange={(event) => {
              const raw = event.target.value.trim();
              if (!raw) {
                onDurationYearsChange(null);
                return;
              }
              const parsed = Number(raw);
              if (!Number.isFinite(parsed)) {
                onDurationYearsChange(null);
                return;
              }
              const [min, max] = durationRange(product);
              onDurationYearsChange(Math.min(max, Math.max(min, Math.floor(parsed))));
            }}
          />
        </div>
      )}

      {product === "maxcizinkomplex" && (
        <div className="space-y-1">
          <label className="block text-sm font-medium">Varianta produktu</label>
          <select
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
            value={maxCizinKomplexVariant}
            onChange={(event) => onMaxCizinVariantChange(event.target.value as MaxCizinKomplexVariant)}
          >
            {maxCizinOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {shouldShowDurationMonths(product) && (
        <div className="space-y-1">
          <label className="block text-sm font-medium">Doba trvání smlouvy (měsíce)</label>
          <input
            type="number"
            min={durationMonthsRange(product)[0]}
            max={durationMonthsRange(product)[1]}
            className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900 ${
              missingFields.includes("dobu trvání v měsících")
                ? "border-rose-400/70"
                : "border-slate-300"
            }`}
            value={durationMonths ?? ""}
            onChange={(event) => {
              const raw = event.target.value.trim();
              if (!raw) {
                onDurationMonthsChange(null);
                return;
              }
              const parsed = Number(raw);
              if (!Number.isFinite(parsed)) {
                onDurationMonthsChange(null);
                return;
              }
              onDurationMonthsChange(normalizedDurationMonths(product, parsed));
            }}
            placeholder="Např. 12"
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="block text-sm font-medium">
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
            <span>Parametry platby</span>
          </span>
        </label>
        {hasFrequencyPicker ? (
          <select
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
            value={frequency}
            onChange={(event) => onFrequencyChange(event.target.value as PaymentFrequency)}
          >
            {allowedFrequencies.map((item) => (
              <option key={item} value={item}>
                {titleForFrequency(item)}
              </option>
            ))}
          </select>
        ) : !isLifeProduct ? (
          <p className="text-sm text-slate-700">{defaultFrequencyText(product)}</p>
        ) : null}
      </div>
    </section>
  );
}
