import { AnimatedMoney, AnimatedNumber } from "./AnimatedNumbers";

type Props = {
  loading: boolean;
  showTeamBox: boolean;
  myContractsCount: number;
  myImmediateSum: number;
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
  teamContractsCount,
  teamImmediateSum,
  totalContractsCount,
  totalWithTeam,
  isLiteUI,
}: Props) {
  const summaryCardClass = isLiteUI
    ? "h-full rounded-[28px] border border-slate-900 bg-white px-5 py-8 sm:px-8 sm:py-10"
    : "h-full rounded-[28px] border border-slate-900 bg-white px-5 py-8 shadow-[0_12px_28px_rgba(15,23,42,0.1)] sm:px-8 sm:py-10";

  return (
    <section className={summaryCardClass}>
      <div
        className={`grid h-full items-stretch gap-6 md:gap-8 ${
          showTeamBox ? "md:grid-cols-3" : "md:grid-cols-2"
        }`}
      >
        <div className="flex min-h-[220px] h-full flex-col justify-center space-y-6 text-center">
          <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
            Vlastní produkce
          </h2>
          {loading ? (
            <p className="text-base text-slate-600">Načítám…</p>
          ) : (
            <dl className="space-y-6">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Počet smluv
                </dt>
                <dd className="mt-2 text-4xl font-semibold text-slate-900 sm:text-5xl">
                  <AnimatedNumber value={myContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Provize
                </dt>
                <dd className="mt-2 text-4xl font-semibold text-slate-900 sm:text-5xl">
                  <AnimatedMoney value={myImmediateSum} />
                </dd>
              </div>
            </dl>
          )}
        </div>

        {showTeamBox && (
          <div className="relative flex min-h-[220px] h-full flex-col justify-center space-y-6 text-center md:ml-2 md:pl-6 before:hidden md:before:absolute md:before:left-0 md:before:top-0 md:before:block md:before:h-full md:before:w-px md:before:bg-slate-300">
            <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
              Týmová produkce
            </h2>
            {loading ? (
              <p className="text-base text-slate-600">Načítám…</p>
            ) : (
              <dl className="space-y-6">
                <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                    Počet smluv
                  </dt>
                  <dd className="mt-2 text-4xl font-semibold text-slate-900 sm:text-5xl">
                    <AnimatedNumber value={teamContractsCount} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    Provize
                  </dt>
                  <dd className="mt-2 text-4xl font-semibold text-slate-900 sm:text-5xl">
                    <AnimatedMoney value={teamImmediateSum} />
                  </dd>
                </div>
              </dl>
            )}
          </div>
        )}

        <div className="relative flex min-h-[220px] h-full flex-col justify-center space-y-6 text-center md:ml-2 md:pl-6 before:hidden md:before:absolute md:before:left-0 md:before:top-0 md:before:block md:before:h-full md:before:w-px md:before:bg-slate-300">
          <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
            Celková produkce
          </h2>
          {loading ? (
            <p className="text-base text-slate-600">Načítám…</p>
          ) : (
            <dl className="space-y-6">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Počet smluv
                </dt>
                <dd className="mt-2 text-4xl font-semibold text-slate-900 sm:text-5xl">
                  <AnimatedNumber value={totalContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Provize
                </dt>
                <dd className="mt-2 text-4xl font-semibold text-slate-900 sm:text-5xl">
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
