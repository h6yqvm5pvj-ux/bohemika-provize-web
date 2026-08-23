import { useEffect, useState } from "react";
import Image from "next/image";
import { WalletCards } from "lucide-react";

import { type AppLanguage } from "@/lib/appLanguage";
import { formatMoney } from "../homeUtils";
import { LoadingProgressPanel } from "./LoadingProgressPanel";

type Props = {
  language: AppLanguage;
  loading: boolean;
  grossAmount: number;
  stornoFundAmount: number;
  netAmount: number;
  periodLabel: string;
  isLiteUI: boolean;
};

const EXPECTED_PAYOUT_COPY: Record<
  AppLanguage,
  {
    currentMonth: string;
    title: string;
    loadingTitle: string;
    loadingAccent: string;
    loadingStages: [string, string, string];
    netPayout: string;
    gross: string;
    stornoFund: string;
  }
> = {
  cs: {
    currentMonth: "aktuální měsíc",
    title: "Očekávaná výplata",
    loadingTitle: "Načítám data výplaty",
    loadingAccent: "Výplata",
    loadingStages: [
      "Načítám cashflow položky…",
      "Počítám hrubou výplatu a storno fond…",
      "Finalizuji čistou výplatu…",
    ],
    netPayout: "Čistá výplata",
    gross: "Hrubá",
    stornoFund: "StornoFond",
  },
};

export function ExpectedPayoutSection({
  language,
  loading,
  grossAmount,
  stornoFundAmount,
  netAmount,
  periodLabel,
  isLiteUI,
}: Props) {
  const copy = EXPECTED_PAYOUT_COPY[language];
  const safeGross = Number.isFinite(grossAmount) ? Math.max(0, grossAmount) : 0;
  const safeStorno = Number.isFinite(stornoFundAmount) ? Math.max(0, stornoFundAmount) : 0;
  const payoutPeriodLabel =
    typeof periodLabel === "string" && periodLabel.trim().length > 0
      ? periodLabel.trim()
      : copy.currentMonth;

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
      ? copy.loadingStages[0]
      : clampedLoadingProgress < 72
        ? copy.loadingStages[1]
        : copy.loadingStages[2];

  return (
    <section className={cardClass} data-fixed-box-theme="slate">
      <Image
        src="/images/money-wallet.png"
        alt=""
        width={1268}
        height={1241}
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-12 -right-10 z-0 w-[180px] select-none object-contain opacity-[0.24] saturate-75 sm:-bottom-14 sm:-right-8 sm:w-[235px]"
      />

      {loading ? (
        <div className="relative z-10 flex h-full flex-col gap-4">
          <div className="flex items-start gap-3">
            <h2 className="flex max-w-full items-center gap-3 text-2xl font-extrabold leading-tight tracking-[-0.02em] text-violet-50 sm:text-3xl">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-100/48 bg-violet-300/18">
                <WalletCards className="h-4.5 w-4.5 text-emerald-200" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="min-w-0">{copy.title}</span>
            </h2>
          </div>

          <LoadingProgressPanel
            title={copy.loadingTitle}
            stage={loadingStage}
            progress={clampedLoadingProgress}
            accentLabel={copy.loadingAccent}
            visual="money"
          />
        </div>
      ) : (
        <div className="relative z-10 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_180px] 2xl:items-start 2xl:gap-5">
          <div className="min-w-0">
            <h2 className="flex max-w-full items-center gap-3 text-2xl font-extrabold leading-tight tracking-[-0.02em] text-violet-50 sm:text-3xl">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-100/48 bg-violet-300/18">
                <WalletCards className="h-4.5 w-4.5 text-emerald-200" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="min-w-0">{copy.title}</span>
            </h2>

            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/75">
              {copy.netPayout} ({payoutPeriodLabel})
            </p>
            <p className="mt-1 whitespace-nowrap text-[2.4rem] font-black leading-[0.96] tracking-[-0.03em] text-emerald-200 sm:text-[2.95rem]">
              {formatMoney(netAmount)}
            </p>
          </div>

          <aside className="flex min-w-0 flex-col 2xl:justify-self-end">
            <dl className="space-y-1.5 2xl:mt-14">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/72">{copy.gross}</dt>
                <dd className="text-sm font-semibold text-violet-50 sm:text-base">{formatMoney(safeGross)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/72">{copy.stornoFund}</dt>
                <dd className="text-sm font-semibold text-rose-200 sm:text-base">- {formatMoney(safeStorno)}</dd>
              </div>
            </dl>
          </aside>
        </div>
      )}
    </section>
  );
}
