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

export function CashflowFilters({
  hasTeam,
  scopeFilter,
  productFilter,
  onScopeChange,
  onProductChange,
}: CashflowFiltersProps) {
  return (
    <section
      className={`grid grid-cols-1 ${
        hasTeam ? "md:grid-cols-[1.1fr_1fr]" : ""
      } gap-3`}
    >
      {hasTeam && (
        <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-4 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.7)] space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                Filtrování smluv
              </p>
              <p className="text-sm text-slate-200">Vlastní / tým</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
            <button
              type="button"
              onClick={() => onScopeChange("combined")}
              className={`px-3 py-1.5 rounded-full border transition ${
                scopeFilter === "combined"
                  ? "bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/40"
                  : "border-white/20 text-slate-200 hover:bg-white/5"
              }`}
            >
              Kombinovaný
            </button>
            <button
              type="button"
              onClick={() => onScopeChange("own")}
              className={`px-3 py-1.5 rounded-full border transition ${
                scopeFilter === "own"
                  ? "bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/40"
                  : "border-white/20 text-slate-200 hover:bg-white/5"
              }`}
            >
              Vlastní
            </button>
            <button
              type="button"
              onClick={() => onScopeChange("team")}
              className={`px-3 py-1.5 rounded-full border transition ${
                scopeFilter === "team"
                  ? "bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/40"
                  : "border-white/20 text-slate-200 hover:bg-white/5"
              }`}
            >
              Týmové
            </button>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-4 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.7)] space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
              Filtrování produktů
            </p>
            <p className="text-sm text-slate-200">Výběr kategorií</p>
          </div>
        </div>
        <div className="flex flex-nowrap gap-2 text-xs sm:text-sm overflow-x-auto whitespace-nowrap px-1 pb-1">
          {PRODUCT_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onProductChange(option.value)}
              className={`px-3 py-1.5 rounded-full border transition ${
                productFilter === option.value
                  ? "bg-sky-500 text-white border-sky-400 shadow-md shadow-sky-500/40"
                  : "border-white/20 text-slate-200 hover:bg-white/5"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
