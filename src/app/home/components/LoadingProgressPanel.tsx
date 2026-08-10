import { HomeLoaderScene } from "./HomeLoaderScene";

type Props = {
  title: string;
  stage: string;
  progress: number;
  accentLabel: string;
  visual?: "progress" | "money" | "payout" | "production";
};

export function LoadingProgressPanel({
  title,
  stage,
  progress,
  accentLabel,
  visual = "progress",
}: Props) {
  const safeProgress = Math.max(8, Math.min(97, progress));
  const visualType = visual === "production" ? "production" : "payout";

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
