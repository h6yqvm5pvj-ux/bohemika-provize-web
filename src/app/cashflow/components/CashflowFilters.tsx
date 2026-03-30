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
  const baseChip =
    "rounded-full border px-3 py-1.5 transition text-xs sm:text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]";

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
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-300/80">
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
                  ? "border-emerald-300/70 bg-gradient-to-br from-emerald-300/55 to-teal-300/35 text-slate-950 shadow-[0_10px_24px_rgba(52,211,153,0.35)]"
                  : "border-white/25 bg-white/6 text-slate-100 hover:bg-white/12"
              }`}
            >
              Kombinovaný
            </button>
            <button
              type="button"
              onClick={() => onScopeChange("own")}
              className={`${baseChip} ${
                scopeFilter === "own"
                  ? "border-emerald-300/70 bg-gradient-to-br from-emerald-300/55 to-teal-300/35 text-slate-950 shadow-[0_10px_24px_rgba(52,211,153,0.35)]"
                  : "border-white/25 bg-white/6 text-slate-100 hover:bg-white/12"
              }`}
            >
              Vlastní
            </button>
            <button
              type="button"
              onClick={() => onScopeChange("team")}
              className={`${baseChip} ${
                scopeFilter === "team"
                  ? "border-emerald-300/70 bg-gradient-to-br from-emerald-300/55 to-teal-300/35 text-slate-950 shadow-[0_10px_24px_rgba(52,211,153,0.35)]"
                  : "border-white/25 bg-white/6 text-slate-100 hover:bg-white/12"
              }`}
            >
              Týmové
            </button>
          </div>
        </div>
      )}

      <div className="px-1 py-1">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-300/80">
              Filtrování produktů
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto whitespace-nowrap px-1 pb-1">
          {PRODUCT_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onProductChange(option.value)}
              className={`${baseChip} ${
                productFilter === option.value
                  ? "border-cyan-300/70 bg-gradient-to-br from-cyan-300/55 to-sky-300/35 text-slate-950 shadow-[0_10px_24px_rgba(56,189,248,0.35)]"
                  : "border-white/25 bg-white/6 text-slate-100 hover:bg-white/12"
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
