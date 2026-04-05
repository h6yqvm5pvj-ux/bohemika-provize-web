import type { LucideIcon } from "lucide-react";
import { CarFront, HeartPulse, Home, UserRound, UsersRound, WalletCards } from "lucide-react";

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
  { value: "life", label: "Život" },
  { value: "auto", label: "Auto" },
  { value: "property", label: "Majetek" },
  { value: "gold", label: "Zlato" },
  { value: "other", label: "Vedlejší produkty" },
];

const PRODUCT_FILTER_ICONS: Partial<Record<ProductFilter, LucideIcon>> = {
  life: HeartPulse,
  auto: CarFront,
  property: Home,
  gold: WalletCards,
};

export function CashflowFilters({
  hasTeam,
  scopeFilter,
  productFilter,
  onScopeChange,
  onProductChange,
}: CashflowFiltersProps) {
  const baseChip =
    "rounded-full border px-3 py-1.5 transition text-xs sm:text-sm font-medium";

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
                  ? "border-slate-900 bg-slate-950 text-white"
                  : "border-slate-300 bg-white text-slate-800 hover:border-slate-900"
              }`}
            >
              Kombinovaný
            </button>
            <button
              type="button"
              onClick={() => onScopeChange("own")}
              className={`${baseChip} ${
                scopeFilter === "own"
                  ? "border-slate-900 bg-slate-950 text-white"
                  : "border-slate-300 bg-white text-slate-800 hover:border-slate-900"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <UserRound
                  size={14}
                  strokeWidth={2}
                  className={scopeFilter === "own" ? "text-white" : "text-slate-500"}
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
                  ? "border-slate-900 bg-slate-950 text-white"
                  : "border-slate-300 bg-white text-slate-800 hover:border-slate-900"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <UsersRound
                  size={14}
                  strokeWidth={2}
                  className={scopeFilter === "team" ? "text-white" : "text-slate-500"}
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
                className={`${baseChip} inline-flex items-center gap-1.5 ${
                  isActive
                    ? "border-slate-900 bg-slate-950 text-white"
                    : "border-slate-300 bg-white text-slate-800 hover:border-slate-900"
                }`}
              >
                {Icon ? (
                  <Icon
                    size={14}
                    strokeWidth={2}
                    className={isActive ? "text-white" : "text-slate-500"}
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
