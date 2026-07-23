import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  CarFront,
  CreditCard,
  Globe2,
  HeartPulse,
  Home,
  Landmark,
  Plane,
  Search,
  Tag,
  UserRound,
  UsersRound,
  Sparkles,
  X,
} from "lucide-react";

import { REVENUE_SCOPE_THEME } from "@/app/lib/revenueScopeTheme";
import { formatMoney, frequencyText, productLabel } from "../helpers";
import type { CashflowItem, ProductFilter, ScopeFilter } from "../types";

type ContractSearchSummary = {
  productKey: CashflowItem["productKey"];
  clientName: string | null;
  inputAmount: number | null;
  frequency: CashflowItem["frequency"];
  contractStatus: CashflowItem["contractStatus"];
};

type CashflowFiltersProps = {
  hasTeam: boolean;
  scopeFilter: ScopeFilter;
  productFilter: ProductFilter;
  showSubscriptionFilter?: boolean;
  contractNumberQuery: string;
  contractNumberSearchActive: boolean;
  contractNumberMatchCount: number;
  contractNumberContractCount: number;
  contractNumberSummary: ContractSearchSummary | null;
  onScopeChange: (scope: ScopeFilter) => void;
  onProductChange: (filter: ProductFilter) => void;
  onContractNumberChange: (value: string) => void;
};

const PRODUCT_FILTER_OPTIONS: { value: ProductFilter; label: string }[] = [
  { value: "all", label: "Všechny" },
  { value: "tip", label: "TIP" },
  { value: "subscription", label: "Předplatné" },
  { value: "life", label: "Život" },
  { value: "auto", label: "Auto" },
  { value: "property", label: "Majetek" },
  { value: "entrepreneurs", label: "Podnikatele" },
  { value: "travel", label: "Cestovní" },
  { value: "foreigners", label: "Cizinci" },
  { value: "gold", label: "Zlato" },
];

const PRODUCT_FILTER_ICONS: Partial<Record<ProductFilter, LucideIcon>> = {
  all: Sparkles,
  tip: Tag,
  subscription: CreditCard,
  life: HeartPulse,
  auto: CarFront,
  property: Home,
  entrepreneurs: BriefcaseBusiness,
  travel: Plane,
  foreigners: Globe2,
  gold: Landmark,
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
    activeClass: REVENUE_SCOPE_THEME.own.activeChipClass,
  },
  team: {
    activeClass: REVENUE_SCOPE_THEME.team.activeChipClass,
  },
};

const PRODUCT_FILTER_VISUALS: Record<ProductFilter, ChipVisual> = {
  all: {
    activeClass:
      "z-10 border-slate-900 bg-[linear-gradient(135deg,#0f172a_0%,#020617_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(2,6,23,0.32)]",
  },
  tip: {
    activeClass: REVENUE_SCOPE_THEME.tip.activeChipClass,
  },
  subscription: {
    activeClass:
      "z-10 border-emerald-500/55 bg-[linear-gradient(135deg,#34d399_0%,#047857_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(4,120,87,0.32)]",
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
  entrepreneurs: {
    activeClass:
      "z-10 border-indigo-500/55 bg-[linear-gradient(135deg,#818cf8_0%,#4338ca_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(67,56,202,0.35)]",
  },
  travel: {
    activeClass:
      "z-10 border-sky-500/55 bg-[linear-gradient(135deg,#38bdf8_0%,#0369a1_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(3,105,161,0.35)]",
  },
  foreigners: {
    activeClass:
      "z-10 border-teal-500/55 bg-[linear-gradient(135deg,#2dd4bf_0%,#0f766e_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(15,118,110,0.35)]",
  },
  gold: {
    activeClass:
      "z-10 border-amber-500/55 bg-[linear-gradient(135deg,#facc15_0%,#ca8a04_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(202,138,4,0.34)]",
  },
};

function formatCount(count: number, singular: string, few: string, many: string): string {
  if (count === 1) return `1 ${singular}`;
  if (count >= 2 && count <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

function contractStatusLabel(
  status: ContractSearchSummary["contractStatus"] | undefined
): string | null {
  if (typeof status !== "string") return null;
  const normalized = status.trim().toLowerCase();
  if (
    normalized === "storno" ||
    normalized === "stornovana" ||
    normalized === "stornována"
  ) {
    return "stornovaná";
  }
  if (
    normalized === "dozita" ||
    normalized === "dožitá" ||
    normalized === "dozito" ||
    normalized === "dožito"
  ) {
    return "dožitá";
  }
  return null;
}

export function CashflowFilters({
  hasTeam,
  scopeFilter,
  productFilter,
  showSubscriptionFilter = false,
  contractNumberQuery,
  contractNumberSearchActive,
  contractNumberMatchCount,
  contractNumberContractCount,
  contractNumberSummary,
  onScopeChange,
  onProductChange,
  onContractNumberChange,
}: CashflowFiltersProps) {
  const baseChip =
    "ui-focus relative inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition duration-200";
  const inactiveChip =
    "border-slate-200 bg-white text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.06)] hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50";
  const iconClass = "h-4 w-4";
  const foundPrefix = contractNumberMatchCount === 1 ? "Nalezena" : "Nalezeno";
  const searchResultLabel =
    contractNumberMatchCount === 0
      ? "Smlouva s tímto číslem není v aktuálním cashflow výběru."
      : `${foundPrefix} ${formatCount(contractNumberMatchCount, "položka", "položky", "položek")} · ${formatCount(contractNumberContractCount, "smlouva", "smlouvy", "smluv")}`;
  const summaryClientName = contractNumberSummary?.clientName?.trim() || "—";
  const summaryAmount =
    contractNumberSummary &&
    Number.isFinite(Number(contractNumberSummary.inputAmount)) &&
    Number(contractNumberSummary.inputAmount) > 0
      ? formatMoney(Number(contractNumberSummary.inputAmount))
      : "neuvedeno";
  const summaryFrequency = contractNumberSummary?.frequency
    ? frequencyText(contractNumberSummary.frequency)
    : "frekvence neuvedena";
  const summaryStatus = contractStatusLabel(contractNumberSummary?.contractStatus);
  const productFilterOptions = showSubscriptionFilter
    ? PRODUCT_FILTER_OPTIONS
    : PRODUCT_FILTER_OPTIONS.filter((option) => option.value !== "subscription");

  return (
    <section className="relative overflow-visible px-1 py-1">
      <div className={`grid grid-cols-1 gap-4 ${hasTeam ? "xl:grid-cols-[0.95fr_1.2fr]" : ""}`}>
        {hasTeam ? (
          <div className="overflow-visible">
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

        <div className="overflow-visible">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Filtrování produktů
          </p>
          <div className="mt-2.5 -mx-1 px-1">
            <div className="flex flex-nowrap gap-2 overflow-x-auto pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible md:pb-3 md:pt-1">
              {productFilterOptions.map((option) => {
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

      <div className="mt-1 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,390px)_minmax(0,1fr)] lg:items-end">
        <label className="block min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Číslo smlouvy
          </span>
          <span className="relative mt-2.5 flex h-12 items-center">
            <Search
              className="pointer-events-none absolute left-3.5 h-4.5 w-4.5 text-slate-400"
              strokeWidth={2}
              aria-hidden="true"
            />
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              value={contractNumberQuery}
              onChange={(event) => onContractNumberChange(event.target.value)}
              placeholder="Zadej číslo smlouvy"
              className="ui-focus h-full w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-11 font-mono text-[1.05rem] font-semibold text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.07)] outline-none transition placeholder:font-sans placeholder:text-sm placeholder:font-medium placeholder:text-slate-400 hover:border-slate-300 focus:border-[#a65af2] focus:ring-4 focus:ring-[#c084fc]/18"
            />
            {contractNumberQuery.trim() ? (
              <button
                type="button"
                onClick={() => onContractNumberChange("")}
                className="ui-focus absolute right-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
                aria-label="Vyčistit číslo smlouvy"
              >
                <X className="h-4 w-4" strokeWidth={2.2} />
              </button>
            ) : null}
          </span>
        </label>

        {contractNumberSearchActive ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${
              contractNumberMatchCount === 0
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            {contractNumberSummary ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span>
                  Nalezena smlouva{" "}
                  <strong className="font-black">
                    {productLabel(contractNumberSummary.productKey)}
                  </strong>
                </span>
                <span className="hidden h-1.5 w-1.5 rounded-full bg-emerald-400 sm:inline-block" />
                <span>
                  Klient: <strong className="font-black">{summaryClientName}</strong>
                </span>
                <span className="hidden h-1.5 w-1.5 rounded-full bg-emerald-400 sm:inline-block" />
                <span>
                  Pojistné:{" "}
                  <strong className="font-black">{summaryAmount}</strong> / {summaryFrequency}
                </span>
                {summaryStatus ? (
                  <>
                    <span className="hidden h-1.5 w-1.5 rounded-full bg-emerald-400 sm:inline-block" />
                    <span className="rounded-full border border-emerald-300 bg-white/65 px-2.5 py-1 text-xs font-black uppercase tracking-[0.08em] text-emerald-950">
                      Stav: {summaryStatus}
                    </span>
                  </>
                ) : null}
              </div>
            ) : (
              searchResultLabel
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
