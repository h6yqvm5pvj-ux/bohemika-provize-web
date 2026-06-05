import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, WalletCards } from "lucide-react";

import { formatMoney } from "../homeUtils";
import { LoadingProgressPanel } from "./LoadingProgressPanel";

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
    ? "relative min-w-0 h-full overflow-hidden rounded-[30px] border border-violet-300/35 bg-[radial-gradient(circle_at_14%_0%,rgba(168,85,247,0.26),transparent_42%),linear-gradient(165deg,#261048_0%,#160934_58%,#0d0521_100%)] px-5 py-5 text-white transition-[border-color,box-shadow] duration-200 hover:border-violet-200/60 focus-within:border-violet-200/60 focus-within:shadow-[0_0_0_1px_rgba(221,214,254,0.3)] sm:px-7 sm:py-6"
    : "relative min-w-0 h-full overflow-hidden rounded-[30px] border border-violet-300/35 bg-[radial-gradient(circle_at_14%_0%,rgba(168,85,247,0.26),transparent_42%),linear-gradient(165deg,#261048_0%,#160934_58%,#0d0521_100%)] px-5 py-5 text-white shadow-[0_20px_44px_rgba(11,3,33,0.5)] transition-[border-color,box-shadow] duration-200 hover:border-violet-200/60 hover:shadow-[0_26px_54px_rgba(11,3,33,0.56),0_0_0_1px_rgba(221,214,254,0.24)] focus-within:border-violet-200/60 focus-within:shadow-[0_26px_54px_rgba(11,3,33,0.56),0_0_0_1px_rgba(221,214,254,0.3)] sm:px-7 sm:py-6";
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
      const target = Math.round(14 + eased * 81);
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
      {loading ? (
        <div className="relative z-10 flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="inline-flex items-center gap-3 text-2xl font-extrabold leading-tight tracking-[-0.02em] text-violet-50 sm:whitespace-nowrap sm:text-3xl">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-100/48 bg-violet-300/18">
                <WalletCards className="h-4.5 w-4.5 text-emerald-200" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span>Očekávaná výplata</span>
            </h2>
            <Link
              href="/cashflow"
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-100/45 bg-violet-300/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-violet-50 transition hover:border-violet-100/70 hover:bg-violet-300/30"
            >
              Detail
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>

          <LoadingProgressPanel
            title="Načítám data výplaty"
            stage={loadingStage}
            progress={clampedLoadingProgress}
            accentLabel="Výplata"
          />
        </div>
      ) : (
        <div className="relative z-10 grid gap-4 md:grid-cols-[minmax(0,1fr)_230px] md:items-start md:gap-5">
          <div className="min-w-0">
            <h2 className="inline-flex items-center gap-3 text-2xl font-extrabold leading-tight tracking-[-0.02em] text-violet-50 sm:whitespace-nowrap sm:text-3xl">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-100/48 bg-violet-300/18">
                <WalletCards className="h-4.5 w-4.5 text-emerald-200" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span>Očekávaná výplata</span>
            </h2>

            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/75">
              Čistá výplata ({payoutPeriodLabel})
            </p>
            <p className="mt-1 whitespace-nowrap text-[2.4rem] font-black leading-[0.96] tracking-[-0.03em] text-emerald-200 sm:text-[2.95rem]">
              {formatMoney(netAmount)}
            </p>
          </div>

          <aside className="min-w-0 flex flex-col md:justify-self-end">
            <Link
              href="/cashflow"
              className="inline-flex w-fit self-start items-center gap-1.5 rounded-full border border-violet-100/45 bg-violet-300/20 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-50 transition hover:border-violet-100/70 hover:bg-violet-300/30 md:self-end"
            >
              Detail
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </Link>

            <dl className="mt-6 space-y-1.5 md:mt-14">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/72">Hrubá</dt>
                <dd className="text-sm font-semibold text-violet-50 sm:text-base">{formatMoney(safeGross)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/72">StornoFond</dt>
                <dd className="text-sm font-semibold text-rose-200 sm:text-base">- {formatMoney(safeStorno)}</dd>
              </div>
            </dl>
          </aside>
        </div>
      )}
    </section>
  );
}
