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
  "rounded-[22px] border border-slate-300 bg-[linear-gradient(160deg,#ffffff_0%,#f8fafc_100%)] px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)]";
const commissionRowClass =
  "flex items-baseline justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3";
const commissionTotalClass =
  "mt-4 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3";
const commissionTotalHighlightClass =
  "mt-4 rounded-xl border border-slate-900 bg-slate-900 px-4 py-3 text-white shadow-[0_10px_20px_rgba(15,23,42,0.28)]";
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
        <span className="flex items-center gap-3 text-lg font-medium text-slate-900">
          {icon && (
            <span className="relative h-5 w-5 flex-shrink-0">
              <Image src={icon} alt="" fill className="object-contain" />
            </span>
          )}
          <span>{cleanResultTitle(item.title)}</span>
        </span>
        <span className="text-lg font-semibold text-slate-900">{formatMoney(item.amount)}</span>
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
                        {isPaymentBasedProduct && card.totals ? (
                          <div className="w-full space-y-2 text-lg">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">Celkem v 1. roce</span>
                              <span className="text-2xl font-bold text-slate-900">
                                {formatMoney(card.totals.immediate)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">Celkem ročně následně</span>
                              <span className="text-2xl font-bold text-slate-900">
                                {formatMoney(card.totals.subsequent)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex w-full items-center justify-between gap-4">
                            <span className="text-lg font-semibold">Celkem meziprovize</span>
                            <span className="text-2xl font-bold text-slate-900">
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
              {isPaymentBasedProduct && paymentBasedAdviserTotals ? (
                <div className="w-full space-y-2 text-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Celkem v 1. roce</span>
                    <span className="text-2xl font-bold text-emerald-300">
                      {formatMoney(paymentBasedAdviserTotals.immediate)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Celkem ročně následně</span>
                    <span className="text-2xl font-bold text-emerald-300">
                      {formatMoney(paymentBasedAdviserTotals.subsequent)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-lg font-semibold">Celkem</span>
                  <span className="text-2xl font-bold text-emerald-300">
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
                {isPaymentBasedProduct && paymentBasedAdviserTotals ? (
                  <div className="w-full space-y-2 text-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Celkem v 1. roce</span>
                      <span className="text-2xl font-bold text-emerald-300">
                        {formatMoney(paymentBasedAdviserTotals.immediate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Celkem ročně následně</span>
                      <span className="text-2xl font-bold text-emerald-300">
                        {formatMoney(paymentBasedAdviserTotals.subsequent)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="text-lg font-semibold">Celkem</span>
                    <span className="text-2xl font-bold text-emerald-300">
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
