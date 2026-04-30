"use client";

import Image from "next/image";
import Link from "next/link";
import { BarChart3, CheckCircle2, FileText, Sigma } from "lucide-react";

import { type CommissionResultItemDTO, type Product } from "../types/domain";
import { formatMoney } from "@/app/lib/formatters";
import { cleanResultTitle, resultIconForTitle } from "./calculatorHelpers";

type TipContractConfigSummary = {
  tipsterPercent: number;
  tipsterName: string | null;
  tipsterEmail: string | null;
};

type CalculatorResultsSectionProps = {
  tipsterModeEnabled: boolean;
  tipsterPercentPanelOpen: boolean;
  tipsterPercent: number;
  tipsterPercentPresets: number[];
  saveMessage: string | null;
  tipContractConfig: TipContractConfigSummary | null;
  unsupported: boolean;
  supportedLabel: string;
  items: CommissionResultItemDTO[];
  tipsterImmediateCommission: number;
  product: Product;
  paymentBasedTotalsMemo: { immediate: number; subsequent: number } | null;
  tipContractImmediateGrossFirstYear: number;
  tipContractTipsterAmountFirstYear: number;
  tipContractImmediateNetFirstYear: number;
  tipContractTotalNet: number;
  total: number;
  saving: boolean;
  canSaveContract: boolean;
  lastSavedContractHref: string | null;
  onOpenCoefModal: () => void;
  onToggleTipsterPercentPanel: () => void;
  onTipsterPercentDraft: (value: number) => void;
  onPersistTipsterPercent: (value: number) => void | Promise<void>;
  onSaveContract: () => void;
};

function formatMoneyResult(value: number | undefined | null): string {
  return formatMoney(value, {
    minFractionDigits: 2,
    maxFractionDigits: 2,
  });
}

export function CalculatorResultsSection({
  tipsterModeEnabled,
  tipsterPercentPanelOpen,
  tipsterPercent,
  tipsterPercentPresets,
  saveMessage,
  tipContractConfig,
  unsupported,
  supportedLabel,
  items,
  tipsterImmediateCommission,
  product,
  paymentBasedTotalsMemo,
  tipContractImmediateGrossFirstYear,
  tipContractTipsterAmountFirstYear,
  tipContractImmediateNetFirstYear,
  tipContractTotalNet,
  total,
  saving,
  canSaveContract,
  lastSavedContractHref,
  onOpenCoefModal,
  onToggleTipsterPercentPanel,
  onTipsterPercentDraft,
  onPersistTipsterPercent,
  onSaveContract,
}: CalculatorResultsSectionProps) {
  return (
    <div className="self-start space-y-3 lg:sticky lg:top-6">
      <section className="ui-card overflow-hidden rounded-3xl bg-white px-5 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="inline-flex items-center gap-1.5 text-lg font-semibold text-slate-900">
            <BarChart3 size={18} strokeWidth={2} className="text-slate-700" aria-hidden="true" />
            <span>Výsledky</span>
          </h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenCoefModal}
              disabled={unsupported}
              className={`ui-btn-secondary ui-focus inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs sm:text-sm ${
                unsupported ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              <Sigma size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
              Zobrazit koeficienty
            </button>

            {tipsterModeEnabled && (
              <button
                type="button"
                onClick={onToggleTipsterPercentPanel}
                className="ui-btn-primary ui-focus inline-flex items-center rounded-xl px-3 py-2 text-sm"
                aria-pressed={tipsterPercentPanelOpen}
                aria-label="Nastavit procenta pro tipaře"
              >
                %
              </button>
            )}
          </div>
        </div>

        {tipsterModeEnabled && tipsterPercentPanelOpen && (
          <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-xs uppercase tracking-wide text-slate-600">
                Zobrazované procento provize
              </label>
              <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-sm font-bold text-slate-900">
                {tipsterPercent} %
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void onPersistTipsterPercent(tipsterPercent - 5)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                aria-label="Snížit o 5 procentních bodů"
              >
                −5
              </button>

              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={tipsterPercent}
                onChange={(event) => onTipsterPercentDraft(Number(event.target.value) || 0)}
                onPointerUp={(event) => void onPersistTipsterPercent(Number(event.currentTarget.value) || 0)}
                onKeyUp={(event) => {
                  if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") {
                    void onPersistTipsterPercent(Number((event.currentTarget as HTMLInputElement).value) || 0);
                  }
                }}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-slate-900"
                aria-label="Nastavit procento tipařské provize"
              />

              <button
                type="button"
                onClick={() => void onPersistTipsterPercent(tipsterPercent + 5)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                aria-label="Zvýšit o 5 procentních bodů"
              >
                +5
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {tipsterPercentPresets.map((preset) => {
                const active = preset === tipsterPercent;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => void onPersistTipsterPercent(preset)}
                    className={`ui-chip ui-focus rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                      active
                        ? "ui-chip-active"
                        : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    {preset} %
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-600">Rozsah 0–100 %</p>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={tipsterPercent}
                onChange={(event) => onTipsterPercentDraft(Number(event.target.value) || 0)}
                onBlur={() => void onPersistTipsterPercent(tipsterPercent)}
                className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>
        )}

        {saveMessage && <p className="text-xs text-slate-600">{saveMessage}</p>}

        {tipContractConfig && !tipsterModeEnabled && (
          <p className="text-xs text-emerald-700">
            Aktivní Smlouva z TIPU: {tipContractConfig.tipsterPercent} % z okamžité provize v 1. roce pro{" "}
            {tipContractConfig.tipsterName ?? tipContractConfig.tipsterEmail ?? "neoznačeného tipaře"}.
          </p>
        )}

        {unsupported && (
          <p className="rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-800">
            {supportedLabel}
          </p>
        )}

        {!unsupported && items.length === 0 && (
          <p className="text-sm text-slate-600">Zadej částku a produkt, hned vypočítáme jednotlivé provize.</p>
        )}

        {items.length > 0 && !unsupported && (() => {
          if (tipsterModeEnabled) {
            return (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 py-1.5">
                  <span className="flex items-center gap-3 text-sm text-slate-900">
                    <span className="relative h-5 w-5 flex-shrink-0 sm:h-6 sm:w-6">
                      <Image src="/icons/penize2.png" alt="" fill className="object-contain" />
                    </span>
                    <span>Okamžitá provize ({tipsterPercent} %)</span>
                  </span>
                  <span className="text-lg font-semibold text-slate-900 sm:text-2xl">
                    {formatMoneyResult(tipsterImmediateCommission)}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="font-semibold text-slate-900">Celkem</span>
                  <span className="text-2xl font-bold text-slate-900 sm:text-3xl">
                    {formatMoneyResult(tipsterImmediateCommission)}
                  </span>
                </div>
              </div>
            );
          }

          const displayItems = items.filter((item) => {
            const title = cleanResultTitle(item.title).toLowerCase();
            return !(title === "celkem" || title.startsWith("celková provize"));
          });

          return (
            <div className="space-y-2">
              {displayItems.map((item, idx) => {
                const iconSrc = resultIconForTitle(item.title);
                const title = cleanResultTitle(item.title);

                return (
                  <div
                    key={idx}
                    className="flex items-baseline justify-between gap-3 border-b border-slate-200 py-1.5 last:border-b-0"
                  >
                    <span className="flex items-center gap-3 text-sm text-slate-900">
                      {iconSrc && (
                        <div className="relative h-5 w-5 flex-shrink-0 sm:h-6 sm:w-6">
                          <Image src={iconSrc} alt="" fill className="object-contain" />
                        </div>
                      )}
                      <span>{title}</span>
                    </span>
                    <span className="text-lg font-semibold text-slate-900 sm:text-2xl">
                      {formatMoneyResult(item.amount)}
                    </span>
                  </div>
                );
              })}

              {tipContractConfig && (
                <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    Smlouva z TIPU
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span>Okamžitá v 1. roce (brutto)</span>
                    <span className="font-semibold">{formatMoneyResult(tipContractImmediateGrossFirstYear)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Podíl tipaře ({tipContractConfig.tipsterPercent} %)</span>
                    <span className="font-semibold text-rose-700">
                      −{formatMoneyResult(tipContractTipsterAmountFirstYear)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Okamžitá v 1. roce po TIPU</span>
                    <span className="font-bold text-emerald-800">
                      {formatMoneyResult(tipContractImmediateNetFirstYear)}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                {(product === "domex" ||
                  product === "cpphafan" ||
                  product === "koopmajetekobcan" ||
                  product === "maxdomov") &&
                paymentBasedTotalsMemo ? (
                  <div className="w-full space-y-1 text-slate-900">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Celkem v 1. roce{tipContractConfig ? " po TIPU" : ""}</span>
                      <span className="text-2xl font-bold text-slate-900 sm:text-3xl">
                        {formatMoneyResult(
                          tipContractConfig ? tipContractImmediateNetFirstYear : paymentBasedTotalsMemo.immediate
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Celkem ročně následně</span>
                      <span className="text-2xl font-bold text-slate-900 sm:text-3xl">
                        {formatMoneyResult(paymentBasedTotalsMemo.subsequent)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="font-semibold text-slate-900">Celkem{tipContractConfig ? " po TIPU" : ""}</span>
                    <span className="text-2xl font-bold text-slate-900 sm:text-3xl">
                      {formatMoneyResult(tipContractConfig ? tipContractTotalNet : total)}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </section>
      {!tipsterModeEnabled && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSaveContract}
            disabled={!canSaveContract}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
            {saving ? "Ukládám…" : "Sepsáno"}
          </button>
          {lastSavedContractHref && (
            <Link
              href={lastSavedContractHref}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            >
              <FileText size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
              Zobrazit smlouvu
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
