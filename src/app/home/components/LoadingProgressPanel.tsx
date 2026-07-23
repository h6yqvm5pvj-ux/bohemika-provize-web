import { type AppLanguage } from "@/lib/appLanguage";

type Props = {
  language: AppLanguage;
  title: string;
  stage: string;
  progress: number;
  accentLabel: string;
  visual?: "progress" | "money" | "payout" | "production";
};

const LOADING_PROGRESS_COPY: Record<
  AppLanguage,
  {
    phases: string[];
    ready: string;
  }
> = {
  cs: {
    phases: ["Sběr dat", "Výpočty", "Finalizace"],
    ready: "připraveno",
  },
};

function PayoutVisual() {
  const renderBanknote = (className: string, amount: string) => (
    <span className={`home-loader-banknote ${className}`}>
      <span className="note-corner">{amount}</span>
      <span className="note-corner note-corner-opposite">{amount}</span>
      <span className="note-strip" />
      <span className="note-portrait" />
      <span className="note-seal" />
      <span className="note-line note-line-a" />
      <span className="note-line note-line-b" />
      <span className="note-line note-line-c" />
    </span>
  );

  return (
    <div className="home-loader-visual" aria-hidden="true">
      {renderBanknote("bill-a", "500")}
      {renderBanknote("bill-b", "1000")}
      {renderBanknote("bill-c", "200")}
      {renderBanknote("bill-d", "500")}
      <div className="home-loader-wallet">
        <span className="wallet-line" />
        <span className="wallet-line short" />
        <span className="wallet-dot" />
      </div>
      <div className="home-loader-stack">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} style={{ bottom: `${index * 7}px` }}>
            <span />
            <span />
          </span>
        ))}
      </div>
    </div>
  );
}

function ProductionVisual() {
  return (
    <div className="home-loader-visual production" aria-hidden="true">
      <span className="home-loader-contract contract-a"><span /><span /></span>
      <span className="home-loader-contract contract-b"><span /><span /></span>
      <span className="home-loader-contract contract-c"><span /><span /></span>
      <div className="home-loader-columns">
        {[46, 64, 82, 58].map((height, index) => (
          <span
            key={height}
            style={{
              height: `${height}%`,
              ["--home-column-index" as string]: index,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function LoadingProgressPanel({
  language,
  title,
  stage,
  progress,
  accentLabel,
  visual = "progress",
}: Props) {
  const copy = LOADING_PROGRESS_COPY[language];
  const safeProgress = Math.max(8, Math.min(97, progress));
  const activePhaseIndex =
    safeProgress < 35 ? 0 : safeProgress < 72 ? 1 : 2;
  const visualType = visual === "money" ? "payout" : visual;

  return (
    <div className="home-loader-panel relative h-full min-h-[168px] w-full overflow-hidden rounded-[24px] bg-[linear-gradient(145deg,#ffffff_0%,#fbfbfb_54%,#fdf2f8_100%)] px-4 py-4 text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_20px_44px_rgba(10,5,35,0.22)] sm:px-5">
      <style jsx global>{`
        .home-loader-panel::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(
              116deg,
              transparent 0%,
              transparent 38%,
              rgba(217, 70, 239, 0.09) 38%,
              rgba(217, 70, 239, 0.03) 59%,
              transparent 59%
            ),
            radial-gradient(circle at 76% 20%, rgba(217, 70, 239, 0.14), transparent 34%);
          pointer-events: none;
        }

        .home-loader-panel::after {
          content: "";
          position: absolute;
          inset: -38% -28% auto;
          height: 62%;
          background: linear-gradient(
            108deg,
            transparent 18%,
            rgba(255, 255, 255, 0.88) 40%,
            rgba(217, 70, 239, 0.12) 52%,
            transparent 74%
          );
          transform: translate3d(-108%, 0, 0) rotate(6deg);
          animation: homeLoaderBeam 2600ms cubic-bezier(0.2, 0.82, 0.28, 1) infinite;
          pointer-events: none;
        }

        .home-loader-visual {
          position: relative;
          min-height: 142px;
          overflow: hidden;
          border-radius: 22px;
          background:
            radial-gradient(circle at 50% 78%, rgba(217, 70, 239, 0.16), transparent 46%),
            rgba(255, 255, 255, 0.66);
        }

        .home-loader-visual::after {
          content: "";
          position: absolute;
          left: 16%;
          right: 16%;
          bottom: 18px;
          height: 15px;
          border-radius: 9999px;
          background: rgba(2, 6, 23, 0.16);
          filter: blur(13px);
        }

        .home-loader-banknote {
          position: absolute;
          top: -64px;
          z-index: 5;
          height: 50px;
          width: 112px;
          overflow: hidden;
          border-radius: 10px;
          border: 1px solid rgba(2, 6, 23, 0.14);
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.92), rgba(252, 231, 243, 0.82) 48%, rgba(255, 255, 255, 0.95)),
            repeating-linear-gradient(90deg, rgba(2, 6, 23, 0.055) 0 1px, transparent 1px 8px),
            repeating-linear-gradient(0deg, rgba(217, 70, 239, 0.045) 0 1px, transparent 1px 7px);
          box-shadow:
            0 18px 30px rgba(15, 23, 42, 0.16),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
          opacity: 0;
          animation: homeLoaderDrop 2100ms cubic-bezier(0.18, 0.82, 0.28, 1) infinite;
        }

        .home-loader-banknote::before {
          content: "";
          position: absolute;
          inset: 5px;
          border-radius: 7px;
          border: 1px solid rgba(2, 6, 23, 0.08);
          background: radial-gradient(circle at 74% 50%, rgba(217, 70, 239, 0.1), transparent 38%);
          pointer-events: none;
        }

        .note-corner {
          position: absolute;
          left: 8px;
          top: 7px;
          z-index: 2;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 12px;
          font-weight: 900;
          line-height: 1;
          color: #a21caf;
        }

        .note-corner-opposite {
          inset: auto 8px 7px auto;
          color: rgba(2, 6, 23, 0.76);
          transform: rotate(180deg);
        }

        .note-strip {
          position: absolute;
          top: 7px;
          bottom: 7px;
          left: 36px;
          z-index: 2;
          width: 5px;
          border-radius: 9999px;
          background: linear-gradient(180deg, rgba(2, 6, 23, 0.86), rgba(217, 70, 239, 0.78), rgba(2, 6, 23, 0.86));
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.46);
        }

        .note-portrait {
          position: absolute;
          top: 10px;
          right: 30px;
          z-index: 2;
          height: 28px;
          width: 28px;
          border-radius: 9999px;
          border: 1px solid rgba(2, 6, 23, 0.12);
          background:
            radial-gradient(circle at 46% 42%, rgba(255, 255, 255, 0.95) 0 27%, rgba(217, 70, 239, 0.18) 28% 47%, transparent 48%),
            rgba(255, 255, 255, 0.5);
        }

        .note-portrait::after {
          content: "";
          position: absolute;
          inset: 7px 9px;
          border-radius: 9999px 9999px 6px 6px;
          background: rgba(2, 6, 23, 0.16);
        }

        .note-seal {
          position: absolute;
          right: 9px;
          top: 9px;
          z-index: 2;
          height: 12px;
          width: 12px;
          border-radius: 9999px;
          border: 2px solid rgba(217, 70, 239, 0.72);
          box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.82);
        }

        .note-line {
          position: absolute;
          left: 48px;
          z-index: 2;
          height: 4px;
          border-radius: 9999px;
          background: rgba(2, 6, 23, 0.18);
        }

        .note-line-a {
          top: 13px;
          width: 38px;
          background: rgba(217, 70, 239, 0.58);
        }

        .note-line-b {
          top: 23px;
          width: 50px;
        }

        .note-line-c {
          top: 33px;
          width: 34px;
        }

        .bill-a {
          left: 8%;
          --drop-x: 34px;
          --drop-start-rotate: -7deg;
          --drop-rotate: 10deg;
          animation-delay: -120ms;
        }

        .bill-b {
          left: 29%;
          --drop-x: -12px;
          --drop-start-rotate: 6deg;
          --drop-rotate: -8deg;
          animation-delay: -580ms;
        }

        .bill-c {
          left: 52%;
          --drop-x: 14px;
          --drop-start-rotate: -6deg;
          --drop-rotate: 7deg;
          animation-delay: -1040ms;
        }

        .bill-d {
          left: 67%;
          --drop-x: -28px;
          --drop-start-rotate: 8deg;
          --drop-rotate: -11deg;
          animation-delay: -1500ms;
        }

        .home-loader-contract {
          position: absolute;
          top: -58px;
          z-index: 4;
          display: flex;
          height: 50px;
          width: 76px;
          flex-direction: column;
          gap: 6px;
          border-radius: 12px;
          border: 1px solid rgba(2, 6, 23, 0.12);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(252, 244, 255, 0.96));
          padding: 10px;
          box-shadow: 0 16px 28px rgba(15, 23, 42, 0.14);
          opacity: 0;
          animation: homeLoaderDrop 2100ms cubic-bezier(0.18, 0.82, 0.28, 1) infinite;
        }

        .home-loader-contract span {
          display: block;
          height: 5px;
          border-radius: 9999px;
          background: rgba(15, 23, 42, 0.15);
        }

        .home-loader-contract span:first-child {
          width: 44%;
          background: rgba(217, 70, 239, 0.62);
        }

        .home-loader-contract span:nth-child(2) {
          width: 82%;
        }

        .home-loader-wallet {
          position: absolute;
          right: 10%;
          bottom: 32px;
          z-index: 3;
          height: 72px;
          width: 140px;
          border-radius: 22px;
          background:
            linear-gradient(145deg, #020617 0%, #111827 58%, #a21caf 100%);
          box-shadow:
            0 22px 38px rgba(15, 23, 42, 0.2),
            0 0 0 8px rgba(217, 70, 239, 0.08);
        }

        .home-loader-wallet::before {
          content: "";
          position: absolute;
          inset: 12px 14px auto;
          height: 25px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.08);
        }

        .wallet-line,
        .wallet-line.short,
        .wallet-dot {
          position: absolute;
          left: 18px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.72);
        }

        .wallet-line {
          bottom: 22px;
          height: 6px;
          width: 66px;
        }

        .wallet-line.short {
          bottom: 36px;
          width: 42px;
        }

        .wallet-dot {
          right: 18px;
          bottom: 23px;
          left: auto;
          height: 16px;
          width: 16px;
          background: #d946ef;
        }

        .home-loader-stack {
          position: absolute;
          left: 8%;
          bottom: 30px;
          z-index: 2;
          height: 62px;
          width: 126px;
          transform: rotate(-2deg);
        }

        .home-loader-stack > span {
          position: absolute;
          right: 0;
          left: 0;
          height: 40px;
          overflow: hidden;
          border-radius: 10px;
          border: 1px solid rgba(2, 6, 23, 0.11);
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.95), rgba(252, 231, 243, 0.72), rgba(255, 255, 255, 0.96)),
            repeating-linear-gradient(90deg, rgba(2, 6, 23, 0.045) 0 1px, transparent 1px 7px);
          box-shadow: 0 12px 22px rgba(15, 23, 42, 0.11);
        }

        .home-loader-stack > span::before {
          content: "500";
          position: absolute;
          left: 9px;
          top: 8px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 10px;
          font-weight: 900;
          line-height: 1;
          color: #a21caf;
        }

        .home-loader-stack > span::after {
          content: "";
          position: absolute;
          top: 7px;
          bottom: 7px;
          left: 34px;
          width: 4px;
          border-radius: 9999px;
          background: rgba(2, 6, 23, 0.72);
        }

        .home-loader-stack > span > span {
          position: absolute;
          left: 48px;
          display: block;
          height: 4px;
          border-radius: 9999px;
          background: rgba(2, 6, 23, 0.16);
        }

        .home-loader-stack > span > span:first-child {
          top: 13px;
          width: 46px;
          background: rgba(217, 70, 239, 0.5);
        }

        .home-loader-stack > span > span:nth-child(2) {
          top: 24px;
          width: 58px;
        }

        .production .home-loader-contract {
          height: 54px;
          width: 68px;
          animation-name: homeLoaderContractFlow;
        }

        .contract-a {
          left: 10%;
          --drop-x: 104px;
          --drop-start-rotate: -6deg;
          --drop-rotate: 8deg;
          animation-delay: -100ms;
        }

        .contract-b {
          left: 36%;
          --drop-x: 54px;
          --drop-start-rotate: 7deg;
          --drop-rotate: -9deg;
          animation-delay: -640ms;
        }

        .contract-c {
          left: 62%;
          --drop-x: -14px;
          --drop-start-rotate: -6deg;
          --drop-rotate: 7deg;
          animation-delay: -1180ms;
        }

        .home-loader-columns {
          position: absolute;
          right: 12%;
          bottom: 28px;
          left: 12%;
          z-index: 2;
          display: grid;
          height: 100px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          align-items: end;
          gap: 10px;
        }

        .home-loader-columns span {
          display: block;
          border-radius: 16px 16px 8px 8px;
          background: linear-gradient(180deg, rgba(217, 70, 239, 0.66), rgba(2, 6, 23, 0.88));
          box-shadow: 0 14px 26px rgba(162, 28, 175, 0.14);
          animation: homeLoaderColumnPulse 1250ms ease-in-out infinite;
          animation-delay: calc(var(--home-column-index) * -120ms);
        }

        @keyframes homeLoaderBeam {
          0% {
            opacity: 0;
            transform: translate3d(-108%, 0, 0) rotate(6deg);
          }
          22% {
            opacity: 0.74;
          }
          100% {
            opacity: 0;
            transform: translate3d(118%, 0, 0) rotate(6deg);
          }
        }

        @keyframes homeLoaderDrop {
          0% {
            opacity: 0;
            transform: translate3d(0, -20px, 0) rotate(var(--drop-start-rotate, -7deg)) scale(0.94);
          }
          14% {
            opacity: 1;
          }
          76% {
            opacity: 1;
            transform: translate3d(var(--drop-x, 12px), 136px, 0) rotate(var(--drop-rotate, 8deg)) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate3d(var(--drop-x, 12px), 148px, 0) rotate(var(--drop-rotate, 8deg)) scale(0.92);
          }
        }

        @keyframes homeLoaderContractFlow {
          0% {
            opacity: 0;
            transform: translate3d(0, -20px, 0) rotate(var(--drop-start-rotate, -7deg)) scale(0.94);
          }
          14% {
            opacity: 1;
          }
          72% {
            opacity: 1;
            transform: translate3d(var(--drop-x, 60px), 110px, 0) rotate(var(--drop-rotate, 8deg)) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate3d(var(--drop-x, 60px), 122px, 0) rotate(var(--drop-rotate, 8deg)) scale(0.92);
          }
        }

        @keyframes homeLoaderColumnPulse {
          0%,
          100% {
            opacity: 0.78;
            transform: scaleY(0.88);
          }
          50% {
            opacity: 1;
            transform: scaleY(1);
          }
        }

        @media (max-width: 640px) {
          .home-loader-visual {
            min-height: 132px;
          }

          .home-loader-wallet {
            right: 10%;
            bottom: 34px;
            height: 74px;
            width: 132px;
          }

          .home-loader-stack {
            left: 8%;
            bottom: 32px;
          }

          .home-loader-banknote {
            height: 46px;
            width: 100px;
          }

          .home-loader-columns {
            height: 104px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .home-loader-panel::after,
          .home-loader-banknote,
          .home-loader-contract,
          .home-loader-columns span {
            animation: none;
          }
        }
      `}</style>

      <div className="relative z-10 grid h-full min-h-[136px] grid-cols-1 gap-4 md:grid-cols-[minmax(0,0.82fr)_minmax(230px,1fr)] md:items-center">
        <div className="min-w-0">
          <div className="inline-flex items-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-bold uppercase text-fuchsia-700">
            {accentLabel}
          </div>

          <div className="mt-3 flex items-end gap-1 font-mono text-4xl font-semibold leading-none text-black sm:text-5xl">
            <span>{safeProgress}</span>
            <span className="pb-1 text-2xl text-fuchsia-700">%</span>
          </div>

          <h3 className="mt-2 text-lg font-black leading-6 text-black sm:text-xl">
            {title}
          </h3>
          <p className="mt-1 text-sm font-semibold leading-5 text-black/58">
            {stage}
          </p>

          <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/10">
            <div
              className="relative h-full min-w-5 rounded-full bg-[linear-gradient(90deg,#020617_0%,#a21caf_54%,#e879f9_100%)] transition-[width] duration-300 ease-out"
              style={{ width: `${safeProgress}%` }}
            >
              <span className="absolute inset-y-0 right-0 w-10 bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-90" />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {copy.phases.map((phase, index) => {
              const state =
                index < activePhaseIndex
                  ? "done"
                  : index === activePhaseIndex
                    ? "active"
                    : "idle";

              return (
                <span
                  key={phase}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                    state === "done"
                      ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
                      : state === "active"
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white/72 text-black/48"
                  }`}
                >
                  {phase}
                </span>
              );
            })}
          </div>
        </div>

        {visualType === "production" ? <ProductionVisual /> : <PayoutVisual />}
      </div>
    </div>
  );
}
