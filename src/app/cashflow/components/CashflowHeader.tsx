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

        <div className="relative w-full overflow-hidden rounded-[26px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.07)] sm:w-auto sm:min-w-[340px]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_18%,rgba(16,185,129,0.1),transparent_44%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_96%,rgba(15,23,42,0.08),transparent_38%)]" />

          <div className="relative ui-kicker text-slate-600">
            Celkové očekávané cashflow
          </div>
          <div className="relative mt-1">
            <div className="ui-money-positive whitespace-nowrap text-3xl sm:text-4xl font-semibold leading-none">
              {formatMoney(totalCashflow)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onTogglePastYears}
          className="ui-btn-primary ui-focus rounded-full px-4 py-2 text-sm"
        >
          {showPastYears ? "Skrýt předchozí roky" : "Zobrazit předchozí roky"}
        </button>
      </div>
    </header>
  );
}
