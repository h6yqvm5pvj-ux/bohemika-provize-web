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
    ? "h-full rounded-[28px] border border-slate-700 bg-slate-950 px-5 py-8 text-white transition-[border-color,box-shadow] duration-200 hover:border-slate-500 focus-within:border-slate-500 focus-within:shadow-[0_0_0_1px_rgba(148,163,184,0.28)] sm:px-8 sm:py-10"
    : "h-full rounded-[28px] border border-slate-700 bg-slate-950 px-5 py-8 text-white shadow-[0_14px_34px_rgba(2,6,23,0.35)] transition-[border-color,box-shadow] duration-200 hover:border-slate-500 hover:shadow-[0_18px_42px_rgba(2,6,23,0.45),0_0_0_1px_rgba(148,163,184,0.18)] focus-within:border-slate-500 focus-within:shadow-[0_18px_42px_rgba(2,6,23,0.45),0_0_0_1px_rgba(148,163,184,0.22)] sm:px-8 sm:py-10";

  return (
    <section className={summaryCardClass}>
      <div
        className={`grid h-full items-stretch gap-6 md:gap-8 ${
          showTeamBox
            ? "md:grid-cols-3 md:divide-x md:divide-slate-700"
            : "md:grid-cols-2 md:divide-x md:divide-slate-700"
        }`}
      >
        <div className="flex min-h-[220px] h-full flex-col justify-center space-y-6 text-center md:px-6">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">
            Vlastní produkce
          </h2>
          {loading ? (
            <p className="text-base text-slate-300">Načítám…</p>
          ) : (
            <dl className="space-y-6">
              <div>
                <dt className="text-xs uppercase tracking-wide text-[#f8fafc]">
                  Počet smluv
                </dt>
                <dd className="mt-2 text-4xl font-semibold text-white sm:text-5xl">
                  <AnimatedNumber value={myContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[#f8fafc]">
                  Provize
                </dt>
                <dd className="mt-2 text-4xl font-semibold text-white sm:text-5xl">
                  <AnimatedMoney value={myImmediateSum} />
                </dd>
              </div>
            </dl>
          )}
        </div>

        {showTeamBox && (
          <div className="flex min-h-[220px] h-full flex-col justify-center space-y-6 text-center md:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">
              <span className="block">Týmová</span>
              <span className="block">produkce</span>
            </h2>
            {loading ? (
              <p className="text-base text-slate-300">Načítám…</p>
            ) : (
              <dl className="space-y-6">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[#f8fafc]">
                    Počet smluv
                  </dt>
                  <dd className="mt-2 text-4xl font-semibold text-white sm:text-5xl">
                    <AnimatedNumber value={teamContractsCount} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[#f8fafc]">
                    Provize
                  </dt>
                  <dd className="mt-2 text-4xl font-semibold text-white sm:text-5xl">
                    <AnimatedMoney value={teamImmediateSum} />
                  </dd>
                </div>
              </dl>
            )}
          </div>
        )}

        <div className="flex min-h-[220px] h-full flex-col justify-center space-y-6 text-center md:px-6">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">
            Celková produkce
          </h2>
          {loading ? (
            <p className="text-base text-slate-300">Načítám…</p>
          ) : (
            <dl className="space-y-6">
              <div>
                <dt className="text-xs uppercase tracking-wide text-[#f8fafc]">
                  Počet smluv
                </dt>
                <dd className="mt-2 text-4xl font-semibold text-emerald-400 sm:text-5xl">
                  <AnimatedNumber value={totalContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[#f8fafc]">
                  Provize
                </dt>
                <dd className="mt-2 text-4xl font-semibold text-emerald-400 sm:text-5xl">
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
