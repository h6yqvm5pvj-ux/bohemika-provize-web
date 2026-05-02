import Link from "next/link";
import { ArrowRight, WalletCards } from "lucide-react";

import { formatMoney } from "../homeUtils";

type Props = {
  loading: boolean;
  grossAmount: number;
  stornoFundAmount: number;
  netAmount: number;
  periodLabel: string;
  isLiteUI: boolean;
};

export function ExpectedPayoutSection({
  loading,
  grossAmount,
  stornoFundAmount,
  netAmount,
  periodLabel,
  isLiteUI,
}: Props) {
  const safeGross = Number.isFinite(grossAmount) ? Math.max(0, grossAmount) : 0;
  const safeStorno = Number.isFinite(stornoFundAmount) ? Math.max(0, stornoFundAmount) : 0;
  const payoutPeriodLabel =
    typeof periodLabel === "string" && periodLabel.trim().length > 0
      ? periodLabel.trim()
      : "aktuální měsíc";

  const cardClass = isLiteUI
    ? "relative min-w-0 h-full overflow-hidden rounded-[26px] border border-slate-200 bg-white px-5 py-5 sm:px-8 sm:py-7"
    : "relative min-w-0 h-full overflow-hidden rounded-[26px] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.07)] sm:px-8 sm:py-7";

  return (
    <section className={cardClass} data-fixed-box-theme="slate">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(16,185,129,0.12),transparent_46%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_100%,rgba(15,23,42,0.08),transparent_40%)]" />

      <div className="relative flex h-full flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="inline-flex items-center gap-2 text-2xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-3xl">
              <WalletCards className="h-6 w-6 text-slate-700" strokeWidth={1.9} aria-hidden="true" />
              <span>Očekávaná výplata</span>
            </h2>
          </div>
          <Link
            href="/cashflow"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-black"
          >
            Detail
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>

        {loading ? (
          <>
            <div className="inline-flex items-center gap-2 text-sm text-slate-600">
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
                aria-hidden="true"
              />
              <span>Načítám data výplaty…</span>
            </div>
            <div className="h-32 animate-pulse rounded-3xl border border-slate-700 bg-slate-900/90 sm:h-36" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="h-12 animate-pulse rounded-xl border border-white/20 bg-white/10" />
              <div className="h-12 animate-pulse rounded-xl border border-rose-200/35 bg-rose-300/10" />
            </div>
            <div className="h-2 animate-pulse rounded-full bg-slate-200/80" />
          </>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 px-5 py-5 shadow-[0_18px_34px_rgba(2,6,23,0.34)] sm:px-6 sm:py-6">
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-300/20 blur-2xl" />
              <div className="pointer-events-none absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-cyan-300/16 blur-2xl" />

              <div className="relative">
                <div className="text-xs text-emerald-200/90">Čistá výplata ({payoutPeriodLabel})</div>
                <div className="mt-2 text-[2.25rem] font-semibold leading-[0.98] tracking-tight text-emerald-200 sm:text-[2.9rem]">
                  {formatMoney(netAmount)}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="inline-flex min-w-[170px] items-center justify-between gap-3 rounded-xl border border-white/22 bg-white/8 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-white/70">
                      Hrubá
                    </div>
                    <div className="text-sm font-semibold leading-none text-white sm:text-base">
                      {formatMoney(safeGross)}
                    </div>
                  </div>
                  <div className="inline-flex min-w-[170px] items-center justify-between gap-3 rounded-xl border border-rose-300/40 bg-rose-300/12 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-rose-200">
                      StornoFond
                    </div>
                    <div className="text-sm font-semibold leading-none text-rose-200 sm:text-base">
                      - {formatMoney(safeStorno)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
