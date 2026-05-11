import type { LucideIcon } from "lucide-react";
import {
  CarFront,
  HeartPulse,
  Home,
  Landmark,
  Tag,
  Wrench,
  UserRound,
  UsersRound,
  Sparkles,
} from "lucide-react";

import type { ProductFilter, ScopeFilter } from "../types";

type CashflowFiltersProps = {
  hasTeam: boolean;
  scopeFilter: ScopeFilter;
  productFilter: ProductFilter;
  onScopeChange: (scope: ScopeFilter) => void;
  onProductChange: (filter: ProductFilter) => void;
};

const PRODUCT_FILTER_OPTIONS: { value: ProductFilter; label: string }[] = [
  { value: "all", label: "Všechny" },
  { value: "tip", label: "TIP" },
  { value: "life", label: "Život" },
  { value: "auto", label: "Auto" },
  { value: "property", label: "Majetek" },
  { value: "gold", label: "Zlato" },
  { value: "other", label: "Vedlejší produkty" },
];

const PRODUCT_FILTER_ICONS: Partial<Record<ProductFilter, LucideIcon>> = {
  all: Sparkles,
  tip: Tag,
  life: HeartPulse,
  auto: CarFront,
  property: Home,
  gold: Landmark,
  other: Wrench,
};

type ChipVisual = {
  activeClass: string;
};

const SCOPE_FILTER_VISUALS: Record<ScopeFilter, ChipVisual> = {
  combined: {
    activeClass:
      "z-10 border-slate-900 bg-[linear-gradient(135deg,#0f172a_0%,#020617_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(2,6,23,0.32)]",
  },
  own: {
    activeClass:
      "z-10 border-indigo-500/50 bg-[linear-gradient(135deg,#6366f1_0%,#4338ca_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(67,56,202,0.35)]",
  },
  team: {
    activeClass:
      "z-10 border-amber-500/55 bg-[linear-gradient(135deg,#f59e0b_0%,#c2410c_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(194,65,12,0.34)]",
  },
};

const PRODUCT_FILTER_VISUALS: Record<ProductFilter, ChipVisual> = {
  all: {
    activeClass:
      "z-10 border-slate-900 bg-[linear-gradient(135deg,#0f172a_0%,#020617_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(2,6,23,0.32)]",
  },
  tip: {
    activeClass:
      "z-10 border-emerald-500/55 bg-[linear-gradient(135deg,#34d399_0%,#047857_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(4,120,87,0.35)]",
  },
  life: {
    activeClass:
      "z-10 border-rose-500/55 bg-[linear-gradient(135deg,#fb7185_0%,#e11d48_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(225,29,72,0.34)]",
  },
  auto: {
    activeClass:
      "z-10 border-blue-500/55 bg-[linear-gradient(135deg,#60a5fa_0%,#1d4ed8_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(29,78,216,0.35)]",
  },
  property: {
    activeClass:
      "z-10 border-cyan-500/55 bg-[linear-gradient(135deg,#22d3ee_0%,#0e7490_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(14,116,144,0.35)]",
  },
  gold: {
    activeClass:
      "z-10 border-amber-500/55 bg-[linear-gradient(135deg,#facc15_0%,#ca8a04_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(202,138,4,0.34)]",
  },
  other: {
    activeClass:
      "z-10 border-slate-500/55 bg-[linear-gradient(135deg,#64748b_0%,#334155_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(51,65,85,0.34)]",
  },
};

export function CashflowFilters({
  hasTeam,
  scopeFilter,
  productFilter,
  onScopeChange,
  onProductChange,
}: CashflowFiltersProps) {
  const baseChip =
    "ui-focus relative inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition duration-200";
  const inactiveChip =
    "border-slate-200 bg-white text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.06)] hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50";
  const iconClass = "h-4 w-4";

  return (
    <section className="relative overflow-visible rounded-[28px] border border-white/80 bg-white/86 px-4 py-4 shadow-[0_20px_54px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:px-5 sm:py-5">
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-[28px] bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_92%_15%,rgba(56,189,248,0.09),transparent_38%)]" />

      <div className={`relative z-10 grid grid-cols-1 gap-4 ${hasTeam ? "xl:grid-cols-[0.95fr_1.2fr]" : ""}`}>
        {hasTeam ? (
          <div className="overflow-visible rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Filtrování smluv
            </p>
            <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-3 pb-3 pt-1">
              <button
                type="button"
                onClick={() => onScopeChange("combined")}
                className={`${baseChip} ${
                  scopeFilter === "combined"
                    ? SCOPE_FILTER_VISUALS.combined.activeClass
                    : inactiveChip
                }`}
              >
                Kombinovaný
              </button>

              <button
                type="button"
                onClick={() => onScopeChange("own")}
                className={`${baseChip} ${
                  scopeFilter === "own"
                    ? SCOPE_FILTER_VISUALS.own.activeClass
                    : inactiveChip
                }`}
              >
                <UserRound
                  strokeWidth={2}
                  className={`${iconClass} ${scopeFilter === "own" ? "text-[#f8fafc]" : "text-slate-500"}`}
                  aria-hidden="true"
                />
                Vlastní
              </button>

              <button
                type="button"
                onClick={() => onScopeChange("team")}
                className={`${baseChip} ${
                  scopeFilter === "team"
                    ? SCOPE_FILTER_VISUALS.team.activeClass
                    : inactiveChip
                }`}
              >
                <UsersRound
                  strokeWidth={2}
                  className={`${iconClass} ${scopeFilter === "team" ? "text-[#f8fafc]" : "text-slate-500"}`}
                  aria-hidden="true"
                />
                Týmové
              </button>
            </div>
          </div>
        ) : null}

        <div className="overflow-visible rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Filtrování produktů
          </p>
          <div className="mt-2.5 -mx-1 px-1">
            <div className="flex flex-nowrap gap-2 overflow-x-auto pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible md:pb-3 md:pt-1">
              {PRODUCT_FILTER_OPTIONS.map((option) => {
                const Icon = PRODUCT_FILTER_ICONS[option.value];
                const isActive = productFilter === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onProductChange(option.value)}
                    className={`${baseChip} ${
                      isActive
                        ? PRODUCT_FILTER_VISUALS[option.value].activeClass
                        : inactiveChip
                    }`}
                  >
                    {Icon ? (
                      <Icon
                        strokeWidth={2}
                        className={`${iconClass} ${isActive ? "text-[#f8fafc]" : "text-slate-500"}`}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
