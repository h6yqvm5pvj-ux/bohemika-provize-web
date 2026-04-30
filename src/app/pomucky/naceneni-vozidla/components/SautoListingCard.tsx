import { ExternalLink } from "lucide-react";

import { type SautoMarketListing, type SautoMatchTone } from "../types";

function matchToneClass(tone: SautoMatchTone): string {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "ok") return "border-sky-200 bg-sky-50 text-sky-700";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function matchCardAccentClass(tone?: SautoMatchTone): string {
  if (tone === "good") return "border-l-4 border-l-emerald-300";
  if (tone === "ok") return "border-l-4 border-l-sky-300";
  if (tone === "warn") return "border-l-4 border-l-amber-300";
  if (tone === "bad") return "border-l-4 border-l-rose-300";
  return "";
}

type SautoListingCardProps = {
  listing: SautoMarketListing;
  fallbackUrl: string;
  formatCurrency: (value: number | null | undefined) => string;
  formatNumber: (value: number | null | undefined) => string;
};

export function SautoListingCard({ listing, fallbackUrl, formatCurrency, formatNumber }: SautoListingCardProps) {
  const target = listing.url || fallbackUrl;
  const match = listing.match;
  const yearLabel = listing.year ? String(listing.year) : "—";
  const mileageLabel = listing.mileageKm != null ? `${formatNumber(listing.mileageKm)} km` : "—";
  const fuelLabel = listing.fuel || "—";
  const locationLabel = listing.location || "Lokalita neuvedena";
  const sellerLabel = listing.seller || "Prodejce neuveden";

  return (
    <a
      href={target}
      target="_blank"
      rel="noreferrer"
      className={`group rounded-xl border border-slate-200/70 bg-white px-4 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm ${matchCardAccentClass(
        match?.tone
      )}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold tracking-tight text-slate-900">{listing.title}</div>
        </div>
        <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-slate-600" />
      </div>

      {match && (
        <div className="mt-2 flex flex-wrap gap-1">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${matchToneClass(match.tone)}`}>
            {match.label}
          </span>
          {match.reasons.slice(0, 3).map((reason) => (
            <span
              key={`${listing.id}-${reason}`}
              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500"
            >
              {reason}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-3xl font-semibold leading-none tracking-tight text-slate-900">
          {formatCurrency(listing.priceCzk)}
        </div>
        <div className="text-[11px] font-medium text-slate-500">Cenový inzerát</div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rok</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-800">{yearLabel}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Nájezd</div>
          <div className="mt-0.5 truncate text-xs font-semibold text-slate-800">{mileageLabel}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Palivo</div>
          <div className="mt-0.5 truncate text-xs font-semibold text-slate-800">{fuelLabel}</div>
        </div>
      </div>

      <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
        <div className="truncate">{locationLabel}</div>
        <div className="truncate">{sellerLabel}</div>
      </div>
    </a>
  );
}
