import SplitTitle from "../../pomucky/plan-produkce/SplitTitle";
import { formatMoney } from "../helpers";
import { Coins, CalendarRange, Sparkles } from "lucide-react";

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

          <div className="w-full xl:w-auto xl:pl-4">
            <div className="relative isolate inline-flex w-fit max-w-full flex-col overflow-hidden rounded-[22px] border border-[#6b34a0] bg-[#140b23] px-4 py-3 shadow-[0_18px_34px_rgba(20,8,34,0.42)] ring-1 ring-[#8a4bc6]/35 sm:px-5">
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(73,32,111,0.62)_0%,rgba(31,18,49,0.78)_42%,rgba(18,12,27,0.98)_100%)]" />
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(190,92,255,0.15)_0%,rgba(190,92,255,0)_36%,rgba(164,82,244,0.13)_100%)]" />
              <span className="pointer-events-none absolute -top-24 left-16 h-72 w-px rotate-[34deg] bg-[#9d61ca]/14" />
              <span className="pointer-events-none absolute inset-x-4 top-0 h-[2px] rounded-full bg-[linear-gradient(90deg,#cb85ff_0%,#aa57f5_45%,#8f44e8_100%)] opacity-90" />

              <div className="relative z-[1]">
                <Coins
                  className="pointer-events-none absolute right-0 top-0 h-[30px] w-[30px] text-[#d9bdf4]"
                  strokeWidth={2.1}
                />
                <div className="max-w-[18ch] pr-10 text-[11px] font-semibold uppercase leading-[1.22] tracking-[0.14em] text-[#c8aee4]">
                  Celkem očekávané cashflow
                </div>
                <div className="mt-1.5 w-fit max-w-full whitespace-nowrap font-mono text-[1.75rem] font-semibold leading-none text-[#fbf7ff] sm:text-[1.95rem]">
                  {formatMoney(totalCashflow)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
