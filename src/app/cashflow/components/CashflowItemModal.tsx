import { formatMoney, frequencyText, productLabel } from "../helpers";
import type { CashflowItem } from "../types";

type CashflowItemModalProps = {
  item: CashflowItem | null;
  onClose: () => void;
};

export function CashflowItemModal({ item, onClose }: CashflowItemModalProps) {
  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="w-[min(520px,92vw)] rounded-2xl bg-slate-900 border border-white/10 shadow-2xl p-5 space-y-4 text-slate-100"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Výplata
            </p>
            <h3 className="text-xl font-semibold">{productLabel(item.productKey)}</h3>
            <p className="text-sm text-slate-300">
              {item.date.toLocaleDateString("cs-CZ")}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              Částka
            </div>
            <div className="text-xl font-bold text-emerald-300">
              {formatMoney(item.amount)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              Klient
            </div>
            <div className="font-medium">{item.clientName?.trim() || "—"}</div>
            <div className="text-[11px] text-slate-400">
              Číslo smlouvy: {item.contractNumber?.trim() || "—"}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              Frekvence / Zdroj
            </div>
            <div className="font-medium">{frequencyText(item.frequency)}</div>
            <div className="text-[11px] text-slate-400">
              {item.source === "manager" || item.isManagerOverride
                ? "Manažerská provize"
                : "Vlastní provize"}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1 text-sm">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Poznámka
          </div>
          <div className="text-slate-100">{item.note?.trim() || "Bez poznámky"}</div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white text-slate-900 px-4 py-2 text-sm font-semibold hover:bg-slate-100"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
}
