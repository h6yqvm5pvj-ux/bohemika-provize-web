import { useState } from "react";

import { formatMoney } from "../homeUtils";
import { type ChartMode } from "../types";

type PersonalSeriesPoint = {
  label: string;
  lifeMonthly: number;
  otherAnnual: number;
  totalCombined: number;
};

function PersonalProductionChart({ data }: { data: PersonalSeriesPoint[] }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const plotWidth = Math.min(560, Math.max(320, data.length * 42));
  const plotHeight = 180;
  const paddingX = 28;
  const paddingY = 24;
  const viewWidth = plotWidth + paddingX * 2;
  const viewHeight = plotHeight + paddingY * 2 + 26;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;
  const maxValue = Math.max(...data.map((d) => d.totalCombined), 1);
  const hasData = data.some((d) => d.totalCombined > 0);

  const yFor = (value: number) =>
    paddingY + plotHeight - (Math.min(maxValue, value) / maxValue) * plotHeight;

  const points = data.map((d, i) => ({
    x: paddingX + step * i,
    y: yFor(d.totalCombined),
  }));

  const totalPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    points.length > 1
      ? [
          `M${points[0].x.toFixed(1)},${paddingY + plotHeight}`,
          ...points.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`),
          `L${points[points.length - 1].x.toFixed(1)},${paddingY + plotHeight}`,
          "Z",
        ].join(" ")
      : "";

  const latest = data[data.length - 1] ?? { lifeMonthly: 0, otherAnnual: 0, totalCombined: 0 };
  const selected = selectedIdx != null && selectedIdx >= 0 && selectedIdx < data.length
    ? data[selectedIdx]
    : null;
  const tooltipX = selectedIdx != null ? paddingX + step * selectedIdx : 0;
  const tooltipY = selected != null ? yFor(selected.totalCombined) : 0;
  const tooltipWidth = 220;
  const tooltipHeight = 74;
  const tooltipXClamped = Math.max(
    8,
    Math.min(tooltipX - tooltipWidth / 2, viewWidth - tooltipWidth - 8)
  );
  const tooltipYClamped = Math.max(
    8,
    Math.min(tooltipY - tooltipHeight - 12, viewHeight - tooltipHeight - 8)
  );

  return (
    <div className="rounded-3xl border border-white/12 bg-slate-900/75 backdrop-blur-2xl p-5 sm:p-6 shadow-[0_22px_80px_rgba(0,0,0,0.85)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-white">
            Graf produkce — posledních 12 měsíců
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-200">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-300" />
            <span className="font-semibold text-white">{formatMoney(latest.totalCombined)}</span>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-0 w-full max-w-full">
          <svg
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            role="img"
            aria-label="Graf osobní produkce za 12 měsíců"
            className="w-full"
          >
            <defs>
              <linearGradient id="totalLine" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(103,232,249,0.25)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0.03)" />
              </linearGradient>
              <filter id="tooltipShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="rgba(0,0,0,0.35)" />
              </filter>
            </defs>

            <g>
              {points.map((p, i) => {
                return (
                  <line
                    key={`grid-${i}`}
                    x1={p.x}
                    x2={p.x}
                    y1={paddingY}
                    y2={paddingY + plotHeight}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={1}
                  />
                );
              })}
            </g>

            {[0.25, 0.5, 0.75, 1].map((ratio, idx) => {
              const y = paddingY + plotHeight * ratio;
              const value = maxValue * (1 - ratio);
              return (
                <g key={`hgrid-${idx}`}>
                  <line
                    x1={paddingX}
                    x2={paddingX + plotWidth}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth={1}
                    strokeDasharray="4 6"
                  />
                  <text
                    x={paddingX + plotWidth + 8}
                    y={y + 4}
                    fontSize="10"
                    fill="rgba(148,163,184,0.75)"
                  >
                    {formatMoney(Math.round(value))}
                  </text>
                </g>
              );
            })}

            {hasData && areaPath && (
              <path d={areaPath} fill="url(#areaFill)" stroke="none" />
            )}

            <path
              d={totalPath}
              fill="none"
              stroke="url(#totalLine)"
              strokeWidth={4}
              strokeLinecap="round"
            />

            {points.map((p, i) => {
              const d = data[i];
              const { x, y: yTotal } = p;
              return (
                <g
                  key={`pt-${i}`}
                  className="cursor-pointer"
                  onClick={() => setSelectedIdx(i)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedIdx(i);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <circle cx={x} cy={yTotal} r={12} fill="transparent" />
                  <circle
                    cx={x}
                    cy={yTotal}
                    r={4}
                    fill="#67e8f9"
                    stroke={selectedIdx === i ? "#a5f3fc" : "#0ea5e9"}
                    strokeWidth={1.5}
                  />
                  {selectedIdx === i && (
                    <circle
                      cx={x}
                      cy={yTotal}
                      r={7.5}
                      fill="none"
                      stroke="rgba(103,232,249,0.4)"
                      strokeWidth={2}
                    />
                  )}
                  <text
                    x={x}
                    y={paddingY + plotHeight + 18}
                    textAnchor="middle"
                    fontSize="11"
                    fill="rgba(226,232,240,0.8)"
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}

            {selected && (
              <g transform={`translate(${tooltipXClamped}, ${tooltipYClamped})`}>
                <rect
                  x={0}
                  y={0}
                  width={tooltipWidth}
                  height={tooltipHeight}
                  rx={10}
                  ry={10}
                  fill="rgba(15,23,42,0.9)"
                  stroke="rgba(148,163,184,0.4)"
                  strokeWidth={1}
                  filter="url(#tooltipShadow)"
                />
                <text
                  x={12}
                  y={18}
                  fontSize="11"
                  fill="rgba(226,232,240,0.9)"
                >
                  {selected.label}
                </text>
                <text
                  x={12}
                  y={36}
                  fontSize="12"
                  fill="#67e8f9"
                  fontWeight={600}
                >
                  Celkem: {formatMoney(selected.totalCombined)}
                </text>
                <text
                  x={12}
                  y={52}
                  fontSize="12"
                  fill="#6ee7b7"
                  fontWeight={600}
                >
                  Život: {formatMoney(selected.lifeMonthly)}
                </text>
                <text
                  x={12}
                  y={68}
                  fontSize="12"
                  fill="#a5f3fc"
                  fontWeight={600}
                >
                  Vedlejší: {formatMoney(selected.otherAnnual)}
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>

      {!hasData && (
        <p className="mt-3 text-xs text-slate-300">
          Zatím žádná osobní produkce v posledních 12 měsících – jakmile přibydou
          smlouvy, graf se vyplní.
        </p>
      )}
    </div>
  );
}

type Subordinate = { email: string; name: string };

type ProductionChartSectionProps = {
  chartMode: ChartMode;
  setChartMode: (mode: ChartMode) => void;
  hasTeam: boolean;
  personalProductionSeries: PersonalSeriesPoint[];
  selectedSubordinate: string | null;
  onSelectSubordinate: (val: string | null) => void;
  subordinates: Subordinate[];
  subPickerOpen: boolean;
  setSubPickerOpen: (val: boolean) => void;
  subSearch: string;
  setSubSearch: (val: string) => void;
  isLiteUI: boolean;
};

export function ProductionChartSection({
  chartMode,
  setChartMode,
  hasTeam,
  personalProductionSeries,
  selectedSubordinate,
  onSelectSubordinate,
  subordinates,
  subPickerOpen,
  setSubPickerOpen,
  subSearch,
  setSubSearch,
  isLiteUI,
}: ProductionChartSectionProps) {
  const chartCardClass = isLiteUI
    ? "rounded-3xl border border-white/12 bg-slate-900 px-5 py-5 sm:px-7 sm:py-6 overflow-hidden"
    : "rounded-3xl border border-white/12 bg-slate-900/80 backdrop-blur-2xl px-5 py-5 sm:px-7 sm:py-6 shadow-[0_22px_80px_rgba(0,0,0,0.85)] overflow-hidden";

  return (
    <section className={chartCardClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-2">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-white">
            Osobní produkce — posledních 12 měsíců
          </h2>
          <p className="text-xs text-slate-300">
            Život = měsíční pojistné, vedlejší produkty = roční pojistné
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-slate-900/60 border border-white/10 p-1 backdrop-blur">
            <button
              type="button"
              onClick={() => setChartMode("personal")}
              className={`px-3 py-1.5 text-xs sm:text-[13px] rounded-full transition ${
                chartMode === "personal"
                  ? "bg-white text-slate-900 shadow-md"
                  : "text-slate-200 hover:bg-white/10"
              }`}
            >
              Osobní
            </button>
            {hasTeam && (
              <>
                <button
                  type="button"
                  onClick={() => setChartMode("team")}
                  className={`px-3 py-1.5 text-xs sm:text-[13px] rounded-full transition ${
                    chartMode === "team"
                      ? "bg-white text-slate-900 shadow-md"
                      : "text-slate-200 hover:bg-white/10"
                  }`}
                >
                  Týmová
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode("combined")}
                  className={`px-3 py-1.5 text-xs sm:text-[13px] rounded-full transition ${
                    chartMode === "combined"
                      ? "bg-white text-slate-900 shadow-md"
                      : "text-slate-200 hover:bg-white/10"
                  }`}
                >
                  Souhrnná
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubPickerOpen(true);
                    setChartMode("specific");
                  }}
                  className={`px-3 py-1.5 text-xs sm:text-[13px] rounded-full transition ${
                    chartMode === "specific"
                      ? "bg-white text-slate-900 shadow-md"
                      : "text-slate-200 hover:bg-white/10"
                  }`}
                >
                  Konkrétní
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-200">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-300" />
              Celkem (život měsíčně + vedlejší ročně)
              <span className="font-semibold text-white">
                {formatMoney(personalProductionSeries[personalProductionSeries.length - 1]?.totalCombined ?? 0)}
              </span>
            </span>
          </div>
        </div>
      </div>

      {chartMode === "specific" && hasTeam && (
        <div className="mb-3 rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-200">
              {selectedSubordinate
                ? `Vybraný podřízený: ${
                    subordinates.find((s) => s.email === selectedSubordinate)?.name ??
                    selectedSubordinate
                  }`
                : "Vyber podřízeného"}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubPickerOpen(true)}
                className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:bg-white/10 transition"
              >
                Změnit výběr
              </button>
              {selectedSubordinate && (
                <button
                  type="button"
                  onClick={() => onSelectSubordinate(null)}
                  className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-200 hover:bg-white/5 transition"
                >
                  Vymazat
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <PersonalProductionChart data={personalProductionSeries} />

      {chartMode === "specific" && hasTeam && subPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setSubPickerOpen(false)}
          />
          <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/90 shadow-[0_26px_90px_rgba(0,0,0,0.9)] p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Vyber podřízeného</h3>
                <p className="text-xs text-slate-300">
                  Filtruješ graf pouze na zvoleného člověka.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubPickerOpen(false)}
                className="text-slate-200 hover:text-white text-lg leading-none"
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>

            <input
              type="text"
              value={subSearch}
              onChange={(e) => setSubSearch(e.target.value)}
              placeholder="Hledej podle jména nebo e-mailu"
              className="w-full rounded-xl bg-slate-800/80 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />

            <div className="max-h-72 overflow-auto space-y-2">
              {subordinates
                .filter(
                  (s) =>
                    !subSearch ||
                    s.name.toLowerCase().includes(subSearch.toLowerCase()) ||
                    s.email.toLowerCase().includes(subSearch.toLowerCase())
                )
                .map((s) => (
                  <button
                    key={s.email}
                    type="button"
                    onClick={() => {
                      onSelectSubordinate(s.email);
                      setSubPickerOpen(false);
                      setChartMode("specific");
                    }}
                    className={`w-full text-left rounded-2xl border px-4 py-3 transition ${
                      selectedSubordinate === s.email
                        ? "bg-sky-500/15 border-sky-400/50 text-white"
                        : "bg-white/5 border-white/10 text-slate-200 hover:border-sky-400/60 hover:bg-white/10"
                    }`}
                  >
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="text-xs text-slate-300">{s.email}</div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
