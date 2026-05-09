"use client";

import { FileText, RefreshCcw, Repeat2 } from "lucide-react";

import { type PaymentFrequency, type Product } from "../types/domain";
import { placeholderForAmount } from "./calculatorHelpers";

type CalculatorAmountAndActionsSectionProps = {
  embedded?: boolean;
  product: Product;
  frequency: PaymentFrequency;
  isLifeProduct: boolean;
  tipsterModeEnabled: boolean;
  comfortGradual: boolean;
  amountText: string;
  comfortPaymentText: string;
  comfortTargetAmountText: string;
  comfortPayoutCount: number | null;
  missingFields: string[];
  hasTipContractConfig: boolean;
  refreshOriginalOpen: boolean;
  onComfortGradualChange: (value: boolean) => void;
  onAmountTextChange: (value: string) => void;
  onComfortPaymentTextChange: (value: string) => void;
  onComfortTargetAmountTextChange: (value: string) => void;
  onOpenTipContractModal: () => void;
  onToggleRefreshOriginal: () => void;
  onPrepareEndorsement: () => void;
};

export function CalculatorAmountAndActionsSection({
  embedded = false,
  product,
  frequency,
  isLifeProduct,
  tipsterModeEnabled,
  comfortGradual,
  amountText,
  comfortPaymentText,
  comfortTargetAmountText,
  comfortPayoutCount,
  missingFields,
  hasTipContractConfig,
  refreshOriginalOpen,
  onComfortGradualChange,
  onAmountTextChange,
  onComfortPaymentTextChange,
  onComfortTargetAmountTextChange,
  onOpenTipContractModal,
  onToggleRefreshOriginal,
  onPrepareEndorsement,
}: CalculatorAmountAndActionsSectionProps) {
  const content = (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-900">Výpočet provize</h2>
        <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
      </div>
      <div className="space-y-4">
      {product === "comfortcc" && (
        <section className="space-y-2">
          <div className="text-sm font-semibold text-slate-800">Comfort Commodity</div>
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="mb-1 text-[12px] uppercase text-slate-400">Poplatek</div>
              <div className="ui-chip-group">
                <button
                  type="button"
                  onClick={() => onComfortGradualChange(false)}
                  className={`ui-chip ui-focus px-3 py-1.5 text-sm ${!comfortGradual ? "ui-chip-active" : ""}`}
                >
                  Jednorázový poplatek
                </button>
                <button
                  type="button"
                  onClick={() => onComfortGradualChange(true)}
                  className={`ui-chip ui-focus px-3 py-1.5 text-sm ${comfortGradual ? "ui-chip-active" : ""}`}
                >
                  Postupný poplatek
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="space-y-1">
        <label className="block text-sm font-semibold text-slate-800">
          {product === "comfortcc"
            ? comfortGradual
              ? "1% z Poplatku v 1. platbě"
              : "Poplatek (zde se určuje provize z poplatku klienta)"
            : "Částka"}
        </label>
        <input
          type="number"
          className={`w-full rounded-2xl border bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_18px_rgba(15,23,42,0.06)] outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900 ${
            missingFields.includes("částku") ? "border-rose-400/70" : "border-slate-300"
          }`}
          value={amountText}
          onChange={(event) => onAmountTextChange(event.target.value)}
          placeholder={product === "comfortcc" ? "Zadejte poplatek" : placeholderForAmount(product, frequency)}
        />
      </div>

      {product === "comfortcc" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-slate-800">Pravidelná platba</label>
            <input
              type="number"
              className="w-full rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
              value={comfortPaymentText}
              onChange={(event) => onComfortPaymentTextChange(event.target.value)}
              placeholder="Zadejte pravidelnou platbu"
            />
          </div>

          {comfortGradual && (
            <div className="space-y-1">
              <label className="block text-sm font-semibold text-slate-800">Cílová částka (volitelné)</label>
              <input
                type="number"
                className="w-full rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
                value={comfortTargetAmountText}
                onChange={(event) => onComfortTargetAmountTextChange(event.target.value)}
                placeholder="Např. 200000"
              />
              {comfortPayoutCount && (
                <p className="text-xs text-slate-600">
                  Následná provize z platby bude vyplacena celkem {comfortPayoutCount}x.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {!tipsterModeEnabled && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenTipContractModal}
              className={`ui-btn-primary ui-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
                hasTipContractConfig
                  ? "border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700"
                  : ""
              }`}
            >
              <FileText size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
              {hasTipContractConfig ? "Smlouva z TIPU ✓" : "Smlouva z TIPU"}
            </button>
            {isLifeProduct && product === "neon" && (
              <button
                type="button"
                onClick={onToggleRefreshOriginal}
                className={`ui-btn-primary ui-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
                  refreshOriginalOpen
                    ? "border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700"
                    : ""
                }`}
              >
                <RefreshCcw size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                {refreshOriginalOpen ? "Refresh zapnutý" : "Refresh smlouvy"}
              </button>
            )}
            {isLifeProduct && (
              <button
                type="button"
                onClick={onPrepareEndorsement}
                className="ui-btn-primary ui-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm"
              >
                <Repeat2 size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                Změna
              </button>
            )}
          </div>
          {isLifeProduct && product === "neon" && refreshOriginalOpen && (
            <p className="mt-2 text-[11px] text-slate-600">
              Při uložení se nová smlouva označí jako Refresh.
            </p>
          )}
        </div>
      )}
      </div>
    </>
  );

  if (embedded) {
    return <section>{content}</section>;
  }

  return (
    <section className="rounded-[1.35rem] border border-slate-300 bg-white/90 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.06)]">
      {content}
    </section>
  );
}
