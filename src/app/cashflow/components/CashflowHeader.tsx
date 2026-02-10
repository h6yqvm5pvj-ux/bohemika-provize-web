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
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <SplitTitle text="Cashflow provizí" />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onTogglePastYears}
          className="rounded-full border border-white/25 bg-white/10 backdrop-blur-md px-4 py-2 text-sm text-white shadow-[0_12px_32px_rgba(255,255,255,0.15)] hover:bg-white/20 transition"
        >
          {showPastYears ? "Skrýt předchozí roky" : "Zobrazit předchozí roky"}
        </button>

        <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/50 px-4 py-4 text-center shadow-[0_18px_50px_rgba(16,185,129,0.4)]">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/80 mb-1">
            Celkové očekávané cashflow
          </div>
          <div className="text-2xl sm:text-3xl font-semibold text-emerald-100">
            {formatMoney(totalCashflow)}
          </div>
        </div>
      </div>
    </header>
  );
}
