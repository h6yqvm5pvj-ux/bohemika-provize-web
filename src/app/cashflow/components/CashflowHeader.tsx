import SplitTitle from "../../pomucky/plan-produkce/SplitTitle";
import { formatMoney } from "../helpers";
import { BrainCircuit, CalendarRange, CircleHelp, Sparkles } from "lucide-react";

type CashflowHeaderProps = {
  totalCashflow: number;
  hasPaidMonthTotals?: boolean;
  forecastYears: number;
  intelligentPredictionEnabled: boolean;
  showPastYears: boolean;
  onTogglePastYears: () => void;
  onOpenPredictionInfo: () => void;
  onOpenHelp: () => void;
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
  onOpenHelp,
  tipsterMode = false,
}: CashflowHeaderProps) {
  return (
    <header className="px-0 py-3 text-slate-950 sm:px-2 sm:py-7">
      <div className="flex flex-col gap-4 sm:gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-4xl text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e6cdfc] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7e22ce] shadow-[0_8px_18px_rgba(126,34,206,0.08)] sm:gap-2 sm:px-3.5 sm:py-1.5 sm:text-xs sm:tracking-[0.18em]">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
            {tipsterMode ? "TIP CASHFLOW" : "CASHFLOW"}
          </span>

          <div className="mt-2 flex justify-start sm:mt-3">
            <SplitTitle
              text={tipsterMode ? "Provizní kalendář TIPŮ" : "Provizní kalendář"}
              wrap={false}
              className="justify-start text-left !text-[2.2rem] !leading-[0.96] !text-slate-950 sm:!text-[3.5rem]"
            />
          </div>

          <p className="mt-2 max-w-3xl text-[0.92rem] leading-6 text-slate-600 sm:mt-3 sm:text-base sm:leading-relaxed">
            {tipsterMode
              ? "Přehled sjednaných tipů a očekávaných TIP provizí napříč měsíci a roky."
              : "Predikce výplat napříč měsíci a roky v jednotném přehledu. Otevři rok, zkontroluj měsíce a jdi až na detail položky."}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:gap-4 xl:items-end">
          <div className="text-left xl:text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7e22ce] sm:text-[11px] sm:tracking-[0.16em]">
              {tipsterMode
                ? "Celkem očekávané TIP provize"
                : hasPaidMonthTotals
                ? "Celkem cashflow"
                : "Celkem očekávané cashflow"}
            </div>
            <div className="mt-1 whitespace-nowrap font-mono text-[2rem] font-semibold leading-none text-slate-950 sm:text-[2.7rem]">
              {formatMoney(totalCashflow)}
            </div>
            <p className="mt-1 text-[0.82rem] font-medium leading-5 text-slate-500 sm:text-sm">
              {showPastYears
                ? `Včetně předchozích let a výhledu na ${forecastYears} let`
                : `Na následujících ${forecastYears} let`}
              {intelligentPredictionEnabled && !tipsterMode ? " · s inteligentní predikcí" : ""}
            </p>
          </div>

          <div className="grid grid-cols-[auto_1fr_1fr] gap-2 sm:flex sm:flex-wrap xl:justify-end">
            <button
              type="button"
              onClick={onOpenHelp}
              aria-label="Otevřít nápovědu k proviznímu kalendáři"
              title="Nápověda"
              className="ui-focus inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8b4fe] bg-white text-[#581c87] shadow-[0_10px_22px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-[#a855f7] hover:bg-[#faf5ff] sm:h-11 sm:w-11"
            >
              <CircleHelp className="h-4 w-4 sm:h-4.5 sm:w-4.5" strokeWidth={2.2} aria-hidden="true" />
            </button>

            {!tipsterMode && (
              <button
                type="button"
                onClick={onOpenPredictionInfo}
                className={`ui-focus inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold shadow-[0_10px_22px_rgba(15,23,42,0.1)] transition hover:-translate-y-0.5 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${
                  intelligentPredictionEnabled
                    ? "border-[#21142f] bg-[#13091f] !text-white hover:bg-[#1d0f2c]"
                    : "border-[#d8b4fe] bg-white text-[#581c87] hover:border-[#a855f7] hover:bg-[#faf5ff]"
                }`}
              >
                <BrainCircuit className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.2} aria-hidden="true" />
                {intelligentPredictionEnabled ? "Predikce zapnutá" : "Inteligentní predikce"}
              </button>
            )}

            <button
              type="button"
              onClick={onTogglePastYears}
              className="ui-focus inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-[0_10px_22px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-900 hover:text-slate-950 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <CalendarRange className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.2} aria-hidden="true" />
              {showPastYears ? "Skrýt předchozí roky" : "Předchozí roky"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
