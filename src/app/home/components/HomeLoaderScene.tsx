type Props = {
  type: "production" | "payout";
};

const productionBars = [
  { x: 36, y: 91, height: 35, delay: "-1.8s" },
  { x: 76, y: 74, height: 52, delay: "-1.45s" },
  { x: 116, y: 84, height: 42, delay: "-1.1s" },
  { x: 156, y: 58, height: 68, delay: "-0.75s" },
  { x: 196, y: 69, height: 57, delay: "-0.4s" },
  { x: 236, y: 43, height: 83, delay: "-0.05s" },
] as const;

function ProductionDataPreview() {
  return (
    <div className="bohemika-production-preview">
      <div className="bohemika-production-preview__topline absolute left-[15px] top-[13px] z-[3] flex items-center text-[9px] font-bold uppercase tracking-[0.13em] text-cyan-100/85">
        <span className="bohemika-production-preview__live inline-flex items-center gap-1.5">
          <i className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
          Živý přehled
        </span>
      </div>

      <div className="bohemika-production-preview__chart">
        <span className="bohemika-production-preview__scan" />
        <svg viewBox="0 0 280 142" preserveAspectRatio="none">
          <defs>
            <linearGradient id="productionArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="productionLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#67e8f9" />
              <stop offset="48%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#f0abfc" />
            </linearGradient>
            <linearGradient id="productionBar" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#4338ca" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.62" />
            </linearGradient>
          </defs>

          <g
            className="bohemika-production-preview__grid"
            fill="none"
            stroke="rgba(221, 214, 254, 0.09)"
            strokeWidth="1"
            strokeDasharray="3 5"
          >
            <path d="M8 30 H272" />
            <path d="M8 63 H272" />
            <path d="M8 96 H272" />
            <path d="M8 126 H272" />
          </g>

          <g className="bohemika-production-preview__bars">
            {productionBars.map((bar) => (
              <rect
                key={bar.x}
                x={bar.x}
                y={bar.y}
                width="18"
                height={bar.height}
                rx="7"
                fill="url(#productionBar)"
                style={{ animationDelay: bar.delay }}
              />
            ))}
          </g>

          <path
            className="bohemika-production-preview__area"
            d="M10 112 C32 108 45 98 62 100 C82 103 91 86 108 88 C128 91 136 71 154 73 C175 76 187 55 204 58 C226 62 235 36 270 27 L270 132 L10 132 Z"
            fill="url(#productionArea)"
          />
          <path
            className="bohemika-production-preview__line"
            d="M10 112 C32 108 45 98 62 100 C82 103 91 86 108 88 C128 91 136 71 154 73 C175 76 187 55 204 58 C226 62 235 36 270 27"
            fill="none"
            stroke="url(#productionLine)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            className="bohemika-production-preview__point"
            cx="270"
            cy="27"
            r="4"
            fill="#f5d0fe"
            stroke="rgba(255, 255, 255, 0.92)"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      <div className="bohemika-production-preview__metrics absolute bottom-[11px] left-[15px] right-[15px] z-[3] flex items-center gap-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-violet-100/55">
        <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-cyan-300" />Smlouvy</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-violet-300" />Provize</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-fuchsia-300" />Trend</span>
      </div>
    </div>
  );
}

function PayoutFlow() {
  return (
    <div className="bohemika-payout-preview">
      <span className="bohemika-payout-preview__trail" />
      <span className="bohemika-payout-preview__card bohemika-payout-preview__card--a">
        <i />
        <b />
      </span>
      <span className="bohemika-payout-preview__card bohemika-payout-preview__card--b">
        <i />
        <b />
      </span>
      <span className="bohemika-payout-preview__core">
        <i />
      </span>
    </div>
  );
}

export function HomeLoaderScene({ type }: Props) {
  return (
    <div className={`bohemika-loader-scene bohemika-loader-scene--${type}`} aria-hidden="true">
      {type === "production" ? <ProductionDataPreview /> : <PayoutFlow />}

      <style jsx global>{`
        .bohemika-loader-scene {
          position: relative;
          min-width: 0;
          min-height: 158px;
          isolation: isolate;
        }

        .bohemika-production-preview {
          position: absolute;
          inset: 0;
          overflow: hidden;
          border: 1px solid rgba(196, 181, 253, 0.16);
          border-radius: 22px;
          background:
            radial-gradient(circle at 78% 12%, rgba(167, 139, 250, 0.16), transparent 34%),
            linear-gradient(155deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.018));
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            0 20px 40px rgba(5, 3, 22, 0.2);
          backdrop-filter: blur(12px);
        }

        .bohemika-production-preview::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(112deg, transparent 18%, rgba(255, 255, 255, 0.055) 46%, transparent 68%);
          transform: translateX(-100%);
          animation: bohemikaProductionSurfaceSweep 3.8s ease-in-out infinite;
          pointer-events: none;
        }

        .bohemika-production-preview__live i {
          box-shadow: 0 0 0 4px rgba(103, 232, 249, 0.08), 0 0 12px rgba(103, 232, 249, 0.42);
          animation: bohemikaProductionLiveDot 1.9s ease-in-out infinite;
        }

        .bohemika-production-preview__chart {
          position: absolute;
          top: 34px;
          right: 13px;
          bottom: 27px;
          left: 13px;
          overflow: hidden;
        }

        .bohemika-production-preview__chart svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .bohemika-production-preview__bars rect {
          transform-box: fill-box;
          transform-origin: center bottom;
          animation: bohemikaProductionBar 2.9s cubic-bezier(0.34, 1, 0.64, 1) infinite;
        }

        .bohemika-production-preview__area {
          opacity: 0.68;
          animation: bohemikaProductionArea 3.2s ease-in-out infinite;
        }

        .bohemika-production-preview__line {
          stroke-dasharray: 360;
          stroke-dashoffset: 360;
          filter: drop-shadow(0 0 5px rgba(167, 139, 250, 0.45));
          animation: bohemikaProductionLine 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .bohemika-production-preview__point {
          filter: drop-shadow(0 0 6px rgba(240, 171, 252, 0.9));
          transform-box: fill-box;
          transform-origin: center;
          animation: bohemikaProductionPoint 1.8s ease-in-out infinite;
        }

        .bohemika-production-preview__scan {
          position: absolute;
          z-index: 2;
          top: 3px;
          bottom: 1px;
          left: 0;
          width: 1px;
          background: linear-gradient(180deg, transparent, rgba(103, 232, 249, 0.62), transparent);
          box-shadow: 0 0 10px rgba(103, 232, 249, 0.28);
          opacity: 0;
          animation: bohemikaProductionScan 3.2s ease-in-out infinite;
        }

        .bohemika-payout-preview {
          position: absolute;
          inset: 0;
          overflow: hidden;
          border-radius: 22px;
          background: radial-gradient(circle at 50% 50%, rgba(217, 70, 239, 0.16), transparent 58%);
        }

        .bohemika-payout-preview__trail {
          position: absolute;
          top: 50%;
          right: 14%;
          left: 14%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(232, 121, 249, 0.48), transparent);
        }

        .bohemika-payout-preview__card {
          position: absolute;
          width: 66px;
          height: 42px;
          border: 1px solid rgba(255, 255, 255, 0.7);
          border-radius: 10px;
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(250, 232, 255, 0.78));
          box-shadow: 0 14px 25px rgba(49, 10, 83, 0.18);
          animation: bohemikaPayoutCard 3s ease-in-out infinite;
        }

        .bohemika-payout-preview__card i,
        .bohemika-payout-preview__card b {
          position: absolute;
          left: 10px;
          display: block;
          height: 4px;
          border-radius: 99px;
        }

        .bohemika-payout-preview__card i { top: 12px; width: 24px; background: #d946ef; }
        .bohemika-payout-preview__card b { top: 23px; width: 38px; background: rgba(49, 10, 83, 0.16); }
        .bohemika-payout-preview__card--a { top: 18%; left: 12%; transform: rotate(-8deg); }
        .bohemika-payout-preview__card--b { right: 10%; bottom: 14%; transform: rotate(9deg); animation-delay: -1.4s; }

        .bohemika-payout-preview__core {
          position: absolute;
          z-index: 2;
          top: 50%;
          left: 50%;
          width: 68px;
          height: 68px;
          border: 1px solid rgba(255, 255, 255, 0.36);
          border-radius: 22px;
          background: linear-gradient(145deg, #6b21a8, #2e1065 64%, #16062c);
          box-shadow: 0 16px 30px rgba(59, 7, 100, 0.34), 0 0 0 9px rgba(217, 70, 239, 0.07);
          transform: translate(-50%, -50%) rotate(-4deg);
          animation: bohemikaPayoutCore 2.6s ease-in-out infinite;
        }

        .bohemika-payout-preview__core i {
          position: absolute;
          top: 24px;
          left: 23px;
          width: 22px;
          height: 12px;
          border-bottom: 3px solid white;
          border-left: 3px solid white;
          transform: rotate(-45deg);
        }

        @keyframes bohemikaProductionSurfaceSweep {
          0%, 20% { opacity: 0; transform: translateX(-100%); }
          48% { opacity: 1; }
          78%, 100% { opacity: 0; transform: translateX(100%); }
        }

        @keyframes bohemikaProductionLiveDot {
          0%, 100% { opacity: 0.56; transform: scale(0.82); }
          50% { opacity: 1; transform: scale(1); }
        }

        @keyframes bohemikaProductionBar {
          0%, 100% { opacity: 0.38; transform: scaleY(0.48); }
          38%, 72% { opacity: 0.9; transform: scaleY(1); }
        }

        @keyframes bohemikaProductionArea {
          0%, 15%, 100% { opacity: 0.18; }
          48%, 76% { opacity: 0.7; }
        }

        @keyframes bohemikaProductionLine {
          0%, 14% { opacity: 0; stroke-dashoffset: 360; }
          46%, 78% { opacity: 1; stroke-dashoffset: 0; }
          100% { opacity: 0.25; stroke-dashoffset: -20; }
        }

        @keyframes bohemikaProductionPoint {
          0%, 100% { opacity: 0.55; transform: scale(0.78); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        @keyframes bohemikaProductionScan {
          0%, 16% { left: 0; opacity: 0; }
          28% { opacity: 0.72; }
          78% { opacity: 0.52; }
          92%, 100% { left: 100%; opacity: 0; }
        }

        @keyframes bohemikaPayoutCard {
          0%, 100% { opacity: 0.3; translate: 0 5px; }
          50% { opacity: 0.92; translate: 0 -4px; }
        }

        @keyframes bohemikaPayoutCore {
          0%, 100% { scale: 0.96; }
          50% { scale: 1.03; }
        }

        @media (max-width: 767px) {
          .bohemika-loader-scene { min-height: 152px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .bohemika-production-preview::before,
          .bohemika-production-preview__live i,
          .bohemika-production-preview__bars rect,
          .bohemika-production-preview__area,
          .bohemika-production-preview__line,
          .bohemika-production-preview__point,
          .bohemika-production-preview__scan,
          .bohemika-payout-preview__card,
          .bohemika-payout-preview__core {
            animation: none;
          }

          .bohemika-production-preview__line { stroke-dashoffset: 0; opacity: 1; }
          .bohemika-production-preview__bars rect { opacity: 0.9; transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
