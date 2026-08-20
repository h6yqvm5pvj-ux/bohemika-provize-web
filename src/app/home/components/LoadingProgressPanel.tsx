import { HomeLoaderScene } from "./HomeLoaderScene";

type Props = {
  title: string;
  stage: string;
  progress: number;
  accentLabel: string;
  visual?: "progress" | "money" | "payout" | "production";
};

const productionSteps = ["Smlouvy", "Provize", "Součty"] as const;

export function LoadingProgressPanel({
  title,
  stage,
  progress,
  accentLabel,
  visual = "progress",
}: Props) {
  const safeProgress = Math.max(8, Math.min(97, progress));
  const visualType = visual === "production" ? "production" : "payout";

  if (visual === "production") {
    const activeStep = safeProgress < 35 ? 0 : safeProgress < 72 ? 1 : 2;

    return (
      <div
        className="home-production-loader relative h-full min-h-[226px] w-full overflow-hidden rounded-[24px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))] px-5 py-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_22px_50px_rgba(5,2,20,0.2)] sm:px-6 sm:py-6"
        role="status"
        aria-live="polite"
      >
        <style jsx global>{`
          .home-production-loader::before {
            content: "";
            position: absolute;
            width: 310px;
            height: 310px;
            right: -110px;
            top: -185px;
            border-radius: 999px;
            background: rgba(124, 58, 237, 0.2);
            filter: blur(58px);
            pointer-events: none;
          }

          .home-production-loader::after {
            content: "";
            position: absolute;
            inset: 0;
            background-image:
              linear-gradient(rgba(221, 214, 254, 0.025) 1px, transparent 1px),
              linear-gradient(90deg, rgba(221, 214, 254, 0.025) 1px, transparent 1px);
            background-size: 30px 30px;
            mask-image: linear-gradient(105deg, transparent 4%, black 58%, transparent 100%);
            pointer-events: none;
          }

          .home-production-loader__progress::after {
            content: "";
            position: absolute;
            inset: 0;
            width: 46px;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.65), transparent);
            animation: homeProductionProgressGlint 1.8s ease-in-out infinite;
          }

          @keyframes homeProductionProgressGlint {
            from { transform: translateX(-58px); }
            to { transform: translateX(430px); }
          }

          @media (prefers-reduced-motion: reduce) {
            .home-production-loader__progress::after { animation: none; }
          }
        `}</style>

        <div className="relative z-10 grid min-h-[158px] grid-cols-1 gap-5 md:grid-cols-[minmax(0,0.82fr)_minmax(240px,1.18fr)] md:items-center md:gap-6">
          <div className="min-w-0 md:py-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-200/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-cyan-100/90">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-35" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-300" />
              </span>
              {accentLabel}
            </div>

            <h3 className="mt-4 max-w-[280px] text-[1.55rem] font-extrabold leading-[1.08] tracking-[-0.025em] text-white sm:text-[1.75rem]">
              {title}
            </h3>
            <p className="mt-2 max-w-[310px] text-[13px] font-medium leading-5 text-violet-100/58">
              {stage}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {productionSteps.map((step, index) => {
                const completed = index < activeStep;
                const active = index === activeStep;
                return (
                  <span
                    key={step}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      completed
                        ? "border-cyan-200/16 bg-cyan-200/[0.07] text-cyan-100/78"
                        : active
                          ? "border-violet-300/28 bg-violet-300/[0.1] text-violet-50"
                          : "border-white/[0.07] bg-white/[0.025] text-violet-100/36"
                    }`}
                  >
                    <i
                      className={`h-1.5 w-1.5 rounded-full ${
                        completed
                          ? "bg-cyan-300"
                          : active
                            ? "bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,0.8)]"
                            : "bg-violet-100/25"
                      }`}
                    />
                    {step}
                  </span>
                );
              })}
            </div>
          </div>

          <HomeLoaderScene type="production" />
        </div>

        <div className="relative z-10 mt-5 flex items-center justify-between gap-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100/46">
          <span>Synchronizace dat</span>
          <span
            className="font-mono text-xs tracking-normal text-violet-100/72"
            aria-hidden="true"
          >
            {safeProgress}%
          </span>
        </div>
        <div
          className="relative z-10 mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
          aria-hidden="true"
        >
          <div
            className="home-production-loader__progress relative h-full min-w-5 overflow-hidden rounded-full bg-[linear-gradient(90deg,#22d3ee_0%,#8b5cf6_56%,#e879f9_100%)] shadow-[0_0_14px_rgba(139,92,246,0.34)] transition-[width] duration-300 ease-out"
            style={{ width: `${safeProgress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="home-loader-panel relative h-full min-h-[144px] w-full overflow-hidden rounded-[24px] bg-[linear-gradient(145deg,#ffffff_0%,#fbfbfb_54%,#fdf2f8_100%)] px-4 py-4 text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_20px_44px_rgba(10,5,35,0.22)] sm:px-5">
      <style jsx global>{`
        .home-loader-panel::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(116deg, transparent 0%, transparent 38%, rgba(217, 70, 239, 0.09) 38%, rgba(217, 70, 239, 0.03) 59%, transparent 59%),
            radial-gradient(circle at 76% 20%, rgba(217, 70, 239, 0.14), transparent 34%);
          pointer-events: none;
        }

        .home-loader-panel::after {
          content: "";
          position: absolute;
          inset: -38% -28% auto;
          height: 62%;
          background: linear-gradient(108deg, transparent 18%, rgba(255, 255, 255, 0.88) 40%, rgba(217, 70, 239, 0.12) 52%, transparent 74%);
          transform: translate3d(-108%, 0, 0) rotate(6deg);
          animation: homeLoaderBeam 2.6s cubic-bezier(0.2, 0.82, 0.28, 1) infinite;
          pointer-events: none;
        }

        @keyframes homeLoaderBeam {
          0% { opacity: 0; transform: translate3d(-108%, 0, 0) rotate(6deg); }
          22% { opacity: 0.74; }
          100% { opacity: 0; transform: translate3d(118%, 0, 0) rotate(6deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .home-loader-panel::after { animation: none; }
        }
      `}</style>

      <div className="relative z-10 grid h-full min-h-[116px] grid-cols-1 gap-4 md:grid-cols-[minmax(0,0.82fr)_minmax(230px,1fr)] md:items-center">
        <div className="min-w-0">
          <div className="inline-flex items-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-bold uppercase text-fuchsia-700">
            {accentLabel}
          </div>

          <div className="mt-3 flex items-end gap-1 font-mono text-4xl font-semibold leading-none text-black sm:text-5xl">
            <span>{safeProgress}</span>
            <span className="pb-1 text-2xl text-fuchsia-700">%</span>
          </div>

          <h3 className="mt-2 text-lg font-black leading-6 text-black sm:text-xl">{title}</h3>
          <p className="mt-1 text-sm font-semibold leading-5 text-black/58">{stage}</p>

          <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/10">
            <div
              className="relative h-full min-w-5 rounded-full bg-[linear-gradient(90deg,#020617_0%,#a21caf_54%,#e879f9_100%)] transition-[width] duration-300 ease-out"
              style={{ width: `${safeProgress}%` }}
            >
              <span className="absolute inset-y-0 right-0 w-10 bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-90" />
            </div>
          </div>
        </div>

        <HomeLoaderScene type={visualType} />
      </div>
    </div>
  );
}
