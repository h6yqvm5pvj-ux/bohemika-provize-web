import Link from "next/link";

import { formatMoney, frequencyText, productLabel } from "../helpers";
import type { CashflowItem, MonthGroup } from "../types";

type CashflowMonthModalProps = {
  month: MonthGroup | null;
  onClose: () => void;
  onSelectItem: (item: CashflowItem) => void;
};

const STORNO_FUND_RATE = 0.15;
const STORNO_EXEMPT_PRODUCT = "comfortcc";

export function CashflowMonthModal({
  month,
  onClose,
  onSelectItem,
}: CashflowMonthModalProps) {
  if (!month) return null;

  const sortedItems = [...month.items].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const stornoFund = month.items.reduce((sum, item) => {
    if (item.productKey === STORNO_EXEMPT_PRODUCT) return sum;
    return sum + item.amount * STORNO_FUND_RATE;
  }, 0);
  const netTotal = month.total - stornoFund;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[min(1080px,96vw)] overflow-hidden rounded-3xl border border-slate-300 bg-white p-4 text-slate-900 shadow-[0_28px_70px_rgba(0,0,0,0.28)] sm:p-5"
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
            <div className="grid grid-cols-1 gap-3 sm:min-w-[560px] sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  Brutto
                </div>
                <div className="mt-1 text-lg font-semibold leading-none text-slate-900 sm:text-2xl">
                  {formatMoney(month.total)}
                </div>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-right">
                <div className="text-[11px] uppercase tracking-[0.14em] text-rose-700">
                  STORNO fond (15 %)
                </div>
                <div className="mt-1 text-lg font-semibold leading-none text-rose-700 sm:text-2xl">
                  - {formatMoney(stornoFund)}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-right">
                <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-700">
                  Čisté cashflow
                </div>
                <div className="mt-1 text-lg font-semibold leading-none text-emerald-700 sm:text-2xl">
                  {formatMoney(netTotal)}
                </div>
              </div>
            </div>
          </div>

          <div className="max-h-[58vh] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
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
              const href = contractSlug
                ? `/smlouvy/${encodeURIComponent(contractSlug)}`
                : null;
              const isTeamIncome = item.source === "manager" || item.isManagerOverride;

              return (
                <article
                  key={item.id}
                  className="relative rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:border-slate-300 hover:bg-slate-50"
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
                        <p>
                          <span className="text-slate-500">Klient:</span>{" "}
                          <span className="text-slate-900">{clientName ?? "—"}</span>
                        </p>
                        <p>
                          <span className="text-slate-500">Frekvence:</span>{" "}
                          <span className="text-slate-900">{frequencyText(item.frequency)}</span>
                        </p>
                        {item.note && (
                          <p className="text-xs text-slate-500">{item.note}</p>
                        )}
                      </div>
                    </button>

                    <div className="border-t border-slate-200 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                      <div className="flex items-end justify-between gap-3 sm:h-full sm:flex-col sm:items-end sm:justify-between">
                        <div className="text-right">
                          <span className="text-xs uppercase tracking-[0.12em] text-slate-500">
                            Výplata
                          </span>
                          <div className="mt-1 whitespace-nowrap text-4xl leading-none font-semibold tracking-tight text-slate-900 sm:text-[2.6rem]">
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
                            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium ${
                              isTeamIncome
                                ? "border-indigo-600 bg-indigo-600 !text-white"
                                : "border-emerald-600 bg-emerald-600 text-white"
                            }`}
                          >
                            {isTeamIncome ? "Týmová" : "Vlastní"}
                          </span>
                          {href && (
                            <Link
                              href={href}
                              className="inline-flex items-center rounded-full border border-slate-900 bg-slate-950 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-black"
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
              className="rounded-xl border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Zavřít
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
