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
  "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 rounded-2xl border border-slate-200/90 bg-white/88 px-4 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.04)] backdrop-blur-sm sm:items-center";
const commissionTotalHighlightClass =
  "relative mt-4 overflow-hidden rounded-2xl border border-slate-800/90 bg-[linear-gradient(135deg,#0b1328_0%,#0e1a3a_54%,#081124_100%)] px-4 py-3 text-white shadow-[0_20px_48px_rgba(2,6,23,0.45)]";
const commissionTotalLineDarkClass =
  "flex items-center justify-between gap-3";
const commissionTotalLabelDarkClass =
  "text-sm font-semibold uppercase tracking-[0.1em] text-slate-200/90";
const commissionTotalValueDarkClass =
  "text-2xl font-bold tracking-tight text-emerald-300 sm:text-3xl";
const monoHeadingClass = "font-mono tracking-tight text-slate-900";
const monoChipClass =
  "inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-base font-mono tracking-tight text-slate-900";
const monoChipDarkClass =
  "inline-flex items-center rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-base font-mono tracking-tight text-white";
const collapsibleButtonClass =
  "flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold font-mono tracking-tight text-slate-900 transition hover:border-slate-400 hover:bg-slate-50";
const isLegacyImmediateTotalTitle = (title: string): boolean =>
  cleanResultTitle(title).toLowerCase().includes("okamžitá provize");

const isSplitImmediateProduct = (product: Product | undefined): boolean =>
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
  const renderSplitImmediateGroup = (
    commissionItems: CommissionResultItemDTO[],
    key: string
  ) => {
    const total = sumCommissionItems(commissionItems);

    return (
      <details key={key} className="group">
        <summary
          className={`${commissionRowClass} cursor-pointer list-none transition hover:border-slate-400 hover:bg-slate-100 [&::-webkit-details-marker]:hidden`}
        >
          <span className="flex min-w-0 items-start gap-3 text-base font-medium text-slate-900 sm:items-center sm:text-lg">
            <span className="relative h-[22px] w-[22px] flex-shrink-0">
              <Image src="/icons/penize2.png" alt="" fill className="object-contain" />
            </span>
            <span className="min-w-0 leading-tight [overflow-wrap:anywhere]">
              <span>Okamžitá provize</span>
              <span className="ml-2 inline-flex align-middle rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                rozpis
              </span>
            </span>
          </span>
          <span className="flex items-center justify-end gap-2 whitespace-nowrap text-right text-lg font-semibold text-slate-900">
            {formatMoney(total)}
            <ChevronDown
              size={18}
              strokeWidth={2.2}
              className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </span>
        </summary>

        <div className="mt-2 space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
          {commissionItems.map((part) => {
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
                  {formatMoney(part.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </details>
    );
  };

  const renderCommissionRow = (
    item: CommissionResultItemDTO,
    position: Position | null | undefined,
    commissionMode: CommissionMode | null | undefined,
    key: string
  ) => {
    const icon = resultIconForTitle(item.title);
    const clickable =
      product === "neon" &&
      isLegacyImmediateTotalTitle(item.title) &&
      hasNeonImmediateCoefficient(position);
    const rowClass = clickable
      ? `${commissionRowClass} w-full text-left transition hover:border-slate-400 hover:bg-slate-100`
      : commissionRowClass;
    const itemNote = displayNoteForCommissionItem(item);

    const content = (
      <>
        <span className="flex min-w-0 items-start gap-3 text-base font-medium text-slate-900 sm:items-center sm:text-lg">
          {icon && (
            <span className="relative h-[22px] w-[22px] flex-shrink-0">
              <Image src={icon} alt="" fill className="object-contain" />
            </span>
          )}
          <span className="min-w-0 leading-tight [overflow-wrap:anywhere]">
            <span>{cleanResultTitle(item.title)}</span>
            {itemNote && (
              <span className="mt-1 block text-xs font-semibold text-red-600">
                {itemNote}
              </span>
            )}
          </span>
        </span>
        <span className="whitespace-nowrap text-right text-lg font-semibold text-slate-900">
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

  const renderCommissionRows = (
    commissionItems: CommissionResultItemDTO[],
    position: Position | null | undefined,
    commissionMode: CommissionMode | null | undefined,
    keyPrefix: string
  ) => {
    const splitImmediateItems =
      isSplitImmediateProduct(product)
        ? commissionItems.filter((item) => isSplitImmediateComponentTitle(item.title))
        : [];
    const hasSplitImmediate = splitImmediateItems.length > 0;
    const regularCommissionItems = hasSplitImmediate
      ? commissionItems.filter(
          (item) =>
            !isSplitImmediateComponentTitle(item.title) &&
            !isLegacyImmediateTotalTitle(item.title)
        )
      : commissionItems;

    return (
      <>
        {hasSplitImmediate &&
          renderSplitImmediateGroup(splitImmediateItems, `${keyPrefix}-split-immediate`)}
        {regularCommissionItems.map((item, idx) =>
          renderCommissionRow(
            item,
            position,
            commissionMode,
            `${keyPrefix}-${idx}-${item.title}`
          )
        )}
      </>
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
                        {renderCommissionRows(
                          card.items,
                          card.position,
                          card.mode,
                          card.key
                        )}
                      </div>

                      <div className={commissionTotalHighlightClass}>
                        <span className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-emerald-400/28 blur-3xl" />
                        <span className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-cyan-400/18 blur-3xl" />
                        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40" />
                        {isPaymentBasedProduct && card.totals ? (
                          <div className="relative z-10 w-full space-y-2.5">
                            <div className={commissionTotalLineDarkClass}>
                              <span className={commissionTotalLabelDarkClass}>Celkem v 1. roce</span>
                              <span className={commissionTotalValueDarkClass}>
                                {formatMoney(card.totals.immediate)}
                              </span>
                            </div>
                            <div className={commissionTotalLineDarkClass}>
                              <span className={commissionTotalLabelDarkClass}>Celkem ročně následně</span>
                              <span className={commissionTotalValueDarkClass}>
                                {formatMoney(card.totals.subsequent)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className={`${commissionTotalLineDarkClass} relative z-10 w-full`}>
                            <span className={commissionTotalLabelDarkClass}>Celkem meziprovize</span>
                            <span className={commissionTotalValueDarkClass}>
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
              {renderCommissionRows(
                adviserItems,
                adviserBreakdownPosition,
                adviserBreakdownMode,
                "adviser-own"
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
                {renderCommissionRows(
                  adviserItems,
                  adviserBreakdownPosition,
                  adviserBreakdownMode,
                  "adviser-team"
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
