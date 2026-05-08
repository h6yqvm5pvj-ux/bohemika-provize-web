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
  activeGlowClass: string;
};

const SCOPE_FILTER_VISUALS: Record<ScopeFilter, ChipVisual> = {
  combined: {
    activeClass:
      "border-0 bg-[linear-gradient(135deg,#334155_0%,#0f172a_100%)] text-[#f8fafc]",
    activeGlowClass: "",
  },
  own: {
    activeClass:
      "border-0 bg-[linear-gradient(135deg,#818cf8_0%,#4338ca_100%)] text-[#f8fafc]",
    activeGlowClass: "",
  },
  team: {
    activeClass:
      "border-0 bg-[linear-gradient(135deg,#fb923c_0%,#c2410c_100%)] text-[#f8fafc]",
    activeGlowClass: "",
  },
};

const PRODUCT_FILTER_VISUALS: Record<ProductFilter, ChipVisual> = {
  all: {
    activeClass:
      "border-0 bg-[linear-gradient(135deg,#334155_0%,#0f172a_100%)] text-[#f8fafc]",
    activeGlowClass: "",
  },
  tip: {
    activeClass:
      "border-0 bg-[linear-gradient(135deg,#34d399_0%,#047857_100%)] text-[#f8fafc]",
    activeGlowClass: "",
  },
  life: {
    activeClass:
      "border-0 bg-[linear-gradient(135deg,#fb7185_0%,#e11d48_100%)] text-[#f8fafc]",
    activeGlowClass: "",
  },
  auto: {
    activeClass:
      "border-0 bg-[linear-gradient(135deg,#60a5fa_0%,#1d4ed8_100%)] text-[#f8fafc]",
    activeGlowClass: "",
  },
  property: {
    activeClass:
      "border-0 bg-[linear-gradient(135deg,#22d3ee_0%,#0e7490_100%)] text-[#f8fafc]",
    activeGlowClass: "",
  },
  gold: {
    activeClass:
      "border-0 bg-[linear-gradient(135deg,#facc15_0%,#ca8a04_100%)] text-[#f8fafc]",
    activeGlowClass: "",
  },
  other: {
    activeClass:
      "border-0 bg-[linear-gradient(135deg,#64748b_0%,#334155_100%)] text-[#f8fafc]",
    activeGlowClass: "",
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
    "rounded-2xl border px-3.5 py-2.5 transition text-xs sm:text-sm font-semibold";
  const inactiveChip =
    "border-slate-300 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50";
  const scopeIconClass = "h-4 w-4";
  const productIconClass = "h-4 w-4";

  return (
    <section
      className={`grid grid-cols-1 ${
        hasTeam ? "md:grid-cols-[1.1fr_1fr]" : ""
      } gap-3`}
    >
      {hasTeam && (
        <div className="px-1 py-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">
                Filtrování smluv
              </p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onScopeChange("combined")}
              className={`${baseChip} ${
                scopeFilter === "combined"
                  ? `${SCOPE_FILTER_VISUALS.combined.activeClass} ${SCOPE_FILTER_VISUALS.combined.activeGlowClass}`
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
                  ? `${SCOPE_FILTER_VISUALS.own.activeClass} ${SCOPE_FILTER_VISUALS.own.activeGlowClass}`
                  : inactiveChip
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <UserRound
                  strokeWidth={2}
                  className={`${scopeIconClass} ${
                    scopeFilter === "own" ? "text-[#f8fafc]" : "text-slate-500"
                  }`}
                  aria-hidden="true"
                />
                <span>Vlastní</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onScopeChange("team")}
              className={`${baseChip} ${
                scopeFilter === "team"
                  ? `${SCOPE_FILTER_VISUALS.team.activeClass} ${SCOPE_FILTER_VISUALS.team.activeGlowClass}`
                  : inactiveChip
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <UsersRound
                  strokeWidth={2}
                  className={`${scopeIconClass} ${
                    scopeFilter === "team" ? "text-[#f8fafc]" : "text-slate-500"
                  }`}
                  aria-hidden="true"
                />
                <span>Týmové</span>
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="px-1 py-1">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">
              Filtrování produktů
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto whitespace-nowrap px-1 pb-1">
          {PRODUCT_FILTER_OPTIONS.map((option) => {
            const Icon = PRODUCT_FILTER_ICONS[option.value];
            const isActive = productFilter === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onProductChange(option.value)}
                className={`${baseChip} inline-flex shrink-0 items-center gap-1.5 ${
                  isActive
                    ? `${PRODUCT_FILTER_VISUALS[option.value].activeClass} ${PRODUCT_FILTER_VISUALS[option.value].activeGlowClass}`
                    : inactiveChip
                }`}
              >
                {Icon ? (
                  <Icon
                    strokeWidth={2}
                    className={`${productIconClass} ${
                      isActive
                        ? "text-[#f8fafc]"
                        : "text-slate-500"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
