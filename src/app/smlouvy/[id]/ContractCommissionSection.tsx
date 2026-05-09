import Image from "next/image";
import { ChevronDown } from "lucide-react";

import {
  type CommissionMode,
  type CommissionResultItemDTO,
  type Position,
  type Product,
} from "../../types/domain";
import {
  cleanResultTitle,
  formatMoney,
  positionLabel,
  resultIconForTitle,
} from "./contractDetailHelpers";
import {
  hasNeonImmediateCoefficient,
  isImmediateCommissionTitle,
} from "./contractDetailLogic";

export type MeziprovisionCard = {
  key: string;
  userName: string;
  position: Position | null;
  mode: CommissionMode | null;
  items: CommissionResultItemDTO[];
  totals: { immediate: number; subsequent: number } | null;
  totalDisplay: number;
};

type ContractCommissionSectionProps = {
  product: Product | undefined;
  isOwnContract: boolean;
  isPaymentBasedProduct: boolean;
  showAnyMeziprovision: boolean;
  meziprovisionCards: MeziprovisionCard[];
  expandedMeziprovisionKeys: string[];
  onToggleMeziprovisionCard: (key: string) => void;
  adviserItems: CommissionResultItemDTO[];
  adviserBreakdownPosition: Position | null;
  adviserBreakdownMode: CommissionMode | null;
  paymentBasedAdviserTotals: { immediate: number; subsequent: number } | null;
  adviserTotalDisplay: number;
  contractAuthorName: string;
  showAdvisorDetails: boolean;
  onToggleAdvisorDetails: () => void;
  onOpenNeonImmediateBreakdown: (
    item: CommissionResultItemDTO,
    position: Position | null | undefined,
    commissionMode: CommissionMode | null | undefined
  ) => void;
};

const commissionPanelClass =
  "rounded-[24px] border border-slate-300/90 bg-[linear-gradient(165deg,#ffffff_0%,#f8fafc_58%,#eef4ff_100%)] px-5 py-4 shadow-[0_16px_38px_rgba(15,23,42,0.1)]";
const commissionRowClass =
  "flex flex-nowrap items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white/88 px-4 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.04)] backdrop-blur-sm";
const commissionTotalClass =
  "relative mt-4 overflow-hidden rounded-2xl border border-slate-300/90 bg-[linear-gradient(160deg,#ffffff_0%,#f8fafc_52%,#eaf2ff_100%)] px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.1)]";
const commissionTotalHighlightClass =
  "relative mt-4 overflow-hidden rounded-2xl border border-slate-800/90 bg-[linear-gradient(135deg,#0b1328_0%,#0e1a3a_54%,#081124_100%)] px-4 py-3 text-white shadow-[0_20px_48px_rgba(2,6,23,0.45)]";
const commissionTotalLineClass =
  "flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/75 px-3 py-2.5";
const commissionTotalLineDarkClass =
  "flex items-center justify-between gap-3";
const commissionTotalLabelClass = "text-sm font-semibold uppercase tracking-[0.1em] text-slate-700";
const commissionTotalLabelDarkClass =
  "text-sm font-semibold uppercase tracking-[0.1em] text-slate-200/90";
const commissionTotalValueClass = "text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl";
const commissionTotalValueDarkClass =
  "text-2xl font-bold tracking-tight text-emerald-300 sm:text-3xl";
const monoHeadingClass = "font-mono tracking-tight text-slate-900";
const monoChipClass =
  "inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-base font-mono tracking-tight text-slate-900";
const monoChipDarkClass =
  "inline-flex items-center rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-base font-mono tracking-tight text-white";
const collapsibleButtonClass =
  "flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold font-mono tracking-tight text-slate-900 transition hover:border-slate-400 hover:bg-slate-50";

export function ContractCommissionSection({
  product,
  isOwnContract,
  isPaymentBasedProduct,
  showAnyMeziprovision,
  meziprovisionCards,
  expandedMeziprovisionKeys,
  onToggleMeziprovisionCard,
  adviserItems,
  adviserBreakdownPosition,
  adviserBreakdownMode,
  paymentBasedAdviserTotals,
  adviserTotalDisplay,
  contractAuthorName,
  showAdvisorDetails,
  onToggleAdvisorDetails,
  onOpenNeonImmediateBreakdown,
}: ContractCommissionSectionProps) {
  const renderCommissionRow = (
    item: CommissionResultItemDTO,
    position: Position | null | undefined,
    commissionMode: CommissionMode | null | undefined,
    key: string
  ) => {
    const icon = resultIconForTitle(item.title);
    const clickable =
      product === "neon" &&
      isImmediateCommissionTitle(item.title) &&
      hasNeonImmediateCoefficient(position);
    const rowClass = clickable
      ? `${commissionRowClass} w-full text-left transition hover:border-slate-400 hover:bg-slate-100`
      : commissionRowClass;

    const content = (
      <>
        <span className="flex min-w-0 items-center gap-3 text-base font-medium text-slate-900 sm:text-lg">
          {icon && (
            <span className="relative h-[22px] w-[22px] flex-shrink-0">
              <Image src={icon} alt="" fill className="object-contain" />
            </span>
          )}
          <span className="whitespace-nowrap">{cleanResultTitle(item.title)}</span>
        </span>
        <span className="whitespace-nowrap text-lg font-semibold text-slate-900">
          {formatMoney(item.amount)}
        </span>
      </>
    );

    if (!clickable) {
      return (
        <div key={key} className={rowClass}>
          {content}
        </div>
      );
    }

    return (
      <button
        key={key}
        type="button"
        className={rowClass}
        onClick={() => onOpenNeonImmediateBreakdown(item, position, commissionMode)}
      >
        {content}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      {showAnyMeziprovision && (
        <section className="space-y-4">
          {meziprovisionCards.map((card) => {
            const isExpanded = expandedMeziprovisionKeys.includes(card.key);
            return (
              <div key={card.key} className="space-y-3">
                <button
                  type="button"
                  onClick={() => onToggleMeziprovisionCard(card.key)}
                  aria-expanded={isExpanded}
                  className={`${collapsibleButtonClass} ${
                    isExpanded ? "border-slate-900 bg-slate-50" : ""
                  }`}
                >
                  <span className="truncate text-left">Meziprovize: {card.userName}</span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-slate-500 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {isExpanded && (
                  <div className="space-y-3">
                    <h4
                      className={`flex flex-wrap items-center gap-2 text-lg font-semibold ${monoHeadingClass}`}
                    >
                      <span className={monoChipClass}>Meziprovize</span>
                      Meziprovize: {card.userName}
                      {card.position && (
                        <span className="ml-1 text-sm text-slate-700">
                          ({positionLabel(card.position)})
                        </span>
                      )}
                    </h4>

                    <div className={commissionPanelClass}>
                      <div className="space-y-1">
                        {card.items.map((item, idx) =>
                          renderCommissionRow(
                            item,
                            card.position,
                            card.mode,
                            `${card.key}-${idx}-${item.title}`
                          )
                        )}
                      </div>

                      <div className={commissionTotalClass}>
                        <span className="pointer-events-none absolute -right-14 -top-16 h-36 w-36 rounded-full bg-sky-300/20 blur-3xl" />
                        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/85" />
                        {isPaymentBasedProduct && card.totals ? (
                          <div className="relative z-10 w-full space-y-2.5">
                            <div className={commissionTotalLineClass}>
                              <span className={commissionTotalLabelClass}>Celkem v 1. roce</span>
                              <span className={commissionTotalValueClass}>
                                {formatMoney(card.totals.immediate)}
                              </span>
                            </div>
                            <div className={commissionTotalLineClass}>
                              <span className={commissionTotalLabelClass}>Celkem ročně následně</span>
                              <span className={commissionTotalValueClass}>
                                {formatMoney(card.totals.subsequent)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className={`${commissionTotalLineClass} relative z-10 w-full`}>
                            <span className={commissionTotalLabelClass}>Celkem meziprovize</span>
                            <span className={commissionTotalValueClass}>
                              {formatMoney(card.totalDisplay)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {isOwnContract ? (
        <section className="space-y-4">
          <h3 className={`flex items-center gap-2 text-xl font-semibold ${monoHeadingClass}`}>
            <span className={monoChipDarkClass}>Provize</span>
            Výpočet provizí
          </h3>
          <div className={commissionPanelClass}>
            <div className="space-y-1">
              {adviserItems.map((item, idx) =>
                renderCommissionRow(
                  item,
                  adviserBreakdownPosition,
                  adviserBreakdownMode,
                  `adviser-own-${idx}-${item.title}`
                )
              )}
            </div>

            <div className={commissionTotalHighlightClass}>
              <span className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-emerald-400/28 blur-3xl" />
              <span className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-cyan-400/18 blur-3xl" />
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40" />
              {isPaymentBasedProduct && paymentBasedAdviserTotals ? (
                <div className="relative z-10 w-full space-y-2.5">
                  <div className={commissionTotalLineDarkClass}>
                    <span className={commissionTotalLabelDarkClass}>Celkem v 1. roce</span>
                    <span className={commissionTotalValueDarkClass}>
                      {formatMoney(paymentBasedAdviserTotals.immediate)}
                    </span>
                  </div>
                  <div className={commissionTotalLineDarkClass}>
                    <span className={commissionTotalLabelDarkClass}>Celkem ročně následně</span>
                    <span className={commissionTotalValueDarkClass}>
                      {formatMoney(paymentBasedAdviserTotals.subsequent)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className={`${commissionTotalLineDarkClass} relative z-10 w-full`}>
                  <span className={commissionTotalLabelDarkClass}>Celkem</span>
                  <span className={commissionTotalValueDarkClass}>
                    {formatMoney(adviserTotalDisplay)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <button
            type="button"
            onClick={onToggleAdvisorDetails}
            aria-expanded={showAdvisorDetails}
            className={`${collapsibleButtonClass} ${
              showAdvisorDetails ? "border-slate-900 bg-slate-50" : ""
            }`}
          >
            <span className="truncate text-left">Provize sjednatele: {contractAuthorName}</span>
            <ChevronDown
              size={16}
              className={`shrink-0 text-slate-500 transition-transform ${
                showAdvisorDetails ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </button>

          {showAdvisorDetails && (
            <div className={commissionPanelClass}>
              <div className="space-y-1">
                {adviserItems.map((item, idx) =>
                  renderCommissionRow(
                    item,
                    adviserBreakdownPosition,
                    adviserBreakdownMode,
                    `adviser-team-${idx}-${item.title}`
                  )
                )}
              </div>

              <div className={commissionTotalHighlightClass}>
                <span className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-emerald-400/28 blur-3xl" />
                <span className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-cyan-400/18 blur-3xl" />
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40" />
                {isPaymentBasedProduct && paymentBasedAdviserTotals ? (
                  <div className="relative z-10 w-full space-y-2.5">
                    <div className={commissionTotalLineDarkClass}>
                      <span className={commissionTotalLabelDarkClass}>Celkem v 1. roce</span>
                      <span className={commissionTotalValueDarkClass}>
                        {formatMoney(paymentBasedAdviserTotals.immediate)}
                      </span>
                    </div>
                    <div className={commissionTotalLineDarkClass}>
                      <span className={commissionTotalLabelDarkClass}>Celkem ročně následně</span>
                      <span className={commissionTotalValueDarkClass}>
                        {formatMoney(paymentBasedAdviserTotals.subsequent)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className={`${commissionTotalLineDarkClass} relative z-10 w-full`}>
                    <span className={commissionTotalLabelDarkClass}>Celkem</span>
                    <span className={commissionTotalValueDarkClass}>
                      {formatMoney(adviserTotalDisplay)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
