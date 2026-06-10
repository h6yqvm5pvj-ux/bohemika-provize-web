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
      <label className={labelClassName}>
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
        className="w-full rounded-[1.05rem] border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
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
  );

  const content = (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-900">Parametry smlouvy</h2>
        <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
      </div>
      <div className="space-y-4">
        {hasContractParameterFields && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {showDurationYearsInContractFields &&
              renderDurationYearsField("block text-sm font-semibold text-slate-800")}

            {showMaxCizinVariant && (
              <div className="space-y-1">
                <label className="block text-sm font-semibold text-slate-800">Varianta produktu</label>
                <select
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
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
                <label className="block text-sm font-semibold text-slate-800">Doba trvání smlouvy (měsíce)</label>
                <input
                  type="number"
                  min={durationMonthsRange(product)[0]}
                  max={durationMonthsRange(product)[1]}
                  className={`w-full rounded-2xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900 ${
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
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-800">
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
              <span>Parametry platby</span>
            </span>
          </label>
          <div
            className={`grid grid-cols-1 gap-3 ${
              hasPaymentCompanionField ? "sm:max-w-xl sm:grid-cols-2" : "sm:max-w-xs"
            }`}
          >
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">{amountLabel}</label>
              <input
                type="number"
                className={`w-full rounded-[1.05rem] border bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900 ${
                  missingFields.includes("částku") ? "border-rose-400/70" : "border-slate-300"
                }`}
                value={amountText}
                onChange={(event) => onAmountTextChange(event.target.value)}
                placeholder={product === "comfortcc" ? "Zadejte poplatek" : placeholderForAmount(product, frequency)}
              />
            </div>

            {pairAmountWithDuration
              ? renderDurationYearsField("block text-xs font-semibold text-slate-700")
              : showFrequencyValue && (
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">Frekvence platby</label>
                    {hasFrequencyPicker ? (
                      <select
                        className="w-full rounded-[1.05rem] border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
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
                      <p className="rounded-[1.05rem] border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
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
    <section className="rounded-[1.35rem] border border-slate-300 bg-white/85 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.06)]">
      {content}
    </section>
  );
}
