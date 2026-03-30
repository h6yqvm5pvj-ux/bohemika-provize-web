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
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[min(560px,92vw)] overflow-hidden rounded-3xl border border-white/20 bg-white/[0.08] p-5 text-slate-100 shadow-[0_30px_80px_rgba(0,0,0,0.6)] backdrop-blur-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl"
        />

        <div className="relative space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300/80">
                Výplata
              </p>
              <h3 className="text-xl font-semibold">{productLabel(item.productKey)}</h3>
              <p className="text-sm text-slate-200/85">
                {item.date.toLocaleDateString("cs-CZ")}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-300/80">
                Částka
              </div>
              <div className="text-xl font-bold text-emerald-100">
                {formatMoney(item.amount)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl border border-white/15 bg-white/[0.08] p-3 space-y-1 backdrop-blur-xl">
              <div className="text-[11px] uppercase tracking-wide text-slate-300/80">
                Klient
              </div>
              <div className="font-medium">{item.clientName?.trim() || "—"}</div>
              <div className="text-[11px] text-slate-300/75">
                Číslo smlouvy: {item.contractNumber?.trim() || "—"}
              </div>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/[0.08] p-3 space-y-1 backdrop-blur-xl">
              <div className="text-[11px] uppercase tracking-wide text-slate-300/80">
                Frekvence / Zdroj
              </div>
              <div className="font-medium">{frequencyText(item.frequency)}</div>
              <div className="text-[11px] text-slate-300/75">
                {item.source === "manager" || item.isManagerOverride
                  ? "Manažerská provize"
                  : "Vlastní provize"}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/[0.08] p-3 space-y-1 text-sm backdrop-blur-xl">
            <div className="text-[11px] uppercase tracking-wide text-slate-300/80">
              Poznámka
            </div>
            <div className="text-slate-100">{item.note?.trim() || "Bez poznámky"}</div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/25 bg-white/12 px-4 py-2 text-sm font-semibold text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:bg-white/18"
            >
              Zavřít
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
