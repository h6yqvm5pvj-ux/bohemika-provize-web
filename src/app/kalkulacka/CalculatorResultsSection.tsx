"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BarChart3, CheckCircle2, FileText, Loader2, Sigma } from "lucide-react";

import { type CommissionResultItemDTO, type Product } from "../types/domain";
import { formatMoney } from "@/app/lib/formatters";
import { cleanResultTitle, resultIconForTitle } from "./calculatorHelpers";

type TipContractConfigSummary = {
  tipsterPercent: number;
  tipsterName: string | null;
  tipsterEmail: string | null;
};

type CalculatorResultsSectionProps = {
  topTools?: ReactNode;
  tipsterModeEnabled: boolean;
  showSaveActions?: boolean;
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

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", sync);
      return () => query.removeEventListener("change", sync);
    }

    query.addListener(sync);
    return () => query.removeListener(sync);
  }, []);

  return reducedMotion;
}

function AnimatedMoneyValue({
  value,
  className,
}: {
  value: number;
  className: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const previousRef = useRef(value);
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const syncOnNextFrame = (nextValue: number) => {
      const rafId = window.requestAnimationFrame(() => {
        setDisplayValue(nextValue);
        previousRef.current = nextValue;
      });
      return () => window.cancelAnimationFrame(rafId);
    };

    if (!Number.isFinite(value)) {
      return syncOnNextFrame(0);
    }

    if (reducedMotion) {
      return syncOnNextFrame(value);
    }

    const start = previousRef.current;
    const delta = value - start;
    if (Math.abs(delta) < 0.01) {
      return syncOnNextFrame(value);
    }

    const durationMs = 650;
    const startAt = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(start + delta * eased);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      previousRef.current = value;
      setDisplayValue(value);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [reducedMotion, value]);

  return <span className={className}>{formatMoneyResult(displayValue)}</span>;
}

export function CalculatorResultsSection({
  topTools,
  tipsterModeEnabled,
  showSaveActions = true,
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
      {topTools}
      <section className="relative space-y-4 overflow-hidden rounded-[1.85rem] border border-violet-300/35 bg-[radial-gradient(circle_at_14%_0%,rgba(168,85,247,0.26),transparent_42%),linear-gradient(165deg,#261048_0%,#160934_58%,#0d0521_100%)] px-4 py-4 text-white shadow-[0_20px_44px_rgba(11,3,33,0.5)] sm:px-5 sm:py-5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-fuchsia-300/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-44 w-44 rounded-full bg-indigo-300/16 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center justify-between gap-3">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-violet-50">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-violet-100/45 bg-violet-300/18 text-emerald-200">
              <BarChart3 size={19} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span>Výsledky</span>
          </h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenCoefModal}
              disabled={unsupported}
              className={`inline-flex items-center gap-2 rounded-full border border-violet-100/45 bg-violet-300/20 px-3 py-2 text-xs font-semibold text-violet-50 transition hover:border-violet-100/70 hover:bg-violet-300/30 sm:text-sm ${
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
                className="inline-flex items-center rounded-full border border-violet-100/45 bg-violet-300/20 px-3 py-2 text-sm font-semibold text-violet-50 transition hover:border-violet-100/70 hover:bg-violet-300/30"
                aria-pressed={tipsterPercentPanelOpen}
                aria-label="Nastavit procenta pro tipaře"
              >
                %
              </button>
            )}
          </div>
        </div>

        {tipsterModeEnabled && tipsterPercentPanelOpen && (
          <div className="relative space-y-3 rounded-2xl border border-violet-100/30 bg-violet-950/28 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-xs uppercase tracking-wide text-violet-100/70">
                Zobrazované procento provize
              </label>
              <span className="rounded-full border border-violet-100/45 bg-violet-300/20 px-2.5 py-1 text-sm font-bold text-violet-50">
                {tipsterPercent} %
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void onPersistTipsterPercent(tipsterPercent - 5)}
                className="rounded-lg border border-violet-100/45 bg-violet-300/20 px-2.5 py-1.5 text-sm font-semibold text-violet-50 transition hover:border-violet-100/70 hover:bg-violet-300/30"
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
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-violet-200/25 accent-violet-200"
                aria-label="Nastavit procento tipařské provize"
              />

              <button
                type="button"
                onClick={() => void onPersistTipsterPercent(tipsterPercent + 5)}
                className="rounded-lg border border-violet-100/45 bg-violet-300/20 px-2.5 py-1.5 text-sm font-semibold text-violet-50 transition hover:border-violet-100/70 hover:bg-violet-300/30"
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
                        : "border-violet-100/45 bg-violet-300/20 text-violet-50 hover:border-violet-100/70 hover:bg-violet-300/30"
                    }`}
                  >
                    {preset} %
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-violet-100/70">Rozsah 0–100 %</p>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={tipsterPercent}
                onChange={(event) => onTipsterPercentDraft(Number(event.target.value) || 0)}
                onBlur={() => void onPersistTipsterPercent(tipsterPercent)}
                className="w-20 rounded-lg border border-violet-100/45 bg-violet-300/18 px-2.5 py-1.5 text-sm text-violet-50 outline-none focus:border-violet-100 focus:ring-2 focus:ring-violet-200/40"
              />
            </div>
          </div>
        )}

        {saveMessage && <p className="text-xs text-violet-100/75">{saveMessage}</p>}

        {tipContractConfig && !tipsterModeEnabled && (
          <p className="text-xs text-emerald-200/95">
            Aktivní Smlouva z TIPU: {tipContractConfig.tipsterPercent} % z okamžité provize v 1. roce pro{" "}
            {tipContractConfig.tipsterName ?? tipContractConfig.tipsterEmail ?? "neoznačeného tipaře"}.
          </p>
        )}

        {unsupported && (
          <p className="rounded-xl border border-amber-300/55 bg-amber-300/18 px-3 py-2 text-sm text-amber-100">
            {supportedLabel}
          </p>
        )}

        {!unsupported && items.length === 0 && (
          <p className="text-sm text-violet-100/75">Zadej částku a produkt, hned vypočítáme jednotlivé provize.</p>
        )}

        {items.length > 0 && !unsupported && (() => {
          if (tipsterModeEnabled) {
            return (
              <div className="relative space-y-2">
                <div className="flex items-center justify-between gap-3 border-b border-violet-100/20 py-3">
                  <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-violet-50">
                    <span className="relative h-6 w-6 flex-shrink-0 sm:h-7 sm:w-7">
                      <Image src="/icons/penize2.png" alt="" fill className="object-contain" />
                    </span>
                    <span>Okamžitá provize ({tipsterPercent} %)</span>
                  </span>
                  <span className="whitespace-nowrap text-lg font-semibold text-violet-50 sm:text-2xl">
                    {formatMoneyResult(tipsterImmediateCommission)}
                  </span>
                </div>

                <div className="flex items-end justify-between gap-3 border-t border-violet-100/25 pt-4">
                  <span className="font-semibold text-violet-100">Celkem</span>
                  <AnimatedMoneyValue
                    value={tipsterImmediateCommission}
                    className="whitespace-nowrap text-2xl font-bold text-emerald-200 sm:text-3xl"
                  />
                </div>
              </div>
            );
          }

          const displayItems = items.filter((item) => {
            const title = cleanResultTitle(item.title).toLowerCase();
            return !(title === "celkem" || title.startsWith("celková provize"));
          });

          return (
            <div className="relative space-y-1">
              {displayItems.map((item, idx) => {
                const iconSrc = resultIconForTitle(item.title);
                const title = cleanResultTitle(item.title);

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 border-b border-violet-100/18 py-3"
                  >
                    <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-violet-50">
                      {iconSrc && (
                        <div className="relative h-6 w-6 flex-shrink-0 sm:h-7 sm:w-7">
                          <Image src={iconSrc} alt="" fill className="object-contain" />
                        </div>
                      )}
                      <span className="min-w-0">{title}</span>
                    </span>
                    <span className="whitespace-nowrap text-lg font-semibold text-violet-50 sm:text-2xl">
                      {formatMoneyResult(item.amount)}
                    </span>
                  </div>
                );
              })}

              {tipContractConfig && (
                <div className="space-y-1 border-l-2 border-emerald-300/55 pl-3 text-violet-100">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                    Smlouva z TIPU
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span>Okamžitá v 1. roce (brutto)</span>
                    <span className="font-semibold">{formatMoneyResult(tipContractImmediateGrossFirstYear)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Podíl tipaře ({tipContractConfig.tipsterPercent} %)</span>
                    <span className="font-semibold text-rose-200">
                      −{formatMoneyResult(tipContractTipsterAmountFirstYear)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Okamžitá v 1. roce po TIPU</span>
                    <span className="font-bold text-emerald-200">
                      {formatMoneyResult(tipContractImmediateNetFirstYear)}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-3">
                {(product === "domex" ||
                  product === "cpphafan" ||
                  product === "koopmajetekobcan" ||
                  product === "maxdomov") &&
                paymentBasedTotalsMemo ? (
                  <div className="w-full space-y-2 border-t border-violet-100/25 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-violet-100">
                        Celkem v 1. roce{tipContractConfig ? " po TIPU" : ""}
                      </span>
                      <AnimatedMoneyValue
                        value={tipContractConfig ? tipContractImmediateNetFirstYear : paymentBasedTotalsMemo.immediate}
                        className="whitespace-nowrap text-2xl font-bold text-emerald-200 sm:text-3xl"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-violet-100">Celkem ročně následně</span>
                      <AnimatedMoneyValue
                        value={paymentBasedTotalsMemo.subsequent}
                        className="whitespace-nowrap text-2xl font-bold text-emerald-200 sm:text-3xl"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-full border-t border-violet-100/25 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-violet-100">
                        Celkem{tipContractConfig ? " po TIPU" : ""}
                      </span>
                      <AnimatedMoneyValue
                        value={tipContractConfig ? tipContractTotalNet : total}
                        className="whitespace-nowrap text-2xl font-bold text-emerald-200 sm:text-3xl"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </section>
      {showSaveActions && !tipsterModeEnabled && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSaveContract}
            disabled={!canSaveContract || saving}
            aria-busy={saving}
            className="group relative inline-flex min-w-[168px] items-center justify-center gap-2 overflow-hidden rounded-full border border-[#111827] bg-[#111827] px-7 py-2.5 text-sm font-black text-[#f8fafc] shadow-[0_16px_34px_rgba(15,23,42,0.26)] transition hover:-translate-y-0.5 hover:border-[#1f2937] hover:bg-[#1f2937] hover:shadow-[0_20px_44px_rgba(15,23,42,0.34)] active:translate-y-0 disabled:cursor-not-allowed disabled:border-[#334155] disabled:bg-[#334155] disabled:text-[#f8fafc] disabled:opacity-100 disabled:shadow-[0_12px_26px_rgba(15,23,42,0.2)] disabled:hover:translate-y-0"
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-[115%] bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.34)_45%,transparent_78%)] transition-transform duration-500 ease-out group-hover:translate-x-[120%]" aria-hidden="true" />
            <span className="relative z-10 inline-flex h-5 w-5 items-center justify-center" aria-hidden="true">
              {saving ? (
                <Loader2 size={14} strokeWidth={2.2} className="shrink-0 animate-spin" />
              ) : (
                <CheckCircle2 size={14} strokeWidth={2.2} className="shrink-0" />
              )}
            </span>
            {saving ? "Ukládám…" : "Sepsáno"}
          </button>
          {lastSavedContractHref && (
            <Link
              href={lastSavedContractHref}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#111827] bg-[#111827] px-4 py-2 text-sm font-black text-[#f8fafc] shadow-[0_14px_30px_rgba(15,23,42,0.24)] transition hover:-translate-y-0.5 hover:border-[#1f2937] hover:bg-[#1f2937] hover:shadow-[0_18px_38px_rgba(15,23,42,0.3)]"
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
