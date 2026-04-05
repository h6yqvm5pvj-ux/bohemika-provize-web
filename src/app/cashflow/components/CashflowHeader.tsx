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
    <header className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <SplitTitle
          text="Cashflow provizí"
          wrap={false}
          className="text-4xl sm:text-5xl !text-slate-900"
        />

        <div className="min-w-[340px] rounded-2xl border border-slate-900 bg-slate-950 px-5 py-4 shadow-[0_12px_24px_rgba(2,6,23,0.35)]">
          <div className="text-[11px] uppercase tracking-[0.22em] text-white">
            Celkové očekávané cashflow
          </div>
          <div className="mt-1">
            <div className="whitespace-nowrap text-3xl sm:text-4xl font-semibold leading-none text-emerald-400">
              {formatMoney(totalCashflow)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onTogglePastYears}
          className="rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          {showPastYears ? "Skrýt předchozí roky" : "Zobrazit předchozí roky"}
        </button>
      </div>
    </header>
  );
}
