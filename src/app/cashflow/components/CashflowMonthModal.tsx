import Link from "next/link";

import { formatMoney, productLabel } from "../helpers";
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

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[min(980px,96vw)] overflow-hidden rounded-3xl border border-slate-300 bg-white p-5 text-slate-900 shadow-[0_28px_70px_rgba(0,0,0,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Přehled měsíce
              </p>
              <h3 className="text-2xl font-semibold">{month.label}</h3>
              <p className="text-sm text-slate-600">{month.items.length} položek</p>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                Součet
              </div>
              <div className="text-2xl font-bold text-slate-950">
                {formatMoney(month.total)}
              </div>
            </div>
          </div>

          <div className="max-h-[58vh] space-y-2 overflow-y-auto rounded-2xl border border-slate-300 bg-slate-50 p-3">
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

              return (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs sm:text-sm"
                >
                  <button
                    type="button"
                    onClick={() => onSelectItem(item)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="text-[11px] text-slate-500">{dateLabel}</span>
                    <div className="font-medium text-slate-900">
                      {productLabel(item.productKey)}
                      {contractNo && (
                        <span className="font-normal text-slate-600"> · {contractNo}</span>
                      )}
                    </div>
                    {clientName && (
                      <div className="text-[11px] text-slate-600">Klient: {clientName}</div>
                    )}
                    {item.note && (
                      <div className="text-[11px] text-slate-500">{item.note}</div>
                    )}
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right text-sm font-semibold text-slate-950">
                      {formatMoney(item.amount)}
                    </div>
                    {href && (
                      <Link
                        href={href}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-900 bg-slate-950 px-2 py-1 text-[11px] text-white transition hover:bg-slate-800"
                      >
                        Otevřít
                      </Link>
                    )}
                  </div>
                </div>
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
