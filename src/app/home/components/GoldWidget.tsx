import Image from "next/image";
import { Coins, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { type AppLanguage } from "@/lib/appLanguage";
import { formatMoney } from "../homeUtils";

type Props = {
  language: AppLanguage;
  isLiteUI: boolean;
  goldLoading: boolean;
  goldData: { czkPerOz: number; ts: number; changePct: number | null } | null;
  goldChangePct: number | null;
  goldChangeAbs: number | null;
  goldDir: "up" | "down" | "flat";
  goldError: string | null;
};

const GOLD_WIDGET_COPY: Record<
  AppLanguage,
  {
    currentPrice: string;
    loading: string;
    dailyMove: string;
    noChange: string;
  }
> = {
  cs: {
    currentPrice: "Aktuální cena zlata / 1 oz",
    loading: "Načítám…",
    dailyMove: "Denní pohyb",
    noChange: "Bez změny",
  },
};

export function GoldWidget({
  language,
  isLiteUI,
  goldLoading,
  goldData,
  goldChangePct,
  goldChangeAbs,
  goldDir,
  goldError,
}: Props) {
  const copy = GOLD_WIDGET_COPY[language];
  const goldCardClass = isLiteUI
    ? "relative min-w-0 h-full overflow-hidden rounded-[30px] border border-amber-300/35 bg-[radial-gradient(circle_at_14%_0%,rgba(245,158,11,0.24),transparent_42%),linear-gradient(165deg,#271347_0%,#160934_58%,#0d0521_100%)] px-5 py-5 text-white transition-[border-color,box-shadow] duration-200 hover:border-amber-200/60 focus-within:border-amber-200/60 focus-within:shadow-[0_0_0_1px_rgba(253,230,138,0.25)] sm:px-7 sm:py-6"
    : "relative min-w-0 h-full overflow-hidden rounded-[30px] border border-amber-300/35 bg-[radial-gradient(circle_at_14%_0%,rgba(245,158,11,0.24),transparent_42%),linear-gradient(165deg,#271347_0%,#160934_58%,#0d0521_100%)] px-5 py-5 text-white shadow-[0_20px_44px_rgba(11,3,33,0.5)] transition-[border-color,box-shadow] duration-200 hover:border-amber-200/60 hover:shadow-[0_26px_54px_rgba(11,3,33,0.56),0_0_0_1px_rgba(253,230,138,0.2)] focus-within:border-amber-200/60 focus-within:shadow-[0_26px_54px_rgba(11,3,33,0.56),0_0_0_1px_rgba(253,230,138,0.25)] sm:px-7 sm:py-6";

  const trendClass =
    goldDir === "up"
      ? "text-emerald-300"
      : goldDir === "down"
        ? "text-rose-300"
        : "text-slate-300";

  const trendAbsClass =
    goldDir === "up"
      ? "text-emerald-200"
      : goldDir === "down"
        ? "text-rose-200"
        : "text-slate-300";

  const TrendIcon =
    goldDir === "up" ? TrendingUp : goldDir === "down" ? TrendingDown : Minus;

  return (
    <section className={goldCardClass} data-fixed-box-theme="slate">
      <Image
        src="/images/investicni-zlato-pamp.png"
        alt=""
        width={1536}
        height={1024}
        aria-hidden="true"
        priority
        className="pointer-events-none absolute -bottom-12 -right-16 z-0 w-[250px] select-none object-contain opacity-[0.2] saturate-75 [mask-image:linear-gradient(to_right,transparent_0%,black_38%,black_100%)] sm:-bottom-20 sm:-right-12 sm:w-[335px]"
      />

      <div className="relative z-10 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_180px] 2xl:items-start 2xl:gap-5">
        <div className="min-w-0">
          <h2 className="flex max-w-full items-center gap-3 text-2xl font-extrabold leading-tight tracking-[-0.02em] text-amber-50 sm:text-3xl">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-100/45 bg-amber-300/15">
              <Coins className="h-4.5 w-4.5 text-amber-200" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className="min-w-0">{copy.currentPrice}</span>
          </h2>

          <p className="mt-4 whitespace-nowrap text-[2.4rem] font-black leading-[0.96] tracking-[-0.03em] text-amber-200 sm:text-[2.95rem]">
            {goldLoading && !goldData ? copy.loading : goldData ? formatMoney(goldData.czkPerOz) : "—"}
          </p>

          {goldError ? <p className="mt-2 text-xs font-semibold text-rose-200">{goldError}</p> : null}
        </div>

        <aside className="min-w-0 2xl:justify-self-end">
          <div className={`flex min-w-0 items-center gap-2 2xl:mt-14 ${trendClass}`}>
            <TrendIcon className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100/60">{copy.dailyMove}</p>
              <p className="flex flex-wrap items-baseline gap-x-2 font-black">
                <span className="text-base sm:text-lg">
                  {goldChangePct == null
                    ? copy.noChange
                    : `${goldChangePct > 0 ? "+" : ""}${goldChangePct.toFixed(2)} %`}
                </span>
                {goldChangeAbs != null ? (
                  <span className={`text-xs sm:text-sm ${trendAbsClass}`}>
                    {goldChangeAbs > 0 ? "+" : goldChangeAbs < 0 ? "−" : ""}
                    {formatMoney(Math.abs(goldChangeAbs))}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
