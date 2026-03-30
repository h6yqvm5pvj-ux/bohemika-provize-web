import SplitTitle from "../../pomucky/plan-produkce/SplitTitle";
import { formatMoney } from "../helpers";

type CashflowHeaderProps = {
  totalCashflow: number;
  showPastYears: boolean;
  onTogglePastYears: () => void;
};

export function CashflowHeader({
  totalCashflow,
  showPastYears,
  onTogglePastYears,
}: CashflowHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SplitTitle text="Cashflow provizí" />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onTogglePastYears}
          className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:bg-white/18"
        >
          {showPastYears ? "Skrýt předchozí roky" : "Zobrazit předchozí roky"}
        </button>

        <div className="min-w-[260px] rounded-2xl border border-white/20 bg-white/[0.05] px-4 py-3 backdrop-blur-md shadow-[0_10px_28px_rgba(0,0,0,0.32)]">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-300/85">
            Celkové očekávané cashflow
          </div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div className="whitespace-nowrap text-2xl sm:text-3xl font-semibold leading-none text-emerald-100">
              {formatMoney(totalCashflow)}
            </div>
            <div className="pb-0.5 text-[11px] uppercase tracking-[0.14em] text-emerald-200/75">
              Výhled
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
