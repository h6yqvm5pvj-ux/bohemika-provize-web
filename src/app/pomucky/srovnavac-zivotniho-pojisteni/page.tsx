"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Check,
  Filter,
  Printer,
  RotateCcw,
  Search,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import comparisonData from "./lifeComparisonData.json";

type ComparisonProduct = {
  id: string;
  insurer: string;
  name: string;
  version: string;
};

type ComparisonItem = {
  id: string;
  page: number;
  question: string;
  values: Record<string, string>;
};

type ComparisonSection = {
  title: string;
  items: ComparisonItem[];
};

type ProductView = ComparisonProduct & {
  logo: string;
};

const PRODUCT_LOGOS: Record<string, string> = {
  "cpp-neon": "/icons/cpp.png",
  "koop-flexi": "/icons/koop.png",
  "generali-bel-mondo-20": "/icons/generali.png",
  "nn-orange-risk": "/icons/nn.png",
};

const PRODUCT_VIEWS: ProductView[] = (
  comparisonData.products as ComparisonProduct[]
).map((product) => ({
  ...product,
  logo: PRODUCT_LOGOS[product.id] ?? "/icons/produkt.png",
}));

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCompareValue(value: string): string {
  return normalizeSearchValue(value).replace(/\s+/g, " ");
}

function uniqueSections(sections: ComparisonSection[]): ComparisonSection[] {
  const order: string[] = [];
  const grouped = new Map<string, ComparisonItem[]>();

  sections.forEach((section) => {
    if (!grouped.has(section.title)) {
      order.push(section.title);
      grouped.set(section.title, []);
    }
    grouped.get(section.title)?.push(...section.items);
  });

  return order.map((title) => ({
    title,
    items: grouped.get(title) ?? [],
  }));
}

function productValue(item: ComparisonItem, product: ProductView): string {
  return item.values[product.id] ?? "";
}

function selectedValues(item: ComparisonItem, products: ProductView[]): string[] {
  return products
    .map((product) => normalizeCompareValue(productValue(item, product)))
    .filter(Boolean);
}

function valuesAreSame(item: ComparisonItem, products: ProductView[]): boolean {
  const values = selectedValues(item, products);

  return values.length > 1 && new Set(values).size === 1;
}

function valuesAreDifferent(item: ComparisonItem, products: ProductView[]): boolean {
  const values = selectedValues(item, products);

  return new Set(values).size > 1;
}

function comparisonCellClass(
  item: ComparisonItem,
  product: ProductView,
  products: ProductView[]
): string {
  const value = productValue(item, product);

  if (!value.trim()) {
    return "border-rose-100 bg-rose-50 text-rose-900";
  }

  if (valuesAreSame(item, products)) {
    return "border-emerald-100 bg-emerald-50 text-slate-800";
  }

  return "border-amber-100 bg-amber-50 text-slate-800";
}

function displayValue(value: string): string {
  const trimmed = value.trim();

  if (!/^[a-zá-ž]/.test(trimmed)) return trimmed;

  const splitMatch = trimmed.match(
    /(?:[.;]\s+|\)\s+)(Ano(?:,|\b)|Ne(?:,|\b)|Krácení\b|Pojistné\b|Plnění\b|Úplná\b|Bez\b|Obnosové\b|Nová\b|Maximální\b|Vysoký\b|Nízký\b|Standardní\b|Čekací\b|\d+\s+měsíce?\b)/
  );

  if (!splitMatch?.index || !splitMatch[1]) return trimmed;

  return trimmed.slice(splitMatch.index + splitMatch[0].indexOf(splitMatch[1]));
}

function formatCzechDate(value: string): string {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) return value;

  return `${day}. ${month}. ${year}`;
}

export default function LifeInsuranceComparisonPage() {
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    PRODUCT_VIEWS.map((product) => product.id)
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const groupedSections = useMemo(
    () => uniqueSections(comparisonData.sections as ComparisonSection[]),
    []
  );

  const categoryOptions = groupedSections.map((section) => ({
    title: section.title,
    count: section.items.length,
  }));
  const filteredCategoryOptions = categoryOptions.filter((category) =>
    normalizeSearchValue(category.title).includes(normalizeSearchValue(categorySearch))
  );

  const selectedProducts = PRODUCT_VIEWS.filter((product) =>
    selectedProductIds.includes(product.id)
  );

  const filteredSections = useMemo(() => {
    const query = normalizeSearchValue(searchQuery);
    const categorySet = new Set(selectedCategories);
    const productsForDiff = PRODUCT_VIEWS.filter((product) =>
      selectedProductIds.includes(product.id)
    );

    return groupedSections
      .filter((section) => categorySet.size === 0 || categorySet.has(section.title))
      .map((section) => {
        const items = section.items.filter((item) => {
          if (onlyDifferences && !valuesAreDifferent(item, productsForDiff)) {
            return false;
          }

          if (!query) return true;

          return [section.title, item.question, ...Object.values(item.values)]
            .map(normalizeSearchValue)
            .some((value) => value.includes(query));
        });

        return { ...section, items };
      })
      .filter((section) => section.items.length > 0);
  }, [
    groupedSections,
    onlyDifferences,
    searchQuery,
    selectedCategories,
    selectedProductIds,
  ]);

  const totalItems = filteredSections.reduce(
    (sum, section) => sum + section.items.length,
    0
  );

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  };

  const toggleCategory = (title: string) => {
    setSelectedCategories((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title]
    );
  };

  const resetFilters = () => {
    setSelectedProductIds(PRODUCT_VIEWS.map((product) => product.id));
    setSelectedCategories([]);
    setSearchQuery("");
    setCategorySearch("");
    setOnlyDifferences(false);
  };

  const tableGridColumns =
    selectedProducts.length === 1
      ? "minmax(230px, 0.62fr) minmax(360px, 1fr)"
      : `minmax(230px, 0.62fr) repeat(${selectedProducts.length}, minmax(260px, 1fr))`;
  const baseTableMinWidth = Math.max(980, 240 + selectedProducts.length * 250);
  const tableMinWidth = baseTableMinWidth;
  const generatedDate = formatCzechDate(comparisonData.generatedAt);
  const activeFilterCount =
    (selectedProductIds.length === PRODUCT_VIEWS.length ? 0 : 1) +
    selectedCategories.length +
    (searchQuery.trim() ? 1 : 0) +
    (onlyDifferences ? 1 : 0);
  const filterSummary =
    activeFilterCount === 0
      ? "Bez aktivních filtrů"
      : `${activeFilterCount} aktivních filtrů`;

  return (
    <AppLayout active="tools">
      <div className="w-full space-y-4 overflow-x-hidden px-1 py-1 text-slate-900 sm:px-2 sm:py-2">
        <div className="relative z-20 border-b border-slate-200 bg-white/90 pb-3 backdrop-blur">
          <header className="space-y-3">
            <div className="min-w-0 space-y-1">
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
                Srovnavač životního pojištění
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
                <span>{selectedProducts.length} produktů</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>{totalItems} kritérií</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>{filterSummary}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen((current) => !current)}
                aria-expanded={filtersOpen}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-900"
              >
                <Filter className="h-4 w-4" />
                Filtry
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-slate-950 px-1.5 py-0.5 text-[10px] leading-none text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-900"
              >
                <Printer className="h-4 w-4" />
                Tisk
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-900"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
            </div>

            {filtersOpen && (
              <div className="rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-950">Filtry</h2>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {selectedProducts.length} z {PRODUCT_VIEWS.length} produktů ·{" "}
                      {selectedCategories.length === 0
                        ? "všechny kategorie"
                        : `${selectedCategories.length} kategorií`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-900 hover:text-slate-950"
                    aria-label="Zavřít filtry"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(260px,1fr)_minmax(360px,1.25fr)]">
                  <section className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-xs font-bold uppercase text-slate-500">
                          Pojišťovny
                        </h3>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedProductIds(
                              PRODUCT_VIEWS.map((product) => product.id)
                            )
                          }
                          className="text-xs font-bold text-slate-700 underline-offset-4 hover:underline"
                        >
                          Vybrat vše
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {PRODUCT_VIEWS.map((product) => {
                          const active = selectedProductIds.includes(product.id);
                          return (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => toggleProduct(product.id)}
                              aria-pressed={active}
                              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-2.5 text-sm font-bold transition ${
                                active
                                  ? "border-slate-950 bg-slate-950 text-white"
                                  : "border-slate-200 bg-white text-slate-800 hover:border-slate-400"
                              }`}
                            >
                              <span className="flex h-6 w-11 items-center justify-center rounded bg-white px-1">
                                <Image
                                  src={product.logo}
                                  alt=""
                                  width={42}
                                  height={18}
                                  className="max-h-5 max-w-full object-contain"
                                />
                              </span>
                              <span className="max-w-[120px] truncate">{product.insurer}</span>
                              {active && <Check className="h-4 w-4 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <section className="space-y-2">
                      <h3 className="text-xs font-bold uppercase text-slate-500">
                        Hledat v kritériích
                      </h3>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          placeholder="Riziko, výluka, čekací doba"
                          className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                        />
                      </div>
                    </section>

                    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800">
                      <span>
                        <span className="block font-bold text-slate-950">
                          Pouze rozdíly
                        </span>
                        <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                          Jen řádky, kde se vybrané produkty liší.
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={onlyDifferences}
                        onChange={(event) => setOnlyDifferences(event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                      />
                    </label>
                  </section>

                  <section className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-bold uppercase text-slate-500">Kategorie</h3>
                      <button
                        type="button"
                        onClick={() => setSelectedCategories([])}
                        className="text-xs font-bold text-slate-700 underline-offset-4 hover:underline"
                      >
                        Všechny
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={categorySearch}
                        onChange={(event) => setCategorySearch(event.target.value)}
                        placeholder="Filtrovat kategorie"
                        className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                      />
                    </div>

                    <div className="max-h-[34vh] overflow-y-auto rounded-lg border border-slate-200 p-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedCategories([])}
                          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                            selectedCategories.length === 0
                              ? "border-slate-950 bg-slate-950 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                          }`}
                        >
                          Všechny ({categoryOptions.length})
                        </button>

                        {filteredCategoryOptions.map((category) => {
                          const active = selectedCategories.includes(category.title);
                          return (
                            <button
                              key={category.title}
                              type="button"
                              onClick={() => toggleCategory(category.title)}
                              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                                active
                                  ? "border-slate-950 bg-slate-950 text-white"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                              }`}
                            >
                              {category.title} ({category.count})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </header>
        </div>

        <div className="w-full overflow-x-auto print:overflow-visible">
          <article
            className="w-full bg-white px-4 pb-12 pt-5 sm:px-6 lg:px-8 print:min-w-0 print:px-0"
            style={{ minWidth: tableMinWidth }}
          >
            <div className="mb-4 flex items-start justify-between gap-6 border-b border-slate-100 pb-3">
              <div>
                <h1 className="text-[34px] font-extrabold leading-none text-[#5d8fac]">
                  Srovnání produktů
                </h1>
                <p className="mt-1 text-lg font-semibold text-[#5d8fac]">
                  životní pojištění
                </p>
              </div>
              <Image
                src="/icons/bohemika_logo.png"
                alt="bohemika"
                width={118}
                height={32}
                className="mt-1 h-8 w-auto object-contain"
              />
            </div>

            {selectedProducts.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                Vyber alespoň jednu pojišťovnu.
              </div>
            ) : (
              <>
                <div
                  className="grid overflow-hidden rounded-lg border border-slate-200 bg-white font-sans"
                  style={{ gridTemplateColumns: tableGridColumns }}
                >
                  <div className="flex items-center border-r border-slate-200 px-3 py-3 text-sm font-bold text-slate-950">
                    Pojišťovna
                  </div>
                  {selectedProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-3 border-r border-slate-100 px-3 py-2 last:border-r-0"
                    >
                      <Image
                        src={product.logo}
                        alt=""
                        width={68}
                        height={32}
                        className="h-8 w-16 object-contain"
                      />
                      <div className="min-w-0">
                        <div className="text-base font-bold leading-tight text-slate-950">
                          {product.insurer}
                        </div>
                        <div className="text-xs font-medium leading-tight text-slate-700">
                          {product.name}
                        </div>
                        <div className="text-[11px] leading-tight text-slate-500">
                          {product.version}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {filteredSections.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                    Pro zadané filtry nejsou žádná kritéria.
                  </div>
                ) : (
                  <div className="mt-4 space-y-4 font-sans">
                    {filteredSections.map((section) => (
                      <section key={section.title}>
                        <div className="rounded-t-lg bg-slate-200 px-3 py-2 text-[13px] font-bold text-slate-700">
                          {section.title}
                        </div>
                        <div className="overflow-hidden rounded-b-lg border-x border-b border-slate-200">
                          {section.items.map((item) => (
                            <div
                              key={item.id}
                              className="grid border-b border-slate-100 last:border-b-0"
                              style={{ gridTemplateColumns: tableGridColumns }}
                            >
                              <div className="flex min-h-[62px] items-center border-r border-slate-100 bg-white px-3 py-2">
                                <p className="text-sm font-semibold leading-6 text-slate-900">
                                  {item.question}
                                </p>
                              </div>
                              {selectedProducts.map((product) => (
                                <div
                                  key={product.id}
                                  className="border-r border-slate-100 bg-white p-1.5 last:border-r-0"
                                >
                                  <div
                                    className={`flex h-full min-h-[50px] items-center justify-center rounded-md border px-3 py-2 text-center ${comparisonCellClass(
                                      item,
                                      product,
                                      selectedProducts
                                    )}`}
                                  >
                                    <p className="whitespace-pre-line text-sm font-medium leading-6">
                                      {displayValue(productValue(item, product)) || "—"}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}

            <footer className="mt-12 flex items-end justify-between border-t border-slate-200 pt-4 text-[11px] text-slate-600">
              <div className="font-semibold leading-4">
                <div>Bohemika a.s.</div>
                <div>Volyňských Čechů 837, 438 01 Žatec, IČO 28506405</div>
                <div>info@bohemika.eu, www.bohemika.eu</div>
              </div>
              <Image
                src="/icons/bohemika_logo.png"
                alt="bohemika"
                width={88}
                height={24}
                className="h-6 w-auto object-contain opacity-80"
              />
              <div className="text-right font-semibold leading-4">
                <div>Zdroj PDF: {comparisonData.source}</div>
                <div>Vytvořeno dne: {generatedDate}</div>
              </div>
            </footer>
          </article>
        </div>
      </div>
    </AppLayout>
  );
}
