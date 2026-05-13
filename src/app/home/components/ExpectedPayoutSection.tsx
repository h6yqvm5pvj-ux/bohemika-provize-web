import { useEffect, useState } from "react";
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
  const [loadingProgress, setLoadingProgress] = useState(14);
  const clampedLoadingProgress = Math.max(8, Math.min(97, loadingProgress));

  useEffect(() => {
    if (!loading) {
      const resetFrame = window.requestAnimationFrame(() => setLoadingProgress(14));
      return () => window.cancelAnimationFrame(resetFrame);
    }

    const startedAt = performance.now();
    let frame = 0;

    const animate = () => {
      const elapsed = performance.now() - startedAt;
      const phase = Math.min(1, elapsed / 3200);
      const eased = 1 - Math.pow(1 - phase, 2.2);
      const target = Math.round(14 + eased * 81); // držíme max ~95 %, finále až po reálných datech
      setLoadingProgress((prev) => (target > prev ? target : prev));
      frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [loading]);

  const loadingStage =
    clampedLoadingProgress < 35
      ? "Načítám cashflow položky…"
      : clampedLoadingProgress < 72
        ? "Počítám hrubou výplatu a storno fond…"
        : "Finalizuji čistou výplatu…";

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
            <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 px-5 py-5 shadow-[0_18px_34px_rgba(2,6,23,0.34)] sm:px-6 sm:py-6">
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-300/20 blur-2xl" />
              <div className="pointer-events-none absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-cyan-300/16 blur-2xl" />

              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-100">
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-emerald-300"
                        aria-hidden="true"
                      />
                      Načítám data výplaty
                    </div>
                    <div className="mt-2 text-sm text-slate-300">{loadingStage}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.12em] text-emerald-200">
                      {clampedLoadingProgress}% připraveno
                    </div>
                  </div>

                  <div className="relative h-16 w-16 shrink-0">
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `conic-gradient(from -90deg, rgba(16,185,129,1) 0deg ${clampedLoadingProgress * 3.6}deg, rgba(148,163,184,0.25) ${clampedLoadingProgress * 3.6}deg 360deg)`,
                      }}
                    />
                    <div className="absolute inset-[5px] rounded-full bg-slate-950" />
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-emerald-200">
                      {clampedLoadingProgress}%
                    </div>
                  </div>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-300 to-cyan-200 transition-[width] duration-300 ease-out"
                    style={{ width: `${clampedLoadingProgress}%` }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/20 bg-white/8 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-white/60">Hrubá</div>
                    <div className="mt-2 h-4 w-24 animate-pulse rounded bg-white/20" />
                  </div>
                  <div className="rounded-xl border border-rose-300/40 bg-rose-300/12 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-rose-200/85">StornoFond</div>
                    <div className="mt-2 h-4 w-20 animate-pulse rounded bg-rose-200/35" style={{ animationDelay: "120ms" }} />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="h-2 w-[78%] animate-pulse rounded-full bg-white/20" />
                  <div className="h-2 w-[62%] animate-pulse rounded-full bg-white/15" style={{ animationDelay: "110ms" }} />
                  <div className="h-2 w-[70%] animate-pulse rounded-full bg-white/15" style={{ animationDelay: "220ms" }} />
                </div>
              </div>
            </div>
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
                  <div className="inline-flex min-w-0 sm:min-w-[170px] items-center justify-between gap-3 rounded-xl border border-white/22 bg-white/8 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-white/70">
                      Hrubá
                    </div>
                    <div className="text-sm font-semibold leading-none text-white sm:text-base">
                      {formatMoney(safeGross)}
                    </div>
                  </div>
                  <div className="inline-flex min-w-0 sm:min-w-[170px] items-center justify-between gap-3 rounded-xl border border-rose-300/40 bg-rose-300/12 px-3 py-2">
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
