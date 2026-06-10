import { formatMoney, frequencyText, productLabel } from "../helpers";
import type { CashflowItem } from "../types";

type CashflowItemModalProps = {
  item: CashflowItem | null;
  onClose: () => void;
};

export function CashflowItemModal({ item, onClose }: CashflowItemModalProps) {
  if (!item) return null;
  const isTipPayout = item.isTipPayout === true;
  const tipSourceOwner =
    item.tipSourceAdviserName && item.tipSourceAdviserName.trim() !== ""
      ? item.tipSourceAdviserName.trim()
      : null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[min(560px,92vw)] overflow-hidden rounded-3xl border border-white/25 bg-slate-950 p-5 text-white shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative space-y-4">
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
              <div className="text-xl font-bold text-white">
                {formatMoney(item.amount)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl border border-white/20 bg-black p-3 space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                Klient
              </div>
              <div className="font-medium">
                {item.clientName?.trim() || "—"}
              </div>
              {isTipPayout ? (
                <div className="text-[11px] text-slate-300">
                  Smlouvu uzavřel: {tipSourceOwner ?? "—"}
                </div>
              ) : (
                <div className="text-[11px] text-slate-300">
                  Číslo smlouvy: {item.contractNumber?.trim() || "—"}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/20 bg-black p-3 space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                Frekvence / Zdroj
              </div>
              <div className="font-medium">
                {isTipPayout ? "TIP provize" : frequencyText(item.frequency)}
              </div>
              <div className="text-[11px] text-slate-300">
                {isTipPayout
                  ? "TIP provize"
                  : item.source === "manager" || item.isManagerOverride
                  ? "Manažerská provize"
                  : "Vlastní provize"}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/20 bg-black p-3 space-y-1 text-sm">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              Poznámka
            </div>
            <div className="text-white">{item.note?.trim() || "Bez poznámky"}</div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-slate-200"
            >
              Zavřít
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
