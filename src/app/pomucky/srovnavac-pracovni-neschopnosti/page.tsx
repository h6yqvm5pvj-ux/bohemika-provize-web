"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  CircleX,
  Stethoscope,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
  institutionLogoKeyFromInsurerName,
} from "@/app/lib/institutionLogoDisplay";

type ProductOption = {
  id: string;
  comparisonProductId: string;
  productName: string;
  year: string;
};

type ProductGroup = {
  insurerName: string;
  logoPath: string;
  options: ProductOption[];
};

type ComparisonAnswer = {
  summary: string;
  detail: string;
};

type ComparisonItem = {
  id: string;
  question: string;
  answers: Record<string, ComparisonAnswer>;
};

const PRODUCT_GROUPS: ProductGroup[] = [
  {
    insurerName: "ČPP",
    logoPath: "/icons/cpp.png",
    options: [
      {
        id: "cpp-neon-2026",
        comparisonProductId: "cpp-neon",
        productName: "Neon",
        year: "2026",
      },
    ],
  },
  {
    insurerName: "Generali",
    logoPath: "/icons/generali.png",
    options: [
      {
        id: "generali-bel-mondo-20-2024",
        comparisonProductId: "generali-bel-mondo-20",
        productName: "Bel Mondo 20",
        year: "2024",
      },
    ],
  },
];

const WORK_INCAPACITY_ITEMS: ComparisonItem[] = [
  {
    id: "rizikove-tehotenstvi",
    question:
      "Poskytuje pojišťovna pojistné plnění za pracovní neschopnost při rizikovém těhotenství?",
    answers: {
      "cpp-neon": {
        summary: "Ano, max. 90 dnů (ČD 8 měsíců)",
        detail:
          "Za pracovní neschopnost vystavenou v souvislosti s těhotenstvím a porodem bude plněno nejvýše za 90 dnů pro každé těhotenství.",
      },
      "generali-bel-mondo-20": {
        summary: "Ano, max. 30 dnů, resp. bez omezení (ČD 2 měsíce)",
        detail:
          "Za pracovní neschopnost vystavenou v souvislosti s těhotenstvím a porodem bude plněno nejvýše za 30 dnů pro každé těhotenství (při nepřetržité hospitalizaci alespoň po dobu 3 dnů bezprostředně před počátkem pracovní neschopnosti nebo v karenční době - bez zvláštního limitu).",
      },
    },
  },
  {
    id: "pracovni-uraz",
    question:
      "Poskytuje pojišťovna pojistné plnění za pracovní neschopnost v důsledku pracovního úrazu?",
    answers: {
      "cpp-neon": {
        summary: "Ano, je-li sjednán úraz",
        detail: "Pracovní neschopnost z důvodu úrazu je nutno připojistit.",
      },
      "generali-bel-mondo-20": {
        summary: "Ano, s připojištěním",
        detail: "Pracovní úraz je nutno připojistit.",
      },
    },
  },
  {
    id: "nemoci-z-povolani",
    question: "Poskytuje pojišťovna pojistné plnění za nemoci z povolání?",
    answers: {
      "cpp-neon": {
        summary: "Ano",
        detail: "",
      },
      "generali-bel-mondo-20": {
        summary: "Ano, s připojištěním",
        detail: "Nemoc z povolání je nutno připojistit.",
      },
    },
  },
  {
    id: "cekaci-doby",
    question: "Jaké jsou čekací doby?",
    answers: {
      "cpp-neon": {
        summary: "Nemoc 2 měsíce · Úraz 0 měsíců",
        detail: "Pro těhotenství a porod je čekací doba 8 měsíců.",
      },
      "generali-bel-mondo-20": {
        summary: "Nemoc 2 měsíce · Úraz a akutní infekční onemocnění 0 měsíců",
        detail: "",
      },
    },
  },
  {
    id: "maximalni-davka-bez-zkoumani-prijmu",
    question: "Jaká je maximální dávka bez zkoumání příjmů?",
    answers: {
      "cpp-neon": {
        summary: "600 Kč (od 15. a 29. dne) · 800 Kč (od 60. dne)",
        detail: "",
      },
      "generali-bel-mondo-20": {
        summary: "600 Kč (PN 15 a 29) · 800 Kč (PN 62)",
        detail: "",
      },
    },
  },
  {
    id: "pozdni-nahlaseni-pojistne-udalosti",
    question:
      "Jedná se o produkt bez sankce při pozdním nahlášení pojistné události? (Dokdy je nutné hlásit?)",
    answers: {
      "cpp-neon": {
        summary: "Ano (hlásit až po skončení PN)",
        detail:
          "Povinnost hlásit pojistnou událost bez zbytečného odkladu až po skončení pracovní neschopnosti.",
      },
      "generali-bel-mondo-20": {
        summary: "Ano, s výhradou (hlásit co nejdříve po počátku PN)",
        detail:
          "Povinnost hlásit pojistnou událost (což znamená pracovní neschopnost po jejím počátku) bez zbytečného odkladu.\n\nPři opožděném hlášení, majícím podstatný vliv na šetření pojistné události, je pojišťovna oprávněna plnit až za dobu od oznámení pojistné události.\n\nPojišťovna tvrdí, že akceptuje nahlášení až po skončení pracovní neschopnosti a v souvislosti s tím neaplikuje žádné sankce.",
      },
    },
  },
  {
    id: "maximalni-pocet-dnu-plneni",
    question: "Jaký je maximální počet dnů plnění za pracovní neschopnost?",
    answers: {
      "cpp-neon": {
        summary: "Bez omezení, OSVČ a neplátci 365 dnů",
        detail: "",
      },
      "generali-bel-mondo-20": {
        summary: "730 dnů",
        detail: "",
      },
    },
  },
];

const normalizeValue = (value: string): string => value.trim().replace(/\s+/g, " ");

type ResponseTone = "muted" | "negative" | "limited" | "positive" | "neutral";

const responseTone = (value: string): ResponseTone => {
  const normalized = normalizeValue(value).toLocaleLowerCase("cs-CZ");
  if (!normalized) return "muted";
  if (normalized.startsWith("ne") || normalized.includes("úplná výluka")) {
    return "negative";
  }
  if (
    normalized.includes("výjim") ||
    normalized.includes("omezen") ||
    normalized.includes("podmín") ||
    normalized.includes("připojištěním") ||
    normalized.includes("max.")
  ) {
    return "limited";
  }
  if (normalized.startsWith("ano") || normalized.startsWith("bez omezení")) {
    return "positive";
  }
  return "neutral";
};

const responseTextClass: Record<ResponseTone, string> = {
  muted: "text-slate-400",
  negative: "text-rose-600",
  limited: "text-amber-700",
  positive: "text-emerald-700",
  neutral: "text-sky-700",
};

export default function SrovnavacPracovniNeschopnostiPage() {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [expandedInsurers, setExpandedInsurers] = useState<string[]>(
    PRODUCT_GROUPS.map((group) => group.insurerName)
  );
  const [productPickerConfirmed, setProductPickerConfirmed] = useState(false);
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [expandedResponses, setExpandedResponses] = useState<string[]>([]);

  const allProductIds = useMemo(
    () => PRODUCT_GROUPS.flatMap((group) => group.options.map((option) => option.id)),
    []
  );
  const allProductsSelected =
    allProductIds.length > 0 &&
    allProductIds.every((productId) => selectedProducts.includes(productId));
  const allGroupsExpanded = PRODUCT_GROUPS.every((group) =>
    expandedInsurers.includes(group.insurerName)
  );
  const effectiveSelectedProducts =
    selectedProducts.length > 0 ? selectedProducts : allProductIds;
  const confirmedProducts = PRODUCT_GROUPS.flatMap((group) =>
    group.options
      .filter((option) => effectiveSelectedProducts.includes(option.id))
      .map((option) => ({
        ...option,
        insurerName: group.insurerName,
        logoPath: group.logoPath,
      }))
  );
  const visibleComparisonItems = useMemo(
    () =>
      WORK_INCAPACITY_ITEMS.filter((item) => {
        if (!onlyDifferences || confirmedProducts.length < 2) return true;

        const answers = confirmedProducts.map((product) =>
          normalizeValue(item.answers[product.comparisonProductId]?.summary ?? "")
        );
        return new Set(answers).size > 1;
      }),
    [confirmedProducts, onlyDifferences]
  );

  const toggleProduct = (productId: string) => {
    setSelectedProducts((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  };

  const toggleProductGroup = (productIds: string[]) => {
    setSelectedProducts((current) => {
      const isFullySelected = productIds.every((id) => current.includes(id));
      if (isFullySelected) return current.filter((id) => !productIds.includes(id));

      return Array.from(new Set([...current, ...productIds]));
    });
  };

  const toggleInsurerExpanded = (insurerName: string) => {
    setExpandedInsurers((current) =>
      current.includes(insurerName)
        ? current.filter((name) => name !== insurerName)
        : [...current, insurerName]
    );
  };

  const toggleResponse = (itemId: string, productId: string) => {
    const responseId = `${itemId}:${productId}`;
    setExpandedResponses((current) =>
      current.includes(responseId)
        ? current.filter((id) => id !== responseId)
        : [...current, responseId]
    );
  };

  return (
    <AppLayout active="tools">
      <div className="relative w-full max-w-[1500px] space-y-3 overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#fbf7ff_45%,#ffffff_100%)] px-0 pb-8 sm:space-y-4 sm:px-3">
        <header className="flex flex-col gap-3 px-0 pt-0 sm:gap-4 sm:px-2 sm:pt-2">
          <div className="space-y-2 sm:space-y-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-200 bg-white/92 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700 shadow-[0_8px_18px_rgba(217,70,239,0.08)] sm:gap-2 sm:px-3 sm:text-[11px] sm:tracking-[0.18em] sm:shadow-[0_10px_24px_rgba(217,70,239,0.1)]">
              <ChartNoAxesColumn className="h-3.5 w-3.5" />
              Srovnávač plnění
            </div>
            <div>
              <h1
                className={`font-black leading-[0.98] tracking-tight text-slate-950 ${
                  productPickerConfirmed
                    ? "text-3xl sm:text-4xl lg:text-5xl"
                    : "text-[2.3rem] sm:text-5xl lg:text-6xl"
                }`}
              >
                Pracovní neschopnost
              </h1>
              <p className="mt-1.5 max-w-2xl text-xs font-semibold leading-5 text-slate-500 sm:text-sm sm:leading-6">
                {productPickerConfirmed
                  ? "Přehled podmínek vybraných produktů na jednom místě."
                  : "Vyber produkty a ročníky, které chceš porovnat."}
              </p>
            </div>
          </div>
        </header>

        {!productPickerConfirmed ? (
          <section className="space-y-3">
            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.07)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">
                    Výběr produktů
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Zaklikej produkty a ročníky, které chceš porovnat.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                    {allProductsSelected
                      ? `Vybráno vše: ${selectedProducts.length}`
                      : selectedProducts.length === 0
                        ? "Bez omezení"
                        : `Vybráno: ${selectedProducts.length}`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedProducts(allProductsSelected ? [] : allProductIds)
                    }
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      allProductsSelected
                        ? "border-fuchsia-300/35 bg-[linear-gradient(135deg,#020617_0%,#4c1d95_55%,#ec4899_100%)] !text-white shadow-[0_10px_22px_rgba(76,29,149,0.22)]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50"
                    }`}
                  >
                    {allProductsSelected ? "Zrušit vše" : "Všechny produkty"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedInsurers(
                        allGroupsExpanded
                          ? []
                          : PRODUCT_GROUPS.map((group) => group.insurerName)
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50"
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition ${
                        allGroupsExpanded ? "rotate-180" : ""
                      }`}
                    />
                    {allGroupsExpanded ? "Sbalit vše" : "Rozbalit vše"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductPickerConfirmed(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-fuchsia-300/35 bg-[linear-gradient(135deg,#020617_0%,#4c1d95_55%,#ec4899_100%)] px-4 py-2 text-xs font-black !text-white shadow-[0_12px_26px_rgba(76,29,149,0.25)] transition hover:-translate-y-0.5 hover:brightness-110 sm:px-5"
                  >
                    <span>Pokračovat</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid items-start gap-3 lg:grid-cols-2">
              {PRODUCT_GROUPS.map((group) => {
                const productIds = group.options.map((option) => option.id);
                const selectedCount = productIds.filter((id) =>
                  selectedProducts.includes(id)
                ).length;
                const groupFullySelected =
                  selectedCount === group.options.length && selectedCount > 0;
                const groupPartlySelected =
                  selectedCount > 0 && selectedCount < group.options.length;
                const isExpanded = expandedInsurers.includes(group.insurerName);
                const logoKey = institutionLogoKeyFromInsurerName(group.insurerName);

                return (
                  <section
                    key={group.insurerName}
                    className={`rounded-[18px] border bg-white px-4 py-4 transition ${
                      groupFullySelected || groupPartlySelected
                        ? "border-sky-400 shadow-[0_12px_30px_rgba(14,165,233,0.10)]"
                        : "border-slate-300 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => toggleProductGroup(productIds)}
                        className="flex min-w-0 flex-1 items-center gap-4 rounded-xl text-left transition"
                        aria-pressed={groupFullySelected}
                      >
                        <span
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition ${
                            groupFullySelected || groupPartlySelected
                              ? "border-sky-400 bg-sky-50 text-sky-600"
                              : "border-sky-300 bg-white text-white"
                          }`}
                          aria-hidden="true"
                        >
                          {groupFullySelected ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : groupPartlySelected ? (
                            <span className="h-1 w-4 rounded-full bg-sky-500" />
                          ) : null}
                        </span>
                        <span
                          className={`relative inline-flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-transparent bg-white ${institutionLogoFrameClass(
                            logoKey,
                            "compact"
                          )}`}
                        >
                          <Image
                            src={group.logoPath}
                            alt={group.insurerName}
                            fill
                            sizes="64px"
                            className={institutionLogoImageClass(logoKey)}
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block break-words text-xl font-medium leading-tight text-slate-950 sm:text-[1.7rem]">
                            {group.insurerName} ({selectedCount}/{group.options.length})
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleInsurerExpanded(group.insurerName)}
                        className="ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
                        aria-label={`${isExpanded ? "Sbalit" : "Rozbalit"} ${group.insurerName}`}
                        aria-expanded={isExpanded}
                      >
                        <ChevronDown
                          className={`h-7 w-7 stroke-[2.5] transition ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>

                    {isExpanded ? (
                      <div className="mt-6 space-y-4 pl-12 sm:pl-[76px]">
                        {group.options.map((option) => {
                          const active = selectedProducts.includes(option.id);

                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => toggleProduct(option.id)}
                              className={`flex w-full items-center gap-5 rounded-xl text-left transition ${
                                active
                                  ? "bg-sky-50/70 text-slate-950"
                                  : "text-slate-950 hover:bg-slate-50"
                              }`}
                              aria-pressed={active}
                            >
                              <span
                                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 ${
                                  active
                                    ? "border-sky-400 bg-sky-50 text-sky-600"
                                    : "border-sky-300 bg-white text-white"
                                }`}
                                aria-hidden="true"
                              >
                                {active ? <Check className="h-4 w-4" /> : null}
                              </span>
                              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-5 gap-y-1">
                                <span className="break-words text-lg font-normal leading-snug text-slate-950 sm:text-2xl">
                                  {option.productName}
                                </span>
                                <span className="whitespace-nowrap text-lg font-normal leading-snug text-slate-400 sm:text-2xl">
                                  {option.year}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="space-y-2.5 sm:space-y-3">
            <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex items-center gap-2 text-xs text-slate-500">
                <Stethoscope className="h-4 w-4 text-violet-600" />
                <span>
                  <strong className="font-bold text-slate-800">Srovnání podmínek</strong>
                  <span className="mx-1.5 text-slate-300">•</span>
                  Kliknutím na odpověď zobrazíš detail.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    confirmedProducts.length < 2
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                      : onlyDifferences
                        ? "border-violet-300 bg-violet-50 text-violet-800"
                        : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={onlyDifferences}
                    disabled={confirmedProducts.length < 2}
                    onChange={(event) => setOnlyDifferences(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                  Pouze rozdíly
                </label>
                <button
                  type="button"
                  onClick={() => setProductPickerConfirmed(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Upravit výběr
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <div className="min-w-[800px]">
                <div
                  className="grid border-b border-slate-200 bg-slate-50"
                  style={{
                    gridTemplateColumns: `minmax(250px, 0.8fr) repeat(${confirmedProducts.length}, minmax(270px, 1fr))`,
                  }}
                >
                  <div className="flex min-h-[68px] items-center border-r border-slate-200 px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-sm font-black text-slate-900">
                      <CircleHelp className="h-4 w-4 text-violet-600" />
                      O co jde?
                    </span>
                  </div>
                  {confirmedProducts.map((product) => {
                    const logoKey = institutionLogoKeyFromInsurerName(product.insurerName);

                    return (
                      <div
                        key={product.id}
                        className="flex min-h-[68px] items-center gap-2.5 border-r border-slate-200 px-4 py-3 last:border-r-0"
                      >
                        <span
                          className={`relative inline-flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-transparent bg-white ${institutionLogoFrameClass(
                            logoKey,
                            "compact"
                          )}`}
                        >
                          <Image
                            src={product.logoPath}
                            alt={product.insurerName}
                            fill
                            sizes="48px"
                            className={institutionLogoImageClass(logoKey)}
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-slate-900">
                            {product.insurerName}
                          </span>
                          <span className="mt-0.5 block text-sm font-semibold leading-tight text-slate-700">
                            {product.productName}
                          </span>
                          <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                            {product.year}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
                  <div className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                    <Stethoscope className="h-3.5 w-3.5 text-violet-600" />
                    Pracovní neschopnost
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {visibleComparisonItems.length === 1
                      ? "1 kritérium"
                      : `${visibleComparisonItems.length} kritérií`}
                  </span>
                </div>

                {visibleComparisonItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid border-b border-slate-100 last:border-b-0"
                    style={{
                      gridTemplateColumns: `minmax(250px, 0.8fr) repeat(${confirmedProducts.length}, minmax(270px, 1fr))`,
                    }}
                  >
                    <div className="flex min-h-[72px] items-start gap-2 border-r border-slate-200 bg-white px-4 py-3">
                      <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <p className="text-[13px] font-bold leading-5 text-slate-900">
                        {item.question}
                      </p>
                    </div>

                    {confirmedProducts.map((product) => {
                      const answer = item.answers[product.comparisonProductId] ?? {
                        summary: "Bez odpovědi",
                        detail: "",
                      };
                      const responseId = `${item.id}:${product.id}`;
                      const isExpanded = expandedResponses.includes(responseId);
                      const tone = responseTone(answer.summary);
                      const ResponseIcon =
                        tone === "positive"
                          ? CircleCheck
                          : tone === "negative"
                            ? CircleX
                            : tone === "limited"
                              ? CircleAlert
                              : CircleHelp;
                      const canExpand = Boolean(answer.detail);

                      return (
                        <div
                          key={product.id}
                          className="border-r border-slate-200 bg-white px-4 py-3 last:border-r-0"
                        >
                          <div className="flex h-full min-h-8 items-start gap-2">
                            <ResponseIcon
                              aria-hidden="true"
                              className={`mt-0.5 h-4 w-4 shrink-0 ${responseTextClass[tone]}`}
                            />
                            <div className="min-w-0 flex-1">
                              {canExpand ? (
                                <button
                                  type="button"
                                  onClick={() => toggleResponse(item.id, product.id)}
                                  className="flex w-full items-start justify-between gap-2 text-left"
                                  aria-expanded={isExpanded}
                                >
                                  <span
                                    className={`text-[13px] font-bold leading-5 ${
                                      responseTextClass[tone]
                                    }`}
                                  >
                                    {answer.summary}
                                  </span>
                                  {isExpanded ? (
                                    <ChevronUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                                  ) : (
                                    <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                                  )}
                                </button>
                              ) : (
                                <div
                                  className={`text-[13px] font-bold leading-5 ${
                                    responseTextClass[tone]
                                  }`}
                                >
                                  {answer.summary}
                                </div>
                              )}

                              {isExpanded ? (
                                <div className="mt-2 border-t border-slate-200 pt-2 text-[11px] leading-4 text-slate-600">
                                  <span className="block font-bold text-slate-700">Detail podmínky</span>
                                  <p className="mt-1 whitespace-pre-line font-medium">
                                    {answer.detail}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {visibleComparisonItems.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm font-semibold text-slate-500">
                    Vybrané produkty mají u všech dostupných kritérií stejnou odpověď.
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
