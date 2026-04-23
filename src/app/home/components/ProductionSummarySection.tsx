import { BarChart3, Tag, UserRound, UsersRound } from "lucide-react";
import { AnimatedMoney, AnimatedNumber } from "./AnimatedNumbers";

type Props = {
  loading: boolean;
  showTeamBox: boolean;
  myContractsCount: number;
  myImmediateSum: number;
  myTipContractsCount: number;
  myTipImmediateSum: number;
  teamContractsCount: number;
  teamImmediateSum: number;
  totalContractsCount: number;
  totalWithTeam: number;
  isLiteUI: boolean;
};

export function ProductionSummarySection({
  loading,
  showTeamBox,
  myContractsCount,
  myImmediateSum,
  myTipContractsCount,
  myTipImmediateSum,
  teamContractsCount,
  teamImmediateSum,
  totalContractsCount,
  totalWithTeam,
  isLiteUI,
}: Props) {
  const summaryCardClass = isLiteUI
    ? "relative h-full overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 px-5 py-8 text-white transition-[border-color,box-shadow] duration-200 hover:border-slate-600 focus-within:border-slate-600 focus-within:shadow-[0_0_0_1px_rgba(148,163,184,0.22)] sm:px-8 sm:py-10"
    : "relative h-full overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 px-5 py-8 text-white shadow-[0_18px_34px_rgba(2,6,23,0.34)] transition-[border-color,box-shadow] duration-200 hover:border-slate-600 hover:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.18)] focus-within:border-slate-600 focus-within:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.2)] sm:px-8 sm:py-10";
  const compactSummaryCardClass = isLiteUI
    ? "relative h-full overflow-hidden rounded-[24px] border border-slate-800 bg-slate-950 px-4 py-4 text-white transition-[border-color,box-shadow] duration-200 hover:border-slate-600 focus-within:border-slate-600 focus-within:shadow-[0_0_0_1px_rgba(148,163,184,0.22)] sm:px-6 sm:py-5"
    : "relative h-full overflow-hidden rounded-[24px] border border-slate-800 bg-slate-950 px-4 py-4 text-white shadow-[0_18px_34px_rgba(2,6,23,0.34)] transition-[border-color,box-shadow] duration-200 hover:border-slate-600 hover:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.18)] focus-within:border-slate-600 focus-within:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.2)] sm:px-6 sm:py-5";

  if (!showTeamBox) {
    const hasTipIncome = myTipImmediateSum > 0;
    return (
      <section className={compactSummaryCardClass}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(16,185,129,0.12),transparent_46%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_100%,rgba(34,211,238,0.12),transparent_40%)]" />

        <div
          className={`relative z-10 ${
            hasTipIncome
              ? "grid min-h-[190px] items-stretch gap-4 md:grid-cols-2 md:gap-6 md:divide-x md:divide-slate-700"
              : "flex min-h-[170px] flex-col items-center justify-center gap-4 text-center sm:min-h-[190px]"
          }`}
        >
          <div className="grid min-h-[170px] content-center justify-items-center gap-y-4 px-3 text-center sm:min-h-[190px] md:px-6">
            <h2 className="flex min-h-[64px] items-center text-3xl font-semibold text-white sm:min-h-[74px] sm:text-4xl">
              <span className="inline-flex items-center gap-2.5">
                <UserRound
                  className="h-8 w-8 text-sky-300"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <span className="md:whitespace-nowrap">Vlastní produkce</span>
              </span>
            </h2>
            {loading ? (
              <p className="text-base text-slate-300">Načítám…</p>
            ) : (
              <>
                <dl className="space-y-1.5">
                  <dt className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Počet smluv
                  </dt>
                  <dd className="text-5xl font-semibold text-sky-200 sm:text-6xl">
                    <AnimatedNumber value={myContractsCount} />
                  </dd>
                </dl>
                <dl className="space-y-1.5">
                  <dt className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Provize
                  </dt>
                  <dd className="whitespace-nowrap text-4xl font-semibold text-sky-200 sm:text-5xl">
                    <AnimatedMoney value={myImmediateSum} />
                  </dd>
                </dl>
              </>
            )}
          </div>

          {hasTipIncome && (
            <div className="grid min-h-[170px] content-center justify-items-center gap-y-4 px-3 text-center sm:min-h-[190px] md:px-6">
              <h2 className="flex min-h-[64px] items-center text-3xl font-semibold text-white sm:min-h-[74px] sm:text-4xl">
                <span className="inline-flex items-center gap-2.5">
                  <Tag
                    className="h-8 w-8 text-fuchsia-300"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span className="md:whitespace-nowrap">Tipař</span>
                </span>
              </h2>
              {loading ? (
                <p className="text-base text-slate-300">Načítám…</p>
              ) : (
                <>
                <dl className="space-y-1.5">
                  <dt className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Počet tipů
                  </dt>
                  <dd className="text-5xl font-semibold text-fuchsia-200 sm:text-6xl">
                    <AnimatedNumber value={myTipContractsCount} />
                  </dd>
                </dl>
                <dl className="space-y-1.5">
                  <dt className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Provize
                  </dt>
                  <dd className="whitespace-nowrap text-4xl font-semibold text-fuchsia-200 sm:text-5xl">
                    <AnimatedMoney value={myTipImmediateSum} />
                  </dd>
                </dl>
              </>
            )}
            </div>
          )}
        </div>
      </section>
    );
  }

  const hasManagerTipIncome = myTipImmediateSum > 0;
  const managerTitleClass = hasManagerTipIncome
    ? "text-xl font-semibold text-white sm:text-2xl"
    : "text-2xl font-semibold text-white sm:text-3xl";
  const managerCountClass = hasManagerTipIncome
    ? "mt-2 text-3xl font-semibold sm:text-4xl"
    : "mt-2 text-4xl font-semibold sm:text-5xl";
  const managerAmountClass = hasManagerTipIncome
    ? "mt-2 whitespace-nowrap text-[clamp(1.95rem,2vw,2.5rem)] font-semibold"
    : "mt-2 whitespace-nowrap text-4xl font-semibold sm:text-5xl";

  return (
    <section className={summaryCardClass}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(16,185,129,0.12),transparent_46%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_100%,rgba(34,211,238,0.12),transparent_40%)]" />

      <div
        className={`relative z-10 grid h-full items-stretch gap-6 md:gap-8 md:divide-x md:divide-slate-700 ${
          hasManagerTipIncome ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"
        }`}
      >
        <div className="flex min-h-[220px] h-full flex-col justify-center space-y-6 text-center md:px-6">
          <div className="space-y-3">
              <div className="mx-auto flex h-6 w-6 items-center justify-center">
                <UserRound className="h-6 w-6 text-sky-300" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <h2 className={managerTitleClass}>
                <span className="block">Vlastní</span>
                <span className="block">produkce</span>
              </h2>
            </div>
          {loading ? (
            <p className="text-base text-slate-300">Načítám…</p>
          ) : (
            <dl className="space-y-6">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Počet smluv
                </dt>
                <dd className={`${managerCountClass} text-sky-200`}>
                  <AnimatedNumber value={myContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Provize
                </dt>
                <dd className={`${managerAmountClass} text-sky-200`}>
                  <AnimatedMoney value={myImmediateSum} />
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div className="flex min-h-[220px] h-full flex-col justify-center space-y-6 text-center md:px-6">
          <div className="space-y-3">
              <div className="mx-auto flex h-6 w-6 items-center justify-center">
                <UsersRound className="h-6 w-6 text-amber-300" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <h2 className={managerTitleClass}>
                <span className="block">Týmová</span>
                <span className="block">produkce</span>
              </h2>
            </div>
          {loading ? (
            <p className="text-base text-slate-300">Načítám…</p>
          ) : (
            <dl className="space-y-6">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Počet smluv
                </dt>
                <dd className={`${managerCountClass} text-amber-200`}>
                  <AnimatedNumber value={teamContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Provize
                </dt>
                <dd className={`${managerAmountClass} text-amber-200`}>
                  <AnimatedMoney value={teamImmediateSum} />
                </dd>
              </div>
            </dl>
          )}
        </div>

        {hasManagerTipIncome && (
          <div className="flex min-h-[220px] h-full flex-col justify-center space-y-6 text-center md:px-6">
            <div className="space-y-3">
              <div className="mx-auto flex h-6 w-6 items-center justify-center">
                <Tag className="h-6 w-6 text-fuchsia-300" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <h2 className={managerTitleClass}>
                <span className="block">Tipařská</span>
                <span className="block">produkce</span>
              </h2>
            </div>
            {loading ? (
              <p className="text-base text-slate-300">Načítám…</p>
            ) : (
              <dl className="space-y-6">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Počet tipů
                  </dt>
                  <dd className={`${managerCountClass} text-fuchsia-200`}>
                    <AnimatedNumber value={myTipContractsCount} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Provize
                  </dt>
                  <dd className={`${managerAmountClass} text-fuchsia-200`}>
                    <AnimatedMoney value={myTipImmediateSum} />
                  </dd>
                </div>
              </dl>
            )}
          </div>
        )}

        <div className="flex min-h-[220px] h-full flex-col justify-center space-y-6 text-center md:px-6">
          <div className="space-y-3">
              <div className="mx-auto flex h-6 w-6 items-center justify-center">
                <BarChart3 className="h-6 w-6 text-emerald-300" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <h2 className={managerTitleClass}>
                <span className="block">Celková</span>
                <span className="block">produkce</span>
              </h2>
            </div>
          {loading ? (
            <p className="text-base text-slate-300">Načítám…</p>
          ) : (
            <dl className="space-y-6">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Počet smluv
                </dt>
                <dd className={`${managerCountClass} text-emerald-400`}>
                  <AnimatedNumber value={totalContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Provize
                </dt>
                <dd className={`${managerAmountClass} text-emerald-400`}>
                  <AnimatedMoney value={totalWithTeam} />
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </section>
  );
}
