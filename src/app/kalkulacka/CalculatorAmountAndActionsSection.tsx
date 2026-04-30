"use client";

import { RefreshCcw, Repeat2 } from "lucide-react";

import { type PaymentFrequency, type Product } from "../types/domain";
import { placeholderForAmount } from "./calculatorHelpers";

type CalculatorAmountAndActionsSectionProps = {
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
  return (
    <section className="space-y-3">
      {product === "comfortcc" && (
        <section className="space-y-2">
          <div className="text-sm font-medium">Comfort Commodity</div>
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="mb-1 text-[12px] uppercase tracking-wide text-slate-400">Poplatek</div>
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
        <label className="block text-sm font-medium">
          {product === "comfortcc"
            ? comfortGradual
              ? "1% z Poplatku v 1. platbě"
              : "Poplatek (zde se určuje provize z poplatku klienta)"
            : "Částka"}
        </label>
        <input
          type="number"
          className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900 ${
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
            <label className="block text-sm font-medium">Pravidelná platba</label>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
              value={comfortPaymentText}
              onChange={(event) => onComfortPaymentTextChange(event.target.value)}
              placeholder="Zadejte pravidelnou platbu"
            />
          </div>

          {comfortGradual && (
            <div className="space-y-1">
              <label className="block text-sm font-medium">Cílová částka (volitelné)</label>
              <input
                type="number"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
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
        <div className="space-y-2">
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
            <p className="text-[11px] text-slate-600">
              Při uložení se nová smlouva označí jako Refresh.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
