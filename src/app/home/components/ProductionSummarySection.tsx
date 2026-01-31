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
    ? "rounded-3xl border border-white/12 bg-slate-900 px-5 py-7 sm:px-8 sm:py-9"
    : "rounded-3xl border border-white/12 bg-slate-900/75 backdrop-blur-2xl px-5 py-7 sm:px-8 sm:py-9 shadow-[0_24px_80px_rgba(0,0,0,0.85)]";

  return (
    <section className={summaryCardClass}>
      <div
        className={`grid gap-6 md:gap-8 ${
          showTeamBox ? "md:grid-cols-3" : "md:grid-cols-2"
        }`}
      >
        <div className="space-y-4">
          <h2 className="text-base sm:text-lg font-semibold text-slate-50">
            Vlastní produkce
          </h2>
          {loading ? (
            <p className="text-xs sm:text-sm text-slate-300">Načítám…</p>
          ) : (
            <dl className="space-y-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  Počet smluv
                </dt>
                <dd className="text-3xl sm:text-4xl font-semibold text-slate-50 mt-1">
                  <AnimatedNumber value={myContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  Provize
                </dt>
                <dd className="text-3xl sm:text-4xl font-semibold text-slate-50 mt-1">
                  <AnimatedMoney value={myImmediateSum} />
                </dd>
              </div>
            </dl>
          )}
        </div>

        {showTeamBox && (
          <div className="relative space-y-4 md:pl-6 md:ml-2 before:hidden md:before:block md:before:absolute md:before:left-0 md:before:top-0 md:before:h-full md:before:w-px md:before:bg-gradient-to-b md:before:from-white/0 md:before:via-white/20 md:before:to-white/0">
            <h2 className="text-base sm:text-lg font-semibold text-emerald-200">
              Týmová produkce
            </h2>
            {loading ? (
              <p className="text-xs sm:text-sm text-emerald-100/80">Načítám…</p>
            ) : (
              <dl className="space-y-4">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-emerald-300/80">
                    Počet smluv
                  </dt>
                  <dd className="text-3xl sm:text-4xl font-semibold text-emerald-100 mt-1">
                    <AnimatedNumber value={teamContractsCount} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-emerald-300/80">
                    Provize
                  </dt>
                  <dd className="text-3xl sm:text-4xl font-semibold text-emerald-100 mt-1">
                    <AnimatedMoney value={teamImmediateSum} />
                  </dd>
                </div>
              </dl>
            )}
          </div>
        )}

        <div className="relative space-y-4 md:pl-6 md:ml-2 before:hidden md:before:block md:before:absolute md:before:left-0 md:before:top-0 md:before:h-full md:before:w-px md:before:bg-gradient-to-b md:before:from-white/0 md:before:via-white/20 md:before:to-white/0">
          <h2 className="text-base sm:text-lg font-semibold text-cyan-100">
            Celková produkce
          </h2>
          {loading ? (
            <p className="text-xs sm:text-sm text-cyan-100/80">Načítám…</p>
          ) : (
            <dl className="space-y-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-cyan-200/80">
                  Počet smluv
                </dt>
                <dd className="text-3xl sm:text-4xl font-semibold text-cyan-50 mt-1">
                  <AnimatedNumber value={totalContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-cyan-200/80">
                  Provize
                </dt>
                <dd className="text-3xl sm:text-4xl font-semibold text-cyan-50 mt-1">
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
