import { Search } from "lucide-react";

import { type SautoMarketResponse } from "../types";
import { SautoListingCard } from "./SautoListingCard";

type SautoPanelProps = {
  compact: boolean;
  loading: boolean;
  error: string | null;
  market: SautoMarketResponse | null;
  hasVehicleForSauto: boolean;
  onSearch: () => void;
  searchDisabled: boolean;
  marketRecommendation: number | null;
  internalEstimateRecommended: number;
  sautoDiffToneClass: string;
  sautoVsInternalPct: number | null;
  formatCurrency: (value: number | null | undefined) => string;
  formatSignedPercent: (value: number | null | undefined) => string;
  formatNumber: (value: number | null | undefined) => string;
};

export function SautoPanel({
  compact,
  loading,
  error,
  market,
  hasVehicleForSauto,
  onSearch,
  searchDisabled,
  marketRecommendation,
  internalEstimateRecommended,
  sautoDiffToneClass,
  sautoVsInternalPct,
  formatCurrency,
  formatSignedPercent,
  formatNumber,
}: SautoPanelProps) {
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white px-5 py-5">
      <div
        className={`transition-all duration-500 ${
          compact ? "flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between" : "flex flex-col items-center justify-center py-10 text-center"
        }`}
      >
        <div className={compact ? "max-w-xl" : "max-w-2xl"}>
          <h2 className={`font-semibold tracking-tight transition-all duration-500 ${compact ? "text-2xl" : "text-4xl sm:text-5xl"}`}>
            <span className="text-slate-900">Trh </span>
            <span className="text-rose-600">SAUTO</span>
          </h2>
          {compact && market && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
              <span>Hledání:</span>
              <span className="font-semibold text-slate-900">{market.keyword}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onSearch}
          disabled={loading || searchDisabled}
          className={`inline-flex items-center justify-center gap-2 rounded-lg border font-semibold text-white transition ${
            compact ? "self-start border-slate-900 bg-slate-900 px-4 py-2 text-sm hover:bg-black" : "mt-5 border-rose-700 bg-rose-600 px-6 py-3 text-base hover:bg-rose-700"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <Search className={compact ? "h-4 w-4" : "h-5 w-5"} />
          {loading ? "Načítám trh..." : "Načíst Sauto"}
        </button>
      </div>

      <div className={`overflow-hidden transition-all duration-500 ${compact ? "mt-5 max-h-[260rem] translate-y-0 opacity-100" : "max-h-0 -translate-y-2 opacity-0"}`}>
        <div className="space-y-4">
          {error && <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>}

          {loading && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 px-4 py-4 text-sm text-slate-600">
              Načítám živé inzeráty ze Sauto.cz.
            </div>
          )}

          {!loading && !market && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 px-4 py-4 text-sm text-slate-600">
              {hasVehicleForSauto
                ? "Klikni na Načíst Sauto a zobrazí se srovnatelné inzeráty s mediánem trhu."
                : "Nejdřív načti VIN, aby šlo vytvořit hledání pro Sauto."}
            </div>
          )}

          {!loading && market && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tržní doporučení</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{formatCurrency(marketRecommendation)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Medián SAUTO</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(market.stats.median)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rozpětí trhu</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                    {market.stats.q1 != null && market.stats.q3 != null ? `${formatCurrency(market.stats.q1)} - ${formatCurrency(market.stats.q3)}` : "—"}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Srovnaných</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                    {market.comparableCount} / {market.count}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <div className="grid gap-3 rounded-xl border border-slate-200/80 bg-white p-3 text-sm sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Interní odhad</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(internalEstimateRecommended)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sauto trh</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(market.stats.recommended)}</div>
                  </div>
                </div>

                <div className={`rounded-xl border px-4 py-3 ${sautoDiffToneClass}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide">Rozdíl</div>
                  <div className="mt-1 text-2xl font-semibold">{formatSignedPercent(sautoVsInternalPct)}</div>
                </div>
              </div>

              {market.count === 0 ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                  Sauto nevrátilo použitelné ceny. Zkus hledat méně přesně nebo upravit model ve vstupních datech.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Nejbližší inzeráty</h3>
                    <div className="text-xs text-slate-500">Top 6 podle shody</div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    {market.listings.slice(0, 6).map((listing) => (
                      <SautoListingCard
                        key={listing.id}
                        listing={listing}
                        fallbackUrl={`https://www.sauto.cz/inzerce/osobni?text=${encodeURIComponent(market.keyword)}`}
                        formatCurrency={formatCurrency}
                        formatNumber={formatNumber}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
