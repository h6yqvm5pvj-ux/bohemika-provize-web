import { BrainCircuit, ChevronDown, ExternalLink, FileText, Loader2, X } from "lucide-react";

import {
  isAutoProduct,
  isPropertyProduct,
} from "@/app/lib/productCatalog";
import type { Product } from "@/app/types/domain";
import { subscriptionPlanLabel } from "../subscriptionCashflow";
import {
  calculateNetCashflow,
  calculateStornoFund,
  formatMoney,
  frequencyText,
  productLabel,
  sortCashflowItemsForDisplay,
  STORNO_EXEMPT_PRODUCT,
  STORNO_FUND_RATE,
} from "../helpers";
import type { CashflowCommissionStatementSummary, CashflowItem, MonthGroup } from "../types";

type CashflowMonthModalProps = {
  month: MonthGroup | null;
  statements?: CashflowCommissionStatementSummary[];
  statementLoadingId?: string | null;
  onClose: () => void;
  onOpenStatement?: (statement: CashflowCommissionStatementSummary) => void;
  tipsterMode?: boolean;
};

type CashflowDisplayGroup = {
  id: string;
  leadItem: CashflowItem;
  items: CashflowItem[];
  amount: number;
  stornoFundAmount: number;
  netAmount: number;
};

function formatItemCount(count: number, singular: string, few: string, many: string): string {
  if (count === 1) return `1 ${singular}`;
  if (count >= 2 && count <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

function commissionMeaning(
  label: string | null,
  isTipIncome: boolean,
  isSubscriptionIncome: boolean
): { title: string; text: string } {
  if (isSubscriptionIncome) {
    return {
      title: "Platba předplatného",
      text: "Zapsaná nebo očekávaná platba uživatele za aktivní předplatné aplikace. V cashflow se drží odděleně od smluvních provizí a nevstupuje do STORNO fondu.",
    };
  }

  const normalized = (label ?? "").toLowerCase();
  if (normalized.includes("b0301")) {
    return {
      title: "Karta klienta",
      text:
        "Druhá část okamžité provize. Je podmíněná zpracováním karty klienta; pokud ve výpisu nepřijde, cashflow ji drží odděleně a přesune ji do dalšího měsíce.",
    };
  }

  if (normalized.includes("a101")) {
    return {
      title: "Základ sjednávací provize",
      text:
        "První část okamžité provize. Tohle je část, která se běžně očekává v prvním výplatním měsíci po sjednání a počátku smlouvy.",
    };
  }

  if (normalized.includes("b3601") || normalized.includes("b36") || normalized.includes("50%")) {
    return {
      title: "Zrychlená část B36/B3601",
      text:
        "Část provize vyplacená hned ve zrychleném režimu. Je oddělená od A101 a B0301, aby bylo vidět, která konkrétní část už přišla ve výpisu.",
    };
  }

  if (isTipIncome) {
    return {
      title: "TIP provize",
      text: "Samostatná výplata za tip. V cashflow se drží odděleně od vlastních a týmových smluv.",
    };
  }

  return {
    title: "Výplata podle rozpisu",
    text:
      "Položka představuje očekávanou provizní výplatu podle produktu, frekvence platby a rozpisu provizí ve smlouvě.",
  };
}

function normalizeGroupKeyPart(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function commissionLabelForItem(item: CashflowItem): string | null {
  return (
    item.commissionLabel?.trim() ||
    item.commissionCode?.trim() ||
    nonLifeCommissionDetail(item)?.commissionTypeLabel ||
    null
  );
}

function payoutStatusLabel(status: CashflowItem["payoutStatus"] | undefined): string {
  if (status === "paid") return "Vyplaceno";
  if (status === "shifted") return "Přesunuto";
  return "Předpoklad";
}

function payoutStatusClass(status: CashflowItem["payoutStatus"] | "mixed" | undefined): string {
  if (status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "shifted") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "mixed") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function dateRangeLabel(items: CashflowItem[]): string {
  const dates = items
    .map((item) => item.date)
    .filter((date) => date instanceof Date && Number.isFinite(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return "—";
  const firstLabel = first.toLocaleDateString("cs-CZ");
  const lastLabel = last.toLocaleDateString("cs-CZ");
  return firstLabel === lastLabel ? firstLabel : `${firstLabel} - ${lastLabel}`;
}

function cashflowGroupKey(item: CashflowItem): string {
  if (item.isTipPayout) return `tip:${item.id}`;
  if (item.isSubscriptionPayment) return `subscription:${item.id}`;
  const contractNumber = normalizeGroupKeyPart(item.contractNumber);
  const clientName = normalizeGroupKeyPart(item.clientName);
  if (!contractNumber || !clientName) return `single:${item.id}`;
  const source = item.source === "manager" || item.isManagerOverride ? "team" : "own";
  return [
    source,
    normalizeGroupKeyPart(item.ownerEmail),
    item.productKey,
    contractNumber,
    clientName,
  ].join("|");
}

function buildCashflowDisplayGroups(items: CashflowItem[]): CashflowDisplayGroup[] {
  const groupsByKey = new Map<string, CashflowItem[]>();
  const order: string[] = [];

  for (const item of items) {
    const key = cashflowGroupKey(item);
    const group = groupsByKey.get(key);
    if (group) {
      group.push(item);
    } else {
      groupsByKey.set(key, [item]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const groupItems = groupsByKey.get(key) ?? [];
    const amount = groupItems.reduce((sum, item) => sum + item.amount, 0);
    const stornoFundAmount = groupItems.reduce(
      (sum, item) =>
        sum +
        (item.isSubscriptionPayment || item.productKey === STORNO_EXEMPT_PRODUCT
          ? 0
          : item.amount * STORNO_FUND_RATE),
      0
    );

    return {
      id: key,
      leadItem: groupItems[0],
      items: groupItems,
      amount,
      stornoFundAmount,
      netAmount: amount - stornoFundAmount,
    };
  }).filter((group): group is CashflowDisplayGroup => Boolean(group.leadItem));
}

const COMMISSION_BY_PAYMENT_FREQUENCY_PRODUCTS = new Set<Product>([
  "cppAuto",
  "slaviaauto",
  "slaviaflotila",
  "csobAuto",
  "kooperativaAuto",
  "koopflotila",
  "domex",
  "cpphafan",
  "koopmajetekobcan",
  "koopfit",
  "koopodzam",
  "kooppmop",
  "maxdomov",
  "zamex",
  "cppsimplex",
  "cppPPRs",
  "cppPPRbez",
]);

const COMMISSION_ANNUAL_ADVANCE_PRODUCTS = new Set<Product>([
  "allianzAuto",
  "pillowAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowmajetek",
  "allianzmujdomov",
]);

type NonLifeCommissionDetail = {
  commissionTypeLabel: string;
  commissionText: string;
  payoutModeLabel: string;
  firstAnniversaryLabel: string | null;
};

function addYears(date: Date, years: number): Date {
  return new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
}

function estimatedPayoutDateForPolicyDate(date: Date): Date {
  const payoutMonthOffset = date.getDate() > 25 ? 2 : 1;
  return new Date(date.getFullYear(), date.getMonth() + payoutMonthOffset, 25);
}

function nonLifeCommissionDetail(item: CashflowItem): NonLifeCommissionDetail | null {
  const product =
    item.productKey === "unknown" || item.productKey === "subscription"
      ? null
      : item.productKey;
  if (!product || (!isAutoProduct(product) && !isPropertyProduct(product))) return null;

  const policyStart = item.policyStartDate ?? null;
  const firstAnniversary = policyStart ? addYears(policyStart, 1) : null;
  const firstAnniversaryPayout = firstAnniversary
    ? estimatedPayoutDateForPolicyDate(firstAnniversary)
    : null;
  const effectiveDate = item.originalDate ?? item.date;
  const note = (item.note ?? "").toLocaleLowerCase("cs-CZ");
  const isSubsequent =
    note.includes("násled") ||
    note.includes("ročně k výročí") ||
    Boolean(firstAnniversaryPayout && effectiveDate >= firstAnniversaryPayout);
  const isAuto = isAutoProduct(product);
  const commissionTypeLabel = isSubsequent ? "Následná provize" : "Vzniková provize";
  const firstAnniversaryLabel = firstAnniversary
    ? firstAnniversary.toLocaleDateString("cs-CZ")
    : null;

  const commissionText = isSubsequent
    ? `Položka patří do období od 1. výročí smlouvy, proto je vedená jako následná provize.`
    : isAuto
    ? `Položka patří do prvního roku smlouvy, proto je vedená jako vzniková provize. U auta tak zůstává označená i při měsíční nebo čtvrtletní platbě klienta.`
    : `Položka patří do prvního roku smlouvy, proto je vedená jako vzniková provize.`;

  if (COMMISSION_BY_PAYMENT_FREQUENCY_PRODUCTS.has(product)) {
    return {
      commissionTypeLabel,
      commissionText,
      payoutModeLabel: "Dle frekvence platby",
      firstAnniversaryLabel,
    };
  }

  if (COMMISSION_ANNUAL_ADVANCE_PRODUCTS.has(product)) {
    return {
      commissionTypeLabel,
      commissionText,
      payoutModeLabel: "Zálohově za roční pojistné",
      firstAnniversaryLabel,
    };
  }

  return {
    commissionTypeLabel,
    commissionText,
    payoutModeLabel: "Podle rozpisu produktu",
    firstAnniversaryLabel,
  };
}

export function CashflowMonthModal({
  month,
  statements = [],
  statementLoadingId = null,
  onClose,
  onOpenStatement,
  tipsterMode = false,
}: CashflowMonthModalProps) {
  if (!month) return null;

  const sortedItems = sortCashflowItemsForDisplay(month.items);
  const displayGroups = buildCashflowDisplayGroups(sortedItems);
  const tipOnlyMonth =
    tipsterMode ||
    (month.items.length > 0 && month.items.every((item) => item.isTipPayout === true));
  const subscriptionOnlyMonth =
    month.items.length > 0 &&
    month.items.every((item) => item.isSubscriptionPayment === true);
  const isPaidMonth = month.totalSource === "paid";
  const predictedTotal = month.predictedTotal ?? month.total;
  const payoutDifference = month.total - predictedTotal;
  const stornoFund = calculateStornoFund(month.items);
  const netTotal = isPaidMonth ? month.total : calculateNetCashflow(month.total, stornoFund);
  const stornoPercent = Math.round(STORNO_FUND_RATE * 100);
  const itemCountLabelBase = tipOnlyMonth
    ? formatItemCount(month.items.length, "tip", "tipy", "tipů")
    : subscriptionOnlyMonth
    ? formatItemCount(month.items.length, "platba", "platby", "plateb")
    : formatItemCount(month.items.length, "položka", "položky", "položek");
  const grossTotalLabel = tipOnlyMonth
    ? "TIP provize"
    : subscriptionOnlyMonth
    ? "Předplatné"
    : "Předpoklad";
  const itemCountLabel =
    displayGroups.length === month.items.length
      ? itemCountLabelBase
      : `${itemCountLabelBase} · ${formatItemCount(displayGroups.length, "karta", "karty", "karet")}`;

  return (
    <>
      <div
        className="fixed inset-0 z-30 flex items-end justify-center bg-[#08030f]/78 px-2 py-2 backdrop-blur-[7px] sm:items-center sm:px-3 sm:py-4"
        onClick={onClose}
      >
      <div
        className="relative flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-[#fbfdff] p-2 text-slate-900 shadow-[0_34px_82px_rgba(2,6,23,0.36)] sm:max-h-[95vh] sm:w-[min(1520px,96vw)] sm:rounded-[28px] sm:p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#ca85ff_0%,#aa57f5_46%,#8f44e8_100%)]"
          aria-hidden="true"
        />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(244,239,252,0.96)_0%,rgba(250,248,255,0.98)_44%,rgba(252,251,255,1)_100%)]" />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(146deg,rgba(197,105,255,0.08)_0%,rgba(197,105,255,0)_38%,rgba(166,86,246,0.06)_100%)]" />
        <span className="pointer-events-none absolute -top-20 left-28 h-[21rem] w-px rotate-[35deg] bg-[#9a5dcb]/10" />
        <span className="pointer-events-none absolute -right-16 top-10 hidden h-40 w-40 rounded-full bg-[#ae62ff]/12 blur-3xl sm:block" />

        <button
          type="button"
          onClick={onClose}
          className="ui-focus absolute right-3 top-3 z-[2] inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:text-slate-900 sm:h-12 sm:w-12"
          aria-label="Zavřít přehled měsíce"
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-2 sm:gap-3">
          <div className="px-1 pt-1 pr-10 sm:pr-14">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                  Přehled měsíce
                </p>
                <h3 className="text-[1.45rem] font-bold leading-tight text-slate-900 sm:text-[2.45rem]">
                  {month.label}
                </h3>
                <p className="text-xs text-slate-600 sm:text-sm">{itemCountLabel}</p>
              </div>

              <div className="flex flex-col items-stretch gap-3 xl:items-end">
                {statements.length > 0 && onOpenStatement && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {statements.map((statement, index) => {
                      const isLoading = statementLoadingId === statement.id;
                      const label =
                        statements.length === 1
                          ? "Provizní výpis"
                          : `Výpis ${statement.statementNumber ?? index + 1}`;
                      return (
                        <button
                          key={statement.id}
                          type="button"
                          onClick={() => onOpenStatement(statement)}
                          disabled={isLoading}
                          className="ui-focus inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:border-slate-500 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70 sm:gap-2 sm:px-3.5 sm:text-sm"
                        >
                          {isLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                          ) : (
                            <FileText className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                          )}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="block">
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-3 md:grid-cols-3">
                    {isPaidMonth ? (
                      <>
                        <div className="min-w-0 rounded-[13px] border border-emerald-300 bg-emerald-50 px-2 py-2 text-left sm:min-w-[175px] sm:rounded-[16px] sm:px-4 sm:py-2.5 sm:text-right">
                          <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-emerald-700 sm:text-[10px] sm:tracking-[0.16em]">
                            Vyplaceno
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[0.98rem] font-bold leading-none tracking-[-0.02em] text-emerald-700 sm:text-[1.7rem]">
                            {formatMoney(month.total)}
                          </div>
                        </div>

                        <div className="min-w-0 rounded-[13px] border border-[#d7c3ed] bg-[#f4ecff] px-2 py-2 text-left sm:min-w-[175px] sm:rounded-[16px] sm:px-4 sm:py-2.5 sm:text-right">
                          <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#71558f] sm:text-[10px] sm:tracking-[0.16em]">
                            Předpoklad systému
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[0.98rem] font-bold leading-none tracking-[-0.02em] text-[#1a1028] sm:text-[1.7rem]">
                            {formatMoney(predictedTotal)}
                          </div>
                        </div>

                        <div
                          className={`min-w-0 rounded-[13px] border px-2 py-2 text-left sm:min-w-[175px] sm:rounded-[16px] sm:px-4 sm:py-2.5 sm:text-right ${
                            payoutDifference >= 0
                              ? "border-emerald-300 bg-emerald-50"
                              : "border-rose-200 bg-rose-50"
                          }`}
                        >
                          <div
                            className={`text-[8px] font-semibold uppercase tracking-[0.1em] sm:text-[10px] sm:tracking-[0.16em] ${
                              payoutDifference >= 0 ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            Rozdíl
                          </div>
                          <div
                            className={`mt-1 whitespace-nowrap font-mono text-[0.98rem] font-bold leading-none tracking-[-0.02em] sm:text-[1.7rem] ${
                              payoutDifference >= 0 ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {payoutDifference >= 0 ? "+ " : "- "}
                            {formatMoney(Math.abs(payoutDifference))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0 rounded-[13px] border border-[#d7c3ed] bg-[#f4ecff] px-2 py-2 text-left sm:min-w-[175px] sm:rounded-[16px] sm:px-4 sm:py-2.5 sm:text-right">
                          <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#71558f] sm:text-[10px] sm:tracking-[0.16em]">
                            {grossTotalLabel}
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[0.98rem] font-bold leading-none tracking-[-0.02em] text-[#1a1028] sm:text-[1.7rem]">
                            {formatMoney(month.total)}
                          </div>
                        </div>

                        <div className="min-w-0 rounded-[13px] border border-rose-200 bg-rose-50 px-2 py-2 text-left sm:min-w-[175px] sm:rounded-[16px] sm:px-4 sm:py-2.5 sm:text-right">
                          <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-rose-700 sm:text-[10px] sm:tracking-[0.16em]">
                            STORNO fond ({stornoPercent} %)
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[0.98rem] font-bold leading-none tracking-[-0.02em] text-rose-700 sm:text-[1.7rem]">
                            - {formatMoney(stornoFund)}
                          </div>
                        </div>

                        <div className="min-w-0 rounded-[13px] border border-emerald-300 bg-emerald-50 px-2 py-2 text-left sm:min-w-[175px] sm:rounded-[16px] sm:px-4 sm:py-2.5 sm:text-right">
                          <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-emerald-700 sm:text-[10px] sm:tracking-[0.16em]">
                            Čisté cashflow
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[0.98rem] font-bold leading-none tracking-[-0.02em] text-emerald-700 sm:text-[1.7rem]">
                            {formatMoney(netTotal)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-[16px] border border-slate-200 bg-[#f7f8fd] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] sm:rounded-[22px] sm:p-3">
            <div className="grid grid-cols-1 gap-1.5 sm:gap-2.5">
              {displayGroups.map((group) => {
                const item = group.leadItem;
                const groupItems = group.items;
                const isGrouped = groupItems.length > 1;
                const dateLabel = dateRangeLabel(groupItems);
                const contractNo =
                  item.contractNumber && item.contractNumber.trim() !== ""
                    ? item.contractNumber
                    : null;
                const clientName =
                  item.clientName && item.clientName.trim() !== ""
                    ? item.clientName.trim()
                    : null;
                const ownerEmail =
                  item.ownerEmail && item.ownerEmail.trim() !== ""
                    ? item.ownerEmail.trim().toLowerCase()
                    : null;
                const baseEntryId =
                  item.entryId && item.entryId.trim() !== ""
                    ? item.entryId.trim()
                    : null;
                const contractSlug =
                  ownerEmail && baseEntryId
                    ? `${ownerEmail}___${baseEntryId}`
                    : null;
                const isTipIncome = item.isTipPayout === true;
                const isSubscriptionIncome = item.isSubscriptionPayment === true;
                const href = !isTipIncome && !isSubscriptionIncome && contractSlug
                  ? `/smlouvy/${encodeURIComponent(contractSlug)}`
                  : null;
                const isTeamIncome =
                  !isTipIncome &&
                  !isSubscriptionIncome &&
                  (item.source === "manager" || item.isManagerOverride);
                const scopeBadgeClass = isTipIncome
                  ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
                  : isSubscriptionIncome
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : isTeamIncome
                  ? "border-sky-200 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-slate-50 text-slate-700";
                const payoutStatuses = new Set(
                  groupItems.map((groupItem) => groupItem.payoutStatus ?? "predicted")
                );
                const payoutStatus =
                  payoutStatuses.size === 1
                    ? (groupItems[0].payoutStatus ?? "predicted")
                    : "mixed";
                const payoutLabel =
                  payoutStatus === "mixed" ? "Smíšené" : payoutStatusLabel(payoutStatus);
                const subscriptionPaymentStatusLabel =
                  payoutStatus === "paid" ? "Zaplaceno" : "Očekáváno";
                const payoutClass = payoutStatusClass(payoutStatus);
                const commissionLabels = Array.from(
                  new Set(
                    groupItems
                      .map((groupItem) => commissionLabelForItem(groupItem))
                      .filter((value): value is string => Boolean(value))
                  )
                );
                const visibleCommissionLabels = commissionLabels.slice(0, 3);
                const hiddenCommissionLabelCount =
                  commissionLabels.length - visibleCommissionLabels.length;
                const commissionLabel = commissionLabelForItem(item);
                const nonLifeDetail = nonLifeCommissionDetail(item);
                const displayCommissionLabel =
                  commissionLabel ?? nonLifeDetail?.commissionTypeLabel ?? null;
                const stornoFundAmount = group.stornoFundAmount;
                const netAmount = group.netAmount;
                const detailMeaning = nonLifeDetail
                  ? {
                      title: nonLifeDetail.commissionTypeLabel,
                      text: nonLifeDetail.commissionText,
                    }
                  : commissionMeaning(commissionLabel, isTipIncome, isSubscriptionIncome);
                const sourceLabel = isTipIncome
                  ? "TIP provize"
                  : isSubscriptionIncome
                  ? "Předplatné"
                  : isTeamIncome
                  ? "Týmová provize"
                  : "Vlastní provize";
                const subscriptionPeriodLabel =
                  item.subscriptionPeriodFrom && item.subscriptionPeriodUntil
                    ? `${item.subscriptionPeriodFrom} - ${item.subscriptionPeriodUntil}`
                    : null;
                const inputPremium =
                  item.inputAmount != null && Number.isFinite(item.inputAmount) && item.inputAmount > 0
                    ? formatMoney(item.inputAmount)
                    : null;
                const predictionAdjustments = groupItems
                  .map((groupItem) => groupItem.predictionAdjustment)
                  .filter(
                    (
                      adjustment
                    ): adjustment is NonNullable<CashflowItem["predictionAdjustment"]> =>
                      Boolean(adjustment)
                  );
                const hasPredictionAdjustment = predictionAdjustments.length > 0;
                const predictionLabels = Array.from(
                  new Set(predictionAdjustments.map((adjustment) => adjustment.label))
                );
                const predictionLabel =
                  predictionLabels.length === 1
                    ? predictionLabels[0]
                    : "Inteligentní predikce";
                const groupBaseAmount = groupItems.reduce(
                  (sum, groupItem) =>
                    sum + (groupItem.predictionAdjustment?.baseAmount ?? groupItem.amount),
                  0
                );

                return (
                  <details
                    key={group.id}
                    className="group relative isolate overflow-hidden rounded-[15px] border border-slate-200 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.06)] ring-1 ring-white transition hover:border-slate-300 hover:shadow-[0_16px_34px_rgba(15,23,42,0.12)] open:border-[#c9b4e8] sm:rounded-[18px]"
                  >
                    <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,#a855f7_0%,#60a5fa_52%,#34d399_100%)]" />
                    <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,0.08)_0%,rgba(255,255,255,0)_28%)]" />

                    <summary className="relative z-[1] grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2 px-3 py-3 transition hover:bg-slate-50/80 sm:gap-4 sm:px-5 sm:py-4 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <h4 className="min-w-0 text-[1rem] font-bold leading-tight tracking-[-0.01em] text-slate-950 sm:text-[1.22rem]">
                            {productLabel(item.productKey)}
                          </h4>
                          {isGrouped && (
                            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 sm:px-2.5 sm:py-1 sm:text-xs">
                              {formatItemCount(groupItems.length, "provize", "provize", "provizí")}
                            </span>
                          )}
                          {visibleCommissionLabels.map((label) => (
                            <span
                              key={label}
                              className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 sm:px-2.5 sm:py-1 sm:text-xs"
                            >
                              {label}
                            </span>
                          ))}
                          {hiddenCommissionLabelCount > 0 && (
                            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 sm:px-2.5 sm:py-1 sm:text-xs">
                              +{hiddenCommissionLabelCount}
                            </span>
                          )}
                          {!isTipIncome && !isSubscriptionIncome && (
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:py-1 sm:text-xs ${payoutClass}`}
                            >
                              {payoutLabel}
                            </span>
                          )}
                          {isSubscriptionIncome && (
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:py-1 sm:text-xs ${payoutClass}`}
                            >
                              {subscriptionPaymentStatusLabel}
                            </span>
                          )}
                          {hasPredictionAdjustment && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#d8b4fe] bg-[#fbf7ff] px-2 py-0.5 text-[10px] font-semibold text-[#7e22ce] sm:px-2.5 sm:py-1 sm:text-xs">
                              <BrainCircuit className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2.1} aria-hidden="true" />
                              Predikce
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:py-1 sm:text-xs ${scopeBadgeClass}`}
                          >
                            {isTipIncome
                              ? "TIP"
                              : isSubscriptionIncome
                              ? "Předplatné"
                              : isTeamIncome
                              ? "Týmová"
                              : "Vlastní"}
                          </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 sm:mt-2 sm:gap-x-4 sm:gap-y-1.5 sm:text-sm">
                          <span>{dateLabel}</span>
                          {contractNo && <span>Smlouva {contractNo}</span>}
                          {!isGrouped && displayCommissionLabel && <span>{displayCommissionLabel}</span>}
                          <span>
                            {isSubscriptionIncome ? "Uživatel" : "Klient"}:{" "}
                            <span className="font-semibold text-slate-950">{clientName ?? "—"}</span>
                          </span>
                          {isSubscriptionIncome && (
                            <span>
                              Tarif:{" "}
                              <span className="font-semibold text-slate-950">
                                {subscriptionPlanLabel(item.subscriptionPlan)}
                              </span>
                            </span>
                          )}
                          {isSubscriptionIncome && subscriptionPeriodLabel && (
                            <span>
                              Období:{" "}
                              <span className="font-semibold text-slate-950">
                                {subscriptionPeriodLabel}
                              </span>
                            </span>
                          )}
                          {!isTipIncome && !isSubscriptionIncome && (
                            <span>
                              Frekvence:{" "}
                              <span className="font-semibold text-slate-950">
                                {frequencyText(item.frequency)}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:text-[10px] sm:tracking-[0.16em]">
                          {isSubscriptionIncome ? "Částka" : "Výplata"}
                        </span>
                        <div className="mt-0.5 whitespace-nowrap font-mono text-[1.18rem] font-bold leading-none tracking-[-0.03em] text-slate-950 sm:text-[1.95rem]">
                          {formatMoney(group.amount)}
                        </div>
                      </div>

                      <div className="flex items-start justify-end">
                        <span className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 sm:inline">
                          Detail
                        </span>
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.08)] transition group-open:rotate-180 group-open:border-violet-300 group-open:text-violet-700 sm:h-10 sm:w-10">
                          <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.2} />
                        </span>
                      </div>
                    </summary>

                    <div className="relative z-[1] border-t border-slate-200 bg-slate-50/80 px-3 pb-3 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
                      <div className="grid gap-2 sm:gap-3 xl:grid-cols-[minmax(0,1fr)_520px] xl:items-start">
                        <div className="rounded-[14px] border border-slate-200 bg-white px-3 py-2.5 shadow-[0_4px_12px_rgba(15,23,42,0.04)] sm:rounded-[16px] sm:px-4 sm:py-3">
                          {isGrouped ? (
                            <>
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Rozpad provizí
                              </span>
                              <div className="mt-2 grid gap-1.5 sm:mt-3 sm:gap-2">
                                {groupItems.map((part) => {
                                  const partLabel = commissionLabelForItem(part) ?? "Provize";
                                  const partStatus = part.payoutStatus ?? "predicted";
                                  const partStornoFund =
                                    part.isSubscriptionPayment ||
                                    part.productKey === STORNO_EXEMPT_PRODUCT
                                      ? 0
                                      : part.amount * STORNO_FUND_RATE;
                                  const partNet = part.amount - partStornoFund;

                                  return (
                                    <div
                                      key={part.id}
                                      className="grid gap-1.5 rounded-[12px] border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-2 sm:px-3 sm:text-sm"
                                    >
                                      <div className="min-w-0">
                                        <div className="font-bold text-slate-950">
                                          {partLabel}
                                        </div>
                                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                                          <span>{part.date.toLocaleDateString("cs-CZ")}</span>
                                          <span>{payoutStatusLabel(partStatus)}</span>
                                        </div>
                                      </div>
                                      <div className="whitespace-nowrap sm:text-right">
                                        <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                          Hrubá
                                        </span>
                                        <span className="block font-mono text-sm font-bold text-slate-950 sm:text-base">
                                          {formatMoney(part.amount)}
                                        </span>
                                      </div>
                                      <div className="whitespace-nowrap sm:text-right">
                                        <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                          Čistá
                                        </span>
                                        <span className="block font-mono text-sm font-bold text-emerald-700">
                                          {formatMoney(partNet)}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Význam pro kontrolu
                              </span>
                              <div className="mt-1 text-sm font-bold text-slate-950 sm:text-base">
                                {detailMeaning.title}
                              </div>
                              <p className="mt-1 max-w-4xl text-xs leading-relaxed text-slate-600 sm:text-sm">
                                {detailMeaning.text}
                              </p>
                            </>
                          )}

                          <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs sm:mt-3 sm:grid-cols-2 sm:gap-2 sm:text-sm lg:grid-cols-3">
                            {nonLifeDetail && (
                              <div className="rounded-[12px] border border-violet-200 bg-violet-50 px-3 py-2">
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                                  Typ provize
                                </span>
                                <span className="mt-1 block font-semibold text-violet-900">
                                  {nonLifeDetail.commissionTypeLabel}
                                </span>
                              </div>
                            )}

                            {nonLifeDetail && (
                              <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2">
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Výplata provize
                                </span>
                                <span className="mt-1 block font-semibold text-slate-950">
                                  {nonLifeDetail.payoutModeLabel}
                                </span>
                              </div>
                            )}

                            {nonLifeDetail?.firstAnniversaryLabel && (
                              <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2">
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  1. výročí smlouvy
                                </span>
                                <span className="mt-1 block font-semibold text-slate-950">
                                  {nonLifeDetail.firstAnniversaryLabel}
                                </span>
                              </div>
                            )}

                            <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {isSubscriptionIncome ? "Stav platby" : "Stav výpisu"}
                              </span>
                              <span className="mt-1 block font-semibold text-slate-950">
                                {isSubscriptionIncome ? subscriptionPaymentStatusLabel : payoutLabel}
                              </span>
                            </div>

                            {isSubscriptionIncome && (
                              <div className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-3 py-2">
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                  Tarif
                                </span>
                                <span className="mt-1 block font-semibold text-emerald-950">
                                  {subscriptionPlanLabel(item.subscriptionPlan)}
                                </span>
                              </div>
                            )}

                            {isSubscriptionIncome && (
                              <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2">
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Období
                                </span>
                                <span className="mt-1 block font-semibold text-slate-950">
                                  {subscriptionPeriodLabel ?? "—"}
                                </span>
                              </div>
                            )}

                            <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Zdroj
                              </span>
                              <span className="mt-1 block font-semibold text-slate-950">
                                {sourceLabel}
                              </span>
                            </div>

                            {hasPredictionAdjustment && (
                              <div className="rounded-[12px] border border-[#d8b4fe] bg-[#fbf7ff] px-3 py-2">
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7e22ce]">
                                  Inteligentní predikce
                                </span>
                                <span className="mt-1 block font-semibold text-slate-950">
                                  {predictionLabel}
                                </span>
                                <span className="mt-1 block text-xs font-medium text-slate-500">
                                  Základ {formatMoney(groupBaseAmount)} →{" "}
                                  {formatMoney(group.amount)}
                                </span>
                              </div>
                            )}

                            {!isSubscriptionIncome && (
                              <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2">
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Roční pojistné
                                </span>
                                <span className="mt-1 block font-semibold text-slate-950">
                                  {inputPremium ?? "—"}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2 xl:grid-cols-1">
                          <div className="rounded-[12px] border border-slate-200 bg-white px-2.5 py-2 shadow-[0_4px_12px_rgba(15,23,42,0.04)] sm:rounded-[14px] sm:px-3">
                            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              {isSubscriptionIncome ? "Platba" : "Hrubá provize"}
                            </span>
                            <span className="mt-1 block whitespace-nowrap font-mono text-base font-bold text-slate-950 sm:text-[1.2rem]">
                              {formatMoney(group.amount)}
                            </span>
                          </div>

                          <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-2.5 py-2 shadow-[0_4px_12px_rgba(244,63,94,0.06)] sm:rounded-[14px] sm:px-3">
                            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-700">
                              StornoFond {Math.round(STORNO_FUND_RATE * 100)} %
                            </span>
                            <span className="mt-1 block whitespace-nowrap font-mono text-base font-bold text-rose-700 sm:text-[1.2rem]">
                              {stornoFundAmount > 0 ? `- ${formatMoney(stornoFundAmount)}` : "Bez odpočtu"}
                            </span>
                          </div>

                          <div className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-2.5 py-2 shadow-[0_4px_12px_rgba(16,185,129,0.08)] sm:rounded-[14px] sm:px-3">
                            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                              {isSubscriptionIncome ? "Čistý příjem" : "Čistě po odpočtu"}
                            </span>
                            <span className="mt-1 block whitespace-nowrap font-mono text-base font-bold text-emerald-800 sm:text-[1.25rem]">
                              {formatMoney(netAmount)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 sm:mt-3">
                        {href && (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50 sm:px-3.5 sm:text-sm"
                          >
                            <ExternalLink className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                            Otevřít smlouvu
                          </a>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
