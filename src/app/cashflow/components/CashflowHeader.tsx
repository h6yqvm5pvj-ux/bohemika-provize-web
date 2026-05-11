import SplitTitle from "../../pomucky/plan-produkce/SplitTitle";
import { formatMoney } from "../helpers";
import { CalendarRange, Sparkles } from "lucide-react";

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
    <header className="relative overflow-hidden rounded-[32px] border border-white/80 bg-[linear-gradient(140deg,rgba(255,255,255,0.95)_0%,rgba(240,249,255,0.96)_45%,rgba(238,242,255,0.94)_100%)] px-5 py-6 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.14)] sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(34,211,238,0.2),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_92%_10%,rgba(99,102,241,0.14),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.05)_1px,transparent_1px)] bg-[length:32px_32px] opacity-35" />

      <div className="relative z-10 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">
            <Sparkles className="h-3.5 w-3.5" />
            Cashflow Premium
          </span>
          <button
            type="button"
            onClick={onTogglePastYears}
            className="ui-focus inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:text-slate-900"
          >
            <CalendarRange className="h-4 w-4" />
            {showPastYears ? "Skrýt předchozí roky" : "Zobrazit předchozí roky"}
          </button>
        </div>

        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <SplitTitle
              text="Provizní kalendář"
              wrap={false}
              className="!text-4xl !text-slate-900 sm:!text-5xl"
            />
            <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
              Predikce výplat napříč měsíci a roky v jednotném přehledu. Otevři rok, zkontroluj měsíce a jdi až na detail položky.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-2.5 sm:max-w-[280px]">
            <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Celkem cashflow
              </div>
              <div className="mt-1 whitespace-nowrap text-[1.8rem] font-semibold leading-none text-emerald-600 sm:text-[2rem] font-mono">
                {formatMoney(totalCashflow)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
