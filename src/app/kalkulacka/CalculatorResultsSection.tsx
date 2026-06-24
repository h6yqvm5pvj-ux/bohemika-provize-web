"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BarChart3, CheckCircle2, ChevronDown, FileText, Loader2, Sigma } from "lucide-react";

import {
  type CommissionMode,
  type CommissionResultItemDTO,
  type Position,
  type Product,
} from "../types/domain";
import { formatMoney } from "@/app/lib/formatters";
import { cleanResultTitle, resultIconForTitle } from "./calculatorHelpers";
import {
  buildNeonImmediateBreakdown,
  hasNeonImmediateCoefficient,
} from "../smlouvy/[id]/contractDetailLogic";

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
  position: Position;
  mode: CommissionMode;
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

const isLegacyImmediateTotalTitle = (title: string): boolean =>
  cleanResultTitle(title).toLowerCase().includes("okamžitá provize");

const isSplitImmediateProduct = (product: Product): boolean =>
  product === "neon" || product === "flexi";

const isSplitImmediateComponentTitle = (title: string): boolean => {
  const normalizedTitle = cleanResultTitle(title).toLowerCase();
  return (
    normalizedTitle === "provize a101" ||
    normalizedTitle === "provize b0301" ||
    normalizedTitle === "provize 50% z b3601" ||
    normalizedTitle === "provize 50% z b36"
  );
};

const B0301_IMMEDIATE_NOTE =
  "Pro okamžité vyplacení podmíněno zpracováním karty klienta dle podmínek!";

const isB0301Title = (title: string): boolean =>
  cleanResultTitle(title).toLowerCase() === "provize b0301";

const displayNoteForCommissionItem = (item: CommissionResultItemDTO): string | undefined =>
  isB0301Title(item.title) ? B0301_IMMEDIATE_NOTE : item.note;

const sumCommissionItems = (commissionItems: CommissionResultItemDTO[]): number =>
  commissionItems.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);

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
  position,
  mode,
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
  const [expandedNeonImmediateBreakdown, setExpandedNeonImmediateBreakdown] =
    useState(false);

  return (
    <div className="self-start space-y-3 lg:sticky lg:top-6">
      {topTools}
      <section className="relative space-y-4 overflow-hidden rounded-[1.35rem] border border-slate-300 bg-white/95 px-4 py-4 text-slate-900 shadow-[0_14px_32px_rgba(15,23,42,0.06)] sm:px-5 sm:py-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#94a3b8_58%,#e2e8f0_100%)]" aria-hidden="true" />
        <div className="relative flex items-center justify-between gap-3">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-950">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
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
                className="ui-btn-secondary ui-focus inline-flex items-center rounded-full px-3 py-2 text-sm"
                aria-pressed={tipsterPercentPanelOpen}
                aria-label="Nastavit procenta pro tipaře"
              >
                %
              </button>
            )}
          </div>
        </div>

        {tipsterModeEnabled && tipsterPercentPanelOpen && (
          <div className="relative space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-xs uppercase tracking-wide text-slate-500">
                Zobrazované procento provize
              </label>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-sm font-bold text-slate-900">
                {tipsterPercent} %
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void onPersistTipsterPercent(tipsterPercent - 5)}
                className="ui-btn-secondary ui-focus rounded-lg bg-white px-2.5 py-1.5 text-sm"
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
                className="ui-btn-secondary ui-focus rounded-lg bg-white px-2.5 py-1.5 text-sm"
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
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {preset} %
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">Rozsah 0–100 %</p>
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

        {saveMessage && <p className="text-xs text-slate-500">{saveMessage}</p>}

        {tipContractConfig && !tipsterModeEnabled && (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            Aktivní Smlouva z TIPU: {tipContractConfig.tipsterPercent} % z okamžité provize v 1. roce pro{" "}
            {tipContractConfig.tipsterName ?? tipContractConfig.tipsterEmail ?? "neoznačeného tipaře"}.
          </p>
        )}

        {unsupported && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {supportedLabel}
          </p>
        )}

        {!unsupported && items.length === 0 && (
          <p className="text-sm text-slate-500">Zadej částku a produkt, hned vypočítáme jednotlivé provize.</p>
        )}

        {items.length > 0 && !unsupported && (() => {
          if (tipsterModeEnabled) {
            return (
              <div className="relative space-y-2">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 py-3">
                  <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-slate-700">
                    <span className="relative h-6 w-6 flex-shrink-0 sm:h-7 sm:w-7">
                      <Image src="/icons/penize2.png" alt="" fill className="object-contain" />
                    </span>
                    <span>Okamžitá provize ({tipsterPercent} %)</span>
                  </span>
                  <span className="whitespace-nowrap text-lg font-semibold text-slate-950 sm:text-2xl">
                    {formatMoneyResult(tipsterImmediateCommission)}
                  </span>
                </div>

                <div className="flex items-end justify-between gap-3 border-t border-slate-200 pt-4">
                  <span className="font-semibold text-slate-700">Celkem</span>
                  <AnimatedMoneyValue
                    value={tipsterImmediateCommission}
                    className="whitespace-nowrap text-2xl font-bold text-emerald-600 sm:text-3xl"
                  />
                </div>
              </div>
            );
          }

          const displayItems = items.filter((item) => {
            const title = cleanResultTitle(item.title).toLowerCase();
            return !(title === "celkem" || title.startsWith("celková provize"));
          });
          const splitImmediateItems =
            isSplitImmediateProduct(product)
              ? displayItems.filter((item) => isSplitImmediateComponentTitle(item.title))
              : [];
          const hasSplitImmediate = splitImmediateItems.length > 0;
          const regularDisplayItems = hasSplitImmediate
            ? displayItems.filter(
                (item) =>
                  !isSplitImmediateComponentTitle(item.title) &&
                  !isLegacyImmediateTotalTitle(item.title)
              )
            : displayItems;
          const splitImmediateTotal = sumCommissionItems(splitImmediateItems);

          return (
            <div className="relative space-y-1">
              {hasSplitImmediate && (
                <div className="border-b border-slate-200">
                  <button
                    type="button"
                    onClick={() => setExpandedNeonImmediateBreakdown((value) => !value)}
                    aria-expanded={expandedNeonImmediateBreakdown}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-slate-700">
                      <div className="relative h-6 w-6 flex-shrink-0 sm:h-7 sm:w-7">
                        <Image src="/icons/penize2.png" alt="" fill className="object-contain" />
                      </div>
                      <span className="min-w-0">Okamžitá provize</span>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        rozpis
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="whitespace-nowrap text-lg font-semibold text-slate-950 sm:text-2xl">
                        {formatMoneyResult(splitImmediateTotal)}
                      </span>
                      <ChevronDown
                        size={18}
                        strokeWidth={2.2}
                        className={`text-slate-500 transition-transform ${
                          expandedNeonImmediateBreakdown ? "rotate-180" : ""
                        }`}
                        aria-hidden="true"
                      />
                    </span>
                  </button>

                  {expandedNeonImmediateBreakdown && (
                    <div className="mb-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                      <p className="text-sm font-semibold text-slate-900">
                        Rozpis okamžité provize
                      </p>

                      <div className="space-y-2">
                        {splitImmediateItems.map((part) => {
                          const partNote = displayNoteForCommissionItem(part);

                          return (
                            <div
                              key={part.title}
                              className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                            >
                              <span className="min-w-0 text-sm font-medium text-slate-800">
                                <span>{cleanResultTitle(part.title)}</span>
                                {partNote && (
                                  <span className="mt-1 block text-xs font-semibold text-red-600">
                                    {partNote}
                                  </span>
                                )}
                              </span>
                              <span className="whitespace-nowrap pt-0.5 text-sm font-semibold text-slate-950">
                                {formatMoneyResult(part.amount)}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-950 px-3 py-2 text-white">
                        <span className="text-sm font-semibold">
                          Celkem okamžitá provize
                        </span>
                        <span className="whitespace-nowrap text-lg font-bold text-emerald-300">
                          {formatMoneyResult(splitImmediateTotal)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {regularDisplayItems.map((item, idx) => {
                const iconSrc = resultIconForTitle(item.title);
                const title = cleanResultTitle(item.title);
                const canShowNeonImmediateBreakdown =
                  product === "neon" &&
                  isLegacyImmediateTotalTitle(item.title) &&
                  hasNeonImmediateCoefficient(position);
                const neonImmediateBreakdown = canShowNeonImmediateBreakdown
                  ? buildNeonImmediateBreakdown(item.amount ?? 0, position, mode)
                  : null;
                const isNeonBreakdownExpanded =
                  Boolean(neonImmediateBreakdown) && expandedNeonImmediateBreakdown;
                const itemNote = displayNoteForCommissionItem(item);

                return (
                  <div key={idx} className="border-b border-slate-200">
                    <button
                      type="button"
                      onClick={
                        neonImmediateBreakdown
                          ? () =>
                              setExpandedNeonImmediateBreakdown((value) => !value)
                          : undefined
                      }
                      disabled={!neonImmediateBreakdown}
                      aria-expanded={
                        neonImmediateBreakdown
                          ? isNeonBreakdownExpanded
                          : undefined
                      }
                      className={`flex w-full items-center justify-between gap-3 py-3 text-left ${
                        neonImmediateBreakdown
                          ? "rounded-xl px-2 transition hover:bg-slate-50"
                          : "cursor-default"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-slate-700">
                        {iconSrc && (
                          <div className="relative h-6 w-6 flex-shrink-0 sm:h-7 sm:w-7">
                            <Image src={iconSrc} alt="" fill className="object-contain" />
                          </div>
                        )}
                        <span className="min-w-0">
                          <span>{title}</span>
                          {itemNote && (
                            <span className="mt-1 block text-xs font-semibold text-red-600">
                              {itemNote}
                            </span>
                          )}
                        </span>
                        {neonImmediateBreakdown && (
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            rozpis
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="whitespace-nowrap text-lg font-semibold text-slate-950 sm:text-2xl">
                          {formatMoneyResult(item.amount)}
                        </span>
                        {neonImmediateBreakdown && (
                          <ChevronDown
                            size={18}
                            strokeWidth={2.2}
                            className={`text-slate-500 transition-transform ${
                              isNeonBreakdownExpanded ? "rotate-180" : ""
                            }`}
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    </button>

                    {neonImmediateBreakdown && isNeonBreakdownExpanded && (
                      <div className="mb-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                        <p className="text-sm font-semibold text-slate-900">
                          Rozpis okamžité provize
                        </p>

                        <div className="space-y-2">
                          {neonImmediateBreakdown.parts.map((part) => (
                            <div
                              key={part.label}
                              className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                            >
                              <span className="min-w-0 text-sm font-medium text-slate-800">
                                <span>{part.label}</span>
                                {part.label === "Provize B0301" && (
                                  <span className="mt-1 block text-xs font-semibold text-red-600">
                                    Pro okamžité vyplacení podmíněno zpracováním karty klienta dle podmínek!
                                  </span>
                                )}
                              </span>
                              <span className="whitespace-nowrap pt-0.5 text-sm font-semibold text-slate-950">
                                {formatMoneyResult(part.amount)}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-950 px-3 py-2 text-white">
                          <span className="text-sm font-semibold">
                            Celkem okamžitá provize
                          </span>
                          <span className="whitespace-nowrap text-lg font-bold text-emerald-300">
                            {formatMoneyResult(neonImmediateBreakdown.total)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {tipContractConfig && (
                <div className="space-y-1 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-3 text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Smlouva z TIPU
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span>Okamžitá v 1. roce (brutto)</span>
                    <span className="font-semibold text-slate-950">{formatMoneyResult(tipContractImmediateGrossFirstYear)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Podíl tipaře ({tipContractConfig.tipsterPercent} %)</span>
                    <span className="font-semibold text-rose-600">
                      −{formatMoneyResult(tipContractTipsterAmountFirstYear)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Okamžitá v 1. roce po TIPU</span>
                    <span className="font-bold text-emerald-700">
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
                  <div className="w-full space-y-2 border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-700">
                        Celkem v 1. roce{tipContractConfig ? " po TIPU" : ""}
                      </span>
                      <AnimatedMoneyValue
                        value={tipContractConfig ? tipContractImmediateNetFirstYear : paymentBasedTotalsMemo.immediate}
                        className="whitespace-nowrap text-2xl font-bold text-emerald-600 sm:text-3xl"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-700">Celkem ročně následně</span>
                      <AnimatedMoneyValue
                        value={paymentBasedTotalsMemo.subsequent}
                        className="whitespace-nowrap text-2xl font-bold text-emerald-600 sm:text-3xl"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-full border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-700">
                        Celkem{tipContractConfig ? " po TIPU" : ""}
                      </span>
                      <AnimatedMoneyValue
                        value={tipContractConfig ? tipContractTotalNet : total}
                        className="whitespace-nowrap text-2xl font-bold text-emerald-600 sm:text-3xl"
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
            className="ui-btn-primary ui-focus inline-flex min-w-[168px] items-center justify-center gap-2 rounded-full px-7 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center" aria-hidden="true">
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
              className="ui-btn-primary ui-focus inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm"
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
