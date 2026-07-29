"use client";

import { PencilLine, RotateCcw, SlidersHorizontal } from "lucide-react";

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
  placeholderForAmount,
  shouldShowDuration,
  shouldShowDurationMonths,
  titleForFrequency,
} from "./calculatorHelpers";

type MaxCizinOption = {
  id: MaxCizinKomplexVariant;
  label: string;
};

type CalculatorDurationAndFrequencySectionProps = {
  embedded?: boolean;
  product: Product;
  durationHelp: string | null;
  durationHelpOpen: boolean;
  durationYears: number | null;
  durationMonths: number | null;
  durationSourceLabel?: string | null;
  durationUsingOriginal?: boolean;
  missingFields: string[];
  maxCizinKomplexVariant: MaxCizinKomplexVariant;
  maxCizinOptions: MaxCizinOption[];
  hasFrequencyPicker: boolean;
  isLifeProduct: boolean;
  frequency: PaymentFrequency;
  allowedFrequencies: PaymentFrequency[];
  comfortGradual: boolean;
  amountText: string;
  onToggleDurationHelp: () => void;
  onDurationYearsChange: (value: number | null) => void;
  onDurationMonthsChange: (value: number | null) => void;
  onUseOriginalDuration?: () => void;
  onEditDuration?: () => void;
  onMaxCizinVariantChange: (value: MaxCizinKomplexVariant) => void;
  onFrequencyChange: (value: PaymentFrequency) => void;
  onAmountTextChange: (value: string) => void;
};

export function CalculatorDurationAndFrequencySection({
  embedded = false,
  product,
  durationHelp,
  durationHelpOpen,
  durationYears,
  durationMonths,
  durationSourceLabel = null,
  durationUsingOriginal = false,
  missingFields,
  maxCizinKomplexVariant,
  maxCizinOptions,
  hasFrequencyPicker,
  isLifeProduct,
  frequency,
  allowedFrequencies,
  comfortGradual,
  amountText,
  onToggleDurationHelp,
  onDurationYearsChange,
  onDurationMonthsChange,
  onUseOriginalDuration,
  onEditDuration,
  onMaxCizinVariantChange,
  onFrequencyChange,
  onAmountTextChange,
}: CalculatorDurationAndFrequencySectionProps) {
  const showDurationYears = shouldShowDuration(product);
  const showMaxCizinVariant = product === "maxcizinkomplex";
  const showDurationMonths = shouldShowDurationMonths(product);
  const pairAmountWithDuration = isLifeProduct && showDurationYears;
  const showDurationYearsInContractFields = showDurationYears && !pairAmountWithDuration;
  const hasContractParameterFields = showDurationYearsInContractFields || showMaxCizinVariant || showDurationMonths;
  const showFrequencyValue = hasFrequencyPicker || !isLifeProduct;
  const hasPaymentCompanionField = pairAmountWithDuration || showFrequencyValue;
  const amountLabel =
    product === "comfortcc"
      ? comfortGradual
        ? "1% z Poplatku v 1. platbě"
        : "Poplatek"
      : "Částka";
  const renderDurationYearsField = (labelClassName: string) => (
    <div className="space-y-1">
      <label className={`flex min-h-7 items-center ${labelClassName}`}>
        <span className="inline-flex items-center gap-2">
          Doba trvání smlouvy
          {durationHelp && (
            <button
              type="button"
              onClick={onToggleDurationHelp}
              className="inline-flex items-center justify-center rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-900 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
              aria-expanded={durationHelpOpen}
              aria-label="Zobrazit nápovědu k době trvání smlouvy"
            >
              Info
            </button>
          )}
        </span>
      </label>
      {durationHelp && durationHelpOpen && (
        <p className="rounded-xl border border-violet-200 bg-white/80 px-3 py-2 text-xs leading-relaxed text-slate-700">
          {durationHelp}
        </p>
      )}
      {durationSourceLabel && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">
              Dle původní smlouvy
            </p>
            <p className="truncate text-xs font-semibold text-slate-800">
              {durationSourceLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={
              durationUsingOriginal ? onEditDuration : onUseOriginalDuration
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              durationUsingOriginal ? !onEditDuration : !onUseOriginalDuration
            }
          >
            {durationUsingOriginal ? (
              <PencilLine size={13} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <RotateCcw size={13} strokeWidth={2.2} aria-hidden="true" />
            )}
            <span>{durationUsingOriginal ? "Upravit" : "Použít"}</span>
          </button>
        </div>
      )}
      <input
        type="number"
        className={`h-10 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${
          missingFields.includes("dobu trvání smlouvy")
            ? "border-rose-400/70"
            : "border-violet-200"
        }`}
        value={durationYears ?? ""}
        disabled={durationUsingOriginal}
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
  );

  const content = (
    <>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-900">Parametry smlouvy</h2>
        <span className="h-px flex-1 bg-violet-100" aria-hidden="true" />
      </div>
      <div className="space-y-3">
        {hasContractParameterFields && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {showDurationYearsInContractFields &&
              renderDurationYearsField("text-sm font-semibold text-slate-800")}

            {showMaxCizinVariant && (
              <div className="space-y-1">
                <label className="flex min-h-7 items-center text-sm font-semibold text-slate-800">Varianta produktu</label>
                <select
                  className="h-10 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700"
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

            {showDurationMonths && (
              <div className="space-y-1">
                <label className="flex min-h-7 items-center text-sm font-semibold text-slate-800">Doba trvání smlouvy (měsíce)</label>
                <input
                  type="number"
                  min={durationMonthsRange(product)[0]}
                  max={durationMonthsRange(product)[1]}
                  className={`h-10 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700 ${
                    missingFields.includes("dobu trvání v měsících")
                      ? "border-rose-400/70"
                      : "border-violet-200"
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
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-slate-800">
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal size={14} strokeWidth={2} className="text-violet-700" aria-hidden="true" />
              <span>Parametry platby</span>
            </span>
          </label>
          <div
            className={`grid grid-cols-1 gap-2.5 ${
              hasPaymentCompanionField ? "sm:max-w-xl sm:grid-cols-2" : "sm:max-w-xs"
            }`}
          >
            <div className="space-y-1">
              <label className="flex min-h-7 items-center text-xs font-semibold text-slate-700">{amountLabel}</label>
              <input
                type="number"
                className={`h-10 w-full rounded-xl border bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700 ${
                  missingFields.includes("částku") ? "border-rose-400/70" : "border-violet-200"
                }`}
                value={amountText}
                onChange={(event) => onAmountTextChange(event.target.value)}
                placeholder={product === "comfortcc" ? "Zadejte poplatek" : placeholderForAmount(product, frequency)}
              />
            </div>

            {pairAmountWithDuration
              ? renderDurationYearsField("text-xs font-semibold text-slate-700")
              : showFrequencyValue && (
                  <div className="space-y-1">
                    <label className="flex min-h-7 items-center text-xs font-semibold text-slate-700">Frekvence platby</label>
                    {hasFrequencyPicker ? (
                      <select
                        className="h-10 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700"
                        value={frequency}
                        onChange={(event) => onFrequencyChange(event.target.value as PaymentFrequency)}
                      >
                        {allowedFrequencies.map((item) => (
                          <option key={item} value={item}>
                            {titleForFrequency(item)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="flex h-10 items-center rounded-xl border border-violet-100 bg-white/80 px-3 text-sm text-slate-700">
                        {defaultFrequencyText(product)}
                      </p>
                    )}
                  </div>
                )}
          </div>
        </div>
      </div>
    </>
  );

  if (embedded) {
    return <section>{content}</section>;
  }

  return (
    <section className="rounded-[1.1rem] border border-white/80 bg-white/80 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.07)] backdrop-blur-xl">
      {content}
    </section>
  );
}
