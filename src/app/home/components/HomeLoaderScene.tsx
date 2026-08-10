import { type CSSProperties } from "react";

type Props = {
  type: "production" | "payout";
};

const chartCandles = [
  { body: "28px", base: "9px", tone: "violet", delay: "-1.6s" },
  { body: "43px", base: "7px", tone: "magenta", delay: "-1.28s" },
  { body: "35px", base: "12px", tone: "violet", delay: "-0.96s" },
  { body: "57px", base: "4px", tone: "magenta", delay: "-0.64s" },
  { body: "47px", base: "9px", tone: "violet", delay: "-0.32s" },
] as const;

function GrowingCandleChart() {
  return (
    <div className="bohemika-loader-candle-chart" aria-hidden="true">
      <svg className="bohemika-loader-trend" viewBox="0 0 240 90" preserveAspectRatio="none">
        <path d="M0 71 C22 66 29 71 47 56 S78 72 94 48 S121 59 139 31 S169 46 190 23 S219 31 240 8" />
      </svg>
      <div className="bohemika-loader-candle-row">
        {chartCandles.map((candle, index) => (
          <span
            key={index}
            className={`bohemika-loader-candle bohemika-loader-candle--${candle.tone}`}
            style={
              {
                "--candle-body": candle.body,
                "--candle-base": candle.base,
                "--candle-delay": candle.delay,
              } as CSSProperties
            }
          >
            <span className="bohemika-loader-candle-wick" />
            <span className="bohemika-loader-candle-body" />
            <span className="bohemika-loader-candle-flare" />
          </span>
        ))}
      </div>
    </div>
  );
}

function PayoutFlow() {
  return (
    <div className="bohemika-loader-payout-flow">
      <span className="bohemika-loader-payout-trail" />
      <span className="bohemika-loader-payout-card bohemika-loader-payout-card--a">
        <i />
        <b />
      </span>
      <span className="bohemika-loader-payout-card bohemika-loader-payout-card--b">
        <i />
        <b />
      </span>
      <span className="bohemika-loader-payout-card bohemika-loader-payout-card--c">
        <i />
        <b />
      </span>
      <span className="bohemika-loader-payout-core">
        <i />
        <b />
      </span>
    </div>
  );
}

export function HomeLoaderScene({ type }: Props) {
  return (
    <div className={`bohemika-loader-scene bohemika-loader-scene--${type}`} aria-hidden="true">
      <div className="bohemika-loader-aura" />
      <div className="bohemika-loader-orbit" />
      {type === "production" ? <GrowingCandleChart /> : <PayoutFlow />}
      <span className="bohemika-loader-particle bohemika-loader-particle--a" />
      <span className="bohemika-loader-particle bohemika-loader-particle--b" />
      <span className="bohemika-loader-particle bohemika-loader-particle--c" />

      <style jsx global>{`
        .bohemika-loader-scene {
          position: relative;
          min-height: 142px;
          isolation: isolate;
          overflow: hidden;
        }

        .bohemika-loader-aura {
          position: absolute;
          z-index: -1;
          left: 15%;
          right: 9%;
          bottom: 6px;
          height: 42px;
          border-radius: 50%;
          background: radial-gradient(ellipse, rgba(192, 38, 211, 0.31) 0%, rgba(139, 92, 246, 0.14) 39%, transparent 72%);
          filter: blur(10px);
          transform: rotateX(68deg);
          animation: bohemikaLoaderAura 2.8s ease-in-out infinite alternate;
        }

        .bohemika-loader-orbit {
          position: absolute;
          z-index: -1;
          left: 50%;
          bottom: 25px;
          width: 48%;
          height: 31px;
          border: 1px solid rgba(217, 70, 239, 0.24);
          border-radius: 50%;
          box-shadow: 0 0 16px rgba(232, 121, 249, 0.19);
          transform: translateX(-50%) rotateX(67deg);
          animation: bohemikaLoaderOrbitPulse 2.2s ease-in-out infinite;
        }

        .bohemika-loader-candle-chart {
          position: absolute;
          z-index: 3;
          left: 10%;
          right: 10%;
          bottom: 13px;
          height: 106px;
          transform: perspective(280px) rotateX(6deg);
          transform-origin: bottom center;
          pointer-events: none;
        }

        .bohemika-loader-candle-chart::before {
          content: "";
          position: absolute;
          right: 0;
          bottom: 0;
          left: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(232, 121, 249, 0.72) 12%, rgba(232, 121, 249, 0.22) 88%, transparent);
          box-shadow: 0 0 10px rgba(232, 121, 249, 0.38);
        }

        .bohemika-loader-trend {
          position: absolute;
          z-index: 1;
          inset: 3px 0 4px;
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .bohemika-loader-trend path {
          fill: none;
          stroke: rgba(255, 255, 255, 0.92);
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: drop-shadow(0 0 4px rgba(232, 121, 249, 0.94));
          stroke-dasharray: 290;
          stroke-dashoffset: 290;
          animation: bohemikaLoaderTrend 3.2s cubic-bezier(0.35, 0, 0.2, 1) infinite;
        }

        .bohemika-loader-candle-row {
          position: absolute;
          z-index: 2;
          right: 7%;
          bottom: 0;
          left: 8%;
          height: 100%;
          display: flex;
          align-items: stretch;
          justify-content: space-around;
        }

        .bohemika-loader-candle {
          position: relative;
          display: block;
          width: 11%;
          height: 100%;
          filter: drop-shadow(0 5px 5px rgba(73, 14, 112, 0.2));
        }

        .bohemika-loader-candle-wick {
          position: absolute;
          z-index: 1;
          bottom: calc(var(--candle-base) - 7px);
          left: 50%;
          width: 2px;
          height: calc(var(--candle-body) + 15px);
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(232, 121, 249, 0.85), rgba(91, 33, 182, 0.72));
          box-shadow: 0 0 4px rgba(232, 121, 249, 0.68);
          transform: translateX(-50%) scaleY(0.12);
          transform-origin: bottom;
          animation: bohemikaLoaderCandleGrow 2.6s cubic-bezier(0.34, 1.14, 0.64, 1) infinite var(--candle-delay);
        }

        .bohemika-loader-candle-body {
          position: absolute;
          z-index: 2;
          right: 1px;
          bottom: var(--candle-base);
          left: 1px;
          height: var(--candle-body);
          border: 1px solid rgba(255, 255, 255, 0.7);
          border-radius: 3px 3px 2px 2px;
          box-shadow: inset 1px 1px rgba(255, 255, 255, 0.42), 0 0 8px rgba(232, 121, 249, 0.46);
          transform: scaleY(0.1);
          transform-origin: bottom;
          animation: bohemikaLoaderCandleGrow 2.6s cubic-bezier(0.34, 1.14, 0.64, 1) infinite var(--candle-delay);
        }

        .bohemika-loader-candle--violet .bohemika-loader-candle-body {
          background: linear-gradient(90deg, #3b0764 0%, #7e22ce 42%, #d8b4fe 100%);
        }

        .bohemika-loader-candle--magenta .bohemika-loader-candle-body {
          background: linear-gradient(90deg, #86198f 0%, #ec4899 48%, #fce7f3 100%);
        }

        .bohemika-loader-candle-flare {
          position: absolute;
          z-index: 3;
          bottom: calc(var(--candle-base) + var(--candle-body) - 2px);
          left: 50%;
          width: 7px;
          height: 7px;
          border: 2px solid rgba(255, 255, 255, 0.92);
          border-radius: 50%;
          background: #f0abfc;
          box-shadow: 0 0 9px 3px rgba(232, 121, 249, 0.66);
          transform: translateX(-50%) scale(0.35);
          animation: bohemikaLoaderCandleFlare 2.6s ease-out infinite var(--candle-delay);
        }

        .bohemika-loader-payout-flow {
          position: absolute;
          z-index: 3;
          inset: 0;
        }

        .bohemika-loader-payout-trail {
          position: absolute;
          top: 50%;
          right: 18%;
          left: 14%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(232, 121, 249, 0.54) 14%, rgba(232, 121, 249, 0.54) 72%, transparent);
          box-shadow: 0 0 10px rgba(217, 70, 239, 0.46);
        }

        .bohemika-loader-payout-trail::before {
          content: "";
          position: absolute;
          top: 50%;
          left: 0;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #fdf4ff;
          box-shadow: 0 0 9px 3px rgba(232, 121, 249, 0.75);
          transform: translateY(-50%);
          animation: bohemikaLoaderPayoutDot 2.5s ease-in-out infinite;
        }

        .bohemika-loader-payout-card {
          position: absolute;
          z-index: 2;
          width: 62px;
          height: 41px;
          border: 1px solid rgba(255, 255, 255, 0.88);
          border-radius: 9px;
          background: linear-gradient(138deg, rgba(255, 255, 255, 0.96), rgba(252, 231, 243, 0.88));
          box-shadow: 0 10px 18px rgba(73, 14, 112, 0.16), inset 0 1px rgba(255, 255, 255, 0.92);
          transform: rotate(-7deg);
          animation: bohemikaLoaderPayoutCard 3s cubic-bezier(0.34, 1.1, 0.64, 1) infinite;
        }

        .bohemika-loader-payout-card::before {
          content: "";
          position: absolute;
          top: 8px;
          right: 8px;
          width: 10px;
          height: 10px;
          border-radius: 3px;
          background: linear-gradient(135deg, #f0abfc, #a21caf);
          box-shadow: inset 0 1px rgba(255, 255, 255, 0.72);
        }

        .bohemika-loader-payout-card i,
        .bohemika-loader-payout-card b {
          position: absolute;
          left: 9px;
          display: block;
          height: 4px;
          border-radius: 99px;
        }

        .bohemika-loader-payout-card i { top: 11px; width: 22px; background: rgba(192, 38, 211, 0.68); }
        .bohemika-loader-payout-card b { top: 21px; width: 34px; background: rgba(49, 10, 83, 0.18); }
        .bohemika-loader-payout-card--a { top: 24%; left: 13%; animation-delay: -2s; }
        .bohemika-loader-payout-card--b { right: 16%; bottom: 19%; transform: rotate(10deg); animation-delay: -1s; }
        .bohemika-loader-payout-card--c { top: 8%; right: 27%; transform: rotate(-13deg) scale(0.82); opacity: 0.82; animation-delay: -0.2s; }

        .bohemika-loader-payout-core {
          position: absolute;
          z-index: 3;
          top: 50%;
          left: 50%;
          width: 68px;
          height: 68px;
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 22px;
          background: linear-gradient(145deg, #5b1b91 0%, #2e1065 52%, #17042f 100%);
          box-shadow: 0 15px 26px rgba(59, 7, 100, 0.3), inset 1px 1px rgba(255, 255, 255, 0.24), 0 0 0 8px rgba(217, 70, 239, 0.06);
          transform: translate(-50%, -50%) rotate(-5deg);
          animation: bohemikaLoaderPayoutCore 2.5s ease-in-out infinite;
        }

        .bohemika-loader-payout-core::before {
          content: "";
          position: absolute;
          inset: 10px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 15px;
          background: radial-gradient(circle at 32% 24%, rgba(255, 255, 255, 0.56), transparent 25%), linear-gradient(145deg, rgba(232, 121, 249, 0.78), rgba(126, 34, 206, 0.4));
          box-shadow: inset 0 1px rgba(255, 255, 255, 0.3), 0 0 16px rgba(232, 121, 249, 0.48);
        }

        .bohemika-loader-payout-core i {
          position: absolute;
          z-index: 1;
          top: 24px;
          left: 24px;
          width: 20px;
          height: 11px;
          border-bottom: 3px solid white;
          border-left: 3px solid white;
          transform: rotate(-45deg);
          filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.75));
        }

        .bohemika-loader-payout-core b {
          position: absolute;
          z-index: 1;
          right: 11px;
          bottom: 10px;
          width: 12px;
          height: 3px;
          border-radius: 99px;
          background: rgba(255, 255, 255, 0.72);
          box-shadow: -16px 0 rgba(255, 255, 255, 0.4);
        }

        .bohemika-loader-particle {
          position: absolute;
          z-index: 2;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 0 10px 3px rgba(232, 121, 249, 0.7);
          animation: bohemikaLoaderParticle 2.1s ease-in-out infinite;
        }

        .bohemika-loader-particle--a { left: 23%; top: 28%; animation-delay: -1.2s; }
        .bohemika-loader-particle--b { right: 20%; top: 47%; animation-delay: -0.4s; }
        .bohemika-loader-particle--c { right: 37%; top: 16%; width: 3px; height: 3px; animation-delay: -1.7s; }

        @keyframes bohemikaLoaderAura {
          from { opacity: 0.48; transform: rotateX(68deg) scale(0.9); }
          to { opacity: 0.94; transform: rotateX(68deg) scale(1.08); }
        }

        @keyframes bohemikaLoaderOrbitPulse {
          0%, 100% { opacity: 0.24; transform: translateX(-50%) rotateX(67deg) scale(0.9); }
          50% { opacity: 0.85; transform: translateX(-50%) rotateX(67deg) scale(1.08); }
        }

        @keyframes bohemikaLoaderParticle {
          0%, 100% { opacity: 0.26; transform: scale(0.6); }
          50% { opacity: 1; transform: scale(1.22); }
        }

        @keyframes bohemikaLoaderCandleGrow {
          0%, 12% { opacity: 0.18; transform: translateZ(0) scaleY(0.08); }
          48%, 67% { opacity: 1; transform: translateZ(0) scaleY(1); }
          80% { opacity: 0.85; transform: translateZ(0) scaleY(0.9); }
          100% { opacity: 0.3; transform: translateZ(0) scaleY(0.82); }
        }

        @keyframes bohemikaLoaderCandleFlare {
          0%, 20% { opacity: 0; transform: translateX(-50%) scale(0.2); }
          48% { opacity: 1; transform: translateX(-50%) scale(1); }
          67% { opacity: 0.7; transform: translateX(-50%) scale(0.75); }
          100% { opacity: 0; transform: translateX(-50%) scale(0.3); }
        }

        @keyframes bohemikaLoaderTrend {
          0%, 12% { opacity: 0; stroke-dashoffset: 290; }
          50%, 67% { opacity: 0.95; stroke-dashoffset: 0; }
          100% { opacity: 0; stroke-dashoffset: -30; }
        }

        @keyframes bohemikaLoaderPayoutDot {
          0% { opacity: 0; transform: translateY(-50%) translateX(0) scale(0.5); }
          20%, 75% { opacity: 1; }
          88%, 100% { opacity: 0; transform: translateY(-50%) translateX(500%) scale(0.7); }
        }

        @keyframes bohemikaLoaderPayoutCard {
          0%, 100% { opacity: 0.2; translate: 0 8px; }
          28%, 70% { opacity: 1; translate: 0 -4px; }
          84% { opacity: 0.42; translate: 5px 1px; }
        }

        @keyframes bohemikaLoaderPayoutCore {
          0%, 100% { box-shadow: 0 15px 26px rgba(59, 7, 100, 0.3), inset 1px 1px rgba(255, 255, 255, 0.24), 0 0 0 8px rgba(217, 70, 239, 0.06); }
          50% { box-shadow: 0 17px 29px rgba(59, 7, 100, 0.34), inset 1px 1px rgba(255, 255, 255, 0.3), 0 0 0 13px rgba(217, 70, 239, 0.12), 0 0 25px rgba(232, 121, 249, 0.38); }
        }

        @media (max-width: 640px) {
          .bohemika-loader-scene { min-height: 132px; }
          .bohemika-loader-candle-chart { left: 6%; right: 6%; }
        }

        @media (prefers-reduced-motion: reduce) {
          .bohemika-loader-aura,
          .bohemika-loader-orbit,
          .bohemika-loader-particle,
          .bohemika-loader-trend path,
          .bohemika-loader-candle-wick,
          .bohemika-loader-candle-body,
          .bohemika-loader-candle-flare,
          .bohemika-loader-payout-trail::before,
          .bohemika-loader-payout-card,
          .bohemika-loader-payout-core { animation: none; }

          .bohemika-loader-candle-wick,
          .bohemika-loader-candle-body { opacity: 1; transform: translateX(-50%) scaleY(1); }

          .bohemika-loader-candle-body { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
