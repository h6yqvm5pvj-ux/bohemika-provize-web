import Link from "next/link";
import { X } from "lucide-react";

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
  tipsterMode?: boolean;
};

function formatItemCount(count: number, singular: string, few: string, many: string): string {
  if (count === 1) return `1 ${singular}`;
  if (count >= 2 && count <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

export function CashflowMonthModal({
  month,
  onClose,
  onSelectItem,
  tipsterMode = false,
}: CashflowMonthModalProps) {
  if (!month) return null;

  const sortedItems = [...month.items].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const tipOnlyMonth =
    tipsterMode || month.items.every((item) => item.isTipPayout === true);
  const stornoFund = calculateStornoFund(month.items);
  const netTotal = calculateNetCashflow(month.total, stornoFund);
  const stornoPercent = Math.round(STORNO_FUND_RATE * 100);
  const itemCountLabel = tipOnlyMonth
    ? formatItemCount(month.items.length, "tip", "tipy", "tipů")
    : formatItemCount(month.items.length, "smlouva", "smlouvy", "smluv");

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-[#08030f]/78 px-4 py-6 backdrop-blur-[7px]"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[95vh] w-[min(1520px,96vw)] flex-col overflow-hidden rounded-[34px] border border-slate-200 bg-[#fbfdff] p-4 text-slate-900 shadow-[0_38px_92px_rgba(2,6,23,0.38)] sm:p-6"
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

        <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-4">
          <div className="px-1 pt-1">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Přehled měsíce
                </p>
                <h3 className="text-[2.2rem] font-bold leading-tight text-slate-900 sm:text-[3rem]">
                  {month.label}
                </h3>
                <p className="text-[1.05rem] text-slate-600">{itemCountLabel}</p>
              </div>

              <div className="flex items-start gap-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="min-w-[220px] rounded-[20px] border border-[#d7c3ed] bg-[#f4ecff] px-5 py-3 text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#71558f]">
                      {tipOnlyMonth ? "TIP provize" : "Brutto"}
                    </div>
                    <div className="mt-1 whitespace-nowrap font-mono text-[2.2rem] font-bold leading-none tracking-[-0.02em] text-[#1a1028]">
                      {formatMoney(month.total)}
                    </div>
                  </div>

                  <div className="min-w-[220px] rounded-[20px] border border-rose-200 bg-rose-50 px-5 py-3 text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">
                      STORNO fond ({stornoPercent} %)
                    </div>
                    <div className="mt-1 whitespace-nowrap font-mono text-[2.2rem] font-bold leading-none tracking-[-0.02em] text-rose-700">
                      - {formatMoney(stornoFund)}
                    </div>
                  </div>

                  <div className="min-w-[220px] rounded-[20px] border border-emerald-300 bg-emerald-50 px-5 py-3 text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                      Čisté cashflow
                    </div>
                    <div className="mt-1 whitespace-nowrap font-mono text-[2.2rem] font-bold leading-none tracking-[-0.02em] text-emerald-700">
                      {formatMoney(netTotal)}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="ui-focus inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:text-slate-900"
                  aria-label="Zavřít přehled měsíce"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-[28px] border border-slate-200 bg-[#f7f8fd] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] sm:p-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                ? "border-fuchsia-400/60 bg-fuchsia-500/18 text-fuchsia-100"
                : isTeamIncome
                ? "border-indigo-400/60 bg-indigo-500/18 text-indigo-100"
                : "border-emerald-400/60 bg-emerald-500/20 text-emerald-100";
              const tipSourceOwner =
                item.tipSourceAdviserName && item.tipSourceAdviserName.trim() !== ""
                  ? item.tipSourceAdviserName.trim()
                  : null;

                return (
                  <article
                    key={item.id}
                    className="group relative isolate overflow-hidden rounded-[22px] border border-[#6a3b97] bg-[#1c122c] shadow-[0_12px_24px_rgba(9,4,18,0.44)] ring-1 ring-[#7d4ab0]/24 transition hover:-translate-y-0.5 hover:border-[#9d63d1] hover:shadow-[0_18px_34px_rgba(9,4,18,0.56)]"
                  >
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#cb85ff] via-[#ab5ff6] to-[#9652ef]" />
                    <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(73,36,107,0.44)_0%,rgba(26,16,40,0.75)_45%,rgba(18,12,27,0.94)_100%)]" />

                    <div className="relative z-[1] grid grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_250px] md:items-end md:p-5">
                      <button
                        type="button"
                        onClick={() => onSelectItem(item)}
                        className="min-w-0 text-left md:pr-3"
                      >
                        <div className="text-[1.85rem] leading-tight font-bold tracking-[-0.01em] text-[#f9f4ff]">
                          {productLabel(item.productKey)}
                        </div>

                        <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.15em] text-[#c5abdf]">
                          {dateLabel}
                          {contractNo ? ` · ${contractNo}` : ""}
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-1 text-[1.03rem] text-[#e6dcf3]">
                          {isTipIncome ? (
                            <>
                              <p>
                                <span className="text-[#bfa5d8]">Klient:</span>{" "}
                                <span className="font-medium text-[#faf5ff]">{clientName ?? "—"}</span>
                              </p>
                              <p>
                                <span className="text-[#bfa5d8]">Smlouvu uzavřel:</span>{" "}
                                <span className="font-medium text-[#faf5ff]">{tipSourceOwner ?? "—"}</span>
                              </p>
                            </>
                          ) : (
                            <p>
                              <span className="text-[#bfa5d8]">Klient:</span>{" "}
                              <span className="font-medium text-[#faf5ff]">{clientName ?? "—"}</span>
                            </p>
                          )}
                          {!isTipIncome && (
                            <p>
                              <span className="text-[#bfa5d8]">Frekvence:</span>{" "}
                              <span className="font-medium text-[#faf5ff]">
                                {frequencyText(item.frequency)}
                              </span>
                            </p>
                          )}
                        </div>
                      </button>

                      <div className="text-right md:border-l md:border-[#6d3f9a] md:pl-4">
                        <div className="text-right">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c8aee4]">
                            Výplata
                          </span>
                          <div className="mt-1 whitespace-nowrap font-mono text-[2.45rem] leading-none font-bold tracking-[-0.03em] text-[#f9f4ff]">
                            {formatMoney(item.amount)}
                          </div>
                          {item.productKey !== STORNO_EXEMPT_PRODUCT && (
                            <div className="mt-1 text-sm text-[#c7aedf]">
                              Po odečtení StornoFondu:{" "}
                              <span className="font-semibold text-[#f4ecff]">
                                {formatMoney(item.amount * (1 - STORNO_FUND_RATE))}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold ${scopeBadgeClass}`}
                          >
                            {isTipIncome ? "TIP" : isTeamIncome ? "Týmová" : "Vlastní"}
                          </span>
                          {href && (
                            <Link
                              href={href}
                              className="inline-flex items-center rounded-full border border-[#9a67d0] bg-[#120d20] px-4 py-1.5 text-sm font-semibold text-[#fbf7ff] transition hover:border-[#c89bff] hover:bg-[#a95eff] hover:text-[#160d24]"
                            >
                              Otevřít smlouvu
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
