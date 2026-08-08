// src/app/pomucky/srovnavac-trvalych-nasledku/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Calculator,
  ChartNoAxesColumn,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Files,
  Loader2,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { formatMoney } from "@/app/lib/formatters";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
  institutionLogoKeyFromInsurerName,
} from "@/app/lib/institutionLogoDisplay";

let html2pdfPromise: Promise<any> | null = null;

async function getHtml2Pdf() {
  if (!html2pdfPromise) {
    html2pdfPromise = import("html2pdf.js").then(
      (mod: unknown) =>
        (mod as { default?: unknown }).default ??
        (mod as Record<string, unknown>)
    );
  }
  return html2pdfPromise;
}

const TN_ACTIVE_DARK_CLASS =
  "border-slate-950 bg-[linear-gradient(135deg,#111827_0%,#211442_54%,#090d1c_100%)] text-[#f8fafc] shadow-[0_12px_26px_rgba(18,12,43,0.24)]";
const TN_ACTIVE_VIOLET_CLASS =
  "border-violet-500 bg-[linear-gradient(135deg,#7c3aed_0%,#a855f7_56%,#c084fc_100%)] text-[#f8fafc] shadow-[0_12px_26px_rgba(124,58,237,0.28)]";
const TN_INACTIVE_CHIP_CLASS =
  "border-violet-100 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50/80";

type ComparisonCard = {
  key: string;
  insurer: string;
  badges: string[];
  payout: number;
  info: string;
  infoSections?: InfoSection[];
  tablePreview?: InfoTablePreview;
  diagnosisExamples?: DiagnosisExample[];
  filterYears?: string[];
  curve: PayoutCurvePoint[];
};

type ComparisonCardBase = Omit<ComparisonCard, "curve">;

type InfoSection = {
  title: string;
  body?: string;
  items?: string[];
  emphasis?: boolean;
};

type InfoTablePreview = {
  title: string;
  columns: string[];
  rows: InfoTablePreviewRow[];
};

type InfoTablePreviewRow = {
  cells: string[];
  active?: boolean;
};

type PayoutCurvePoint = {
  percent: number;
  payoutPercent: number;
};

type DiagnosisExample = {
  percent: number;
  title: string;
  note: string;
};

type InsurerFilterOption = {
  value: string;
  productName: string;
  badges: string[];
};

type InsurerFilterGroup = {
  insurerName: string;
  options: InsurerFilterOption[];
};

const parseNumber = (val: string): number => {
  const num = Number(val.replace(",", ".").replace(/\s+/g, ""));
  return Number.isFinite(num) ? num : NaN;
};

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

const parsePercentInput = (raw: string): number => {
  const parsed = parseNumber(raw);
  if (!Number.isFinite(parsed)) return 0;
  return clampPercent(parsed);
};

const formatPercent = (value: number): string =>
  `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;

const formatTablePercent = (value: number): string =>
  `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 3 })} %`;

const roundedPercentIndex = (value: number): number =>
  Math.min(100, Math.max(0, Math.round(value)));

const CPP_NEON_DIAGNOSIS_EXAMPLES: DiagnosisExample[] = [
  {
    percent: 15,
    title: "Traumatická ztráta čočky v jednom oku",
    note: "Položka 20, rozsah 15 %",
  },
  {
    percent: 30,
    title: "Ztráta mluvy následkem poškození ústrojí mluvy",
    note: "Položka 64, rozsah 30 %",
  },
  {
    percent: 70,
    title: "Ztráta jedné ledviny při nefunkčnosti druhé ledviny",
    note: "Položka 86, rozsah 70 %",
  },
];

const buildPayoutCurve = (
  getPayoutPercent: (percent: number) => number
): PayoutCurvePoint[] =>
  Array.from({ length: 101 }, (_, percent) => ({
    percent,
    payoutPercent: Math.max(0, getPayoutPercent(percent)),
  }));

const getNearestCurvePoint = (
  points: PayoutCurvePoint[],
  percent: number
): PayoutCurvePoint => {
  const index = roundedPercentIndex(percent);
  return points[index] ?? points[points.length - 1] ?? { percent: 0, payoutPercent: 0 };
};

const getChartAxisMax = (maxValue: number) => {
  const baseMax = Math.max(100, maxValue);
  const step = baseMax <= 500 ? 100 : 200;
  return Math.ceil(baseMax / step) * step;
};

function PayoutCurveChart({
  points,
  currentPercent,
  maxPayoutPercent,
  sumInsured,
  diagnosisExamples = [],
}: {
  points: PayoutCurvePoint[];
  currentPercent: number;
  maxPayoutPercent: number;
  sumInsured: number;
  diagnosisExamples?: DiagnosisExample[];
}) {
  const width = 860;
  const height = 380;
  const paddingLeft = 62;
  const paddingRight = 28;
  const paddingTop = 30;
  const paddingBottom = 52;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [inspectedPercent, setInspectedPercent] = useState<number | null>(null);
  const safeMax = getChartAxisMax(maxPayoutPercent);
  const currentPoint = getNearestCurvePoint(points, currentPercent);
  const activePoint =
    inspectedPercent === null
      ? currentPoint
      : getNearestCurvePoint(points, inspectedPercent);
  const isInspecting = inspectedPercent !== null;
  const activePayout = sumInsured * (activePoint.payoutPercent / 100);
  const maxPoint = points.reduce<PayoutCurvePoint>(
    (highest, point) =>
      point.payoutPercent > highest.payoutPercent ? point : highest,
    points[0] ?? { percent: 0, payoutPercent: 0 }
  );
  const toX = (percent: number) =>
    paddingLeft +
    (clampPercent(percent) / 100) * (width - paddingLeft - paddingRight);
  const toY = (payoutPercent: number) =>
    height -
    paddingBottom -
    (Math.min(safeMax, Math.max(0, payoutPercent)) / safeMax) *
      (height - paddingTop - paddingBottom);
  const pathPoints = points.map((point) => ({
    x: toX(point.percent),
    y: toY(point.payoutPercent),
  }));
  const linePath = pathPoints
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    )
    .join(" ");
  const areaPath =
    pathPoints.length > 0
      ? `${linePath} L ${pathPoints[pathPoints.length - 1].x.toFixed(2)} ${(height - paddingBottom).toFixed(2)} L ${pathPoints[0].x.toFixed(2)} ${(height - paddingBottom).toFixed(2)} Z`
      : "";
  const activeX = toX(activePoint.percent);
  const activeY = toY(activePoint.payoutPercent);
  const currentX = toX(currentPoint.percent);
  const currentY = toY(currentPoint.payoutPercent);
  const maxX = toX(maxPoint.percent);
  const maxY = toY(maxPoint.payoutPercent);
  const labelWidth = 154;
  const labelHeight = 62;
  const labelX =
    activeX + labelWidth + 18 > width - paddingRight
      ? Math.max(paddingLeft + 8, activeX - labelWidth - 16)
      : activeX + 16;
  const labelY = Math.min(
    height - paddingBottom - labelHeight - 6,
    Math.max(paddingTop + 6, activeY - labelHeight - 14)
  );
  const yTicks = Array.from({ length: 5 }, (_, index) =>
    Math.round((safeMax / 4) * index)
  );
  const xTicks = [0, 25, 50, 75, 100];
  const diagnosisPoints = diagnosisExamples.map((example, index) => {
    const point = getNearestCurvePoint(points, example.percent);
    return {
      ...example,
      index,
      point,
      x: toX(point.percent),
      y: toY(point.payoutPercent),
    };
  });
  const getPercentFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return currentPoint.percent;

    const scale = Math.min(bounds.width / width, bounds.height / height);
    const renderedWidth = width * scale;
    const horizontalOffset = (bounds.width - renderedWidth) / 2;
    const svgX = ((event.clientX - bounds.left - horizontalOffset) / renderedWidth) * width;
    const ratio =
      (svgX - paddingLeft) / (width - paddingLeft - paddingRight);
    return roundedPercentIndex(ratio * 100);
  };
  const updateInspectedPercentFromPointer = (
    event: PointerEvent<SVGSVGElement>
  ) => {
    setInspectedPercent(getPercentFromPointer(event));
  };
  const handleChartKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const basePercent = inspectedPercent ?? currentPoint.percent;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setInspectedPercent(roundedPercentIndex(basePercent - 1));
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setInspectedPercent(roundedPercentIndex(basePercent + 1));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setInspectedPercent(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setInspectedPercent(100);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setInspectedPercent(null);
    }
  };

  return (
    <div className="rounded-3xl border border-violet-100 bg-[linear-gradient(180deg,#ffffff_0%,#faf5ff_100%)] p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            Průběh plnění
          </div>
          <div className="mt-1 text-base font-black text-slate-950">
            Křivka podle rozsahu trvalých následků
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            Osa X = rozsah TN, osa Y = plnění z pojistné částky.
          </div>
        </div>
        <div className="rounded-2xl border border-fuchsia-200 bg-white px-3 py-2 text-right shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-600">
            {isInspecting ? "Vybraný bod" : "Aktuálně"}
          </div>
          <div className="mt-1 text-base font-black leading-none text-fuchsia-950">
            {formatTablePercent(activePoint.payoutPercent)}
          </div>
          <div className="mt-1 text-sm font-black leading-none text-slate-950">
            {formatMoney(activePayout)}
          </div>
          <div className="mt-1 text-[11px] font-bold text-fuchsia-700">
            při {formatPercent(activePoint.percent)} TN
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[24px] border border-violet-100 bg-white p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="h-[21rem] w-full cursor-crosshair touch-none focus:outline-none focus:ring-2 focus:ring-fuchsia-300 sm:h-[24rem]"
          role="img"
          aria-label={`Graf plnění při ${formatPercent(activePoint.percent)}: ${formatTablePercent(activePoint.payoutPercent)}, ${formatMoney(activePayout)}`}
          tabIndex={0}
          onPointerDown={updateInspectedPercentFromPointer}
          onPointerMove={updateInspectedPercentFromPointer}
          onPointerLeave={() => setInspectedPercent(null)}
          onKeyDown={handleChartKeyDown}
        >
          <title>{`Graf plnění při ${formatPercent(activePoint.percent)}: ${formatTablePercent(activePoint.payoutPercent)}, ${formatMoney(activePayout)}`}</title>
          <defs>
            <linearGradient id="tnPayoutAreaGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#d946ef" stopOpacity="0.3" />
              <stop offset="58%" stopColor="#a855f7" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id="tnPayoutLineGradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="54%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#db2777" />
            </linearGradient>
          </defs>
          <rect
            x={paddingLeft}
            y={paddingTop}
            width={width - paddingLeft - paddingRight}
            height={height - paddingTop - paddingBottom}
            rx="18"
            className="fill-violet-50/45"
          />
          {yTicks.map((tick) => {
            const y = toY(tick);
            return (
              <g key={tick}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  className="stroke-white"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[11px] font-bold"
                >
                  {tick} %
                </text>
              </g>
            );
          })}
          {xTicks.map((tick) => {
            const x = toX(tick);
            return (
              <g key={tick}>
                <line
                  x1={x}
                  y1={paddingTop}
                  x2={x}
                  y2={height - paddingBottom}
                  className="stroke-white"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={height - 16}
                  textAnchor="middle"
                  className="fill-slate-400 text-[11px] font-bold"
                >
                  {tick} %
                </text>
              </g>
            );
          })}
          <line
            x1={paddingLeft}
            y1={height - paddingBottom}
            x2={width - paddingRight}
            y2={height - paddingBottom}
            className="stroke-slate-200"
            strokeWidth="1.5"
          />
          <line
            x1={paddingLeft}
            y1={paddingTop}
            x2={paddingLeft}
            y2={height - paddingBottom}
            className="stroke-slate-200"
            strokeWidth="1.5"
          />
          <path d={areaPath} fill="url(#tnPayoutAreaGradient)" />
          <path
            d={linePath}
            fill="none"
            stroke="url(#tnPayoutLineGradient)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
          />
          <circle
            cx={maxX}
            cy={maxY}
            r="4.5"
            className="fill-white stroke-violet-500"
            strokeWidth="2.5"
          />
          {diagnosisPoints.map((example) => {
            const badgeY = Math.max(paddingTop + 12, example.y - 15);
            return (
              <g key={`${example.percent}-${example.title}`}>
                <line
                  x1={example.x}
                  y1={example.y}
                  x2={example.x}
                  y2={height - paddingBottom}
                  className="stroke-violet-300"
                  strokeDasharray="3 5"
                  strokeWidth="1.5"
                />
                <circle
                  cx={example.x}
                  cy={example.y}
                  r="6"
                  className="fill-white stroke-violet-600"
                  strokeWidth="3"
                />
                <circle
                  cx={example.x}
                  cy={example.y}
                  r="3"
                  className="fill-violet-600"
                />
                <rect
                  x={example.x - 8}
                  y={badgeY - 10}
                  width="16"
                  height="16"
                  rx="8"
                  className="fill-slate-950"
                />
                <text
                  x={example.x}
                  y={badgeY + 2}
                  textAnchor="middle"
                  className="fill-white text-[9px] font-black"
                >
                  {example.index + 1}
                </text>
              </g>
            );
          })}
          <g>
            <line
              x1={currentX}
              y1={paddingTop}
              x2={currentX}
              y2={height - paddingBottom}
              className="stroke-fuchsia-300"
              strokeDasharray="6 6"
              strokeWidth="2"
            />
            <circle
              cx={currentX}
              cy={currentY}
              r="6"
              className="fill-white stroke-fuchsia-500"
              strokeWidth="3"
            />
          </g>
          {isInspecting && activePoint.percent !== currentPoint.percent ? (
            <g>
              <line
                x1={activeX}
                y1={paddingTop}
                x2={activeX}
                y2={height - paddingBottom}
                className="stroke-violet-400"
                strokeDasharray="4 4"
                strokeWidth="2"
              />
              <circle
                cx={activeX}
                cy={activeY}
                r="7"
                className="fill-violet-600 stroke-white"
                strokeWidth="3"
              />
            </g>
          ) : null}
          <rect
            x={labelX}
            y={labelY}
            width={labelWidth}
            height={labelHeight}
            rx="14"
            className="fill-white stroke-fuchsia-200"
            strokeWidth="1.5"
          />
          <text
            x={labelX + 12}
            y={labelY + 18}
            className="fill-fuchsia-600 text-[10px] font-black uppercase tracking-[0.1em]"
          >
            {isInspecting ? "Vybraný bod" : "Aktuální bod"}
          </text>
          <text
            x={labelX + 12}
            y={labelY + 34}
            className="fill-slate-950 text-[12px] font-black"
          >
            {formatPercent(activePoint.percent)} / {formatTablePercent(activePoint.payoutPercent)}
          </text>
          <text
            x={labelX + 12}
            y={labelY + 50}
            className="fill-slate-700 text-[11px] font-black"
          >
            {formatMoney(activePayout)}
          </text>
        </svg>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] font-bold text-slate-500">
          <span>Rozsah TN 0-100 %</span>
          <span>Maximum varianty: {formatTablePercent(maxPoint.payoutPercent)}</span>
        </div>
        {diagnosisPoints.length > 0 ? (
          <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/55 p-3">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
              Příklady diagnóz ČPP Neon
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {diagnosisPoints.map((example) => {
                const selected = activePoint.percent === example.point.percent;

                return (
                  <button
                    key={`${example.percent}-${example.title}-legend`}
                    type="button"
                    onClick={() => setInspectedPercent(example.point.percent)}
                    className={`rounded-xl border px-3 py-2 text-left shadow-sm transition hover:border-fuchsia-200 hover:bg-fuchsia-50/70 ${
                      selected
                        ? "border-fuchsia-300 bg-fuchsia-50 ring-1 ring-fuchsia-200"
                        : "border-white bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[10px] font-black text-white">
                        {example.index + 1}
                      </span>
                      <span className="text-[11px] font-black text-fuchsia-700">
                        {formatPercent(example.point.percent)} TN
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-black leading-snug text-slate-950">
                      {example.title}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold leading-snug text-slate-500">
                      {example.note}
                    </div>
                    <div className="mt-1 text-[11px] font-black text-violet-700">
                      Plnění {formatTablePercent(example.point.payoutPercent)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const percentValueRows = (
  table: number[],
  currentPercent: number
): InfoTablePreviewRow[] => {
  const activeIndex = roundedPercentIndex(currentPercent);

  return table.slice(1).map((payoutPercent, index) => {
    const percent = index + 1;
    return {
      cells: [formatTablePercent(percent), formatTablePercent(payoutPercent)],
      active: activeIndex === percent,
    };
  });
};

const buildPercentValueTablePreview = (
  title: string,
  table: number[],
  currentPercent: number
): InfoTablePreview => ({
  title,
  columns: ["TN", "Plnění z pojistné částky"],
  rows: percentValueRows(table, currentPercent),
});

const buildMultiPercentValueTablePreview = (
  title: string,
  columns: string[],
  tables: number[][],
  currentPercent: number
): InfoTablePreview => {
  const activeIndex = roundedPercentIndex(currentPercent);

  return {
    title,
    columns: ["TN", ...columns],
    rows: Array.from({ length: 100 }, (_, index) => {
      const percent = index + 1;
      return {
        cells: [
          formatTablePercent(percent),
          ...tables.map((table) => formatTablePercent(table[percent] ?? 0)),
        ],
        active: activeIndex === percent,
      };
    }),
  };
};

const buildRangeTablePreview = (
  title: string,
  columns: string[],
  rows: InfoTablePreviewRow[]
): InfoTablePreview => ({
  title,
  columns,
  rows,
});

const buildHalfStepValueTablePreview = (
  title: string,
  rows: Array<{ p: number; c: number }>,
  currentPercent: number
): InfoTablePreview => {
  const activePercent = Math.round(clampPercent(currentPercent) * 2) / 2;

  return {
    title,
    columns: ["TN", "Plnění z pojistné částky"],
    rows: rows.map((row) => ({
      cells: [formatTablePercent(row.p), formatTablePercent(row.c)],
      active: row.p === activePercent,
    })),
  };
};

const buildAnchorValueTablePreview = (
  title: string,
  anchors: Array<{ p: number; v: number }>,
  currentPercent: number
): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return {
    title,
    columns: ["TN", "Plnění z pojistné částky"],
    rows: anchors.map((anchor, index) => {
      const next = anchors[index + 1];
      return {
        cells: [formatTablePercent(anchor.p), formatTablePercent(anchor.v)],
        active:
          clamped === anchor.p ||
          (next ? clamped > anchor.p && clamped < next.p : clamped > anchor.p),
      };
    }),
  };
};

const buildAnchorMultiplierTablePreview = (
  title: string,
  anchors: Array<{ p: number; m: number }>,
  currentPercent: number
): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return {
    title,
    columns: ["TN", "Násobek"],
    rows: anchors.map((anchor, index) => {
      const next = anchors[index + 1];
      return {
        cells: [formatTablePercent(anchor.p), `${anchor.m.toLocaleString("cs-CZ")}×`],
        active:
          clamped === anchor.p ||
          (next ? clamped > anchor.p && clamped < next.p : clamped > anchor.p),
      };
    }),
  };
};

const stripUnsupportedColorFunctions = (input: string): string =>
  input.replace(/(?:oklch|lab)\([^)]*\)/gi, "#0f172a");

const getInsurerLogoPath = (insurer: string): string | null => {
  const normalized = insurer.toLowerCase();
  if (normalized.includes("you plus") || normalized.includes("youplus")) {
    return "/icons/youplus.png";
  }
  if (normalized.includes("čpp") || normalized.includes("cpp")) return "/icons/cpp.png";
  if (normalized.includes("uniqa")) return "/icons/uniqa.png";
  if (normalized.includes("nn")) return "/icons/nn.png";
  if (normalized.includes("kooperativa")) return "/icons/koop-v2.png";
  if (normalized.includes("pillow")) return "/icons/pillow.png";
  if (normalized.includes("generali")) return "/icons/generali.png";
  if (normalized.includes("metlife")) return "/icons/metlife.png";
  if (normalized.includes("allianz")) return "/icons/allianz.png";
  if (normalized.includes("axa")) return "/icons/axalogo.png";
  if (normalized.includes("slavia")) return "/icons/slavialogo.png";
  if (normalized.includes("comfort") || normalized.includes("commodity")) {
    return "/icons/cclogo.png";
  }
  if (normalized.includes("maxima")) return "/icons/maxima.png";
  if (normalized.includes("čsob") || normalized.includes("csob")) return "/icons/csb.png";
  if (normalized.includes("simplea")) return "/icons/simplea.png";
  return null;
};

const splitInsurerAndProduct = (value: string): { insurerName: string; productName: string } => {
  const insurerPrefixes = [
    "ČPP",
    "UNIQA",
    "Kooperativa",
    "MetLife",
    "ČSOB",
    "Generali",
    "NN",
    "Maxima",
    "Allianz",
    "AXA",
    "Slavia",
    "Comfort Commodity",
    "Simplea",
    "Pillow",
    "YOU PLUS",
  ];

  const lower = value.toLowerCase();
  const matched = insurerPrefixes.find((prefix) => lower.startsWith(prefix.toLowerCase()));
  if (!matched) {
    return { insurerName: value, productName: value };
  }

  const productName = value.slice(matched.length).trim();
  return {
    insurerName: matched,
    productName: productName || value,
  };
};

const splitProductYearBadge = (value: string): { productName: string; yearBadge: string | null } => {
  const match = value.match(/^(.*\S)\s+(\d{4}(?:[-–]\d{4})?|\d{1,2}\/\d{4})$/);
  if (!match) return { productName: value, yearBadge: null };

  return {
    productName: match[1],
    yearBadge: match[2].replace("-", "–"),
  };
};

const isYearBadge = (value: string): boolean =>
  /^\d{4}(?:[-–](?:\d{4}|\d{1,2}\.\d{1,2}\.\d{4}))?$/.test(value) ||
  /^\d{1,2}\/\d{4}$/.test(value) ||
  /^\d{1,2}\.\d{1,2}\.\d{4}(?:[-–](?:\d{4}|\d{1,2}\.\d{1,2}\.\d{4}))?$/.test(value);

const normalizeYearBadge = (value: string): string => value.replaceAll("-", "–");

const getCardFilterYearBadges = (card: Pick<ComparisonCard, "badges" | "filterYears">): string[] => {
  const years = card.filterYears?.length
    ? card.filterYears
    : card.badges.filter(isYearBadge);

  return Array.from(new Set(years.map(normalizeYearBadge)));
};

const getCardFilterOptions = (
  card: Pick<ComparisonCard, "insurer" | "badges" | "filterYears">
): Array<{ value: string; badges: string[] }> => {
  const yearBadges = getCardFilterYearBadges(card);

  if (yearBadges.length === 0) {
    return [{ value: `${card.insurer}::without-year`, badges: [] }];
  }

  return yearBadges.map((yearBadge) => ({
    value: `${card.insurer}::${yearBadge}`,
    badges: [yearBadge],
  }));
};

const formatKcInput = (value: number): string =>
  Math.round(value).toLocaleString("cs-CZ", { maximumFractionDigits: 0 });

const getMultiplierForRange = (percent: number): number => {
  if (percent <= 10) return 1;
  if (percent <= 20) return 2;
  if (percent <= 30) return 3;
  if (percent <= 40) return 4;
  if (percent <= 50) return 5;
  if (percent <= 60) return 6;
  if (percent <= 70) return 7;
  if (percent <= 80) return 8;
  if (percent <= 90) return 9;
  return 10;
};

const getMultiplierForRange5x = (percent: number): number => {
  if (percent <= 20) return 1;
  if (percent <= 40) return 2;
  if (percent <= 60) return 3;
  if (percent <= 80) return 4;
  return 5;
};

const CPP_EVOLUCE_5X_TABLE: Array<{ from: number; payoutPercent: number }> = [
  { from: 0.001, payoutPercent: 1 },
  { from: 5, payoutPercent: 5 },
  { from: 10, payoutPercent: 10 },
  { from: 15, payoutPercent: 15 },
  { from: 20, payoutPercent: 20 },
  { from: 25, payoutPercent: 25 },
  { from: 30, payoutPercent: 50 },
  { from: 35, payoutPercent: 70 },
  { from: 40, payoutPercent: 90 },
  { from: 45, payoutPercent: 120 },
  { from: 50, payoutPercent: 140 },
  { from: 55, payoutPercent: 160 },
  { from: 60, payoutPercent: 180 },
  { from: 65, payoutPercent: 220 },
  { from: 70, payoutPercent: 260 },
  { from: 75, payoutPercent: 290 },
  { from: 80, payoutPercent: 320 },
  { from: 85, payoutPercent: 380 },
  { from: 90, payoutPercent: 420 },
  { from: 95, payoutPercent: 460 },
  { from: 100, payoutPercent: 500 },
];

const getCppEvoluce5xPayoutPercent = (percent: number): number => {
  const clamped = clampPercent(percent);
  let payoutPercent = 0;

  for (const row of CPP_EVOLUCE_5X_TABLE) {
    if (clamped < row.from) break;
    payoutPercent = row.payoutPercent;
  }

  return payoutPercent;
};

const getMultiplierUniqaDomino = (percent: number): number => {
  if (percent <= 20) return 1;
  if (percent <= 30) return 2;
  if (percent <= 40) return 3;
  if (percent <= 50) return 4;
  if (percent <= 60) return 5;
  if (percent <= 70) return 6;
  if (percent <= 80) return 7;
  if (percent <= 90) return 8;
  if (percent < 100) return 9; // 90,1 % až 99,9 %
  return 10; // přesně 100 %
};

const getUniqaLogika2019Multiplier = (percent: number): number => {
  if (percent <= 25) return 1;
  if (percent <= 50) return 2;
  if (percent <= 75) return 3;
  return 4;
};

const getUniqaLogika2019Multiplier6x = (percent: number): number => {
  if (percent <= 25) return 1;
  if (percent <= 50) return 2;
  if (percent <= 75) return 3;
  if (percent <= 95) return 4;
  return 6;
};

const getUniqaLogika2019Multiplier10x = (percent: number): number => {
  if (percent <= 25) return 1;
  if (percent <= 40) return 2;
  if (percent <= 50) return 3;
  if (percent <= 60) return 4;
  if (percent <= 70) return 5;
  if (percent <= 80) return 6;
  if (percent <= 90) return 7;
  if (percent <= 95) return 8;
  if (percent < 100) return 9;
  return 10;
};

const getUniqaLogika2020Multiplier10x = (percent: number): number => {
  if (percent <= 20) return 1;
  if (percent <= 30) return 2;
  if (percent <= 40) return 3;
  if (percent <= 50) return 4;
  if (percent <= 60) return 5;
  if (percent <= 70) return 6;
  if (percent <= 80) return 7;
  if (percent <= 90) return 8;
  if (percent < 100) return 9;
  return 10;
};

const KOOP_FLEXI_TN10: Array<{ p: number; c: number }> = [
  { p: 0, c: 0 },
  { p: 0.5, c: 0.5 },
  { p: 1, c: 1 },
  { p: 1.5, c: 1.5 },
  { p: 2, c: 2 },
  { p: 2.5, c: 2.5 },
  { p: 3, c: 3 },
  { p: 3.5, c: 3.5 },
  { p: 4, c: 4 },
  { p: 4.5, c: 4.5 },
  { p: 5, c: 5 },
  { p: 5.5, c: 5.5 },
  { p: 6, c: 6 },
  { p: 6.5, c: 6.5 },
  { p: 7, c: 7 },
  { p: 7.5, c: 7.5 },
  { p: 8, c: 8 },
  { p: 8.5, c: 8.5 },
  { p: 9, c: 9 },
  { p: 9.5, c: 9.5 },
  { p: 10, c: 10 },
  { p: 10.5, c: 10.5 },
  { p: 11, c: 11 },
  { p: 11.5, c: 11.5 },
  { p: 12, c: 12 },
  { p: 12.5, c: 12.5 },
  { p: 13, c: 13 },
  { p: 13.5, c: 13.5 },
  { p: 14, c: 14 },
  { p: 14.5, c: 14.5 },
  { p: 15, c: 15 },
  { p: 15.5, c: 23.5 },
  { p: 16, c: 24 },
  { p: 16.5, c: 25 },
  { p: 17, c: 25.5 },
  { p: 17.5, c: 26.5 },
  { p: 18, c: 27 },
  { p: 18.5, c: 28 },
  { p: 19, c: 28.5 },
  { p: 19.5, c: 29.5 },
  { p: 20, c: 30 },
  { p: 20.5, c: 41 },
  { p: 21, c: 42 },
  { p: 21.5, c: 43 },
  { p: 22, c: 44 },
  { p: 22.5, c: 45 },
  { p: 23, c: 46 },
  { p: 23.5, c: 47 },
  { p: 24, c: 48 },
  { p: 24.5, c: 49 },
  { p: 25, c: 50 },
  { p: 25.5, c: 51 },
  { p: 26, c: 52 },
  { p: 26.5, c: 53 },
  { p: 27, c: 54 },
  { p: 27.5, c: 55 },
  { p: 28, c: 56 },
  { p: 28.5, c: 57 },
  { p: 29, c: 58 },
  { p: 29.5, c: 59 },
  { p: 30, c: 60 },
  { p: 30.5, c: 91.5 },
  { p: 31, c: 93 },
  { p: 31.5, c: 94.5 },
  { p: 32, c: 96 },
  { p: 32.5, c: 97.5 },
  { p: 33, c: 99 },
  { p: 33.5, c: 100.5 },
  { p: 34, c: 102 },
  { p: 34.5, c: 103.5 },
  { p: 35, c: 105 },
  { p: 35.5, c: 106.5 },
  { p: 36, c: 108 },
  { p: 36.5, c: 109.5 },
  { p: 37, c: 111 },
  { p: 37.5, c: 112.5 },
  { p: 38, c: 114 },
  { p: 38.5, c: 115.5 },
  { p: 39, c: 117 },
  { p: 39.5, c: 118.5 },
  { p: 40, c: 120 },
  { p: 40.5, c: 162 },
  { p: 41, c: 164 },
  { p: 41.5, c: 166 },
  { p: 42, c: 168 },
  { p: 42.5, c: 170 },
  { p: 43, c: 172 },
  { p: 43.5, c: 174 },
  { p: 44, c: 176 },
  { p: 44.5, c: 178 },
  { p: 45, c: 180 },
  { p: 45.5, c: 182 },
  { p: 46, c: 184 },
  { p: 46.5, c: 186 },
  { p: 47, c: 188 },
  { p: 47.5, c: 190 },
  { p: 48, c: 192 },
  { p: 48.5, c: 194 },
  { p: 49, c: 196 },
  { p: 49.5, c: 198 },
  { p: 50, c: 200 },
  { p: 50.5, c: 252.5 },
  { p: 51, c: 255 },
  { p: 51.5, c: 257.5 },
  { p: 52, c: 260 },
  { p: 52.5, c: 262.5 },
  { p: 53, c: 265 },
  { p: 53.5, c: 267.5 },
  { p: 54, c: 270 },
  { p: 54.5, c: 272.5 },
  { p: 55, c: 275 },
  { p: 55.5, c: 277.5 },
  { p: 56, c: 280 },
  { p: 56.5, c: 282.5 },
  { p: 57, c: 285 },
  { p: 57.5, c: 287.5 },
  { p: 58, c: 290 },
  { p: 58.5, c: 292.5 },
  { p: 59, c: 295 },
  { p: 59.5, c: 297.5 },
  { p: 60, c: 300 },
  { p: 60.5, c: 363 },
  { p: 61, c: 366 },
  { p: 61.5, c: 369 },
  { p: 62, c: 372 },
  { p: 62.5, c: 375 },
  { p: 63, c: 378 },
  { p: 63.5, c: 381 },
  { p: 64, c: 384 },
  { p: 64.5, c: 387 },
  { p: 65, c: 390 },
  { p: 65.5, c: 393 },
  { p: 66, c: 396 },
  { p: 66.5, c: 399 },
  { p: 67, c: 402 },
  { p: 67.5, c: 405 },
  { p: 68, c: 408 },
  { p: 68.5, c: 411 },
  { p: 69, c: 414 },
  { p: 69.5, c: 417 },
  { p: 70, c: 420 },
  { p: 70.5, c: 493.5 },
  { p: 71, c: 497 },
  { p: 71.5, c: 500.5 },
  { p: 72, c: 504 },
  { p: 72.5, c: 507.5 },
  { p: 73, c: 511 },
  { p: 73.5, c: 514.5 },
  { p: 74, c: 518 },
  { p: 74.5, c: 521.5 },
  { p: 75, c: 525 },
  { p: 75.5, c: 528.5 },
  { p: 76, c: 532 },
  { p: 76.5, c: 535.5 },
  { p: 77, c: 539 },
  { p: 77.5, c: 542.5 },
  { p: 78, c: 546 },
  { p: 78.5, c: 549.5 },
  { p: 79, c: 553 },
  { p: 79.5, c: 556.5 },
  { p: 80, c: 560 },
  { p: 80.5, c: 644 },
  { p: 81, c: 648 },
  { p: 81.5, c: 652 },
  { p: 82, c: 656 },
  { p: 82.5, c: 660 },
  { p: 83, c: 664 },
  { p: 83.5, c: 668 },
  { p: 84, c: 672 },
  { p: 84.5, c: 676 },
  { p: 85, c: 680 },
  { p: 85.5, c: 684 },
  { p: 86, c: 688 },
  { p: 86.5, c: 692 },
  { p: 87, c: 696 },
  { p: 87.5, c: 700 },
  { p: 88, c: 704 },
  { p: 88.5, c: 708 },
  { p: 89, c: 712 },
  { p: 89.5, c: 716 },
  { p: 90, c: 720 },
  { p: 90.5, c: 814.5 },
  { p: 91, c: 819 },
  { p: 91.5, c: 823.5 },
  { p: 92, c: 828 },
  { p: 92.5, c: 832.5 },
  { p: 93, c: 837 },
  { p: 93.5, c: 841.5 },
  { p: 94, c: 846 },
  { p: 94.5, c: 850.5 },
  { p: 95, c: 855 },
  { p: 95.5, c: 859.5 },
  { p: 96, c: 864 },
  { p: 96.5, c: 868.5 },
  { p: 97, c: 873 },
  { p: 97.5, c: 877.5 },
  { p: 98, c: 882 },
  { p: 98.5, c: 886.5 },
  { p: 99, c: 891 },
  { p: 99.5, c: 895.5 },
  { p: 100, c: 1000 },
];

const UNIQA_ZIVOT_RADOST_TABLE: number[] = [
  0, // 0 %
  1, // 1 %
  2, // 2 %
  3, // 3 %
  4, // 4 %
  6, // 5 %
  7, // 6 %
  8, // 7 %
  9, // 8 %
  10, // 9 %
  15, // 10 %
  16, // 11 %
  17, // 12 %
  18, // 13 %
  20, // 14 %
  22, // 15 %
  24, // 16 %
  26, // 17 %
  28, // 18 %
  30, // 19 %
  32, // 20 %
  42, // 21 %
  44, // 22 %
  46, // 23 %
  48, // 24 %
  50, // 25 %
  54, // 26 %
  58, // 27 %
  62, // 28 %
  66, // 29 %
  70, // 30 %
  93, // 31 %
  96, // 32 %
  99, // 33 %
  102, // 34 %
  105, // 35 %
  108, // 36 %
  113, // 37 %
  118, // 38 %
  123, // 39 %
  128, // 40 %
  164, // 41 %
  169, // 42 %
  174, // 43 %
  179, // 44 %
  184, // 45 %
  189, // 46 %
  194, // 47 %
  199, // 48 %
  204, // 49 %
  209, // 50 %
  255, // 51 %
  260, // 52 %
  265, // 53 %
  270, // 54 %
  275, // 55 %
  280, // 56 %
  290, // 57 %
  300, // 58 %
  310, // 59 %
  320, // 60 %
  366, // 61 %
  379, // 62 %
  392, // 63 %
  405, // 64 %
  418, // 65 %
  431, // 66 %
  444, // 67 %
  457, // 68 %
  470, // 69 %
  483, // 70 %
  496, // 71 %
  512, // 72 %
  528, // 73 %
  544, // 74 %
  560, // 75 %
  576, // 76 %
  592, // 77 %
  608, // 78 %
  624, // 79 %
  640, // 80 %
  656, // 81 %
  672, // 82 %
  688, // 83 %
  704, // 84 %
  720, // 85 %
  736, // 86 %
  752, // 87 %
  768, // 88 %
  784, // 89 %
  800, // 90 %
  910, // 91 %
  920, // 92 %
  930, // 93 %
  940, // 94 %
  950, // 95 %
  960, // 96 %
  970, // 97 %
  980, // 98 %
  990, // 99 %
  1000, // 100 %
];

const UNIQA_ACTIVELIFE_2019_324_TABLE: number[] = [
  0,
  1, 2, 3, 4, 6, 7, 8, 9, 10, 15,
  16, 18, 19, 21, 22, 24, 25, 27, 28, 30,
  31, 33, 34, 36, 37, 41, 44, 48, 51, 55,
  58, 62, 65, 69, 72, 76, 79, 83, 86, 90,
  93, 97, 100, 104, 107, 111, 114, 118, 121, 175,
  180, 186, 191, 197, 202, 208, 213, 219, 224, 230,
  235, 241, 246, 252, 257, 263, 268, 274, 279, 285,
  290, 296, 301, 307, 312, 320, 327, 335, 342, 350,
  357, 365, 372, 380, 387, 395, 402, 410, 417, 425,
  432, 440, 447, 455, 462, 470, 477, 485, 492, 500,
];

const UNIQA_ACTIVELIFE_2019_325_TABLE: number[] = [
  0,
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5,
  16, 18, 19, 21, 22, 24, 25, 27, 28, 30,
  31, 33, 34, 36, 37, 41, 44, 48, 51, 55,
  58, 62, 65, 69, 72, 76, 79, 83, 86, 90,
  93, 97, 100, 104, 107, 111, 114, 118, 121, 175,
  180, 186, 191, 197, 202, 208, 213, 219, 224, 230,
  235, 241, 246, 252, 257, 263, 268, 274, 279, 285,
  290, 296, 301, 307, 312, 320, 327, 335, 342, 350,
  357, 365, 372, 380, 387, 395, 402, 410, 417, 425,
  432, 440, 447, 455, 462, 470, 477, 485, 492, 500,
];

const getUniqaZivotRadostPercent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return UNIQA_ZIVOT_RADOST_TABLE[idx] ?? 0;
};

const getUniqaActiveLife2019324Percent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return UNIQA_ACTIVELIFE_2019_324_TABLE[idx] ?? 0;
};

const getUniqaActiveLife2019325Percent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return UNIQA_ACTIVELIFE_2019_325_TABLE[idx] ?? 0;
};

const AXA_ACTIVE_LIFE_2016_2021_324_324U_TABLE =
  UNIQA_ACTIVELIFE_2019_324_TABLE;
const AXA_ACTIVE_LIFE_2016_2021_325_325U_TABLE =
  UNIQA_ACTIVELIFE_2019_325_TABLE;

const getAxaActiveLife20162021Tarif324Percent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return AXA_ACTIVE_LIFE_2016_2021_324_324U_TABLE[idx] ?? 0;
};

const getAxaActiveLife20162021Tarif325Percent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return AXA_ACTIVE_LIFE_2016_2021_325_325U_TABLE[idx] ?? 0;
};

const getKooperativaFlexiPercent = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  const roundedHalf = Math.round(clamped * 2) / 2;
  const found = KOOP_FLEXI_TN10.find((row) => row.p === roundedHalf);
  return found?.c ?? 0;
};

const getKooperativaFlexi4Percent = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  const p = Math.round(clamped * 2) / 2; // krok 0,5 %
  if (p <= 25) return p; // 1×
  if (p <= 50) return p * 2; // 2×
  if (p <= 75) return p * 3; // 3×
  return p * 4; // 4×
};

const KOOPERATIVA_NA_PRANI_TN4_TABLE: number[] = [
  0,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 28, 31, 34, 37, 40,
  43, 46, 49, 52, 55, 58, 61, 64, 67, 70,
  73, 76, 79, 82, 85, 88, 91, 94, 97, 100,
  105, 110, 115, 120, 125, 130, 135, 140, 145, 150,
  155, 160, 165, 170, 175, 180, 185, 190, 195, 200,
  205, 210, 215, 220, 225, 231, 237, 243, 249, 255,
  262, 269, 276, 283, 290, 297, 304, 311, 318, 325,
  332, 339, 346, 353, 360, 368, 376, 384, 392, 400,
];

const KOOPERATIVA_NA_PRANI_TN8_TABLE: number[] = [
  0,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 28, 31, 34, 37, 40,
  43, 46, 49, 52, 55, 58, 61, 64, 67, 70,
  73, 76, 79, 82, 85, 88, 91, 94, 97, 100,
  107, 114, 121, 128, 135, 144, 153, 162, 171, 180,
  189, 198, 207, 216, 225, 234, 243, 252, 261, 270,
  280, 290, 300, 310, 320, 330, 340, 350, 360, 370,
  382, 394, 406, 418, 430, 448, 466, 484, 502, 520,
  546, 572, 598, 624, 650, 680, 710, 740, 770, 800,
];

const getKooperativaNaPraniPercent = (
  percent: number,
  variant: "tn4" | "tn8"
): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  const table =
    variant === "tn4"
      ? KOOPERATIVA_NA_PRANI_TN4_TABLE
      : KOOPERATIVA_NA_PRANI_TN8_TABLE;

  return table[idx] ?? 0;
};

const getMetlifeOneGuardPercent = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  const ranges = [
    { max: 15, value: 100 },
    { max: 20, value: 150 },
    { max: 25, value: 200 },
    { max: 30, value: 250 },
    { max: 35, value: 300 },
    { max: 40, value: 350 },
    { max: 45, value: 400 },
    { max: 50, value: 450 },
    { max: 55, value: 500 },
    { max: 60, value: 550 },
    { max: 65, value: 600 },
    { max: 70, value: 650 },
    { max: 75, value: 700 },
    { max: 80, value: 750 },
    { max: 85, value: 800 },
    { max: 90, value: 850 },
    { max: 95, value: 900 },
    { max: 99, value: 950 },
    { max: 100, value: 1000 },
  ];

  const found = ranges.find((r) => clamped <= r.max);
  return found?.value ?? 0;
};

const getMetlifeGarde6Percent = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  const ranges = [
    { max: 15, value: 100 },
    { max: 20, value: 150 },
    { max: 25, value: 200 },
    { max: 30, value: 250 },
    { max: 35, value: 300 },
    { max: 40, value: 350 },
    { max: 45, value: 400 },
    { max: 50, value: 450 },
    { max: 55, value: 500 },
    { max: 60, value: 550 },
    { max: 65, value: 600 },
    { max: 70, value: 650 },
    { max: 75, value: 700 },
    { max: 80, value: 750 },
    { max: 85, value: 800 },
    { max: 90, value: 850 },
    { max: 95, value: 900 },
    { max: 99, value: 950 },
    { max: 100, value: 1000 },
  ];

  const found = ranges.find((r) => clamped <= r.max);
  return found?.value ?? 0;
};

const getMetlifeGarde5Percent = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  const ranges = [
    { max: 20, value: 100 },
    { max: 25, value: 150 },
    { max: 30, value: 200 },
    { max: 35, value: 250 },
    { max: 40, value: 300 },
    { max: 45, value: 350 },
    { max: 50, value: 400 },
    { max: 55, value: 450 },
    { max: 60, value: 500 },
    { max: 65, value: 550 },
    { max: 70, value: 600 },
    { max: 75, value: 650 },
    { max: 80, value: 700 },
    { max: 85, value: 750 },
    { max: 90, value: 800 },
    { max: 95, value: 850 },
    { max: 99, value: 900 },
    { max: 100, value: 1000 },
  ];

  const found = ranges.find((r) => clamped <= r.max);
  return found?.value ?? 0;
};

const GENERALI_MUJ_ZIVOT_TABLE: number[] = [
  0, // 0 %
  1, // 1 %
  2, // 2 %
  3, // 3 %
  4, // 4 %
  5, // 5 %
  6, // 6 %
  7, // 7 %
  8, // 8 %
  9, // 9 %
  10, // 10 %
  11, // 11 %
  12, // 12 %
  13, // 13 %
  14, // 14 %
  15, // 15 %
  17, // 16 %
  19, // 17 %
  21, // 18 %
  23, // 19 %
  25, // 20 %
  27, // 21 %
  29, // 22 %
  31, // 23 %
  33, // 24 %
  35, // 25 %
  37, // 26 %
  39, // 27 %
  41, // 28 %
  43, // 29 %
  45, // 30 %
  45, // 31 %
  49, // 32 %
  51, // 33 %
  53, // 34 %
  55, // 35 %
  58, // 36 %
  61, // 37 %
  64, // 38 %
  67, // 39 %
  70, // 40 %
  73, // 41 %
  76, // 42 %
  79, // 43 %
  82, // 44 %
  85, // 45 %
  88, // 46 %
  91, // 47 %
  94, // 48 %
  97, // 49 %
  100, // 50 %
  103, // 51 %
  106, // 52 %
  109, // 53 %
  112, // 54 %
  115, // 55 %
  124, // 56 %
  133, // 57 %
  142, // 58 %
  151, // 59 %
  160, // 60 %
  169, // 61 %
  178, // 62 %
  187, // 63 %
  196, // 64 %
  205, // 65 %
  220, // 66 %
  235, // 67 %
  250, // 68 %
  265, // 69 %
  280, // 70 %
  295, // 71 %
  310, // 72 %
  325, // 73 %
  340, // 74 %
  355, // 75 %
  375, // 76 %
  395, // 77 %
  415, // 78 %
  435, // 79 %
  455, // 80 %
  475, // 81 %
  495, // 82 %
  515, // 83 %
  535, // 84 %
  555, // 85 %
  580, // 86 %
  605, // 87 %
  630, // 88 %
  655, // 89 %
  680, // 90 %
  705, // 91 %
  730, // 92 %
  755, // 93 %
  780, // 94 %
  805, // 95 %
  844, // 96 %
  883, // 97 %
  922, // 98 %
  961, // 99 %
  1000, // 100 %
];

const NN_ORANGE_TABLE: number[] = [
  0, // 0 %
  1, // 1 %
  2, // 2 %
  3, // 3 %
  4, // 4 %
  5, // 5 %
  6, // 6 %
  7, // 7 %
  8, // 8 %
  9, // 9 %
  10, // 10 %
  11, // 11 %
  12, // 12 %
  13, // 13 %
  14, // 14 %
  15, // 15 %
  16, // 16 %
  17, // 17 %
  18, // 18 %
  19, // 19 %
  20, // 20 %
  21, // 21 %
  22, // 22 %
  23, // 23 %
  24, // 24 %
  25, // 25 %
  28, // 26 %
  31, // 27 %
  34, // 28 %
  37, // 29 %
  40, // 30 %
  43, // 31 %
  46, // 32 %
  49, // 33 %
  52, // 34 %
  55, // 35 %
  58, // 36 %
  61, // 37 %
  64, // 38 %
  67, // 39 %
  70, // 40 %
  73, // 41 %
  76, // 42 %
  79, // 43 %
  82, // 44 %
  85, // 45 %
  88, // 46 %
  91, // 47 %
  94, // 48 %
  97, // 49 %
  100, // 50 %
  105, // 51 %
  110, // 52 %
  115, // 53 %
  120, // 54 %
  125, // 55 %
  130, // 56 %
  135, // 57 %
  140, // 58 %
  145, // 59 %
  150, // 60 %
  155, // 61 %
  160, // 62 %
  165, // 63 %
  170, // 64 %
  175, // 65 %
  180, // 66 %
  185, // 67 %
  190, // 68 %
  195, // 69 %
  200, // 70 %
  205, // 71 %
  210, // 72 %
  215, // 73 %
  220, // 74 %
  225, // 75 %
  236, // 76 %
  247, // 77 %
  258, // 78 %
  269, // 79 %
  280, // 80 %
  291, // 81 %
  302, // 82 %
  313, // 83 %
  324, // 84 %
  335, // 85 %
  346, // 86 %
  357, // 87 %
  368, // 88 %
  379, // 89 %
  390, // 90 %
  401, // 91 %
  412, // 92 %
  423, // 93 %
  434, // 94 %
  445, // 95 %
  458, // 96 %
  467, // 97 %
  479, // 98 %
  489, // 99 %
  500, // 100 %
];

const NN_ORANGE_10X_TABLE: number[] = [
  0, // 0 %
  1, // 1 %
  2, // 2 %
  3, // 3 %
  4, // 4 %
  5, // 5 %
  6, // 6 %
  7, // 7 %
  8, // 8 %
  9, // 9 %
  10, // 10 %
  11, // 11 %
  12, // 12 %
  14, // 13 %
  16, // 14 %
  18, // 15 %
  20, // 16 %
  22, // 17 %
  25, // 18 %
  27, // 19 %
  30, // 20 %
  34, // 21 %
  37, // 22 %
  41, // 23 %
  45, // 24 %
  49, // 25 %
  54, // 26 %
  58, // 27 %
  63, // 28 %
  68, // 29 %
  73, // 30 %
  79, // 31 %
  85, // 32 %
  91, // 33 %
  97, // 34 %
  103, // 35 %
  110, // 36 %
  117, // 37 %
  124, // 38 %
  131, // 39 %
  139, // 40 %
  147, // 41 %
  155, // 42 %
  163, // 43 %
  172, // 44 %
  180, // 45 %
  189, // 46 %
  198, // 47 %
  208, // 48 %
  217, // 49 %
  227, // 50 %
  237, // 51 %
  248, // 52 %
  258, // 53 %
  269, // 54 %
  280, // 55 %
  291, // 56 %
  302, // 57 %
  314, // 58 %
  326, // 59 %
  338, // 60 %
  350, // 61 %
  363, // 62 %
  376, // 63 %
  389, // 64 %
  402, // 65 %
  415, // 66 %
  429, // 67 %
  443, // 68 %
  457, // 69 %
  471, // 70 %
  486, // 71 %
  501, // 72 %
  516, // 73 %
  531, // 74 %
  547, // 75 %
  562, // 76 %
  578, // 77 %
  598, // 78 %
  611, // 79 %
  628, // 80 %
  644, // 81 %
  661, // 82 %
  679, // 83 %
  696, // 84 %
  714, // 85 %
  732, // 86 %
  750, // 87 %
  769, // 88 %
  787, // 89 %
  806, // 90 %
  825, // 91 %
  845, // 92 %
  865, // 93 %
  885, // 94 %
  905, // 95 %
  925, // 96 %
  945, // 97 %
  966, // 98 %
  987, // 99 %
  1000, // 100 %
];

const NN_ORANGE_10X_2025_03_TABLE: number[] = [
  0, // 0 %
  1, // 1 %
  2, // 2 %
  3, // 3 %
  4, // 4 %
  5, // 5 %
  6, // 6 %
  7, // 7 %
  8, // 8 %
  9, // 9 %
  10, // 10 %
  11, // 11 %
  12, // 12 %
  13, // 13 %
  14, // 14 %
  16, // 15 %
  18, // 16 %
  20, // 17 %
  22, // 18 %
  24, // 19 %
  26, // 20 %
  28, // 21 %
  30, // 22 %
  32, // 23 %
  34, // 24 %
  36, // 25 %
  40, // 26 %
  43, // 27 %
  47, // 28 %
  51, // 29 %
  55, // 30 %
  59, // 31 %
  63, // 32 %
  67, // 33 %
  72, // 34 %
  76, // 35 %
  81, // 36 %
  86, // 37 %
  91, // 38 %
  96, // 39 %
  101, // 40 %
  107, // 41 %
  112, // 42 %
  118, // 43 %
  124, // 44 %
  130, // 45 %
  137, // 46 %
  143, // 47 %
  150, // 48 %
  157, // 49 %
  164, // 50 %
  171, // 51 %
  179, // 52 %
  187, // 53 %
  195, // 54 %
  203, // 55 %
  212, // 56 %
  221, // 57 %
  230, // 58 %
  239, // 59 %
  249, // 60 %
  259, // 61 %
  269, // 62 %
  279, // 63 %
  290, // 64 %
  301, // 65 %
  313, // 66 %
  325, // 67 %
  337, // 68 %
  349, // 69 %
  362, // 70 %
  376, // 71 %
  390, // 72 %
  404, // 73 %
  418, // 74 %
  433, // 75 %
  449, // 76 %
  465, // 77 %
  481, // 78 %
  498, // 79 %
  516, // 80 %
  534, // 81 %
  552, // 82 %
  571, // 83 %
  591, // 84 %
  611, // 85 %
  632, // 86 %
  654, // 87 %
  676, // 88 %
  699, // 89 %
  722, // 90 %
  746, // 91 %
  771, // 92 %
  797, // 93 %
  823, // 94 %
  851, // 95 %
  879, // 96 %
  908, // 97 %
  938, // 98 %
  968, // 99 %
  1000, // 100 %
];

const NN_ZIVOT_2019_06_TABLE: number[] = [
  0,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  32, 34, 37, 40, 43, 46, 49, 52, 55, 60,
  63, 66, 69, 72, 75, 78, 81, 84, 87, 90,
  93, 96, 99, 102, 108, 114, 120, 126, 132, 138,
  145, 152, 159, 166, 173, 180, 187, 194, 201, 208,
  215, 222, 229, 236, 243, 253, 263, 273, 283, 293,
  303, 313, 323, 333, 343, 355, 367, 379, 391, 403,
  418, 433, 448, 463, 478, 499, 520, 541, 562, 583,
  604, 625, 646, 667, 688, 709, 730, 751, 775, 800,
];

const YOU_PLUS_4U_2025_TABLE: number[] = [
  0,
  1, 2, 3, 4, 6, 7, 8, 9, 10, 15,
  16, 17, 18, 20, 22, 24, 26, 28, 30, 32,
  34, 36, 38, 41, 44, 47, 50, 53, 56, 59,
  62, 65, 68, 71, 75, 79, 83, 87, 91, 97,
  103, 109, 115, 121, 127, 133, 139, 145, 151, 158,
  165, 172, 179, 186, 193, 200, 207, 214, 221, 228,
  235, 242, 249, 256, 263, 270, 277, 284, 291, 298,
  305, 312, 319, 326, 333, 340, 350, 360, 370, 385,
  400, 415, 430, 445, 460, 475, 490, 505, 525, 550,
  575, 600, 630, 660, 690, 720, 750, 780, 810, 850,
];

const YOU_PLUS_4U_2025_T3K_TABLE: number[] = [
  0,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  22, 24, 26, 28, 30, 33, 36, 39, 42, 45,
  48, 51, 54, 57, 60, 63, 66, 69, 72, 75,
  79, 83, 87, 91, 95, 100, 105, 110, 115, 120,
  130, 140, 150, 160, 170, 180, 190, 200, 210, 220,
  235, 250, 265, 280, 295, 310, 325, 340, 355, 370,
  385, 400, 415, 430, 450, 470, 490, 510, 530, 550,
  570, 590, 610, 630, 650, 670, 690, 710, 730, 750,
  770, 790, 810, 830, 850, 875, 900, 925, 950, 1000,
];

const YOU_PLUS_4U_2020_TABLE: number[] = [
  0,
  1, 2, 3, 4, 6, 7, 8, 9, 10, 15,
  16, 17, 18, 20, 22, 24, 26, 28, 30, 32,
  34, 36, 38, 41, 44, 47, 50, 53, 56, 58,
  60, 62, 66, 70, 74, 78, 82, 86, 90, 95,
  100, 105, 110, 115, 120, 126, 132, 138, 144, 150,
  156, 162, 168, 174, 180, 187, 194, 201, 208, 215,
  222, 229, 236, 243, 250, 257, 264, 271, 278, 285,
  292, 299, 306, 313, 320, 330, 340, 350, 360, 370,
  380, 390, 400, 410, 420, 430, 440, 450, 460, 470,
  480, 490, 500, 510, 525, 540, 555, 570, 585, 600,
];

const YOU_PLUS_4U_2025_T2K_INFO_SECTIONS: InfoSection[] = [
  {
    title: "Pojistné podmínky tarifu T2K",
    body: "Koeficienty pro progresivní plnění 8,5× podle tabulky YOU PLUS 4U 2021-2025.",
    emphasis: true,
  },
];

const YOU_PLUS_4U_2025_T3K_INFO_SECTIONS: InfoSection[] = [
  {
    title: "Pojistné podmínky tarifu T3K",
    body: "Koeficienty pro progresivní plnění 10× podle tabulky YOU PLUS 4U 2021-2025.",
    emphasis: true,
  },
];

const YOU_PLUS_4U_2020_INFO_SECTIONS: InfoSection[] = [
  {
    title: "Pojistné podmínky tarifu T1K",
    body: "Koeficienty pro progresivní plnění 6× podle tabulky YOU PLUS 4U 2020.",
    emphasis: true,
  },
];

const GENERALI_BEL_MONDO_20_2023_2024_TABLE: number[] = [
  0, // 0 %
  1, // 1 %
  2, // 2 %
  3, // 3 %
  4, // 4 %
  5, // 5 %
  6, // 6 %
  7, // 7 %
  8, // 8 %
  9, // 9 %
  10, // 10 %
  11, // 11 %
  12, // 12 %
  13, // 13 %
  14, // 14 %
  15, // 15 %
  17, // 16 %
  19, // 17 %
  21, // 18 %
  23, // 19 %
  25, // 20 %
  27, // 21 %
  29, // 22 %
  31, // 23 %
  33, // 24 %
  35, // 25 %
  38, // 26 %
  41, // 27 %
  44, // 28 %
  47, // 29 %
  50, // 30 %
  53, // 31 %
  56, // 32 %
  59, // 33 %
  62, // 34 %
  65, // 35 %
  69, // 36 %
  73, // 37 %
  77, // 38 %
  81, // 39 %
  85, // 40 %
  89, // 41 %
  93, // 42 %
  97, // 43 %
  101, // 44 %
  105, // 45 %
  113, // 46 %
  121, // 47 %
  129, // 48 %
  137, // 49 %
  145, // 50 %
  153, // 51 %
  161, // 52 %
  169, // 53 %
  177, // 54 %
  185, // 55 %
  196, // 56 %
  207, // 57 %
  218, // 58 %
  229, // 59 %
  240, // 60 %
  251, // 61 %
  262, // 62 %
  273, // 63 %
  284, // 64 %
  295, // 65 %
  308, // 66 %
  321, // 67 %
  334, // 68 %
  347, // 69 %
  360, // 70 %
  373, // 71 %
  386, // 72 %
  399, // 73 %
  412, // 74 %
  425, // 75 %
  441, // 76 %
  457, // 77 %
  473, // 78 %
  489, // 79 %
  505, // 80 %
  521, // 81 %
  537, // 82 %
  553, // 83 %
  569, // 84 %
  585, // 85 %
  607, // 86 %
  629, // 87 %
  651, // 88 %
  673, // 89 %
  695, // 90 %
  720, // 91 %
  745, // 92 %
  770, // 93 %
  795, // 94 %
  820, // 95 %
  856, // 96 %
  892, // 97 %
  928, // 98 %
  964, // 99 %
  1000, // 100 %
];

const GENERALI_ALLEGRO_20_2023_2024_TABLE =
  GENERALI_BEL_MONDO_20_2023_2024_TABLE;

const GENERALI_BEL_MONDO_20_2020_2022_TABLE: number[] = [
  0,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 30, 35, 40, 45, 50,
  55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
  105, 110, 115, 120, 125, 130, 135, 140, 145, 150,
  155, 160, 165, 170, 175, 180, 185, 190, 195, 200,
  205, 210, 215, 220, 225, 230, 235, 240, 245, 250,
  255, 260, 265, 270, 275, 280, 285, 290, 295, 300,
  325, 350, 375, 400, 425, 450, 475, 500, 525, 550,
  575, 600, 625, 650, 675, 700, 725, 750, 775, 800,
];

const GENERALI_ALLEGRO_20_2020_2022_TABLE =
  GENERALI_BEL_MONDO_20_2020_2022_TABLE;

const ALLIANZ_ZIVOT_ANCHORS: Array<{ p: number; v: number }> = [
  { p: 0, v: 0 },
  { p: 5, v: 5 },
  { p: 10, v: 10 },
  { p: 15, v: 15 },
  { p: 20, v: 35 },
  { p: 25, v: 55 },
  { p: 30, v: 75 },
  { p: 35, v: 95 },
  { p: 40, v: 115 },
  { p: 45, v: 135 },
  { p: 50, v: 155 },
  { p: 55, v: 185 },
  { p: 60, v: 215 },
  { p: 65, v: 255 },
  { p: 70, v: 295 },
  { p: 75, v: 345 },
  { p: 80, v: 395 },
  { p: 85, v: 470 },
  { p: 90, v: 570 },
  { p: 95, v: 680 },
  { p: 100, v: 800 },
];

const ALLIANZ_ZIVOT_2021_06_ANCHORS: Array<{ p: number; v: number }> = [
  { p: 0, v: 0 },
  { p: 5, v: 5 },
  { p: 10, v: 10 },
  { p: 15, v: 15 },
  { p: 20, v: 20 },
  { p: 25, v: 25 },
  { p: 30, v: 45 },
  { p: 35, v: 65 },
  { p: 40, v: 85 },
  { p: 45, v: 105 },
  { p: 50, v: 125 },
  { p: 55, v: 155 },
  { p: 60, v: 185 },
  { p: 65, v: 225 },
  { p: 70, v: 265 },
  { p: 75, v: 315 },
  { p: 80, v: 365 },
  { p: 85, v: 440 },
  { p: 90, v: 540 },
  { p: 95, v: 665 },
  { p: 100, v: 800 },
];

const ALLIANZ_PARTNERS_2026_ANCHORS: Array<{ p: number; v: number }> = [
  { p: 0, v: 0 },
  { p: 5, v: 5 },
  { p: 10, v: 10 },
  { p: 15, v: 15 },
  { p: 20, v: 35 },
  { p: 25, v: 55 },
  { p: 30, v: 75 },
  { p: 35, v: 95 },
  { p: 40, v: 115 },
  { p: 45, v: 135 },
  { p: 50, v: 155 },
  { p: 55, v: 185 },
  { p: 60, v: 215 },
  { p: 65, v: 255 },
  { p: 70, v: 295 },
  { p: 75, v: 345 },
  { p: 80, v: 395 },
  { p: 85, v: 470 },
  { p: 90, v: 570 },
  { p: 95, v: 680 },
  { p: 100, v: 800 },
];

const ALLIANZ_PARTNERS_2026_INFO_SECTIONS: InfoSection[] = [
  {
    title: "Garance nejvyššího plnění",
    body: "Pokud některá konkurenční pojišťovna u srovnatelného produktu plní více, Allianz při splnění podmínek navýší vlastní pojistné plnění.",
    emphasis: true,
  },
  {
    title: "Kdy vzniká nárok",
    items: [
      "alespoň jeden trvalý následek úrazu uvedený v Tabulce závažných poškození je pojistnou událostí",
      "upravené pojistné plnění podle konkurenčních produktů je vyšší než plnění Allianz",
    ],
  },
  {
    title: "Jak se určí konkurenční plnění",
    items: [
      "pokud konkurenční produkt uvádí konkrétní hodnotu pro rozsah trvalého následku, použije se tato hodnota",
      "plnění se stanoví podle koeficientu progrese konkurenčního produktu a oceňovací tabulky trvalých následků daného pojistitele",
      "nezohledňují se časově omezené nabídky ani bonusy pro omezený okruh klientů",
    ],
  },
  {
    title: "Časové omezení",
    body: "Nárok na navýšení se vztahuje pouze na události vzniklé nejpozději do 10 let od počátku připojištění.",
    emphasis: true,
  },
  {
    title: "Rozhodné tabulky",
    body: "Při stanovení plnění se vychází z oceňovacích tabulek konkurenčních produktů zveřejněných v den oznámení škodní události.",
  },
  {
    title: "Výluky, omezení a zhoršení poškození",
    body: "Výluky, omezení, krácení plnění a další práva a povinnosti ze smlouvy tím nejsou dotčeny. Pokud po vzniku práva na plnění dojde ke zhoršení poškození a pojištěný žádá o přehodnocení, postupuje se obdobně.",
  },
];

const CSOB_NAS_ZIVOT_TABLE: number[] = [
  0, // 0 %
  1, // 1 %
  2, // 2 %
  3, // 3 %
  4, // 4 %
  5, // 5 %
  6, // 6 %
  7, // 7 %
  8, // 8 %
  9, // 9 %
  10, // 10 %
  12, // 11 %
  13, // 12 %
  14, // 13 %
  15, // 14 %
  16, // 15 %
  18, // 16 %
  19, // 17 %
  20, // 18 %
  23, // 19 %
  24, // 20 %
  26, // 21 %
  29, // 22 %
  32, // 23 %
  35, // 24 %
  38, // 25 %
  41, // 26 %
  44, // 27 %
  47, // 28 %
  50, // 29 %
  53, // 30 %
  56, // 31 %
  59, // 32 %
  62, // 33 %
  62, // 34 %
  69, // 35 %
  68, // 36 %
  71, // 37 %
  74, // 38 %
  77, // 39 %
  80, // 40 %
  87, // 41 %
  94, // 42 %
  101, // 43 %
  108, // 44 %
  115, // 45 %
  122, // 46 %
  129, // 47 %
  136, // 48 %
  143, // 49 %
  150, // 50 %
  159, // 51 %
  168, // 52 %
  177, // 53 %
  186, // 54 %
  195, // 55 %
  204, // 56 %
  213, // 57 %
  222, // 58 %
  231, // 59 %
  240, // 60 %
  251, // 61 %
  262, // 62 %
  273, // 63 %
  284, // 64 %
  295, // 65 %
  306, // 66 %
  317, // 67 %
  328, // 68 %
  339, // 69 %
  350, // 70 %
  363, // 71 %
  376, // 72 %
  389, // 73 %
  402, // 74 %
  415, // 75 %
  428, // 76 %
  441, // 77 %
  454, // 78 %
  467, // 79 %
  480, // 80 %
  495, // 81 %
  510, // 82 %
  525, // 83 %
  540, // 84 %
  555, // 85 %
  570, // 86 %
  585, // 87 %
  600, // 88 %
  615, // 89 %
  630, // 90 %
  647, // 91 %
  664, // 92 %
  681, // 93 %
  698, // 94 %
  715, // 95 %
  732, // 96 %
  749, // 97 %
  766, // 98 %
  783, // 99 %
  800, // 100 %
];

const getCsobNasZivotPercent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return CSOB_NAS_ZIVOT_TABLE[idx] ?? 0;
};

const getCsobForteMultiplier = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  if (clamped <= 25) return 1;
  if (clamped <= 50) return 2;
  if (clamped <= 75) return 3;
  if (clamped <= 95) return 4;
  return 6;
};

const getGeneraliMujZivotPercent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return GENERALI_MUJ_ZIVOT_TABLE[idx] ?? 0;
};

const getNnOrangePercent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return NN_ORANGE_TABLE[idx] ?? 0;
};

const getNnOrange10xPercent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return NN_ORANGE_10X_TABLE[idx] ?? 0;
};

const getNnOrange10x202503Percent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return NN_ORANGE_10X_2025_03_TABLE[idx] ?? 0;
};

const getNnZivot201906Percent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return NN_ZIVOT_2019_06_TABLE[idx] ?? 0;
};

const getYouPlus4u2025Percent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return YOU_PLUS_4U_2025_TABLE[idx] ?? 0;
};

const getYouPlus4u2025T3kPercent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return YOU_PLUS_4U_2025_T3K_TABLE[idx] ?? 0;
};

const getYouPlus4u2020Percent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return YOU_PLUS_4U_2020_TABLE[idx] ?? 0;
};

const getGeneraliBelMondo20232024Percent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return GENERALI_BEL_MONDO_20_2023_2024_TABLE[idx] ?? 0;
};

const getGeneraliBelMondo20202022Percent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return GENERALI_BEL_MONDO_20_2020_2022_TABLE[idx] ?? 0;
};

const getGeneraliAllegro20232024Percent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return GENERALI_ALLEGRO_20_2023_2024_TABLE[idx] ?? 0;
};

const getGeneraliAllegro20202022Percent = (percent: number): number => {
  const idx = Math.min(100, Math.max(0, Math.round(percent)));
  return GENERALI_ALLEGRO_20_2020_2022_TABLE[idx] ?? 0;
};

const getAllianzZivotPercent = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  let lower = ALLIANZ_ZIVOT_ANCHORS[0];
  let upper = ALLIANZ_ZIVOT_ANCHORS[ALLIANZ_ZIVOT_ANCHORS.length - 1];

  for (let i = 0; i < ALLIANZ_ZIVOT_ANCHORS.length; i++) {
    const current = ALLIANZ_ZIVOT_ANCHORS[i];
    if (current.p === clamped) return current.v;
    if (current.p < clamped) lower = current;
    if (current.p > clamped) {
      upper = current;
      break;
    }
  }

  if (upper.p === lower.p) return lower.v;

  const ratio = (clamped - lower.p) / (upper.p - lower.p);
  return Math.round(lower.v + (upper.v - lower.v) * ratio);
};

const getAllianzZivot202106Percent = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  let lower = ALLIANZ_ZIVOT_2021_06_ANCHORS[0];
  let upper =
    ALLIANZ_ZIVOT_2021_06_ANCHORS[ALLIANZ_ZIVOT_2021_06_ANCHORS.length - 1];

  for (let i = 0; i < ALLIANZ_ZIVOT_2021_06_ANCHORS.length; i++) {
    const current = ALLIANZ_ZIVOT_2021_06_ANCHORS[i];
    if (current.p === clamped) return current.v;
    if (current.p < clamped) lower = current;
    if (current.p > clamped) {
      upper = current;
      break;
    }
  }

  if (upper.p === lower.p) return lower.v;

  const ratio = (clamped - lower.p) / (upper.p - lower.p);
  return Math.round(lower.v + (upper.v - lower.v) * ratio);
};

const getAllianzPartners2026Percent = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  let lower = ALLIANZ_PARTNERS_2026_ANCHORS[0];
  let upper =
    ALLIANZ_PARTNERS_2026_ANCHORS[ALLIANZ_PARTNERS_2026_ANCHORS.length - 1];

  for (let i = 0; i < ALLIANZ_PARTNERS_2026_ANCHORS.length; i++) {
    const current = ALLIANZ_PARTNERS_2026_ANCHORS[i];
    if (current.p === clamped) return current.v;
    if (current.p < clamped) lower = current;
    if (current.p > clamped) {
      upper = current;
      break;
    }
  }

  if (upper.p === lower.p) return lower.v;

  const ratio = (clamped - lower.p) / (upper.p - lower.p);
  return Math.round(lower.v + (upper.v - lower.v) * ratio);
};

const getMaximaMaxefektMultiplier = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  if (clamped <= 20) return 1;
  if (clamped <= 40) return 2;
  if (clamped <= 55) return 3;
  if (clamped <= 65) return 4;
  if (clamped <= 75) return 5;
  if (clamped <= 85) return 6;
  if (clamped <= 90) return 7;
  if (clamped <= 95) return 8;
  if (clamped <= 98) return 9;
  return 10;
};

const getSimpleaMultiplier = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  if (clamped <= 15) return 1;
  if (clamped <= 20) return 1.5;
  if (clamped <= 30) return 2;
  if (clamped <= 40) return 3;
  if (clamped <= 50) return 4;
  if (clamped <= 60) return 5;
  if (clamped <= 70) return 6;
  if (clamped <= 80) return 7;
  if (clamped <= 90) return 8;
  return 10;
};

const PILLOW_ANCHORS: Array<{ p: number; m: number }> = [
  { p: 0, m: 1 },
  { p: 20, m: 1 },
  { p: 30, m: 1.7 },
  { p: 40, m: 2.5 },
  { p: 50, m: 3.4 },
  { p: 60, m: 4.4 },
  { p: 70, m: 5.5 },
  { p: 80, m: 6.7 },
  { p: 90, m: 8 },
  { p: 95, m: 9 },
  { p: 100, m: 10 },
];

const getPillowMultiplier = (percent: number): number => {
  const clamped = Math.min(100, Math.max(0, percent));
  let lower = PILLOW_ANCHORS[0];
  let upper = PILLOW_ANCHORS[PILLOW_ANCHORS.length - 1];

  for (let i = 0; i < PILLOW_ANCHORS.length; i++) {
    const current = PILLOW_ANCHORS[i];
    if (current.p === clamped) return current.m;
    if (current.p < clamped) lower = current;
    if (current.p > clamped) {
      upper = current;
      break;
    }
  }

  if (upper.p === lower.p) return lower.m;
  const ratio = (clamped - lower.p) / (upper.p - lower.p);
  return Number((lower.m + (upper.m - lower.m) * ratio).toFixed(2));
};

const buildCppEvoluceTop5xTablePreview = (
  currentPercent: number
): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return {
    title: "Tabulka TOP progrese 5×",
    columns: ["Rozsah TN", "Násobek"],
    rows: [
      { cells: ["do 20 % včetně", "1×"], active: clamped <= 20 },
      {
        cells: ["nad 20 % do 40 % včetně", "2×"],
        active: clamped > 20 && clamped <= 40,
      },
      {
        cells: ["nad 40 % do 60 % včetně", "3×"],
        active: clamped > 40 && clamped <= 60,
      },
      {
        cells: ["nad 60 % do 80 % včetně", "4×"],
        active: clamped > 60 && clamped <= 80,
      },
      {
        cells: ["nad 80 % do 100 % včetně", "5×"],
        active: clamped > 80,
      },
    ],
  };
};

const buildCppEvoluce5xTablePreview = (
  currentPercent: number
): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return {
    title: "Tabulka plnění 5× progrese",
    columns: ["TN od", "Plnění z pojistné částky"],
    rows: CPP_EVOLUCE_5X_TABLE.map((row, index) => {
      const nextFrom = CPP_EVOLUCE_5X_TABLE[index + 1]?.from ?? Infinity;
      return {
        cells: [formatTablePercent(row.from), formatTablePercent(row.payoutPercent)],
        active: clamped >= row.from && clamped < nextFrom,
      };
    }),
  };
};

const buildUniqaLogika20194xTablePreview = (
  currentPercent: number
): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return {
    title: "Tabulka UNIQA Logika 2019 4×",
    columns: ["Rozsah TN", "Násobek"],
    rows: [
      { cells: ["do 25 % včetně", "1×"], active: clamped <= 25 },
      {
        cells: ["nad 25 % do 50 % včetně", "2×"],
        active: clamped > 25 && clamped <= 50,
      },
      {
        cells: ["nad 50 % do 75 % včetně", "3×"],
        active: clamped > 50 && clamped <= 75,
      },
      {
        cells: ["nad 75 % do 100 % včetně", "4×"],
        active: clamped > 75,
      },
    ],
  };
};

const buildUniqaLogika20196xTablePreview = (
  currentPercent: number
): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return {
    title: "Tabulka UNIQA Logika 2019 6×",
    columns: ["Rozsah TN", "Násobek"],
    rows: [
      { cells: ["do 25 % včetně", "1×"], active: clamped <= 25 },
      {
        cells: ["nad 25 % do 50 % včetně", "2×"],
        active: clamped > 25 && clamped <= 50,
      },
      {
        cells: ["nad 50 % do 75 % včetně", "3×"],
        active: clamped > 50 && clamped <= 75,
      },
      {
        cells: ["nad 75 % do 95 % včetně", "4×"],
        active: clamped > 75 && clamped <= 95,
      },
      {
        cells: ["nad 95 % do 100 % včetně", "6×"],
        active: clamped > 95,
      },
    ],
  };
};

const buildUniqaLogika201910xTablePreview = (
  currentPercent: number
): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return {
    title: "Tabulka UNIQA Logika 2019 10×",
    columns: ["Rozsah TN", "Násobek"],
    rows: [
      { cells: ["do 25 % včetně", "1×"], active: clamped <= 25 },
      {
        cells: ["nad 25 % do 40 % včetně", "2×"],
        active: clamped > 25 && clamped <= 40,
      },
      {
        cells: ["nad 40 % do 50 % včetně", "3×"],
        active: clamped > 40 && clamped <= 50,
      },
      {
        cells: ["nad 50 % do 60 % včetně", "4×"],
        active: clamped > 50 && clamped <= 60,
      },
      {
        cells: ["nad 60 % do 70 % včetně", "5×"],
        active: clamped > 60 && clamped <= 70,
      },
      {
        cells: ["nad 70 % do 80 % včetně", "6×"],
        active: clamped > 70 && clamped <= 80,
      },
      {
        cells: ["nad 80 % do 90 % včetně", "7×"],
        active: clamped > 80 && clamped <= 90,
      },
      {
        cells: ["nad 90 % do 95 % včetně", "8×"],
        active: clamped > 90 && clamped <= 95,
      },
      {
        cells: ["nad 95 % do 99,99 % včetně", "9×"],
        active: clamped > 95 && clamped < 100,
      },
      { cells: ["100 %", "10×"], active: clamped === 100 },
    ],
  };
};

const buildUniqaLogika202010xTablePreview = (
  currentPercent: number
): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return {
    title: "Tabulka UNIQA Logika 2020 10×",
    columns: ["Rozsah TN", "Násobek"],
    rows: [
      { cells: ["do 20 % včetně", "1×"], active: clamped <= 20 },
      {
        cells: ["nad 20 % do 30 % včetně", "2×"],
        active: clamped > 20 && clamped <= 30,
      },
      {
        cells: ["nad 30 % do 40 % včetně", "3×"],
        active: clamped > 30 && clamped <= 40,
      },
      {
        cells: ["nad 40 % do 50 % včetně", "4×"],
        active: clamped > 40 && clamped <= 50,
      },
      {
        cells: ["nad 50 % do 60 % včetně", "5×"],
        active: clamped > 50 && clamped <= 60,
      },
      {
        cells: ["nad 60 % do 70 % včetně", "6×"],
        active: clamped > 60 && clamped <= 70,
      },
      {
        cells: ["nad 70 % do 80 % včetně", "7×"],
        active: clamped > 70 && clamped <= 80,
      },
      {
        cells: ["nad 80 % do 90 % včetně", "8×"],
        active: clamped > 80 && clamped <= 90,
      },
      {
        cells: ["nad 90 % do 99,99 % včetně", "9×"],
        active: clamped > 90 && clamped < 100,
      },
      { cells: ["100 %", "10×"], active: clamped === 100 },
    ],
  };
};

const buildKooperativaNaPraniTablePreview = (
  currentPercent: number
): InfoTablePreview =>
  buildMultiPercentValueTablePreview(
    "Tabulka Kooperativa NA PŘÁNÍ",
    ["TN4", "TN8"],
    [KOOPERATIVA_NA_PRANI_TN4_TABLE, KOOPERATIVA_NA_PRANI_TN8_TABLE],
    currentPercent
  );

const buildCppNeon10xTablePreview = (currentPercent: number): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return buildRangeTablePreview("Tabulka ČPP Neon 2026 10×", ["Rozsah TN", "Násobek"], [
    { cells: ["do 10 % včetně", "1×"], active: clamped <= 10 },
    {
      cells: ["nad 10 % do 20 % včetně", "2×"],
      active: clamped > 10 && clamped <= 20,
    },
    {
      cells: ["nad 20 % do 30 % včetně", "3×"],
      active: clamped > 20 && clamped <= 30,
    },
    {
      cells: ["nad 30 % do 40 % včetně", "4×"],
      active: clamped > 30 && clamped <= 40,
    },
    {
      cells: ["nad 40 % do 50 % včetně", "5×"],
      active: clamped > 40 && clamped <= 50,
    },
    {
      cells: ["nad 50 % do 60 % včetně", "6×"],
      active: clamped > 50 && clamped <= 60,
    },
    {
      cells: ["nad 60 % do 70 % včetně", "7×"],
      active: clamped > 60 && clamped <= 70,
    },
    {
      cells: ["nad 70 % do 80 % včetně", "8×"],
      active: clamped > 70 && clamped <= 80,
    },
    {
      cells: ["nad 80 % do 90 % včetně", "9×"],
      active: clamped > 80 && clamped <= 90,
    },
    {
      cells: ["nad 90 % do 100 % včetně", "10×"],
      active: clamped > 90,
    },
  ]);
};

const buildGeneric5xMultiplierTablePreview = (
  title: string,
  currentPercent: number
): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return buildRangeTablePreview(title, ["Rozsah TN", "Násobek"], [
    { cells: ["do 20 % včetně", "1×"], active: clamped <= 20 },
    {
      cells: ["nad 20 % do 40 % včetně", "2×"],
      active: clamped > 20 && clamped <= 40,
    },
    {
      cells: ["nad 40 % do 60 % včetně", "3×"],
      active: clamped > 40 && clamped <= 60,
    },
    {
      cells: ["nad 60 % do 80 % včetně", "4×"],
      active: clamped > 60 && clamped <= 80,
    },
    {
      cells: ["nad 80 % do 100 % včetně", "5×"],
      active: clamped > 80,
    },
  ]);
};

const buildUniqaDominoTablePreview = (currentPercent: number): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return buildRangeTablePreview("Tabulka UNIQA Domino 10×", ["Rozsah TN", "Násobek"], [
    { cells: ["do 20 % včetně", "1×"], active: clamped <= 20 },
    {
      cells: ["nad 20 % do 30 % včetně", "2×"],
      active: clamped > 20 && clamped <= 30,
    },
    {
      cells: ["nad 30 % do 40 % včetně", "3×"],
      active: clamped > 30 && clamped <= 40,
    },
    {
      cells: ["nad 40 % do 50 % včetně", "4×"],
      active: clamped > 40 && clamped <= 50,
    },
    {
      cells: ["nad 50 % do 60 % včetně", "5×"],
      active: clamped > 50 && clamped <= 60,
    },
    {
      cells: ["nad 60 % do 70 % včetně", "6×"],
      active: clamped > 60 && clamped <= 70,
    },
    {
      cells: ["nad 70 % do 80 % včetně", "7×"],
      active: clamped > 70 && clamped <= 80,
    },
    {
      cells: ["nad 80 % do 90 % včetně", "8×"],
      active: clamped > 80 && clamped <= 90,
    },
    {
      cells: ["nad 90 % do 99,99 % včetně", "9×"],
      active: clamped > 90 && clamped < 100,
    },
    { cells: ["100 %", "10×"], active: clamped === 100 },
  ]);
};

const buildKooperativaFlexi4xTablePreview = (
  currentPercent: number
): InfoTablePreview => {
  const rows = Array.from({ length: 201 }, (_, index) => {
    const p = index / 2;
    return { p, c: getKooperativaFlexi4Percent(p) };
  });

  return buildHalfStepValueTablePreview(
    "Tabulka Kooperativa FLEXI 2026 4×",
    rows,
    currentPercent
  );
};

const buildMetlifeCoefficientTablePreview = (
  title: string,
  currentPercent: number,
  getCoefficient: (percent: number) => number,
  maxes = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 99, 100]
): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return buildRangeTablePreview(title, ["Rozsah TN", "Koeficient"], maxes.map((max, index) => {
    const previous = index === 0 ? 0 : maxes[index - 1];
    const label =
      index === 0 ? `do ${max} % včetně` : `nad ${previous} % do ${max} % včetně`;

    return {
      cells: [label, formatTablePercent(getCoefficient(max))],
      active: index === 0 ? clamped <= max : clamped > previous && clamped <= max,
    };
  }));
};

const buildCsobForteTablePreview = (currentPercent: number): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return buildRangeTablePreview("Tabulka ČSOB Forte 2016-2019", ["Rozsah TN", "Násobek"], [
    { cells: ["do 25 % včetně", "1×"], active: clamped <= 25 },
    {
      cells: ["nad 25 % do 50 % včetně", "2×"],
      active: clamped > 25 && clamped <= 50,
    },
    {
      cells: ["nad 50 % do 75 % včetně", "3×"],
      active: clamped > 50 && clamped <= 75,
    },
    {
      cells: ["nad 75 % do 95 % včetně", "4×"],
      active: clamped > 75 && clamped <= 95,
    },
    {
      cells: ["nad 95 % do 100 % včetně", "6×"],
      active: clamped > 95,
    },
  ]);
};

const buildMaximaMaxefektTablePreview = (currentPercent: number): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return buildRangeTablePreview("Tabulka Maxima MAXEFEKT 6.0", ["Rozsah TN", "Násobek"], [
    { cells: ["do 20 % včetně", "1×"], active: clamped <= 20 },
    {
      cells: ["nad 20 % do 40 % včetně", "2×"],
      active: clamped > 20 && clamped <= 40,
    },
    {
      cells: ["nad 40 % do 55 % včetně", "3×"],
      active: clamped > 40 && clamped <= 55,
    },
    {
      cells: ["nad 55 % do 65 % včetně", "4×"],
      active: clamped > 55 && clamped <= 65,
    },
    {
      cells: ["nad 65 % do 75 % včetně", "5×"],
      active: clamped > 65 && clamped <= 75,
    },
    {
      cells: ["nad 75 % do 85 % včetně", "6×"],
      active: clamped > 75 && clamped <= 85,
    },
    {
      cells: ["nad 85 % do 90 % včetně", "7×"],
      active: clamped > 85 && clamped <= 90,
    },
    {
      cells: ["nad 90 % do 95 % včetně", "8×"],
      active: clamped > 90 && clamped <= 95,
    },
    {
      cells: ["nad 95 % do 98 % včetně", "9×"],
      active: clamped > 95 && clamped <= 98,
    },
    {
      cells: ["nad 98 % do 100 % včetně", "10×"],
      active: clamped > 98,
    },
  ]);
};

const buildSimpleaTablePreview = (currentPercent: number): InfoTablePreview => {
  const clamped = clampPercent(currentPercent);

  return buildRangeTablePreview("Tabulka Simplea 2.0", ["Rozsah TN", "Násobek"], [
    { cells: ["do 15 % včetně", "1×"], active: clamped <= 15 },
    {
      cells: ["nad 15 % do 20 % včetně", "1,5×"],
      active: clamped > 15 && clamped <= 20,
    },
    {
      cells: ["nad 20 % do 30 % včetně", "2×"],
      active: clamped > 20 && clamped <= 30,
    },
    {
      cells: ["nad 30 % do 40 % včetně", "3×"],
      active: clamped > 30 && clamped <= 40,
    },
    {
      cells: ["nad 40 % do 50 % včetně", "4×"],
      active: clamped > 40 && clamped <= 50,
    },
    {
      cells: ["nad 50 % do 60 % včetně", "5×"],
      active: clamped > 50 && clamped <= 60,
    },
    {
      cells: ["nad 60 % do 70 % včetně", "6×"],
      active: clamped > 60 && clamped <= 70,
    },
    {
      cells: ["nad 70 % do 80 % včetně", "7×"],
      active: clamped > 70 && clamped <= 80,
    },
    {
      cells: ["nad 80 % do 90 % včetně", "8×"],
      active: clamped > 80 && clamped <= 90,
    },
    {
      cells: ["nad 90 % do 100 % včetně", "10×"],
      active: clamped > 90,
    },
  ]);
};

const buildAllianzPartners2026TablePreview = (
  currentPercent: number
): InfoTablePreview =>
  buildAnchorValueTablePreview(
    "Tabulka Allianz Partners 2025–2026",
    ALLIANZ_PARTNERS_2026_ANCHORS,
    currentPercent
  );

const PAYOUT_PERCENT_BY_CARD_KEY: Record<string, (percent: number) => number> = {
  "cpp-10x": (percent) => getMultiplierForRange(percent) * percent,
  "cpp-5x": (percent) => getMultiplierForRange5x(percent) * percent,
  "cpp-evoluce-top-5x": (percent) => getMultiplierForRange5x(percent) * percent,
  "cpp-evoluce-5x": getCppEvoluce5xPayoutPercent,
  "uniqa-domino": (percent) => getMultiplierUniqaDomino(percent) * percent,
  "uniqa-logika-2019": (percent) => getUniqaLogika2019Multiplier(percent) * percent,
  "uniqa-logika-2019-6x": (percent) =>
    getUniqaLogika2019Multiplier6x(percent) * percent,
  "uniqa-logika-2019-10x": (percent) =>
    getUniqaLogika2019Multiplier10x(percent) * percent,
  "uniqa-logika-2020-10x": (percent) =>
    getUniqaLogika2020Multiplier10x(percent) * percent,
  "uniqa-activelife-2019-324-324u": getUniqaActiveLife2019324Percent,
  "uniqa-activelife-2019-325-325u": getUniqaActiveLife2019325Percent,
  "axa-active-life-2016-2021-324-324u":
    getAxaActiveLife20162021Tarif324Percent,
  "axa-active-life-2016-2021-325-325u":
    getAxaActiveLife20162021Tarif325Percent,
  "uniqa-zivot-radost": getUniqaZivotRadostPercent,
  "koop-flexi": getKooperativaFlexiPercent,
  "koop-flexi-4x": getKooperativaFlexi4Percent,
  "koop-na-prani-tn4": (percent) => getKooperativaNaPraniPercent(percent, "tn4"),
  "koop-na-prani-tn8": (percent) => getKooperativaNaPraniPercent(percent, "tn8"),
  "metlife-oneguard": (percent) =>
    percent * (getMetlifeOneGuardPercent(percent) / 100),
  "metlife-garde5": (percent) => percent * (getMetlifeGarde5Percent(percent) / 100),
  "metlife-garde6": (percent) => percent * (getMetlifeGarde6Percent(percent) / 100),
  "csob-nas-zivot": getCsobNasZivotPercent,
  "csob-forte": (percent) => getCsobForteMultiplier(percent) * percent,
  "generali-muj-zivot": getGeneraliMujZivotPercent,
  "generali-bel-mondo-20-2023-2024": getGeneraliBelMondo20232024Percent,
  "generali-bel-mondo-20-2020-2022": getGeneraliBelMondo20202022Percent,
  "generali-allegro-20-2023-2024": getGeneraliAllegro20232024Percent,
  "generali-allegro-20-2020-2022": getGeneraliAllegro20202022Percent,
  "nn-orange": getNnOrangePercent,
  "nn-orange-2025-09": getNnOrangePercent,
  "nn-orange-10x": getNnOrange10xPercent,
  "nn-orange-10x-2025-03": getNnOrange10x202503Percent,
  "nn-zivot-2019-06": getNnZivot201906Percent,
  "you-plus-4u-2025": getYouPlus4u2025Percent,
  "you-plus-4u-2025-t3k": getYouPlus4u2025T3kPercent,
  "you-plus-4u-2020": getYouPlus4u2020Percent,
  "maxima-maxefekt": (percent) => getMaximaMaxefektMultiplier(percent) * percent,
  "allianz-zivot": getAllianzZivotPercent,
  "allianz-zivot-2021-06": getAllianzZivot202106Percent,
  "allianz-partners-2026": getAllianzPartners2026Percent,
  "simplea-2": (percent) => getSimpleaMultiplier(percent) * percent,
  "pillow-uraz-nemoc": (percent) => getPillowMultiplier(percent) * percent,
};

export default function SrovnavacTrvalychNasledkuPage() {
  const [sumInsuredInput, setSumInsuredInput] = useState("500000");
  const [rangePercentInput, setRangePercentInput] = useState("50");
  const [showOnly10x, setShowOnly10x] = useState(false);
  const [compactList, setCompactList] = useState(false);
  const [selectedInsurers, setSelectedInsurers] = useState<string[]>([]);

  const sumInsuredValue = (() => {
    const parsed = parseNumber(sumInsuredInput);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round(parsed));
  })();

  const rangePercentRaw = parseNumber(rangePercentInput);
  const rangePercentValue = (() => {
    if (!Number.isFinite(rangePercentRaw)) return 0;
    const limited = Math.min(100, Math.max(0, rangePercentRaw));
    return limited;
  })();

  const buildCardsForPercent = (percent: number): ComparisonCard[] => {
    const normalizedPercent = clampPercent(percent);

    const multiplier = getMultiplierForRange(normalizedPercent);
    const payout = sumInsuredValue * multiplier * (normalizedPercent / 100);
    const multiplier5x = getMultiplierForRange5x(normalizedPercent);
    const payout5x = sumInsuredValue * multiplier5x * (normalizedPercent / 100);
    const cppEvoluce5xPayoutPercent =
      getCppEvoluce5xPayoutPercent(normalizedPercent);
    const payoutCppEvoluce5x =
      sumInsuredValue * (cppEvoluce5xPayoutPercent / 100);
    const multiplierUniqa = getMultiplierUniqaDomino(normalizedPercent);
    const payoutUniqa = sumInsuredValue * multiplierUniqa * (normalizedPercent / 100);
    const uniqaLogika2019Multiplier = getUniqaLogika2019Multiplier(normalizedPercent);
    const payoutUniqaLogika2019 =
      sumInsuredValue * uniqaLogika2019Multiplier * (normalizedPercent / 100);
    const uniqaLogika2019Multiplier6x =
      getUniqaLogika2019Multiplier6x(normalizedPercent);
    const payoutUniqaLogika20196x =
      sumInsuredValue * uniqaLogika2019Multiplier6x * (normalizedPercent / 100);
    const uniqaLogika2019Multiplier10x =
      getUniqaLogika2019Multiplier10x(normalizedPercent);
    const payoutUniqaLogika201910x =
      sumInsuredValue * uniqaLogika2019Multiplier10x * (normalizedPercent / 100);
    const uniqaLogika2020Multiplier10x =
      getUniqaLogika2020Multiplier10x(normalizedPercent);
    const payoutUniqaLogika202010x =
      sumInsuredValue * uniqaLogika2020Multiplier10x * (normalizedPercent / 100);
    const uniqaActiveLife2019324Percent =
      getUniqaActiveLife2019324Percent(normalizedPercent);
    const payoutUniqaActiveLife2019324 =
      sumInsuredValue * (uniqaActiveLife2019324Percent / 100);
    const uniqaActiveLife2019325Percent =
      getUniqaActiveLife2019325Percent(normalizedPercent);
    const payoutUniqaActiveLife2019325 =
      sumInsuredValue * (uniqaActiveLife2019325Percent / 100);
    const axaActiveLife324324uPercent =
      getAxaActiveLife20162021Tarif324Percent(normalizedPercent);
    const payoutAxaActiveLife324324u =
      sumInsuredValue * (axaActiveLife324324uPercent / 100);
    const axaActiveLife325325uPercent =
      getAxaActiveLife20162021Tarif325Percent(normalizedPercent);
    const payoutAxaActiveLife325325u =
      sumInsuredValue * (axaActiveLife325325uPercent / 100);
    const uniqaZivotPercent = getUniqaZivotRadostPercent(normalizedPercent);
    const payoutUniqaZivot = sumInsuredValue * (uniqaZivotPercent / 100);
    const kooperativaFlexiPercent = getKooperativaFlexiPercent(normalizedPercent);
    const payoutKooperativaFlexi = sumInsuredValue * (kooperativaFlexiPercent / 100);
    const kooperativaFlexi4Percent = getKooperativaFlexi4Percent(normalizedPercent);
    const payoutKooperativaFlexi4 = sumInsuredValue * (kooperativaFlexi4Percent / 100);
    const kooperativaNaPraniTn4Percent = getKooperativaNaPraniPercent(
      normalizedPercent,
      "tn4"
    );
    const payoutKooperativaNaPraniTn4 =
      sumInsuredValue * (kooperativaNaPraniTn4Percent / 100);
    const kooperativaNaPraniTn8Percent = getKooperativaNaPraniPercent(
      normalizedPercent,
      "tn8"
    );
    const payoutKooperativaNaPraniTn8 =
      sumInsuredValue * (kooperativaNaPraniTn8Percent / 100);
    const metlifeOneGuardPercent = getMetlifeOneGuardPercent(normalizedPercent);
    const payoutMetlifeOneGuard =
      sumInsuredValue * (normalizedPercent / 100) * (metlifeOneGuardPercent / 100);
    const metlifeGarde5Percent = getMetlifeGarde5Percent(normalizedPercent);
    const payoutMetlifeGarde5 =
      sumInsuredValue * (normalizedPercent / 100) * (metlifeGarde5Percent / 100);
    const metlifeGarde6Percent = getMetlifeGarde6Percent(normalizedPercent);
    const payoutMetlifeGarde6 =
      sumInsuredValue * (normalizedPercent / 100) * (metlifeGarde6Percent / 100);
    const csobNasZivotPercent = getCsobNasZivotPercent(normalizedPercent);
    const payoutCsobNasZivot = sumInsuredValue * (csobNasZivotPercent / 100);
    const csobForteMultiplier = getCsobForteMultiplier(normalizedPercent);
    const payoutCsobForte =
      sumInsuredValue * csobForteMultiplier * (normalizedPercent / 100);
    const generaliMujZivotPercent = getGeneraliMujZivotPercent(normalizedPercent);
    const payoutGeneraliMujZivot = sumInsuredValue * (generaliMujZivotPercent / 100);
    const nnOrangePercent = getNnOrangePercent(normalizedPercent);
    const payoutNnOrange = sumInsuredValue * (nnOrangePercent / 100);
    const nnOrange10xPercent = getNnOrange10xPercent(normalizedPercent);
    const payoutNnOrange10x = sumInsuredValue * (nnOrange10xPercent / 100);
    const nnOrange10x202503Percent =
      getNnOrange10x202503Percent(normalizedPercent);
    const payoutNnOrange10x202503 =
      sumInsuredValue * (nnOrange10x202503Percent / 100);
    const nnZivot201906Percent = getNnZivot201906Percent(normalizedPercent);
    const payoutNnZivot201906 = sumInsuredValue * (nnZivot201906Percent / 100);
    const youPlus4u2025Percent = getYouPlus4u2025Percent(normalizedPercent);
    const payoutYouPlus4u2025 = sumInsuredValue * (youPlus4u2025Percent / 100);
    const youPlus4u2025T3kPercent = getYouPlus4u2025T3kPercent(normalizedPercent);
    const payoutYouPlus4u2025T3k =
      sumInsuredValue * (youPlus4u2025T3kPercent / 100);
    const youPlus4u2020Percent = getYouPlus4u2020Percent(normalizedPercent);
    const payoutYouPlus4u2020 = sumInsuredValue * (youPlus4u2020Percent / 100);
    const generaliBelMondo20232024Percent =
      getGeneraliBelMondo20232024Percent(normalizedPercent);
    const payoutGeneraliBelMondo20232024 =
      sumInsuredValue * (generaliBelMondo20232024Percent / 100);
    const generaliBelMondo20202022Percent =
      getGeneraliBelMondo20202022Percent(normalizedPercent);
    const payoutGeneraliBelMondo20202022 =
      sumInsuredValue * (generaliBelMondo20202022Percent / 100);
    const generaliAllegro20232024Percent =
      getGeneraliAllegro20232024Percent(normalizedPercent);
    const payoutGeneraliAllegro20232024 =
      sumInsuredValue * (generaliAllegro20232024Percent / 100);
    const generaliAllegro20202022Percent =
      getGeneraliAllegro20202022Percent(normalizedPercent);
    const payoutGeneraliAllegro20202022 =
      sumInsuredValue * (generaliAllegro20202022Percent / 100);
    const maximaMaxefektMultiplier = getMaximaMaxefektMultiplier(normalizedPercent);
    const payoutMaximaMaxefekt =
      sumInsuredValue * maximaMaxefektMultiplier * (normalizedPercent / 100);
    const allianzZivotPercent = getAllianzZivotPercent(normalizedPercent);
    const payoutAllianzZivot = sumInsuredValue * (allianzZivotPercent / 100);
    const allianzZivot202106Percent =
      getAllianzZivot202106Percent(normalizedPercent);
    const payoutAllianzZivot202106 =
      sumInsuredValue * (allianzZivot202106Percent / 100);
    const allianzPartners2026Percent =
      getAllianzPartners2026Percent(normalizedPercent);
    const payoutAllianzPartners2026 =
      sumInsuredValue * (allianzPartners2026Percent / 100);
    const simpleaMultiplier = getSimpleaMultiplier(normalizedPercent);
    const payoutSimplea =
      sumInsuredValue * simpleaMultiplier * (normalizedPercent / 100);
    const pillowMultiplier = getPillowMultiplier(normalizedPercent);
    const payoutPillow =
      sumInsuredValue * pillowMultiplier * (normalizedPercent / 100);

    const cardsWithoutCurves: ComparisonCardBase[] = [
      {
        key: "cpp-10x",
        insurer: "ČPP Neon 2026",
        badges: ["10× progrese"],
        payout: payout,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${multiplier} × ${formatPercent(normalizedPercent)}.`,
        tablePreview: buildCppNeon10xTablePreview(normalizedPercent),
        diagnosisExamples: CPP_NEON_DIAGNOSIS_EXAMPLES,
      },
      {
        key: "cpp-5x",
        insurer: "ČPP Neon 2026",
        badges: ["5× progrese"],
        payout: payout5x,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${multiplier5x} × ${formatPercent(normalizedPercent)}.`,
        tablePreview: buildGeneric5xMultiplierTablePreview(
          "Tabulka ČPP Neon 2026 5×",
          normalizedPercent
        ),
        diagnosisExamples: CPP_NEON_DIAGNOSIS_EXAMPLES,
      },
      {
        key: "cpp-evoluce-top-5x",
        insurer: "ČPP Evoluce",
        badges: ["TOP progrese 5×"],
        payout: payout5x,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${multiplier5x} × ${formatPercent(normalizedPercent)}.`,
        tablePreview: buildCppEvoluceTop5xTablePreview(normalizedPercent),
      },
      {
        key: "cpp-evoluce-5x",
        insurer: "ČPP Evoluce",
        badges: ["5× progrese"],
        payout: payoutCppEvoluce5x,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${cppEvoluce5xPayoutPercent}%.`,
        tablePreview: buildCppEvoluce5xTablePreview(normalizedPercent),
      },
      {
        key: "uniqa-domino",
        insurer: "UNIQA Domino",
        badges: ["10× progrese"],
        payout: payoutUniqa,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${multiplierUniqa} × ${formatPercent(normalizedPercent)}.`,
        tablePreview: buildUniqaDominoTablePreview(normalizedPercent),
      },
      {
        key: "uniqa-logika-2019",
        insurer: "UNIQA Logika 2019",
        badges: ["4× progrese"],
        payout: payoutUniqaLogika2019,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${uniqaLogika2019Multiplier} × ${formatPercent(normalizedPercent)}.`,
        tablePreview: buildUniqaLogika20194xTablePreview(normalizedPercent),
      },
      {
        key: "uniqa-logika-2019-6x",
        insurer: "UNIQA Logika 2019",
        badges: ["6× progrese"],
        payout: payoutUniqaLogika20196x,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${uniqaLogika2019Multiplier6x} × ${formatPercent(normalizedPercent)}.`,
        tablePreview: buildUniqaLogika20196xTablePreview(normalizedPercent),
      },
      {
        key: "uniqa-logika-2019-10x",
        insurer: "UNIQA Logika 2019",
        badges: ["10× progrese"],
        payout: payoutUniqaLogika201910x,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${uniqaLogika2019Multiplier10x} × ${formatPercent(normalizedPercent)}.`,
        tablePreview: buildUniqaLogika201910xTablePreview(normalizedPercent),
      },
      {
        key: "uniqa-logika-2020-10x",
        insurer: "UNIQA Logika 2020",
        badges: ["10× progrese"],
        payout: payoutUniqaLogika202010x,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${uniqaLogika2020Multiplier10x} × ${formatPercent(normalizedPercent)}.`,
        tablePreview: buildUniqaLogika202010xTablePreview(normalizedPercent),
      },
      {
        key: "uniqa-activelife-2019-324-324u",
        insurer: "UNIQA ActiveLife 2019",
        badges: ["Tarify 324/324U", "5× progrese"],
        payout: payoutUniqaActiveLife2019324,
        info: `Tarify 324/324U: ${formatMoney(sumInsuredValue)} × ${uniqaActiveLife2019324Percent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka ActiveLife 2019 tarify 324/324U",
          UNIQA_ACTIVELIFE_2019_324_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "uniqa-activelife-2019-325-325u",
        insurer: "UNIQA ActiveLife 2019",
        badges: ["Tarify 325/325U", "5× progrese"],
        payout: payoutUniqaActiveLife2019325,
        info: `Tarify 325/325U: ${formatMoney(sumInsuredValue)} × ${uniqaActiveLife2019325Percent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka ActiveLife 2019 tarify 325/325U",
          UNIQA_ACTIVELIFE_2019_325_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "axa-active-life-2016-2021-324-324u",
        insurer: "AXA Active Life 2016-2021",
        badges: ["Tarify 324/324U", "5× progrese"],
        payout: payoutAxaActiveLife324324u,
        info: `Tarify 324/324U: ${formatMoney(sumInsuredValue)} × ${axaActiveLife324324uPercent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka AXA Active Life 2016-2021 tarify 324/324U",
          AXA_ACTIVE_LIFE_2016_2021_324_324U_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "axa-active-life-2016-2021-325-325u",
        insurer: "AXA Active Life 2016-2021",
        badges: ["Tarify 325/325U", "5× progrese"],
        payout: payoutAxaActiveLife325325u,
        info: `Tarify 325/325U: ${formatMoney(sumInsuredValue)} × ${axaActiveLife325325uPercent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka AXA Active Life 2016-2021 tarify 325/325U",
          AXA_ACTIVE_LIFE_2016_2021_325_325U_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "uniqa-zivot-radost",
        insurer: "UNIQA Život & radost 2026",
        badges: ["10× progrese"],
        payout: payoutUniqaZivot,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${uniqaZivotPercent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka UNIQA Život & radost 2026",
          UNIQA_ZIVOT_RADOST_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "koop-flexi",
        insurer: "Kooperativa FLEXI 2026",
        badges: ["10× progrese"],
        payout: payoutKooperativaFlexi,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${kooperativaFlexiPercent}%.`,
        tablePreview: buildHalfStepValueTablePreview(
          "Tabulka Kooperativa FLEXI 2026 10×",
          KOOP_FLEXI_TN10,
          normalizedPercent
        ),
      },
      {
        key: "koop-flexi-4x",
        insurer: "Kooperativa FLEXI 2026",
        badges: ["4× progrese"],
        payout: payoutKooperativaFlexi4,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${kooperativaFlexi4Percent}%.`,
        tablePreview: buildKooperativaFlexi4xTablePreview(normalizedPercent),
      },
      {
        key: "koop-na-prani-tn4",
        insurer: "Kooperativa NA PŘÁNÍ",
        badges: ["4× progrese"],
        payout: payoutKooperativaNaPraniTn4,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${kooperativaNaPraniTn4Percent}% (TN4).`,
        tablePreview: buildKooperativaNaPraniTablePreview(normalizedPercent),
      },
      {
        key: "koop-na-prani-tn8",
        insurer: "Kooperativa NA PŘÁNÍ",
        badges: ["8× progrese"],
        payout: payoutKooperativaNaPraniTn8,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${kooperativaNaPraniTn8Percent}% (TN8).`,
        tablePreview: buildKooperativaNaPraniTablePreview(normalizedPercent),
      },
      {
        key: "metlife-oneguard",
        insurer: "MetLife OneGuard",
        badges: ["10× progrese"],
        payout: payoutMetlifeOneGuard,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${formatPercent(normalizedPercent)} × ${metlifeOneGuardPercent}%.`,
        tablePreview: buildMetlifeCoefficientTablePreview(
          "Tabulka MetLife OneGuard",
          normalizedPercent,
          getMetlifeOneGuardPercent
        ),
      },
      {
        key: "metlife-garde5",
        insurer: "MetLife Garde 5.0",
        badges: ["2018", "10× progrese"],
        payout: payoutMetlifeGarde5,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${formatPercent(normalizedPercent)} × ${metlifeGarde5Percent}%.`,
        tablePreview: buildMetlifeCoefficientTablePreview(
          "Tabulka MetLife Garde 5.0 2018",
          normalizedPercent,
          getMetlifeGarde5Percent,
          [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 99, 100]
        ),
      },
      {
        key: "metlife-garde6",
        insurer: "MetLife Garde 6.0",
        badges: ["2021–2024", "10× progrese"],
        payout: payoutMetlifeGarde6,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${formatPercent(normalizedPercent)} × ${metlifeGarde6Percent}%.`,
        tablePreview: buildMetlifeCoefficientTablePreview(
          "Tabulka MetLife Garde 6.0",
          normalizedPercent,
          getMetlifeGarde6Percent
        ),
      },
      {
        key: "csob-nas-zivot",
        insurer: "ČSOB Náš Život",
        badges: ["8× progrese"],
        payout: payoutCsobNasZivot,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${csobNasZivotPercent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka ČSOB Náš Život",
          CSOB_NAS_ZIVOT_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "csob-forte",
        insurer: "ČSOB Forte 2016-2019",
        badges: ["6× progrese"],
        payout: payoutCsobForte,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${csobForteMultiplier} × ${formatPercent(normalizedPercent)}.`,
        tablePreview: buildCsobForteTablePreview(normalizedPercent),
      },
      {
        key: "generali-muj-zivot",
        insurer: "Generali Můj Život 2 2024",
        badges: ["10× progrese"],
        payout: payoutGeneraliMujZivot,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${generaliMujZivotPercent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka Generali Můj Život 2 2024",
          GENERALI_MUJ_ZIVOT_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "generali-bel-mondo-20-2023-2024",
        insurer: "Generali Bel Mondo 20 2023-2024",
        badges: ["10× progrese"],
        payout: payoutGeneraliBelMondo20232024,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${generaliBelMondo20232024Percent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka Generali Bel Mondo 20 2023-2024",
          GENERALI_BEL_MONDO_20_2023_2024_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "generali-bel-mondo-20-2020-2022",
        insurer: "Generali Bel Mondo 20 2020-2022",
        badges: ["8× progrese"],
        payout: payoutGeneraliBelMondo20202022,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${generaliBelMondo20202022Percent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka Generali Bel Mondo 20 2020-2022",
          GENERALI_BEL_MONDO_20_2020_2022_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "generali-allegro-20-2023-2024",
        insurer: "Generali Allegro 20 2023-2024",
        badges: ["10× progrese"],
        payout: payoutGeneraliAllegro20232024,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${generaliAllegro20232024Percent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka Generali Allegro 20 2023-2024",
          GENERALI_ALLEGRO_20_2023_2024_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "generali-allegro-20-2020-2022",
        insurer: "Generali Allegro 20 2020-2022",
        badges: ["8× progrese"],
        payout: payoutGeneraliAllegro20202022,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${generaliAllegro20202022Percent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka Generali Allegro 20 2020-2022",
          GENERALI_ALLEGRO_20_2020_2022_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "nn-orange",
        insurer: "NN Orange RISK",
        badges: ["2023–18.03.2025", "5× progrese"],
        payout: payoutNnOrange,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${nnOrangePercent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka progresivního plnění pro připojištění trvalých následků úrazu (TN01-P1R, TN10-P1R) a připojištění trvalých následků úrazu dítěte (JT01-P1R, JT10-P1R)",
          NN_ORANGE_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "nn-orange-2025-09",
        insurer: "NN Orange RISK",
        badges: ["02.09.2025–2026", "5× progrese"],
        payout: payoutNnOrange,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${nnOrangePercent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka progresivního plnění pro připojištění trvalých následků úrazu (TN01-P1R, TN10-P1R) a připojištění trvalých následků úrazu dítěte (JT01-P1R, JT10-P1R)",
          NN_ORANGE_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "nn-orange-10x",
        insurer: "NN Orange RISK",
        badges: ["02.09.2025–2026", "10× progrese"],
        payout: payoutNnOrange10x,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${nnOrange10xPercent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka progresivního plnění pro připojištění trvalých následků úrazu „PREMIUM“ (TNX1-P1R, JTX1-P1R)",
          NN_ORANGE_10X_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "nn-orange-10x-2025-03",
        insurer: "NN Orange RISK",
        badges: ["2023–18.03.2025", "10× progrese"],
        payout: payoutNnOrange10x202503,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${nnOrange10x202503Percent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka progresivního plnění NN Orange RISK 2023–18.03.2025 - 10× progrese",
          NN_ORANGE_10X_2025_03_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "nn-zivot-2019-06",
        insurer: "NN Život 6/2019",
        badges: ["8× progrese"],
        payout: payoutNnZivot201906,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${nnZivot201906Percent}%.`,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka NN Život 6/2019",
          NN_ZIVOT_2019_06_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "you-plus-4u-2025",
        insurer: "YOU PLUS 4U 2021-2025",
        badges: ["8,5× progrese"],
        payout: payoutYouPlus4u2025,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${youPlus4u2025Percent}%.`,
        infoSections: YOU_PLUS_4U_2025_T2K_INFO_SECTIONS,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka YOU PLUS 4U 2021-2025 T2K",
          YOU_PLUS_4U_2025_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "you-plus-4u-2025-t3k",
        insurer: "YOU PLUS 4U 2021-2025",
        badges: ["10× progrese"],
        payout: payoutYouPlus4u2025T3k,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${youPlus4u2025T3kPercent}%.`,
        infoSections: YOU_PLUS_4U_2025_T3K_INFO_SECTIONS,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka YOU PLUS 4U 2021-2025 T3K",
          YOU_PLUS_4U_2025_T3K_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "you-plus-4u-2020",
        insurer: "YOU PLUS 4U 2020",
        badges: ["6× progrese"],
        payout: payoutYouPlus4u2020,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${youPlus4u2020Percent}%.`,
        infoSections: YOU_PLUS_4U_2020_INFO_SECTIONS,
        tablePreview: buildPercentValueTablePreview(
          "Tabulka YOU PLUS 4U 2020",
          YOU_PLUS_4U_2020_TABLE,
          normalizedPercent
        ),
      },
      {
        key: "maxima-maxefekt",
        insurer: "Maxima MAXEFEKT 6.0",
        badges: ["10× progrese"],
        payout: payoutMaximaMaxefekt,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${maximaMaxefektMultiplier} × ${formatPercent(normalizedPercent)}.`,
        tablePreview: buildMaximaMaxefektTablePreview(normalizedPercent),
      },
      {
        key: "allianz-zivot",
        insurer: "Allianz Život",
        badges: ["27.05.2022–28.11.2025", "8× progrese"],
        payout: payoutAllianzZivot,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${allianzZivotPercent}%.`,
        tablePreview: buildAnchorValueTablePreview(
          "Tabulka Allianz Život (TNU6, TNU7, TNU8, TNU9), (VTU4, VTU5)",
          ALLIANZ_ZIVOT_ANCHORS,
          normalizedPercent
        ),
      },
      {
        key: "allianz-zivot-2021-06",
        insurer: "Allianz Život",
        badges: ["01.01.2017–18.06.2021", "8× progrese"],
        payout: payoutAllianzZivot202106,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${allianzZivot202106Percent}%.`,
        tablePreview: buildAnchorValueTablePreview(
          "Tabulka Allianz Život (TNU6, TNU7, TNU8, TNU9, TNU1-S, TNU2-S)",
          ALLIANZ_ZIVOT_2021_06_ANCHORS,
          normalizedPercent
        ),
      },
      {
        key: "allianz-partners-2026",
        insurer: "Allianz Partners 2025–2026",
        badges: ["8× progrese"],
        payout: payoutAllianzPartners2026,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${allianzPartners2026Percent}%.`,
        infoSections: ALLIANZ_PARTNERS_2026_INFO_SECTIONS,
        tablePreview: buildAllianzPartners2026TablePreview(normalizedPercent),
      },
      {
        key: "simplea-2",
        insurer: "Simplea 2.0",
        badges: ["10× progrese"],
        payout: payoutSimplea,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${simpleaMultiplier} × ${formatPercent(normalizedPercent)}.`,
        tablePreview: buildSimpleaTablePreview(normalizedPercent),
      },
      {
        key: "pillow-uraz-nemoc",
        insurer: "Pillow Úraz Nemoc",
        badges: ["10× progrese"],
        payout: payoutPillow,
        info: `Výpočet: ${formatMoney(sumInsuredValue)} × ${formatPercent(normalizedPercent)} × ${pillowMultiplier}.`,
        tablePreview: buildAnchorMultiplierTablePreview(
          "Tabulka Pillow Úraz Nemoc",
          PILLOW_ANCHORS,
          normalizedPercent
        ),
      },
    ];

    return cardsWithoutCurves.map((card) => {
      const { productName, yearBadge } = splitProductYearBadge(card.insurer);

      return {
        ...card,
        insurer: productName,
        badges:
          yearBadge && !card.badges.includes(yearBadge)
            ? [yearBadge, ...card.badges]
            : card.badges,
        curve: buildPayoutCurve(PAYOUT_PERCENT_BY_CARD_KEY[card.key] ?? (() => 0)),
      };
    });
  };

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState<string | null>(null);
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [scenarioStep, setScenarioStep] = useState<0 | 1>(0);
  const [scenarioAInput, setScenarioAInput] = useState("25");
  const [scenarioBInput, setScenarioBInput] = useState("50");
  const [scenarioCInput, setScenarioCInput] = useState("75");
  const [currentExporting, setCurrentExporting] = useState(false);
  const [scenarioExporting, setScenarioExporting] = useState(false);
  const [scenarioExportError, setScenarioExportError] = useState<string | null>(null);
  const infoTableScrollRef = useRef<HTMLDivElement | null>(null);
  const [expandedFilterInsurers, setExpandedFilterInsurers] = useState<string[]>([
    "ČPP",
    "UNIQA",
    "Kooperativa",
    "MetLife",
    "ČSOB",
    "Generali",
    "NN",
    "Maxima",
    "Allianz",
    "AXA",
    "Simplea",
    "Pillow",
    "YOU PLUS",
  ]);
  const cards = buildCardsForPercent(rangePercentValue);

  const insurerFilterGroups = cards.reduce<InsurerFilterGroup[]>((groups, card) => {
    const { insurerName, productName } = splitInsurerAndProduct(card.insurer);
    let group = groups.find((item) => item.insurerName === insurerName);

    if (!group) {
      group = { insurerName, options: [] };
      groups.push(group);
    }

    for (const filterOption of getCardFilterOptions(card)) {
      let option = group.options.find((item) => item.value === filterOption.value);
      if (!option) {
        option = { value: filterOption.value, productName, badges: [] };
        group.options.push(option);
      }

      for (const badge of filterOption.badges) {
        if (!option.badges.includes(badge)) option.badges.push(badge);
      }
    }

    return groups;
  }, []);
  const filterValueSignature = insurerFilterGroups
    .flatMap((group) => group.options.map((option) => option.value))
    .join("|");
  const allFilterGroupsExpanded =
    insurerFilterGroups.length > 0 &&
    insurerFilterGroups.every((group) =>
      expandedFilterInsurers.includes(group.insurerName)
    );

  const toggleFilterGroupExpanded = (insurerName: string) => {
    setExpandedFilterInsurers((current) =>
      current.includes(insurerName)
        ? current.filter((item) => item !== insurerName)
        : [...current, insurerName]
    );
  };

  const toggleAllFilterGroupsExpanded = () => {
    setExpandedFilterInsurers(
      allFilterGroupsExpanded
        ? []
        : insurerFilterGroups.map((group) => group.insurerName)
    );
  };

  const toggleFilterOption = (value: string) => {
    setSelectedInsurers((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  };

  const toggleFilterGroupSelection = (values: string[]) => {
    setSelectedInsurers((current) => {
      const allSelected = values.every((value) => current.includes(value));
      if (allSelected) {
        return current.filter((item) => !values.includes(item));
      }

      return Array.from(new Set([...current, ...values]));
    });
  };

  const applyCardFilters = (sourceCards: ComparisonCard[]): ComparisonCard[] =>
    sourceCards.filter((card) => {
      const matchesProgression =
        !showOnly10x || card.badges.some((badge) => badge.includes("10× progrese"));
      const matchesInsurer =
        selectedInsurers.length === 0 ||
        getCardFilterOptions(card).some((option) =>
          selectedInsurers.includes(option.value)
        );

      return matchesProgression && matchesInsurer;
    });

  const scenarioValues = [
    { label: "Nižší rozsah", percent: parsePercentInput(scenarioAInput) },
    { label: "Střední rozsah", percent: parsePercentInput(scenarioBInput) },
    { label: "Vysoký rozsah", percent: parsePercentInput(scenarioCInput) },
  ];

  const escapeHtml = (value: string): string =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const buildScenarioPdfExportHtml = (
    generatedAt: string,
    exportScenarios = scenarioValues
  ): string => {
      const isMultiScenario = exportScenarios.length > 1;
      const scenariosHtml = exportScenarios
        .map((scenario, scenarioIndex) => {
          const scenarioCards = [...applyCardFilters(buildCardsForPercent(scenario.percent))]
            .sort((a, b) => b.payout - a.payout);
          const scenarioToneClass =
            scenarioIndex % 3 === 0
              ? "scenario--a"
              : scenarioIndex % 3 === 1
                ? "scenario--b"
                : "scenario--c";
          const scenarioLetter = ["A", "B", "C"][scenarioIndex] ?? `${scenarioIndex + 1}`;
          const scenarioToneLabel = isMultiScenario
            ? `Scénář ${scenarioLetter}`
            : "Aktuální výpočet";
          const rowsHtml = scenarioCards
            .map((card, idx) => {
              const logoPath = getInsurerLogoPath(card.insurer);
              const logoKey = institutionLogoKeyFromInsurerName(card.insurer);
              const { insurerName, productName } = splitInsurerAndProduct(card.insurer);
              const logoClass =
                logoKey === "cpp" || logoKey === "kooperativa"
                  ? " insurer-logo--wide"
                  : logoKey === "allianz" || logoKey === "axa"
                    ? " insurer-logo--medium"
                    : logoKey === "slavia"
                      ? " insurer-logo--square"
                      : "";
              const rankBadgeClass =
                idx === 0
                  ? "rank-badge rank-badge--top"
                  : idx === 1
                    ? "rank-badge rank-badge--second"
                    : idx === 2
                      ? "rank-badge rank-badge--third"
                      : "rank-badge";
              const variantText = card.badges.join(", ") || "Bez varianty";
              const insurerCell = logoPath
                ? `<div class="insurer-cell"><span class="insurer-logo-wrap"><img class="insurer-logo${logoClass}" src="${escapeHtml(
                    logoPath
                  )}" alt="" /></span><span class="insurer-copy"><span class="insurer-name">${escapeHtml(
                    insurerName
                  )}</span><span class="insurer-product">${escapeHtml(
                    productName
                  )}</span></span></div>`
                : `<div class="insurer-cell insurer-cell--text"><span class="insurer-copy"><span class="insurer-name">${escapeHtml(
                    insurerName
                  )}</span><span class="insurer-product">${escapeHtml(
                    productName
                  )}</span></span></div>`;
              return `
                <tr>
                  <td class="rank-cell"><span class="${rankBadgeClass}">${idx + 1}</span></td>
                  <td class="insurer-col">${insurerCell}</td>
                  <td class="variant-col"><span class="variant-chip">${escapeHtml(variantText)}</span></td>
                  <td class="amount-col">${escapeHtml(formatMoney(card.payout))}</td>
                </tr>
              `;
            })
            .join("");
          const leadersHtml = scenarioCards
            .slice(0, 3)
            .map((card, idx) => {
              const logoPath = getInsurerLogoPath(card.insurer);
              const { insurerName, productName } = splitInsurerAndProduct(card.insurer);
              const logoMarkup = logoPath
                ? `<span class="leader-logo-wrap"><img class="leader-logo" src="${escapeHtml(
                    logoPath
                  )}" alt="" /></span>`
                : `<span class="leader-logo-wrap leader-logo-fallback">${escapeHtml(
                    insurerName.slice(0, 2).toUpperCase()
                  )}</span>`;

              return `
                <div class="leader-card">
                  <span class="leader-rank">${idx + 1}</span>
                  <div class="leader-identity">
                    ${logoMarkup}
                    <span class="leader-copy">
                      <span class="leader-name">${escapeHtml(insurerName)}</span>
                      <span class="leader-product">${escapeHtml(productName)}</span>
                    </span>
                  </div>
                  <span class="leader-variant">${escapeHtml(card.badges.join(", ") || "Varianta")}</span>
                  <strong class="leader-payout">${escapeHtml(formatMoney(card.payout))}</strong>
                </div>
              `;
            })
            .join("");

          return `
            <section class="report-page ${scenarioToneClass}">
              <header class="page-header">
                <div class="hero-main">
                  <span class="hero-badge">${isMultiScenario ? "Export 3 scénáře" : "Export PDF"}</span>
                  <h1>Trvalé následky</h1>
                  <p>Porovnání plnění podle zadané pojistné částky a rozsahu poškození.</p>
                </div>
                <div class="hero-side">
                  <span>${escapeHtml(scenarioToneLabel)}</span>
                  <strong>${escapeHtml(formatPercent(scenario.percent))}</strong>
                  <small>${escapeHtml(scenario.label)}</small>
                </div>
                <div class="hero-date">
                  <span>Vygenerováno</span>
                  <strong>${escapeHtml(generatedAt)}</strong>
                </div>
              </header>

              <section class="info-card">
                <div class="info-grid">
                  <div class="info-item">
                    <span class="info-label">Pojistná částka</span>
                    <strong class="info-value">${escapeHtml(formatMoney(sumInsuredValue))}</strong>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Rozsah</span>
                    <strong class="info-value">${escapeHtml(formatPercent(scenario.percent))}</strong>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Počet variant</span>
                    <strong class="info-value">${scenarioCards.length}</strong>
                  </div>
                </div>
              </section>

              ${
                leadersHtml
                  ? `<section class="section-block">
                      <div class="section-title">Nejvyšší plnění</div>
                      <div class="leader-list">${leadersHtml}</div>
                    </section>`
                  : ""
              }

              <section class="section-block section-block--table">
                <div class="section-title">Přehled variant</div>
                <table class="scenario-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Pojišťovna</th>
                      <th>Varianta</th>
                      <th>Plnění</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml || `<tr><td colspan="4" class="empty-cell">Bez výsledků pro tento scénář.</td></tr>`}
                  </tbody>
                </table>
              </section>
            </section>
          `;
        })
        .join("");

      const pdfHtml = `
        <div class="report-stack">
          ${scenariosHtml}
        </div>
      `;

      const styleBlock = `
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { box-sizing: border-box; }
          .pdf-root {
            width: 794px;
            margin: 0 auto;
            padding: 0;
            background: #ffffff;
            font-family: Inter, "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            color: #0b1020;
            -webkit-font-smoothing: antialiased;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .report-stack {
            width: 794px;
            margin: 0 auto;
          }
          .report-page {
            --accent: #7c3aed;
            --accent-soft: #f8f5ff;
            position: relative;
            width: 794px;
            height: 1123px;
            min-height: 1123px;
            padding: 30px 34px 32px;
            background: #ffffff;
            color: #0b1020;
            break-after: page;
            page-break-after: always;
            overflow: hidden;
          }
          .report-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .report-page::before {
            content: "";
            position: absolute;
            inset: 0 0 auto 0;
            height: 6px;
            background: linear-gradient(90deg, #020617 0%, #7c3aed 54%, #ec4899 100%);
          }
          .scenario--b { --accent: #4c1d95; --accent-soft: #f7f2ff; }
          .scenario--c { --accent: #a21caf; --accent-soft: #fff1fb; }
          .page-header {
            position: relative;
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 18px;
            min-height: 116px;
            margin: 0;
            padding: 20px 22px;
            border-radius: 20px 20px 0 0;
            background: linear-gradient(135deg, #12091f 0%, #4c1d95 58%, #7c3aed 100%);
            color: #ffffff;
            overflow: hidden;
          }
          .hero-main {
            position: relative;
            z-index: 1;
            min-width: 0;
          }
          .hero-badge {
            display: inline-flex;
            width: fit-content;
            align-items: center;
            border-radius: 999px;
            padding: 6px 11px;
            border: 1px solid rgba(255,255,255,0.35);
            background: #ffffff;
            color: #2e1065;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
          }
          .hero-main h1 {
            margin: 10px 0 0;
            color: #ffffff;
            font-size: 36px;
            line-height: 1;
            font-weight: 700;
            letter-spacing: 0;
          }
          .hero-main p {
            max-width: 390px;
            margin: 8px 0 0;
            color: rgba(255,255,255,0.76);
            font-size: 10px;
            line-height: 1.45;
            font-weight: 600;
          }
          .hero-side {
            position: relative;
            z-index: 1;
            min-width: 145px;
            border: 1px solid rgba(255,255,255,0.24);
            border-radius: 16px;
            background: rgba(255,255,255,0.11);
            padding: 11px 12px;
            text-align: right;
          }
          .hero-side span,
          .hero-side small,
          .hero-date span {
            display: block;
            color: rgba(255,255,255,0.68);
            font-size: 8px;
            line-height: 1.2;
            font-weight: 700;
            letter-spacing: 0.11em;
            text-transform: uppercase;
          }
          .hero-side strong {
            display: block;
            margin-top: 5px;
            color: #ffffff;
            font-size: 24px;
            line-height: 1;
            font-weight: 700;
          }
          .hero-side small {
            margin-top: 5px;
            color: rgba(255,255,255,0.82);
            letter-spacing: 0;
            text-transform: none;
          }
          .hero-date {
            position: absolute;
            right: 22px;
            bottom: 18px;
            z-index: 1;
            text-align: right;
          }
          .hero-date strong {
            display: block;
            margin-top: 3px;
            color: #ffffff;
            font-size: 10px;
            line-height: 1.2;
            font-weight: 600;
          }
          .info-card {
            margin: 0 0 24px;
            border: 1px solid #eadff8;
            border-top: 0;
            border-radius: 0 0 18px 18px;
            background: #ffffff;
            overflow: hidden;
          }
          .info-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .info-item {
            min-height: 58px;
            padding: 13px 15px 12px;
            border-left: 1px solid #eadff8;
          }
          .info-item:first-child {
            border-left: 0;
          }
          .info-label {
            display: block;
            margin-bottom: 4px;
            color: #6d28d9;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
          }
          .info-value {
            display: block;
            color: #0b1020;
            font-size: 13px;
            line-height: 1.2;
            font-weight: 650;
          }
          .section-block {
            margin-top: 22px;
          }
          .section-title {
            display: flex;
            align-items: center;
            gap: 9px;
            margin-bottom: 11px;
            color: #0b1020;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }
          .section-title::before {
            content: "";
            width: 20px;
            height: 3px;
            border-radius: 999px;
            background: linear-gradient(90deg, #020617, var(--accent));
          }
          .leader-list {
            display: flex;
            flex-direction: column;
            border: 1px solid #eee7f6;
            border-radius: 16px;
            overflow: hidden;
            background: #ffffff;
          }
          .leader-card {
            display: grid;
            grid-template-columns: 32px minmax(0, 1fr) 120px 128px;
            align-items: center;
            gap: 12px;
            min-height: 54px;
            padding: 9px 12px;
            border-top: 1px solid #f0e7f7;
          }
          .leader-card:first-child {
            border-top: 0;
          }
          .leader-card::before {
            content: "";
            position: absolute;
          }
          .leader-rank,
          .rank-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            border: 1px solid #ddd6fe;
            background: #f8f5ff;
            color: #5b21b6;
            font-weight: 700;
          }
          .leader-rank {
            width: 24px;
            height: 24px;
            font-size: 10px;
          }
          .rank-badge {
            min-width: 22px;
            height: 22px;
            font-size: 10px;
          }
          .rank-badge--top {
            border-color: #a78bfa;
            background: #f5f3ff;
            color: #4c1d95;
          }
          .rank-badge--second,
          .rank-badge--third {
            border-color: #eadff8;
            background: #ffffff;
            color: #0b1020;
          }
          .leader-identity,
          .insurer-cell {
            display: flex;
            align-items: center;
            gap: 9px;
            min-width: 0;
          }
          .leader-logo-wrap,
          .insurer-logo-wrap {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 46px;
            height: 28px;
            flex: 0 0 46px;
            border: 1px solid #eee7f6;
            border-radius: 10px;
            background: #ffffff;
          }
          .leader-logo,
          .insurer-logo {
            width: auto;
            height: auto;
            max-width: 42px;
            max-height: 23px;
            object-fit: contain;
            display: block;
          }
          .insurer-logo--wide { max-width: 50px; }
          .insurer-logo--medium { max-width: 46px; }
          .insurer-logo--square { max-width: 34px; }
          .leader-logo-fallback {
            color: #6d28d9;
            font-size: 10px;
            font-weight: 700;
          }
          .leader-copy,
          .insurer-copy {
            display: flex;
            flex-direction: column;
            min-width: 0;
          }
          .leader-name,
          .insurer-name {
            color: #0b1020;
            font-size: 12px;
            line-height: 1.15;
            font-weight: 700;
            overflow-wrap: anywhere;
          }
          .leader-product,
          .insurer-product {
            margin-top: 2px;
            color: #667085;
            font-size: 9px;
            line-height: 1.15;
            font-weight: 600;
            overflow-wrap: anywhere;
          }
          .leader-variant,
          .variant-chip {
            display: inline-flex;
            width: fit-content;
            max-width: 100%;
            align-items: center;
            justify-content: center;
            border: 1px solid #eadff8;
            border-radius: 999px;
            background: #fbf7ff;
            color: #5b21b6;
            padding: 4px 8px;
            font-size: 9px;
            line-height: 1.1;
            font-weight: 700;
            text-align: center;
          }
          .leader-payout,
          .amount-col {
            color: #0b1020;
            font-size: 13px;
            line-height: 1.1;
            font-weight: 700;
            text-align: right;
            white-space: nowrap;
          }
          .section-block--table {
            margin-top: 24px;
          }
          .scenario-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: separate;
            border-spacing: 0;
            border: 1px solid #eee7f6;
            border-radius: 16px;
            overflow: hidden;
            background: #ffffff;
          }
          .scenario-table thead th {
            background: #070b18;
            color: #ffffff;
            padding: 8px 11px;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-align: left;
            text-transform: uppercase;
          }
          .scenario-table tbody td {
            padding: 6px 11px;
            border-top: 1px solid #f0e7f7;
            color: #0b1020;
            font-size: 10px;
            line-height: 1.15;
          }
          .scenario-table tbody tr:nth-child(even) td {
            background: #fcfaff;
          }
          .rank-cell {
            width: 44px;
            text-align: center;
          }
          .insurer-col {
            width: 43%;
          }
          .variant-col {
            width: 25%;
          }
          .amount-col {
            width: 24%;
          }
          .empty-cell {
            padding: 16px 12px;
            text-align: center;
            color: #667085;
            background: #fbf7ff;
          }
        </style>
      `;

      return stripUnsupportedColorFunctions(
        `<div class="pdf-root">${styleBlock}${pdfHtml}</div>`
      );
  };

  const validateScenarioExportInputs = (): boolean => {
    if (sumInsuredValue <= 0) {
      setScenarioExportError("Zadej nejdřív pojistnou částku.");
      return false;
    }

    const scenarioInputs = [
      { label: "nižší rozsah", value: scenarioAInput },
      { label: "střední rozsah", value: scenarioBInput },
      { label: "vysoký rozsah", value: scenarioCInput },
    ];
    const invalidInput = scenarioInputs.find(({ value }) => {
      const parsed = parseNumber(value);
      return !Number.isFinite(parsed) || parsed < 0 || parsed > 100;
    });

    if (invalidInput) {
      setScenarioExportError(`Zadej ${invalidInput.label} v rozmezí 0 až 100 %.`);
      return false;
    }

    return true;
  };

  const openScenarioExportModal = () => {
    setScenarioStep(0);
    setScenarioExportError(null);
    setScenarioModalOpen(true);
  };

  const goToScenarioPreview = () => {
    if (!validateScenarioExportInputs()) return;
    setScenarioExportError(null);
    setScenarioStep(1);
  };

  const createPdfExportOptions = (filename: string): any => ({
    margin: [0, 0, 0, 0],
    filename,
    image: { type: "png", quality: 1 },
    html2canvas: {
      scale: 2.6,
      backgroundColor: "#ffffff",
      useCORS: true,
      windowWidth: 794,
      scrollX: 0,
      scrollY: 0,
      onclone: (doc: Document) => {
        // html2canvas neumí CSS color funkce lab()/oklch()
        // z některých globálních stylů, proto je při exportu odfiltrujeme.
        doc.querySelectorAll("link[rel='stylesheet']").forEach((n) => n.remove());
        doc.querySelectorAll("style").forEach((n) => {
          const text = n.textContent ?? "";
          if (/(oklch|lab)\(/i.test(text)) n.remove();
        });
      },
    },
    jsPDF: { unit: "pt", format: "a4", orientation: "portrait", compress: true },
    pagebreak: {
      mode: ["css", "legacy"],
      before: ".report-page:not(:first-child)",
      avoid: [".leader-card", ".info-card", ".scenario-table tbody tr"],
    },
  });

  const handleExportCurrentPdf = async () => {
    if (sumInsuredValue <= 0) {
      setScenarioExportError("Zadej nejdřív pojistnou částku.");
      return;
    }

    setScenarioExportError(null);
    setCurrentExporting(true);
    try {
      const html2pdf = await getHtml2Pdf();
      const generatedAt = new Date().toLocaleString("cs-CZ");
      const fileStamp = new Date().toISOString().slice(0, 10);
      const exportHtml = buildScenarioPdfExportHtml(generatedAt, [
        { label: "Aktuální rozsah", percent: rangePercentValue },
      ]);

      await (html2pdf() as any)
        .set(createPdfExportOptions(`srovnani_trvalych_nasledku_${fileStamp}.pdf`))
        .from(exportHtml)
        .save();
    } catch (error) {
      console.error("Nepodařilo se vygenerovat PDF srovnání trvalých následků", error);
      const detail =
        error instanceof Error && error.message ? ` (${error.message})` : "";
      setScenarioExportError(`Generování PDF selhalo${detail}. Zkus to prosím znovu.`);
    } finally {
      setCurrentExporting(false);
    }
  };

  const handleExportThreeScenarioPdf = async () => {
    if (!validateScenarioExportInputs()) return;

    setScenarioExportError(null);
    setScenarioExporting(true);
    try {
      const html2pdf = await getHtml2Pdf();
      const generatedAt = new Date().toLocaleString("cs-CZ");
      const fileStamp = new Date().toISOString().slice(0, 10);
      const exportHtml = buildScenarioPdfExportHtml(generatedAt);

      await (html2pdf() as any)
        .set(createPdfExportOptions(`srovnani_trvalych_nasledku_scenare_${fileStamp}.pdf`))
        .from(exportHtml)
        .save();
    } catch (error) {
      console.error("Nepodařilo se vygenerovat 3 scénáře PDF", error);
      const detail =
        error instanceof Error && error.message ? ` (${error.message})` : "";
      setScenarioExportError(`Generování 3stránkového PDF selhalo${detail}. Zkus to prosím znovu.`);
    } finally {
      setScenarioExporting(false);
    }
  };

  const visibleCards = applyCardFilters(cards);

  const sortedCards = [...visibleCards].sort((a, b) => b.payout - a.payout);
  const selectedInfoCard = cards.find((card) => card.key === infoOpen) ?? null;
  const selectedInfoCardParts = selectedInfoCard
    ? splitInsurerAndProduct(selectedInfoCard.insurer)
    : null;
  const selectedInfoActiveRow =
    selectedInfoCard?.tablePreview?.rows.find((row) => row.active) ?? null;
  const selectedInfoChartMaxPayoutPercent = selectedInfoCard
    ? Math.max(
        100,
        ...selectedInfoCard.curve.map((point) => point.payoutPercent)
      )
    : 100;

  useEffect(() => {
    if (!infoOpen || !selectedInfoCard?.tablePreview) return;

    window.requestAnimationFrame(() => {
      const activeRow = infoTableScrollRef.current?.querySelector<HTMLElement>(
        "[data-active-row='true']"
      );
      activeRow?.scrollIntoView({ block: "center" });
    });
  }, [infoOpen, rangePercentValue, selectedInfoCard?.tablePreview]);

  useEffect(() => {
    const validFilterValues = new Set(filterValueSignature.split("|").filter(Boolean));

    setSelectedInsurers((current) => {
      if (current.length === 0) return current;

      const next = current.filter((value) => validFilterValues.has(value));
      return next.length === current.length ? current : next;
    });
  }, [filterValueSignature]);

  const activeFilterCount =
    (showOnly10x ? 1 : 0) +
    (compactList ? 1 : 0) +
    (selectedInsurers.length > 0 ? 1 : 0);

  const podiumStyles: Array<{ badgeText: string }> = [{ badgeText: "TOP" }];
  const scenarioStepperSteps = ["Scénáře", "Náhled PDF"];
  const scenarioPreviewSrcDoc =
    scenarioModalOpen && scenarioStep === 1
      ? `<!doctype html><html lang="cs"><head><meta charset="utf-8" /><style>html,body{margin:0;background:#ffffff;min-height:100%;}body{display:flex;justify-content:center;padding:16px;}.preview-scale{zoom:.94;}@supports not (zoom:1){.preview-scale{width:106.383%;transform:scale(.94);transform-origin:top center;}}</style></head><body><div class="preview-scale">${buildScenarioPdfExportHtml(
          new Date().toLocaleString("cs-CZ")
        )}</div></body></html>`
      : "";

  return (
    <AppLayout active="tools">
      <div className="relative w-full max-w-[1500px] space-y-3 overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#fbf7ff_45%,#ffffff_100%)] px-0 pb-8 sm:space-y-4 sm:px-3">
        <header className="flex flex-col gap-3 px-0 pt-0 sm:gap-4 sm:px-2 sm:pt-2">
          <Link
            href="/pomucky"
            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-violet-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_8px_18px_rgba(76,29,149,0.07)] transition hover:border-violet-300 hover:bg-violet-50 sm:gap-2 sm:py-2 sm:shadow-[0_10px_24px_rgba(76,29,149,0.08)]"
          >
            <ChevronLeft className="h-4 w-4" />
            Zpět na pomůcky
          </Link>

          <div className="flex flex-col gap-4 min-[560px]:flex-row min-[560px]:items-end min-[560px]:justify-between">
            <div className="space-y-2 sm:space-y-3">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-200 bg-white/92 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700 shadow-[0_8px_18px_rgba(217,70,239,0.08)] sm:gap-2 sm:px-3 sm:text-[11px] sm:tracking-[0.18em] sm:shadow-[0_10px_24px_rgba(217,70,239,0.1)]">
                <ChartNoAxesColumn className="h-3.5 w-3.5" />
                Srovnávač plnění
              </div>
              <div>
                <h1 className="text-[2.3rem] font-black leading-[0.98] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                  Trvalé následky
                </h1>
                <p className="mt-2 max-w-2xl text-xs font-semibold leading-6 text-slate-500 sm:mt-3 sm:text-sm sm:leading-relaxed">
                  Porovnej plnění podle pojistné částky a rozsahu poškození. Export používá stejná data i aktivní filtry.
                </p>
              </div>
            </div>

            <div className="hidden shrink-0 min-[560px]:block">
              <Image
                src="/icons/nasledna.webp"
                alt="Trvalé následky"
                width={260}
                height={260}
                className="h-28 w-auto object-contain grayscale opacity-90 sm:h-36"
                priority
              />
            </div>
          </div>
        </header>

        <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(330px,430px)_1fr]">
          <section className="relative w-full space-y-3 overflow-hidden rounded-[22px] border border-violet-100 bg-white p-3 shadow-[0_12px_28px_rgba(76,29,149,0.08)] sm:space-y-4 sm:rounded-[28px] sm:p-4 sm:shadow-[0_18px_42px_rgba(76,29,149,0.10)]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]"
            />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
                <Calculator className="h-3.5 w-3.5" />
                <span>Vstupní parametry</span>
              </h2>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
              <label className="rounded-[18px] border border-violet-100 bg-white/85 p-3 shadow-sm transition focus-within:border-fuchsia-300 focus-within:ring-2 focus-within:ring-fuchsia-500/10 sm:rounded-2xl sm:p-3.5">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase leading-tight tracking-[0.14em] text-fuchsia-700">
                      Pojistná částka
                    </span>
                    <span className="rounded-lg border border-violet-100 bg-violet-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-violet-700">
                      Kč
                    </span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    min={0}
                    value={sumInsuredInput}
                    onChange={(e) => {
                      setSumInsuredInput(e.target.value);
                    }}
                    onBlur={() => {
                      const parsed = parseNumber(sumInsuredInput);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        setSumInsuredInput(formatKcInput(parsed));
                      }
                    }}
                    className="mt-2.5 w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-base font-semibold leading-none text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-fuchsia-300 focus:ring-0 sm:mt-3 sm:text-lg"
                  />
                </div>
              </label>

              <label className="rounded-[18px] border border-violet-100 bg-white/85 p-3 shadow-sm transition focus-within:border-fuchsia-300 focus-within:ring-2 focus-within:ring-fuchsia-500/10 sm:rounded-2xl sm:p-3.5">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase leading-tight tracking-[0.14em] text-fuchsia-700">
                      Rozsah trvalých následků
                    </span>
                    <span className="rounded-lg border border-violet-100 bg-violet-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-violet-700">
                      %
                    </span>
                  </div>
                  <input
                    type="number"
                    max={100}
                    value={rangePercentInput}
                    onChange={(e) => setRangePercentInput(e.target.value)}
                    onBlur={() => {
                      const parsed = parseNumber(rangePercentInput);
                      if (!Number.isFinite(parsed)) return;
                      const limited = Math.min(100, Math.max(0, parsed));
                      setRangePercentInput(formatKcInput(limited));
                    }}
                    className="mt-2.5 w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-base font-semibold leading-none text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-fuchsia-300 focus:ring-0 sm:mt-3 sm:text-lg"
                  />
                  {Number.isFinite(rangePercentRaw) && rangePercentRaw > 100 && (
                    <p className="mt-2 text-[11px] font-semibold text-fuchsia-700">
                      Max 100 %. Počítám s {rangePercentValue}%.
                    </p>
                  )}
                </div>
              </label>
            </div>
          </section>

          <section className="relative w-full space-y-3 overflow-hidden rounded-[22px] border border-violet-100 bg-white p-3 shadow-[0_12px_28px_rgba(76,29,149,0.08)] sm:space-y-4 sm:rounded-[28px] sm:p-4 sm:shadow-[0_18px_42px_rgba(76,29,149,0.10)]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]"
            />
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <h2 className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Filtry</span>
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => void handleExportCurrentPdf()}
                  disabled={currentExporting || scenarioExporting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-[0_6px_14px_rgba(76,29,149,0.07)] transition hover:border-violet-400 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60 sm:gap-2 sm:px-4 sm:py-2 sm:shadow-[0_8px_18px_rgba(76,29,149,0.08)]"
                >
                  {currentExporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  <span>{currentExporting ? "Generuji…" : "Export PDF"}</span>
                </button>
                <button
                  type="button"
                  onClick={openScenarioExportModal}
                  disabled={currentExporting || scenarioExporting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-fuchsia-300/35 bg-[linear-gradient(135deg,#020617_0%,#4c1d95_55%,#ec4899_100%)] px-3 py-1.5 text-xs font-semibold text-zinc-50 shadow-[0_8px_20px_rgba(76,29,149,0.22)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:gap-2 sm:px-4 sm:py-2 sm:shadow-[0_12px_30px_rgba(76,29,149,0.25)]"
                >
                  {scenarioExporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Files className="h-3.5 w-3.5" />
                  )}
                  <span>{scenarioExporting ? "Generuji…" : "Export 3 scénáře PDF"}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] border border-violet-100 bg-white/85 px-3 py-2.5 shadow-sm sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">
                  {activeFilterCount === 0
                    ? "Bez aktivních filtrů"
                    : `Aktivní filtry: ${activeFilterCount}`}
                </span>
                {showOnly10x && (
                  <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-violet-700">
                    10× progrese
                  </span>
                )}
                {selectedInsurers.length > 0 && (
                  <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-violet-700">
                    Ročníky: {selectedInsurers.length}
                  </span>
                )}
                {compactList && (
                  <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-violet-700">
                    Hustší řádky
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-950 bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Filtry</span>
              </button>
            </div>
          </section>
        </div>

        {scenarioModalOpen && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
            onClick={() => setScenarioModalOpen(false)}
          >
            <section
              className={`relative max-h-[94vh] w-full overflow-y-auto rounded-[28px] border border-violet-100 bg-white p-4 text-slate-950 shadow-[0_34px_90px_rgba(15,23,42,0.28)] sm:p-5 ${
                scenarioStep === 1 ? "max-w-7xl" : "max-w-5xl"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]"
              />
              <button
                type="button"
                onClick={() => setScenarioModalOpen(false)}
                className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-100 bg-white text-slate-700 transition hover:border-fuchsia-200 hover:bg-fuchsia-50"
                aria-label="Zavřít export scénářů"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex flex-col gap-3 pr-12 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
                    Klientský PDF výstup
                  </p>
                  <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950 sm:text-xl">
                    Export 3 scénářů
                  </h3>
                </div>
                {scenarioStep === 1 ? (
                  <button
                    type="button"
                    onClick={handleExportThreeScenarioPdf}
                    disabled={scenarioExporting}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-fuchsia-300/35 bg-[linear-gradient(135deg,#020617_0%,#4c1d95_55%,#ec4899_100%)] px-5 py-2.5 text-sm font-semibold text-zinc-50 shadow-[0_12px_30px_rgba(76,29,149,0.25)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {scenarioExporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4" />
                    )}
                    {scenarioExporting ? "Generuji…" : "Stáhnout PDF"}
                  </button>
                ) : null}
              </div>

              <div className="mt-4 rounded-2xl border border-violet-100 bg-white/85 px-3 py-2.5 shadow-sm">
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${scenarioStepperSteps.length}, minmax(0, 1fr))`,
                  }}
                >
                  {scenarioStepperSteps.map((stepLabel, index) => {
                    const stepDone = scenarioStep > index;
                    const stepActive = scenarioStep === index;

                    return (
                      <div key={stepLabel} className="flex flex-col items-center gap-1 text-center">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
                            stepDone
                              ? "border-violet-500 bg-violet-600 text-white"
                              : stepActive
                                ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700"
                                : "border-violet-100 bg-white text-slate-400"
                          }`}
                        >
                          {stepDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                        </span>
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                            stepActive || stepDone ? "text-slate-950" : "text-slate-400"
                          }`}
                        >
                          {stepLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2.5 h-1.5 rounded-full bg-violet-50">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#020617_0%,#7c3aed_55%,#ec4899_100%)] transition-[width] duration-300"
                    style={{
                      width: `${((scenarioStep + 1) / scenarioStepperSteps.length) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-4">
                {scenarioStep === 0 ? (
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-fuchsia-700">
                      Rozsahy trvalých následků
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        {
                          label: "1. scénář",
                          helper: "Nižší rozsah",
                          value: scenarioAInput,
                          onChange: setScenarioAInput,
                        },
                        {
                          label: "2. scénář",
                          helper: "Střední rozsah",
                          value: scenarioBInput,
                          onChange: setScenarioBInput,
                        },
                        {
                          label: "3. scénář",
                          helper: "Vysoký rozsah",
                          value: scenarioCInput,
                          onChange: setScenarioCInput,
                        },
                      ].map((item) => (
                        <label
                          key={item.label}
                          className="rounded-2xl border border-violet-100 bg-white/85 px-4 py-3 shadow-sm transition focus-within:border-fuchsia-300 focus-within:ring-2 focus-within:ring-fuchsia-500/10"
                        >
                          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700">
                            {item.label}
                          </span>
                          <span className="mt-1 block text-sm font-semibold text-slate-950">
                            {item.helper}
                          </span>
                          <div className="mt-3 flex items-end gap-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={item.value}
                              onChange={(e) => item.onChange(e.target.value)}
                              className="w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-2xl font-black leading-none text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-fuchsia-300 focus:ring-0"
                            />
                            <span className="mb-2 rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">
                              %
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                    <p className="rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-xs font-semibold leading-relaxed text-slate-600">
                      Export použije aktuální pojistnou částku a aktivní filtry. Náhled v dalším kroku ukazuje stejný obsah, který se stáhne do PDF.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_22px_56px_rgba(76,29,149,0.14)]">
                      <iframe
                        title="Náhled klientského PDF výstupu"
                        srcDoc={scenarioPreviewSrcDoc}
                        className="h-[calc(94vh-205px)] min-h-[560px] w-full bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {scenarioExportError ? (
                <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  {scenarioExportError}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-500">
                  Krok {scenarioStep + 1} / {scenarioStepperSteps.length}
                </p>
                <div className="ml-auto flex items-center gap-2">
                  {scenarioStep > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setScenarioExportError(null);
                        setScenarioStep(0);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Zpět
                    </button>
                  ) : null}

                  {scenarioStep === 0 ? (
                    <button
                      type="button"
                      onClick={goToScenarioPreview}
                      className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-300/35 bg-[linear-gradient(135deg,#020617_0%,#4c1d95_55%,#ec4899_100%)] px-5 py-2.5 text-sm font-semibold text-zinc-50 shadow-[0_12px_30px_rgba(76,29,149,0.25)] transition hover:-translate-y-0.5 hover:brightness-110"
                    >
                      Pokračovat
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        )}

        {filtersOpen && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
            onClick={() => setFiltersOpen(false)}
          >
            <div
              className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-violet-100 bg-white px-5 py-5 shadow-[0_34px_90px_rgba(15,23,42,0.28)]"
              onClick={(e) => e.stopPropagation()}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]"
              />
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Filtry a zobrazení</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-950 bg-slate-950 text-sm text-white hover:bg-black"
                  aria-label="Zavřít filtry"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Filtr</div>
                  <button
                    type="button"
                    onClick={() => setShowOnly10x((v) => !v)}
                    className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                      showOnly10x
                        ? TN_ACTIVE_DARK_CLASS
                        : TN_INACTIVE_CHIP_CLASS
                    }`}
                  >
                    Pouze 10× progrese
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Zobrazení</div>
                  <button
                    type="button"
                    onClick={() => setCompactList((v) => !v)}
                    className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                      compactList
                        ? TN_ACTIVE_VIOLET_CLASS
                        : TN_INACTIVE_CHIP_CLASS
                    }`}
                  >
                    {compactList ? "Hustší řádky" : "Standardní řádky"}
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Pojišťovny a ročníky
                    </div>
                    <button
                      type="button"
                      onClick={toggleAllFilterGroupsExpanded}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-violet-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-violet-300 hover:bg-violet-50"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition ${
                          allFilterGroupsExpanded ? "rotate-180" : ""
                        }`}
                      />
                      {allFilterGroupsExpanded ? "Sbalit vše" : "Rozbalit vše"}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedInsurers([])}
                      className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                        selectedInsurers.length === 0
                          ? TN_ACTIVE_DARK_CLASS
                          : TN_INACTIVE_CHIP_CLASS
                      }`}
                    >
                      Všechny ročníky
                    </button>
                    <span className="text-xs font-semibold text-slate-500">
                      {selectedInsurers.length === 0
                        ? "Bez omezení ročníků"
                        : `Vybrané ročníky: ${selectedInsurers.length}`}
                    </span>
                  </div>

                  <div className="grid gap-3 pt-1 md:grid-cols-2">
                    {insurerFilterGroups.map((group) => {
                      const values = group.options.map((option) => option.value);
                      const selectedCount = values.filter((value) =>
                        selectedInsurers.includes(value)
                      ).length;
                      const groupFullySelected =
                        selectedCount === group.options.length && selectedCount > 0;
                      const groupPartlySelected =
                        selectedCount > 0 && selectedCount < group.options.length;
                      const isExpanded = expandedFilterInsurers.includes(
                        group.insurerName
                      );
                      const logoPath = getInsurerLogoPath(group.insurerName);
                      const logoKey = institutionLogoKeyFromInsurerName(
                        group.insurerName
                      );

                      return (
                        <section
                          key={group.insurerName}
                          className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm"
                        >
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => toggleFilterGroupSelection(values)}
                              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1 text-left transition hover:bg-violet-50/80"
                              aria-pressed={groupFullySelected}
                            >
                              <span
                                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                                  groupFullySelected || groupPartlySelected
                                    ? "border-fuchsia-500 bg-fuchsia-600 text-white"
                                    : "border-sky-300 bg-white text-white"
                                }`}
                                aria-hidden="true"
                              >
                                {groupFullySelected ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : groupPartlySelected ? (
                                  <span className="h-0.5 w-2.5 rounded-full bg-white" />
                                ) : null}
                              </span>
                              <span
                                className={`relative inline-flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-violet-100 bg-white shadow-sm ${institutionLogoFrameClass(
                                  logoKey,
                                  "compact"
                                )}`}
                              >
                                {logoPath ? (
                                  <Image
                                    src={logoPath}
                                    alt={group.insurerName}
                                    fill
                                    sizes="48px"
                                    className={institutionLogoImageClass(logoKey)}
                                  />
                                ) : (
                                  <span className="text-[10px] font-semibold text-slate-400">
                                    LOGO
                                  </span>
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className="block break-words text-sm font-black leading-tight text-slate-950">
                                  {group.insurerName}
                                </span>
                                <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                                  {selectedCount}/{group.options.length} ročníků
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleFilterGroupExpanded(group.insurerName)}
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-100 bg-white text-slate-500 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                              aria-label={`${isExpanded ? "Sbalit" : "Rozbalit"} ${group.insurerName}`}
                              aria-expanded={isExpanded}
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition ${
                                  isExpanded ? "" : "-rotate-90"
                                }`}
                              />
                            </button>
                          </div>

                          {isExpanded ? (
                            <div className="border-t border-violet-100 bg-violet-50/25 p-2">
                              <div className="grid gap-2">
                                {group.options.map((option) => {
                                  const active = selectedInsurers.includes(option.value);

                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => toggleFilterOption(option.value)}
                                      className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                                        active
                                          ? "border-violet-500 bg-white text-slate-950 shadow-sm"
                                          : "border-violet-100 bg-white/85 text-slate-600 hover:border-violet-300 hover:bg-white"
                                      }`}
                                      aria-pressed={active}
                                    >
                                      <span
                                        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                          active
                                            ? "border-violet-600 bg-violet-600 text-white"
                                            : "border-sky-300 bg-white text-white"
                                        }`}
                                        aria-hidden="true"
                                      >
                                        {active ? <Check className="h-3 w-3" /> : null}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block break-words leading-snug">
                                          {option.productName}
                                        </span>
                                        {option.badges.length > 0 ? (
                                          <span className="mt-1 flex flex-wrap gap-1">
                                            {option.badges.map((badge) => (
                                              <span
                                                key={badge}
                                                className="rounded-full border border-violet-100 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700"
                                              >
                                                {badge}
                                              </span>
                                            ))}
                                          </span>
                                        ) : null}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="inline-flex items-center rounded-xl border border-slate-950 bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black"
                  >
                    Zavřít
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <section className="relative overflow-visible rounded-[28px] border border-violet-100 bg-white p-4 shadow-[0_18px_42px_rgba(76,29,149,0.10)]">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]"
          />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
                <ChartNoAxesColumn className="h-3.5 w-3.5" />
                Srovnání plnění
              </h2>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Výsledek podle zadaných parametrů.
              </p>
            </div>
            <div className="text-right text-xs font-semibold text-slate-500">
              {sortedCards.length} variant
            </div>
          </div>

          {scenarioExportError && !scenarioModalOpen ? (
            <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {scenarioExportError}
            </p>
          ) : null}

          <div className="mt-4 overflow-visible rounded-2xl border border-violet-100 bg-white">
            {sortedCards.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                Žádná varianta neodpovídá aktivním filtrům.
              </div>
            ) : (
              sortedCards.map((card, idx) => {
                const podium = podiumStyles[idx];
                const logoPath = getInsurerLogoPath(card.insurer);
                const logoKey = institutionLogoKeyFromInsurerName(card.insurer);
                const { insurerName, productName } = splitInsurerAndProduct(card.insurer);

                return (
                  <div
                    key={card.key}
                    className={`group relative grid gap-3 border-t border-violet-100 px-4 first:border-t-0 hover:bg-violet-50/40 sm:grid-cols-[44px_minmax(0,1fr)_minmax(120px,0.42fr)_minmax(132px,auto)_36px] sm:items-center ${
                      compactList ? "py-2" : "py-3"
                    }`}
                  >
                    <div className="flex items-center gap-2 sm:block">
                      <span
                        className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-black ${
                          idx === 0
                            ? "border-violet-500 bg-[linear-gradient(135deg,#111827_0%,#4c1d95_58%,#7c3aed_100%)] text-white"
                            : "border-violet-100 bg-white text-slate-700"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      {podium ? (
                        <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-700 sm:hidden">
                          {podium.badgeText}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-violet-100 bg-white shadow-sm ${institutionLogoFrameClass(
                          logoKey,
                          "compact"
                        )}`}
                      >
                        {logoPath ? (
                          <Image
                            src={logoPath}
                            alt={insurerName}
                            fill
                            sizes="64px"
                            className={institutionLogoImageClass(logoKey)}
                          />
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400">LOGO</span>
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="break-words text-base font-black leading-tight text-slate-950">
                            {insurerName}
                          </div>
                          {podium ? (
                            <span className="hidden rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-700 sm:inline-flex">
                              {podium.badgeText}
                            </span>
                          ) : null}
                        </div>
                        <div className="break-words text-xs font-semibold leading-snug text-slate-500">
                          {productName}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {card.badges.map((badge) => (
                        <span
                          key={badge}
                          className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700 sm:text-right">
                        Plnění
                      </div>
                      <div className="mt-0.5 whitespace-nowrap text-base font-black leading-none text-slate-950 sm:text-right">
                        {formatMoney(card.payout)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setInfoOpen(infoOpen === card.key ? null : card.key)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-white text-xs font-black text-violet-700 transition hover:border-fuchsia-300 hover:bg-fuchsia-50"
                      aria-label={`Zobrazit výpočet pro ${card.insurer}`}
                      aria-expanded={infoOpen === card.key}
                      aria-haspopup="dialog"
                      title="Výpočet"
                    >
                      i
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {selectedInfoCard && selectedInfoCardParts ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"
            onClick={() => setInfoOpen(null)}
          >
            <div
              className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-[30px] border border-violet-100 bg-white shadow-[0_34px_100px_rgba(15,23,42,0.34)]"
              role="dialog"
              aria-modal="true"
              aria-label={`Detail výpočtu pro ${selectedInfoCard.insurer}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-2 border-b border-violet-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-700">
                    Výpočet
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-lg font-black leading-tight text-slate-950 sm:text-xl">
                      {selectedInfoCardParts.insurerName}
                    </h3>
                    {selectedInfoCard.badges.map((badge) => (
                      <span
                        key={badge}
                        className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                  <div className="mt-0.5 break-words text-sm font-semibold text-slate-500">
                    {selectedInfoCardParts.productName}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="text-left sm:text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700">
                      Plnění
                    </div>
                    <div className="mt-0.5 whitespace-nowrap text-lg font-black leading-none text-slate-950 sm:text-xl">
                      {formatMoney(selectedInfoCard.payout)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInfoOpen(null)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-950 bg-slate-950 text-white transition hover:bg-black"
                    aria-label="Zavřít detail výpočtu"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div
                className={`grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:overflow-hidden lg:p-5 ${
                  selectedInfoCard.infoSections
                    ? "lg:grid-cols-[minmax(0,0.72fr)_minmax(680px,1.28fr)]"
                    : "lg:grid-cols-1"
                }`}
              >
                {selectedInfoCard.infoSections ? (
                  <div className="min-h-0 space-y-3 overflow-y-auto lg:max-h-[72vh]">
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-fuchsia-700">
                      Přehled ze znění PP
                    </div>
                    {selectedInfoCard.infoSections.map((section) => (
                      <section
                        key={section.title}
                        className={`rounded-2xl border p-3 ${
                          section.emphasis
                            ? "border-fuchsia-200 bg-fuchsia-50/80"
                            : "border-violet-100 bg-white"
                        }`}
                      >
                        <h4
                          className={`text-sm font-black leading-snug ${
                            section.emphasis ? "text-fuchsia-800" : "text-slate-950"
                          }`}
                        >
                          {section.title}
                        </h4>
                        {section.body ? (
                          <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-slate-700">
                            {section.body}
                          </p>
                        ) : null}
                        {section.items ? (
                          <ul className="mt-2 space-y-1.5 text-[13px] font-semibold leading-relaxed text-slate-700">
                            {section.items.map((item) => (
                              <li key={item} className="flex gap-2">
                                <span
                                  className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                                    section.emphasis ? "bg-fuchsia-600" : "bg-violet-500"
                                  }`}
                                />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </section>
                    ))}
                  </div>
                ) : null}

                <div className="min-h-0 space-y-4 overflow-y-auto lg:max-h-[72vh]">
                  <PayoutCurveChart
                    points={selectedInfoCard.curve}
                    currentPercent={rangePercentValue}
                    maxPayoutPercent={selectedInfoChartMaxPayoutPercent}
                    sumInsured={sumInsuredValue}
                    diagnosisExamples={selectedInfoCard.diagnosisExamples}
                  />

                  {selectedInfoCard.tablePreview ? (
                    <div className="min-h-0 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
                      <div className="space-y-3 border-b border-violet-100 bg-white px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                            {selectedInfoCard.tablePreview.title}
                          </div>
                          <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-700">
                            Aktuální řádek
                          </span>
                        </div>
                        {selectedInfoActiveRow ? (
                          <div className="rounded-2xl border border-fuchsia-200 bg-[linear-gradient(135deg,#fdf2f8_0%,#fae8ff_100%)] p-3">
                            <div className="grid gap-2 sm:grid-cols-2">
                              {selectedInfoCard.tablePreview.columns.map((column, index) => (
                                <div key={column} className="min-w-0">
                                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-600">
                                    {column}
                                  </div>
                                  <div className="mt-0.5 break-words text-sm font-black text-fuchsia-950">
                                    {selectedInfoActiveRow.cells[index]}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div
                        ref={infoTableScrollRef}
                        className="max-h-[34vh] overflow-auto lg:max-h-[36vh]"
                      >
                        <table className="w-full min-w-[420px] border-collapse text-left text-xs">
                          <thead className="sticky top-0 z-10 bg-violet-50 text-slate-700">
                            <tr>
                              {selectedInfoCard.tablePreview.columns.map((column) => (
                                <th
                                  key={column}
                                  className="border-b border-violet-100 px-3 py-2 font-black"
                                >
                                  {column}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {selectedInfoCard.tablePreview.rows.map((row, rowIndex) => (
                              <tr
                                key={`${row.cells.join("|")}-${rowIndex}`}
                                data-active-row={row.active ? "true" : undefined}
                                className={
                                  row.active
                                    ? "bg-fuchsia-50 text-slate-950"
                                    : rowIndex % 2 === 0
                                      ? "bg-white"
                                      : "bg-slate-50/70"
                                }
                              >
                                {row.cells.map((cell, cellIndex) => (
                                  <td
                                    key={`${cell}-${cellIndex}`}
                                    className={`border-b border-violet-50 px-3 py-2 ${
                                      row.active
                                        ? `bg-fuchsia-50 font-black text-fuchsia-900 ${
                                            cellIndex === 0
                                              ? "border-l-4 border-l-fuchsia-500"
                                              : ""
                                          }`
                                        : cellIndex === 0
                                          ? "font-semibold text-slate-700"
                                          : "font-semibold text-slate-600"
                                    }`}
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

    </AppLayout>
  );
}
