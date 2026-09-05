import { useId } from "react";
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

import styles from "../cashflowToolbar.module.css";
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
  const searchId = useId();
  const searchResultId = `${searchId}-result`;
  const foundPrefix = contractNumberMatchCount === 1 ? "Nalezena" : "Nalezeno";
  const searchResultLabel =
    contractNumberMatchCount === 0
      ? "Smlouva s tímto číslem není v aktuálním cashflow výběru."
      : `${foundPrefix} ${formatCount(contractNumberMatchCount, "provize", "provize", "provizí")} · ${formatCount(contractNumberContractCount, "smlouva", "smlouvy", "smluv")}`;
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
    <section className={styles.filters} aria-label="Filtry provizního kalendáře">
      <div className={styles.filterTop}>
        {hasTeam && <div className={styles.scopeControl}>
          <span className={styles.filterLabel}>Smlouvy</span>
          <div className={styles.scopeOptions} role="group" aria-label="Smlouvy">
            <button type="button" onClick={() => onScopeChange("combined")}
              className={styles.scopeButton} aria-pressed={scopeFilter === "combined"}>
              Všechny
            </button>
            <button type="button" onClick={() => onScopeChange("own")}
              className={styles.scopeButton} aria-pressed={scopeFilter === "own"}>
              <UserRound size={14} aria-hidden="true" />Vlastní
            </button>
            <button type="button" onClick={() => onScopeChange("team")}
              className={`${styles.scopeButton} ${styles.teamScope}`} aria-pressed={scopeFilter === "team"}>
              <UsersRound size={14} aria-hidden="true" />Týmové
            </button>
          </div>
        </div>}
        <div className={styles.search}>
          <label htmlFor={searchId} className={styles.srOnly}>Číslo smlouvy</label>
          <Search className={styles.searchIcon} size={16} aria-hidden="true" />
          <input id={searchId} type="search" inputMode="search" autoComplete="off"
            value={contractNumberQuery}
            onChange={(event) => onContractNumberChange(event.target.value)}
            placeholder="Hledat číslo smlouvy"
            aria-describedby={contractNumberSearchActive ? searchResultId : undefined} />
          {contractNumberQuery.trim() && <button type="button" onClick={() => onContractNumberChange("")}
            className={styles.clearSearch} aria-label="Vyčistit číslo smlouvy">
            <X size={14} aria-hidden="true" />
          </button>}
        </div>
      </div>

      <div className={styles.productsRow}>
        <span className={styles.filterLabel}>Produkty</span>
        <div className={styles.products} role="group" aria-label="Produkty">
          {productFilterOptions.map((option) => {
            const Icon = PRODUCT_FILTER_ICONS[option.value];
            return <button key={option.value} type="button" onClick={() => onProductChange(option.value)}
              className={styles.productButton} aria-pressed={productFilter === option.value}>
              {Icon && <Icon size={14} aria-hidden="true" />}{option.label}
            </button>;
          })}
        </div>
      </div>

      {contractNumberSearchActive && <div id={searchResultId} role="status"
        className={`${styles.searchResult} ${contractNumberMatchCount === 0 ? styles.noResults : ""}`}>
        {contractNumberSummary ? <div className={styles.searchSummary}>
          <span>Nalezena smlouva <strong>{productLabel(contractNumberSummary.productKey)}</strong></span>
          <span>Klient: <strong>{summaryClientName}</strong></span>
          <span>Pojistné: <strong>{summaryAmount}</strong> / {summaryFrequency}</span>
          {summaryStatus && <span className={styles.contractStatus}>Stav: {summaryStatus}</span>}
        </div> : searchResultLabel}
      </div>}
    </section>
  );
}
