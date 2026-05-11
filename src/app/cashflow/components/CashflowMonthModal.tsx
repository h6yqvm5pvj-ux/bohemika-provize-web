import Link from "next/link";
import { X } from "lucide-react";

import { REVENUE_SCOPE_THEME } from "@/app/lib/revenueScopeTheme";
import {
  calculateNetCashflow,
  calculateStornoFund,
  formatMoney,
  frequencyText,
  productLabel,
  STORNO_EXEMPT_PRODUCT,
  STORNO_FUND_RATE,
} from "../helpers";
import type { CashflowItem, MonthGroup } from "../types";

type CashflowMonthModalProps = {
  month: MonthGroup | null;
  onClose: () => void;
  onSelectItem: (item: CashflowItem) => void;
};

export function CashflowMonthModal({
  month,
  onClose,
  onSelectItem,
}: CashflowMonthModalProps) {
  if (!month) return null;

  const sortedItems = [...month.items].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const stornoFund = calculateStornoFund(month.items);
  const netTotal = calculateNetCashflow(month.total, stornoFund);
  const stornoPercent = Math.round(STORNO_FUND_RATE * 100);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/58 px-4 py-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="relative w-[min(1120px,96vw)] overflow-hidden rounded-[32px] border border-slate-200 bg-white p-4 text-slate-900 shadow-[0_34px_86px_rgba(2,6,23,0.34)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Přehled měsíce
              </p>
              <h3 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{month.label}</h3>
              <p className="text-sm text-slate-600">{month.items.length} smluv</p>
            </div>
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="grid grid-cols-1 gap-3 sm:min-w-[560px] sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200/90 bg-white/80 px-4 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    Brutto
                  </div>
                  <div className="mt-1 text-xl font-semibold leading-none text-slate-900 sm:text-[1.9rem]">
                    {formatMoney(month.total)}
                  </div>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50/85 px-4 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-rose-700">
                    STORNO fond ({stornoPercent} %)
                  </div>
                  <div className="mt-1 text-xl font-semibold leading-none text-rose-700 sm:text-[1.9rem]">
                    - {formatMoney(stornoFund)}
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50/85 px-4 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-700">
                    Čisté cashflow
                  </div>
                  <div className="mt-1 text-xl font-semibold leading-none text-emerald-700 sm:text-[1.9rem]">
                    {formatMoney(netTotal)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="ui-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.1)] transition hover:border-slate-400 hover:bg-white hover:text-slate-900"
                aria-label="Zavřít přehled měsíce"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[58vh] space-y-3 overflow-y-auto rounded-2xl border border-slate-200/85 bg-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:p-4">
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
                ? REVENUE_SCOPE_THEME.tip.badgeClass
                : isTeamIncome
                ? REVENUE_SCOPE_THEME.team.badgeClass
                : REVENUE_SCOPE_THEME.own.badgeClass;
              const tipSourceOwner =
                item.tipSourceAdviserEmail && item.tipSourceAdviserEmail.trim() !== ""
                  ? item.tipSourceAdviserEmail.trim().toLowerCase()
                  : null;

              return (
                <article
                  key={item.id}
                  className="relative rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.06)] transition hover:border-slate-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.1)]"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_280px] sm:gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <button
                      type="button"
                      onClick={() => onSelectItem(item)}
                      className="min-w-0 text-left"
                    >
                      <div className="text-xl leading-tight font-semibold text-slate-900 sm:text-2xl">
                        {productLabel(item.productKey)}
                      </div>

                      <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                        {dateLabel}
                        {contractNo ? ` · ${contractNo}` : ""}
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-1 text-sm text-slate-700">
                        {isTipIncome ? (
                          <p>
                            <span className="text-slate-500">TIP od:</span>{" "}
                            <span className="text-slate-900">{tipSourceOwner ?? "—"}</span>
                          </p>
                        ) : (
                          <p>
                            <span className="text-slate-500">Klient:</span>{" "}
                            <span className="text-slate-900">{clientName ?? "—"}</span>
                          </p>
                        )}
                        <p>
                          <span className="text-slate-500">
                            {isTipIncome ? "Typ:" : "Frekvence:"}
                          </span>{" "}
                          <span className="text-slate-900">
                            {isTipIncome ? "TIP provize" : frequencyText(item.frequency)}
                          </span>
                        </p>
                      </div>
                    </button>

                    <div className="border-t border-slate-200/85 pt-3 sm:border-l sm:border-slate-200/85 sm:border-t-0 sm:pl-5 sm:pt-0">
                      <div className="flex items-end justify-between gap-3 sm:h-full sm:flex-col sm:items-end sm:justify-between">
                        <div className="text-right">
                          <span className="text-xs uppercase tracking-[0.12em] text-slate-500">
                            Výplata
                          </span>
                          <div className="mt-1 whitespace-nowrap text-3xl leading-none font-semibold tracking-tight text-slate-900 sm:text-[2.2rem]">
                            {formatMoney(item.amount)}
                          </div>
                          {item.productKey !== STORNO_EXEMPT_PRODUCT && (
                            <div className="mt-1 text-sm text-slate-500">
                              Po odečtení StornoFondu:{" "}
                              <span className="font-semibold text-slate-700">
                                {formatMoney(item.amount * (1 - STORNO_FUND_RATE))}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium ${scopeBadgeClass}`}
                          >
                            {isTipIncome ? "TIP" : isTeamIncome ? "Týmová" : "Vlastní"}
                          </span>
                          {href && (
                            <Link
                              href={href}
                              className="inline-flex items-center rounded-full border border-slate-900 bg-slate-950 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
                            >
                              Otevřít smlouvu
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(2,6,23,0.24)] transition hover:bg-slate-800"
            >
              Zavřít
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
