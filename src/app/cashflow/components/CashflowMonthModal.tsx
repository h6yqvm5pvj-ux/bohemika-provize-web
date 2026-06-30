import Link from "next/link";
import { ChevronDown, FileText, Loader2, X } from "lucide-react";

import {
  isAutoProduct,
  isPropertyProduct,
} from "@/app/lib/productCatalog";
import type { Product } from "@/app/types/domain";
import {
  calculateNetCashflow,
  calculateStornoFund,
  formatMoney,
  frequencyText,
  productLabel,
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

function formatItemCount(count: number, singular: string, few: string, many: string): string {
  if (count === 1) return `1 ${singular}`;
  if (count >= 2 && count <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

function commissionMeaning(label: string | null, isTipIncome: boolean): { title: string; text: string } {
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

const COMMISSION_BY_PAYMENT_FREQUENCY_PRODUCTS = new Set<Product>([
  "cppAuto",
  "slaviaauto",
  "csobAuto",
  "kooperativaAuto",
  "domex",
  "cpphafan",
  "koopmajetekobcan",
  "koopfit",
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
  const product = item.productKey === "unknown" ? null : item.productKey;
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

  const sortedItems = [...month.items].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const tipOnlyMonth =
    tipsterMode ||
    (month.items.length > 0 && month.items.every((item) => item.isTipPayout === true));
  const isPaidMonth = month.totalSource === "paid";
  const predictedTotal = month.predictedTotal ?? month.total;
  const payoutDifference = month.total - predictedTotal;
  const stornoFund = calculateStornoFund(month.items);
  const netTotal = isPaidMonth ? month.total : calculateNetCashflow(month.total, stornoFund);
  const stornoPercent = Math.round(STORNO_FUND_RATE * 100);
  const itemCountLabel = tipOnlyMonth
    ? formatItemCount(month.items.length, "tip", "tipy", "tipů")
    : formatItemCount(month.items.length, "položka", "položky", "položek");

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-[#08030f]/78 px-3 py-4 backdrop-blur-[7px]"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[95vh] w-[min(1520px,96vw)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-[#fbfdff] p-3 text-slate-900 shadow-[0_34px_82px_rgba(2,6,23,0.36)] sm:p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#ca85ff_0%,#aa57f5_46%,#8f44e8_100%)]"
          aria-hidden="true"
        />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(244,239,252,0.96)_0%,rgba(250,248,255,0.98)_44%,rgba(252,251,255,1)_100%)]" />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(146deg,rgba(197,105,255,0.08)_0%,rgba(197,105,255,0)_38%,rgba(166,86,246,0.06)_100%)]" />
        <span className="pointer-events-none absolute -top-20 left-28 h-[21rem] w-px rotate-[35deg] bg-[#9a5dcb]/10" />
        <span className="pointer-events-none absolute -right-16 top-10 h-40 w-40 rounded-full bg-[#ae62ff]/12 blur-3xl" />

        <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-3">
          <div className="px-1 pt-1">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Přehled měsíce
                </p>
                <h3 className="text-[1.95rem] font-bold leading-tight text-slate-900 sm:text-[2.45rem]">
                  {month.label}
                </h3>
                <p className="text-sm text-slate-600">{itemCountLabel}</p>
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
                          className="ui-focus inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-800 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:border-slate-500 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
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

                <div className="flex items-start gap-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {isPaidMonth ? (
                      <>
                        <div className="min-w-[175px] rounded-[16px] border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-right">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                            Vyplaceno
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[1.7rem] font-bold leading-none tracking-[-0.02em] text-emerald-700">
                            {formatMoney(month.total)}
                          </div>
                        </div>

                        <div className="min-w-[175px] rounded-[16px] border border-[#d7c3ed] bg-[#f4ecff] px-4 py-2.5 text-right">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#71558f]">
                            Předpoklad systému
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[1.7rem] font-bold leading-none tracking-[-0.02em] text-[#1a1028]">
                            {formatMoney(predictedTotal)}
                          </div>
                        </div>

                        <div
                          className={`min-w-[175px] rounded-[16px] border px-4 py-2.5 text-right ${
                            payoutDifference >= 0
                              ? "border-emerald-300 bg-emerald-50"
                              : "border-rose-200 bg-rose-50"
                          }`}
                        >
                          <div
                            className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                              payoutDifference >= 0 ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            Rozdíl
                          </div>
                          <div
                            className={`mt-1 whitespace-nowrap font-mono text-[1.7rem] font-bold leading-none tracking-[-0.02em] ${
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
                        <div className="min-w-[175px] rounded-[16px] border border-[#d7c3ed] bg-[#f4ecff] px-4 py-2.5 text-right">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#71558f]">
                            {tipOnlyMonth ? "TIP provize" : "Předpoklad"}
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[1.7rem] font-bold leading-none tracking-[-0.02em] text-[#1a1028]">
                            {formatMoney(month.total)}
                          </div>
                        </div>

                        <div className="min-w-[175px] rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-2.5 text-right">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700">
                            STORNO fond ({stornoPercent} %)
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[1.7rem] font-bold leading-none tracking-[-0.02em] text-rose-700">
                            - {formatMoney(stornoFund)}
                          </div>
                        </div>

                        <div className="min-w-[175px] rounded-[16px] border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-right">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                            Čisté cashflow
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[1.7rem] font-bold leading-none tracking-[-0.02em] text-emerald-700">
                            {formatMoney(netTotal)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="ui-focus inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:text-slate-900"
                    aria-label="Zavřít přehled měsíce"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-[22px] border border-slate-200 bg-[#f7f8fd] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] sm:p-3">
            <div className="grid grid-cols-1 gap-2.5">
              {sortedItems.map((item) => {
                const dateLabel = item.date.toLocaleDateString("cs-CZ");
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
                const href = !isTipIncome && contractSlug
                  ? `/smlouvy/${encodeURIComponent(contractSlug)}`
                  : null;
                const isTeamIncome =
                  !isTipIncome && (item.source === "manager" || item.isManagerOverride);
                const scopeBadgeClass = isTipIncome
                  ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
                  : isTeamIncome
                  ? "border-sky-200 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-slate-50 text-slate-700";
                const payoutStatus = item.payoutStatus ?? "predicted";
                const payoutStatusLabel =
                  payoutStatus === "paid"
                    ? "Vyplaceno"
                    : payoutStatus === "shifted"
                    ? "Přesunuto"
                    : "Předpoklad";
                const payoutStatusClass =
                  payoutStatus === "paid"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : payoutStatus === "shifted"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-slate-200 bg-slate-50 text-slate-700";
                const commissionLabel =
                  item.commissionLabel?.trim() ||
                  item.commissionCode?.trim() ||
                  null;
                const nonLifeDetail = nonLifeCommissionDetail(item);
                const displayCommissionLabel =
                  commissionLabel ?? nonLifeDetail?.commissionTypeLabel ?? null;
                const stornoFundAmount =
                  item.productKey === STORNO_EXEMPT_PRODUCT ? 0 : item.amount * STORNO_FUND_RATE;
                const netAmount = item.amount - stornoFundAmount;
                const detailMeaning = nonLifeDetail
                  ? {
                      title: nonLifeDetail.commissionTypeLabel,
                      text: nonLifeDetail.commissionText,
                    }
                  : commissionMeaning(commissionLabel, isTipIncome);
                const sourceLabel = isTipIncome
                  ? "TIP provize"
                  : isTeamIncome
                  ? "Týmová provize"
                  : "Vlastní provize";
                const inputPremium =
                  item.inputAmount != null && Number.isFinite(item.inputAmount) && item.inputAmount > 0
                    ? formatMoney(item.inputAmount)
                    : null;

                return (
                  <details
                    key={item.id}
                    className="group relative isolate overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.08)] ring-1 ring-white transition hover:border-slate-300 hover:shadow-[0_16px_34px_rgba(15,23,42,0.12)] open:border-[#c9b4e8]"
                  >
                    <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,#a855f7_0%,#60a5fa_52%,#34d399_100%)]" />
                    <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,0.08)_0%,rgba(255,255,255,0)_28%)]" />

                    <summary className="relative z-[1] grid cursor-pointer list-none grid-cols-1 gap-4 px-5 py-4 transition hover:bg-slate-50/80 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-[1.22rem] font-bold leading-tight tracking-[-0.01em] text-slate-950">
                            {productLabel(item.productKey)}
                          </h4>
                          {displayCommissionLabel && (
                            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                              {displayCommissionLabel}
                            </span>
                          )}
                          {!isTipIncome && (
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${payoutStatusClass}`}
                            >
                              {payoutStatusLabel}
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${scopeBadgeClass}`}
                          >
                            {isTipIncome ? "TIP" : isTeamIncome ? "Týmová" : "Vlastní"}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
                          <span>{dateLabel}</span>
                          {contractNo && <span>Smlouva {contractNo}</span>}
                          {displayCommissionLabel && <span>{displayCommissionLabel}</span>}
                          <span>
                            Klient:{" "}
                            <span className="font-semibold text-slate-950">{clientName ?? "—"}</span>
                          </span>
                          {!isTipIncome && (
                            <span>
                              Frekvence:{" "}
                              <span className="font-semibold text-slate-950">
                                {frequencyText(item.frequency)}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Výplata
                        </span>
                        <div className="mt-0.5 whitespace-nowrap font-mono text-[1.95rem] font-bold leading-none tracking-[-0.03em] text-slate-950">
                          {formatMoney(item.amount)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Detail
                        </span>
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.08)] transition group-open:rotate-180 group-open:border-violet-300 group-open:text-violet-700">
                          <ChevronDown className="h-4 w-4" strokeWidth={2.2} />
                        </span>
                      </div>
                    </summary>

                    <div className="relative z-[1] border-t border-slate-200 bg-slate-50/80 px-5 pb-5 pt-4">
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_520px] xl:items-start">
                        <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            Význam pro kontrolu
                          </span>
                          <div className="mt-1 text-base font-bold text-slate-950">
                            {detailMeaning.title}
                          </div>
                          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-slate-600">
                            {detailMeaning.text}
                          </p>

                          <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
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
                                Stav výpisu
                              </span>
                              <span className="mt-1 block font-semibold text-slate-950">
                                {payoutStatusLabel}
                              </span>
                            </div>

                            <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Zdroj
                              </span>
                              <span className="mt-1 block font-semibold text-slate-950">
                                {sourceLabel}
                              </span>
                            </div>

                            <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Roční pojistné
                              </span>
                              <span className="mt-1 block font-semibold text-slate-950">
                                {inputPremium ?? "—"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
                          <div className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
                            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              Hrubá provize
                            </span>
                            <span className="mt-1 block whitespace-nowrap font-mono text-[1.2rem] font-bold text-slate-950">
                              {formatMoney(item.amount)}
                            </span>
                          </div>

                          <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-3 py-2 shadow-[0_4px_12px_rgba(244,63,94,0.06)]">
                            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-700">
                              StornoFond {Math.round(STORNO_FUND_RATE * 100)} %
                            </span>
                            <span className="mt-1 block whitespace-nowrap font-mono text-[1.2rem] font-bold text-rose-700">
                              {stornoFundAmount > 0 ? `- ${formatMoney(stornoFundAmount)}` : "Bez odpočtu"}
                            </span>
                          </div>

                          <div className="rounded-[14px] border border-emerald-200 bg-emerald-50 px-3 py-2 shadow-[0_4px_12px_rgba(16,185,129,0.08)]">
                            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                              Čistě po odpočtu
                            </span>
                            <span className="mt-1 block whitespace-nowrap font-mono text-[1.25rem] font-bold text-emerald-800">
                              {formatMoney(netAmount)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                        {href && (
                          <Link
                            href={href}
                            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                          >
                            Otevřít smlouvu
                          </Link>
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
  );
}
