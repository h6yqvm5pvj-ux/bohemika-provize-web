"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
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
      <section className="relative overflow-hidden rounded-[1.65rem] border border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_58%,#eef2f7_100%)] px-4 py-4 shadow-[0_22px_55px_rgba(15,23,42,0.10)] space-y-3 sm:px-5">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#64748b_50%,#7dd3fc_100%)]" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-20 top-12 h-44 w-44 rounded-full bg-emerald-100/70 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center justify-between gap-3">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm">
              <BarChart3 size={19} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span>Výsledky</span>
          </h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenCoefModal}
              disabled={unsupported}
              className={`ui-btn-secondary ui-focus inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs sm:text-sm ${
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
          <div className="relative rounded-2xl border border-slate-300 bg-white/85 px-3 py-3 space-y-3 shadow-sm">
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
              <div className="relative space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/85 px-3 py-3 shadow-sm">
                  <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-slate-900">
                    <span className="relative h-6 w-6 flex-shrink-0 sm:h-7 sm:w-7">
                      <Image src="/icons/penize2.png" alt="" fill className="object-contain" />
                    </span>
                    <span>Okamžitá provize ({tipsterPercent} %)</span>
                  </span>
                  <span className="whitespace-nowrap text-lg font-semibold text-slate-900 sm:text-2xl">
                    {formatMoneyResult(tipsterImmediateCommission)}
                  </span>
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-[linear-gradient(135deg,#0b1328_0%,#0e1a3a_54%,#081124_100%)] px-4 py-4 shadow-[0_20px_48px_rgba(2,6,23,0.45)]">
                  <span className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-emerald-400/28 blur-3xl" />
                  <span className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-cyan-400/18 blur-3xl" />
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40" />
                  <div className="relative z-10 flex items-center justify-between gap-3">
                    <span className="font-semibold !text-white">Celkem</span>
                    <AnimatedMoneyValue
                      value={tipsterImmediateCommission}
                      className="whitespace-nowrap text-2xl font-bold text-emerald-300 sm:text-3xl"
                    />
                  </div>
                </div>
              </div>
            );
          }

          const displayItems = items.filter((item) => {
            const title = cleanResultTitle(item.title).toLowerCase();
            return !(title === "celkem" || title.startsWith("celková provize"));
          });

          return (
            <div className="relative space-y-2">
              {displayItems.map((item, idx) => {
                const iconSrc = resultIconForTitle(item.title);
                const title = cleanResultTitle(item.title);

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/85 px-3 py-3 shadow-sm"
                  >
                    <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-slate-900">
                      {iconSrc && (
                        <div className="relative h-6 w-6 flex-shrink-0 sm:h-7 sm:w-7">
                          <Image src={iconSrc} alt="" fill className="object-contain" />
                        </div>
                      )}
                      <span className="min-w-0">{title}</span>
                    </span>
                    <span className="whitespace-nowrap text-lg font-semibold text-slate-900 sm:text-2xl">
                      {formatMoneyResult(item.amount)}
                    </span>
                  </div>
                );
              })}

              {tipContractConfig && (
                <div className="space-y-1 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-3 py-3 text-slate-900 shadow-sm">
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
                  <div className="relative w-full space-y-2 overflow-hidden rounded-[1.25rem] border border-slate-800/90 bg-[linear-gradient(135deg,#0b1328_0%,#0e1a3a_54%,#081124_100%)] px-4 py-4 shadow-[0_20px_48px_rgba(2,6,23,0.45)]">
                    <span className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-emerald-400/28 blur-3xl" />
                    <span className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-cyan-400/18 blur-3xl" />
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40" />
                    <div className="relative z-10 flex items-center justify-between gap-3">
                      <span className="font-semibold !text-white">
                        Celkem v 1. roce{tipContractConfig ? " po TIPU" : ""}
                      </span>
                      <AnimatedMoneyValue
                        value={tipContractConfig ? tipContractImmediateNetFirstYear : paymentBasedTotalsMemo.immediate}
                        className="whitespace-nowrap text-2xl font-bold text-emerald-300 sm:text-3xl"
                      />
                    </div>
                    <div className="relative z-10 flex items-center justify-between gap-3">
                      <span className="font-semibold !text-white">Celkem ročně následně</span>
                      <AnimatedMoneyValue
                        value={paymentBasedTotalsMemo.subsequent}
                        className="whitespace-nowrap text-2xl font-bold text-emerald-300 sm:text-3xl"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="relative w-full overflow-hidden rounded-[1.25rem] border border-slate-800/90 bg-[linear-gradient(135deg,#0b1328_0%,#0e1a3a_54%,#081124_100%)] px-4 py-4 shadow-[0_20px_48px_rgba(2,6,23,0.45)]">
                    <span className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-emerald-400/28 blur-3xl" />
                    <span className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-cyan-400/18 blur-3xl" />
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40" />
                    <div className="relative z-10 flex items-center justify-between gap-3">
                      <span className="font-semibold !text-white">
                        Celkem{tipContractConfig ? " po TIPU" : ""}
                      </span>
                      <AnimatedMoneyValue
                        value={tipContractConfig ? tipContractTotalNet : total}
                        className="whitespace-nowrap text-2xl font-bold text-emerald-300 sm:text-3xl"
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
            disabled={!canSaveContract}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(16,185,129,0.22)] transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
            {saving ? "Ukládám…" : "Sepsáno"}
          </button>
          {lastSavedContractHref && (
            <Link
              href={lastSavedContractHref}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
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
