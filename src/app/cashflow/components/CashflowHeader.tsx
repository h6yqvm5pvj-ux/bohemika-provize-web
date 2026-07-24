import SplitTitle from "../../pomucky/plan-produkce/SplitTitle";
import { formatMoney } from "../helpers";
import { BrainCircuit, CalendarRange, Sparkles } from "lucide-react";

type CashflowHeaderProps = {
  totalCashflow: number;
  hasPaidMonthTotals?: boolean;
  forecastYears: number;
  intelligentPredictionEnabled: boolean;
  showPastYears: boolean;
  onTogglePastYears: () => void;
  onOpenPredictionInfo: () => void;
  tipsterMode?: boolean;
};

export function CashflowHeader({
  totalCashflow,
  hasPaidMonthTotals = false,
  forecastYears,
  intelligentPredictionEnabled,
  showPastYears,
  onTogglePastYears,
  onOpenPredictionInfo,
  tipsterMode = false,
}: CashflowHeaderProps) {
  return (
    <header className="px-1 py-5 text-slate-950 sm:px-2 sm:py-7">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-4xl text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#e6cdfc] bg-white px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#7e22ce] shadow-[0_10px_24px_rgba(126,34,206,0.08)]">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
            {tipsterMode ? "TIP CASHFLOW" : "CASHFLOW"}
          </span>

          <div className="mt-3 flex justify-start">
            <SplitTitle
              text={tipsterMode ? "Provizní kalendář TIPŮ" : "Provizní kalendář"}
              wrap={false}
              className="justify-start text-left !text-[2.65rem] !leading-[0.95] !text-slate-950 sm:!text-[3.5rem]"
            />
          </div>

          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
            {tipsterMode
              ? "Přehled sjednaných tipů a očekávaných TIP provizí napříč měsíci a roky."
              : "Predikce výplat napříč měsíci a roky v jednotném přehledu. Otevři rok, zkontroluj měsíce a jdi až na detail položky."}
          </p>
        </div>

        <div className="flex flex-col gap-4 xl:items-end">
          <div className="text-left xl:text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7e22ce]">
              {tipsterMode
                ? "Celkem očekávané TIP provize"
                : hasPaidMonthTotals
                ? "Celkem cashflow"
                : "Celkem očekávané cashflow"}
            </div>
            <div className="mt-1 whitespace-nowrap font-mono text-[2.25rem] font-semibold leading-none text-slate-950 sm:text-[2.7rem]">
              {formatMoney(totalCashflow)}
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {showPastYears
                ? `Včetně předchozích let a výhledu na ${forecastYears} let`
                : `Na následujících ${forecastYears} let`}
              {intelligentPredictionEnabled && !tipsterMode ? " · s inteligentní predikcí" : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 xl:justify-end">
            {!tipsterMode && (
              <button
                type="button"
                onClick={onOpenPredictionInfo}
                className={`ui-focus inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-[0_12px_28px_rgba(15,23,42,0.1)] transition hover:-translate-y-0.5 ${
                  intelligentPredictionEnabled
                    ? "border-[#21142f] bg-[#13091f] !text-white hover:bg-[#1d0f2c]"
                    : "border-[#d8b4fe] bg-white text-[#581c87] hover:border-[#a855f7] hover:bg-[#faf5ff]"
                }`}
              >
                <BrainCircuit className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                {intelligentPredictionEnabled ? "Predikce zapnutá" : "Inteligentní predikce"}
              </button>
            )}

            <button
              type="button"
              onClick={onTogglePastYears}
              className="ui-focus inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-[0_12px_28px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-900 hover:text-slate-950"
            >
              <CalendarRange className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              {showPastYears ? "Skrýt předchozí roky" : "Předchozí roky"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
