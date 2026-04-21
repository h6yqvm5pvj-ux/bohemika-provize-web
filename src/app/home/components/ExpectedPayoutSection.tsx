import Link from "next/link";

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
  const cardClass = isLiteUI
    ? "relative min-w-0 h-full overflow-hidden rounded-[26px] border border-slate-200 bg-white px-5 py-5 sm:px-8 sm:py-7"
    : "relative min-w-0 h-full overflow-hidden rounded-[26px] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.07)] sm:px-8 sm:py-7";

  return (
    <section className={cardClass}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_12%,rgba(15,23,42,0.05),transparent_42%)]" />

      <div className="relative flex h-full flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
              Cashflow kalendář
            </p>
            <h2 className="mt-1 text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-4xl">
              Očekávaná výplata tento měsíc
            </h2>
            <p className="mt-2 text-sm text-slate-500">{periodLabel}</p>
          </div>
          <Link
            href="/cashflow"
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
          >
            Detail
          </Link>
        </div>

        {loading ? (
          <>
            <div className="h-32 animate-pulse rounded-3xl border border-emerald-100 bg-emerald-50/60 sm:h-36" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
              <div className="h-24 animate-pulse rounded-2xl border border-rose-100 bg-rose-50/70" />
            </div>
          </>
        ) : (
          <>
            <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-100/70 px-5 py-4 sm:px-6 sm:py-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700">Čistá výplata</div>
              <div className="mt-2 text-[2.25rem] font-semibold leading-[0.98] tracking-tight text-emerald-700 sm:text-[2.85rem]">
                {formatMoney(netAmount)}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Hrubá</div>
                <div className="mt-1.5 text-[1.85rem] font-semibold leading-[1.02] tracking-tight text-slate-900 sm:text-[2.15rem]">
                  {formatMoney(grossAmount)}
                </div>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50/60 px-4 py-3.5">
                <div className="text-[10px] uppercase tracking-[0.16em] text-rose-700">Storno fond</div>
                <div className="mt-1.5 text-[1.85rem] font-semibold leading-[1.02] tracking-tight text-rose-700 sm:text-[2.15rem]">
                  - {formatMoney(stornoFundAmount)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
