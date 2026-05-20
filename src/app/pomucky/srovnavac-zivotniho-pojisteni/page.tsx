"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronUp,
  Check,
  CheckCheck,
  Filter,
  Info,
  Layers3,
  MessageSquareText,
  Printer,
  RotateCcw,
  Search,
  SendHorizontal,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";

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

type ComparisonDataset = {
  source?: string;
  generatedAt?: string;
  products: ComparisonProduct[];
  sections: ComparisonSection[];
};

type ProductView = ComparisonProduct & {
  logo: string;
};

type SetupInsurerGroup = {
  key: string;
  insurer: string;
  logo: string;
  products: ProductView[];
};

type ChatCitation = {
  section: string;
  page: number;
  id: string;
  question: string;
};

type ChatBullet = {
  title: string;
  detail: string;
  citations: ChatCitation[];
};

type ChatStructuredAnswer = {
  summary: string;
  bullets: ChatBullet[];
  citations: ChatCitation[];
  followups: string[];
  sources?: Array<{
    title: string;
    url: string;
  }>;
  intent: string;
};

type LifeComparisonChatApiResponse = {
  ok?: boolean;
  reply?: string;
  answer?: ChatStructuredAnswer;
  warning?: string;
  error?: string;
  meta?: {
    usedItemsCount?: number;
    totalItems?: number;
    intent?: string;
  };
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  answer?: ChatStructuredAnswer;
  warning?: string;
};

type ManualInvaliditaItem = {
  id: string;
  subtitle: string;
  question: string;
  answer: "ANO" | "NE";
  answerByProductId?: Partial<Record<string, string>>;
  infoTitle: string;
  infoParagraphs: string[];
  expandableAnswer?: boolean;
  expandableProducts?: string[];
  answerDetailsByProductId?: Partial<Record<string, string>>;
};

const MANUAL_SECTION_INVALIDITA = "Invalidita";
const MANUAL_INVALIDITA_SUBTITLE_VYPOVEDITELNOST = "Vypověditelnost Invalidity";
const MANUAL_INVALIDITA_QUESTION_VYPOVEDITELNOST =
  "Může pojišťovna vypovědět pojištění invalidity?";
const MANUAL_INVALIDITA_SUBTITLE_ROZPOROVANI = "Rozporování invalidity";
const MANUAL_INVALIDITA_QUESTION_ROZPOROVANI =
  "Vyhrazuje si pojišťovna výslovně právo rozporovat státem uznanou invaliditu?";
const MANUAL_INVALIDITA_SUBTITLE_DUCHOD = "Podmínka doložení důchodu";
const MANUAL_INVALIDITA_QUESTION_DUCHOD =
  "Poskytuje pojišťovna pojistné plnění bez nutnosti doložení rozhodnutí o vyměření invalidního důchodu?";
const MANUAL_INVALIDITA_SUBTITLE_PRECHOZI = "Předchozí nemoci/úrazy";
const MANUAL_INVALIDITA_QUESTION_PRECHOZI =
  "Poskytuje pojišťovna pojistné plnění za invaliditu následkem příčin vzniklých před počátkem pojištění?";
const MANUAL_INVALIDITA_SUBTITLE_ALKOHOL = "Výše krácení za alkohol";
const MANUAL_INVALIDITA_QUESTION_ALKOHOL =
  "Jak přistupuje pojišťovna k určení výše krácení za invaliditu následkem úrazu v příčinné souvislosti s požitím alkoholu?";
const MANUAL_INVALIDITA_INFO_PARAGRAPHS_VYPOVEDITELNOST = [
  "Pojišťovna nemůže ze zákona vypovědět životní pojištění. Vypovězením rozumíme jednostrannou výpověď ke konci pojistného období dle § 2807 občanského zákoníku.",
  "Za životní pojištění je obvykle považováno pojištění pro případ smrti nebo dožití se určitého věku nebo dne určeného smlouvou jako konec pojištění. Za životní pojištění může být ale považováno i pojištění pro případ jiné skutečnosti týkající se změny osobního postavení člověka. Typicky jde o invaliditu nebo závažné onemocnění.",
  "Pojišťovny, které nepovažují pojištění invalidity nebo závažných onemocnění za pojištění životní, tak vystavují své klienty riziku, že jim v budoucnu klíčová rizika z pojištění jednostranně vypoví. To jde proti základnímu principu pojištění - zvýšení míry jistoty pro případ nenadálých životních situací.",
  "Pokud je na vůli pojišťovny, zda zanechá pojištěného v pojištění či nikoliv, vystavuje se klient riziku, že ve chvíli nejvyšší potřeby nesplní pojištění svůj účel a nedostane se mu potřebné pomoci.",
  "Možnost aplikace § 2807 by měla být zachována pouze pro pojištění méně zásadních rizik jako je denní odškodné za úraz nebo pracovní neschopnost. Nikoliv však u invalidity a závažných onemocnění.",
];
const MANUAL_INVALIDITA_INFO_PARAGRAPHS_ROZPOROVANI = [
  "Přiznání invalidity spadá do gesce okresní správy sociálního zabezpečení, která prostřednictvím posudkového lékaře posoudí zdravotní stav a pracovní schopnost pojištěného.",
  "Výsledkem je posudek o invaliditě, ve kterém nalezneme posouzení zdravotního stavu a míry poklesu pracovní schopnosti. Tímto způsobem stát uznává invaliditu dle zákona.",
  "Pojišťovna ovšem může stanovit další podmínky pro přiznání invalidity, čímž opět vychyluje rovnováhu ve svůj prospěch. Je tedy potřeba vybrat pojišťovnu, která bude invaliditu uznanou státem respektovat.",
  "To však neznamená, že taková pojišťovna nemůže provést zdravotní přezkum například pro účely zjištění, zda pojistná událost vznikla v době trvání pojištění či zda nemá souvislost s nemocí vzniklou před pojištěním.",
];
const MANUAL_INVALIDITA_ITEMS: ManualInvaliditaItem[] = [
  {
    id: "vypoveditelnost-invalidity",
    subtitle: MANUAL_INVALIDITA_SUBTITLE_VYPOVEDITELNOST,
    question: MANUAL_INVALIDITA_QUESTION_VYPOVEDITELNOST,
    answer: "NE",
    infoTitle: MANUAL_INVALIDITA_SUBTITLE_VYPOVEDITELNOST,
    infoParagraphs: MANUAL_INVALIDITA_INFO_PARAGRAPHS_VYPOVEDITELNOST,
  },
  {
    id: "rozporovani-invalidity",
    subtitle: MANUAL_INVALIDITA_SUBTITLE_ROZPOROVANI,
    question: MANUAL_INVALIDITA_QUESTION_ROZPOROVANI,
    answer: "NE",
    infoTitle: MANUAL_INVALIDITA_SUBTITLE_ROZPOROVANI,
    infoParagraphs: MANUAL_INVALIDITA_INFO_PARAGRAPHS_ROZPOROVANI,
  },
  {
    id: "podminka-dolozeni-duchodu",
    subtitle: MANUAL_INVALIDITA_SUBTITLE_DUCHOD,
    question: MANUAL_INVALIDITA_QUESTION_DUCHOD,
    answer: "ANO",
    infoTitle: "",
    infoParagraphs: [],
  },
  {
    id: "predchozi-nemoci-urazy",
    subtitle: MANUAL_INVALIDITA_SUBTITLE_PRECHOZI,
    question: MANUAL_INVALIDITA_QUESTION_PRECHOZI,
    answer: "ANO",
    infoTitle: "",
    infoParagraphs: [],
    expandableAnswer: true,
    answerDetailsByProductId: {
      "cpp-neon":
        "Pokud byl klient přijat bez individuálních výluk, pojišťovna bude plnit (pokud nebylo nic zamlčeno).\n\nPojištění se nevztahuje na:\n- zdravotní obtíže, které vznikly nebo byly diagnostikovány před počátkem tohoto pojištění a pro které byl v období 7 let před počátkem tohoto pojištění léčen, lékařsky sledován nebo jejichž příznaky se projevily během tohoto období,\n- nádorová onemocnění, prekancerózy a genetické predispozice k nádorovým onemocněním, které byly kdykoliv před počátkem tohoto pojištění diagnostikovány nebo léčeny,\n\nAVŠAK POUZE pokud byl klient přijat bez zkoumání zdravotního stavu nebo tyto obtíže neuvedl do dotazníku.",
      "koop-flexi":
        "Ano, s výjimkou\nPokud byl klient přijat bez individuálních výluk, pojišťovna bude plnit (pokud nebylo nic zamlčeno).\n\nPojištění se nevztahuje na zdravotní obtíže, které vznikly nebo byly diagnostikovány před počátkem tohoto pojištění a pro které byl v období 7 let před počátkem tohoto pojištění léčen, lékařsky sledován nebo jejichž příznaky se projevily během tohoto období, AVŠAK POUZE pokud byl klient přijat bez zkoumání zdravotního stavu nebo tyto obtíže neuvedl do dotazníku.",
      "nn-orange-risk":
        "Pokud byl klient přijat bez individuálních výluk, pojišťovna bude plnit (pokud nebylo nic zamlčeno).",
      "uniqa-zivot-radost":
        "Pokud byl klient přijat bez individuálních výluk, pojišťovna bude plnit (pokud nebylo nic zamlčeno).",
      "generali-bel-mondo-20":
        "Pokud byl klient přijat bez individuálních výluk, pojišťovna bude plnit (pokud nebylo nic zamlčeno).",
    },
  },
  {
    id: "vyska-kraceni-za-alkohol",
    subtitle: MANUAL_INVALIDITA_SUBTITLE_ALKOHOL,
    question: MANUAL_INVALIDITA_QUESTION_ALKOHOL,
    answer: "NE",
    answerByProductId: {
      "cpp-neon": "Pojistné plnění může být kráceno až o 50%.",
      "generali-bel-mondo-20": "Pojistné plnění může být kráceno až o 50%.",
      "koop-flexi":
        "Krácení na základě přesně stanovených pravidel (odstupňováno dle promilí)",
      "nn-orange-risk":
        "Krácení na základě přesně stanovených pravidel (odstupňováno dle promilí)",
      "uniqa-zivot-radost":
        "Krácení na základě přesně stanovených pravidel (odstupňováno dle promilí)",
    },
    infoTitle: "",
    infoParagraphs: [],
    expandableProducts: [
      "cpp-neon",
      "koop-flexi",
      "generali-bel-mondo-20",
      "nn-orange-risk",
      "uniqa-zivot-radost",
    ],
    answerDetailsByProductId: {
      "cpp-neon": "Pojistné plnění může být kráceno až o 50%.",
      "koop-flexi":
        "Možnost krácení až o 50%, avšak s předvídatelnou výší krácení podle množství alkoholu:\nod 0,51 ‰ do 1,00 ‰, resp. alkohol prokázán, ale nezměřen: pojistné plnění sníženo až o 15 %;\nod 1,01 ‰ výše: pojistné plnění sníženo až o 25 %;\nopakovaná událost pod vlivem alkoholu nebo způsobení škody na zdraví, na majetku či smrti nebo při řízení vozidla: pojistné plnění sníženo o 50 %.",
      "generali-bel-mondo-20": "Pojistné plnění může být kráceno až o 50%.",
      "nn-orange-risk":
        "Možnost krácení až o 50%, avšak s předvídatelnou výší krácení podle množství alkoholu:\nod 0,51 ‰ do 1,50 ‰: pojistné plnění sníženo o 15 %\nod 1,51 ‰ do 3,0 ‰: pojistné plnění sníženo o 25 %\nod 3,01 ‰ výše: pojistné plnění sníženo o 50 %\n\nUvedené hodnoty maximálního krácení platí pouze pro případy, kdy je hodnota alkoholu v krvi zdokumentována.",
      "uniqa-zivot-radost":
        "Možnost krácení až o 50%, avšak s předvídatelnou výší krácení podle množství alkoholu:\nod 0,51 ‰ do 0,99 ‰: pojistné plnění sníženo o 20 %\nod 1,00 ‰ do 1,49 ‰: pojistné plnění sníženo o 30 %\nod 1,49 ‰ do 1,99 ‰: pojistné plnění sníženo o 40 %\nod 2,00 ‰ výše: pojistné plnění sníženo o 50 %\n\nUvedené hodnoty maximálního krácení platí pouze pro případy, kdy je hodnota alkoholu v krvi zdokumentována.",
    },
  },
] as const;

const PRODUCT_LOGOS: Record<string, string> = {
  "cpp-neon": "/icons/cpp.png",
  "koop-flexi": "/icons/koop-v2.png",
  "generali-bel-mondo-20": "/icons/generali.png",
  "nn-orange-risk": "/icons/nn.png",
  "uniqa-zivot-radost": "/icons/uniqa.png",
};
const INSURER_LOGOS: Record<string, string> = {
  Allianz: "/icons/allianz.png",
  "ČPP": "/icons/cpp.png",
  "ČSOB": "/icons/csob.png",
  "Generali Česká": "/icons/generali.png",
  "Komerční pojišťovna": "/icons/kblogo.png",
  Kooperativa: "/icons/koop-v2.png",
  Maxima: "/icons/maxima.png",
  MetLife: "/icons/metlife.png",
  NN: "/icons/nn.png",
  Pillow: "/icons/pillow.png",
  Simplea: "/icons/simplea.png",
  Slavia: "/icons/slavialogo.png",
  UNIQA: "/icons/uniqa.png",
};
const INSURER_CARD_TINT_DEFAULT =
  "bg-[radial-gradient(circle_at_20%_20%,rgba(148,163,184,0.2)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(14,165,233,0.16)_0%,transparent_66%)]";
const INSURER_CARD_TINTS: Record<string, string> = {
  Allianz:
    "bg-[radial-gradient(circle_at_20%_18%,rgba(37,99,235,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(99,102,241,0.16)_0%,transparent_66%)]",
  "ČPP":
    "bg-[radial-gradient(circle_at_20%_18%,rgba(16,185,129,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(37,99,235,0.16)_0%,transparent_66%)]",
  "ČSOB":
    "bg-[radial-gradient(circle_at_20%_18%,rgba(245,158,11,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(234,179,8,0.16)_0%,transparent_66%)]",
  "Generali Česká":
    "bg-[radial-gradient(circle_at_20%_18%,rgba(244,63,94,0.2)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(239,68,68,0.16)_0%,transparent_66%)]",
  "Komerční pojišťovna":
    "bg-[radial-gradient(circle_at_20%_18%,rgba(37,99,235,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(6,182,212,0.16)_0%,transparent_66%)]",
  Kooperativa:
    "bg-[radial-gradient(circle_at_20%_18%,rgba(14,165,233,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(59,130,246,0.16)_0%,transparent_66%)]",
  Maxima:
    "bg-[radial-gradient(circle_at_20%_18%,rgba(244,63,94,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(217,119,6,0.16)_0%,transparent_66%)]",
  MetLife:
    "bg-[radial-gradient(circle_at_20%_18%,rgba(56,189,248,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(148,163,184,0.16)_0%,transparent_66%)]",
  NN: "bg-[radial-gradient(circle_at_20%_18%,rgba(249,115,22,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(245,158,11,0.16)_0%,transparent_66%)]",
  Pillow:
    "bg-[radial-gradient(circle_at_20%_18%,rgba(34,197,94,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(20,184,166,0.16)_0%,transparent_66%)]",
  Simplea:
    "bg-[radial-gradient(circle_at_20%_18%,rgba(99,102,241,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(168,85,247,0.16)_0%,transparent_66%)]",
  Slavia:
    "bg-[radial-gradient(circle_at_20%_18%,rgba(217,119,6,0.2)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(225,29,72,0.16)_0%,transparent_66%)]",
  UNIQA:
    "bg-[radial-gradient(circle_at_20%_18%,rgba(100,116,139,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(37,99,235,0.16)_0%,transparent_66%)]",
};
const EMPTY_COMPARISON_DATA: ComparisonDataset = {
  source: "",
  generatedAt: "",
  products: [],
  sections: [],
};
const LIFE_COMPARISON_CHAT_ENDPOINT = "/api/life-comparison-chat";

function normalizeSearchValue(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

function normalizeCompareValue(value: string): string {
  return normalizeSearchValue(value).replace(/\s+/g, " ");
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

  if (!value.trim()) return "border-rose-100 bg-rose-50 text-rose-900";
  if (valuesAreSame(item, products)) return "border-emerald-100 bg-emerald-50 text-slate-800";
  return "border-amber-100 bg-amber-50 text-slate-800";
}

function displayValue(value: string): string {
  return value.trim();
}

function buildProductViews(products: ComparisonProduct[]): ProductView[] {
  return products.map((product) => ({
    ...product,
    logo:
      PRODUCT_LOGOS[product.id] ??
      INSURER_LOGOS[product.insurer] ??
      "/icons/produkt.png",
  }));
}

function buildSetupInsurerGroups(productViews: ProductView[]): SetupInsurerGroup[] {
  const grouped = new Map<string, ProductView[]>();

  productViews.forEach((product) => {
    if (!grouped.has(product.insurer)) grouped.set(product.insurer, []);
    grouped.get(product.insurer)?.push(product);
  });

  return Array.from(grouped.entries()).map(([insurer, products]) => ({
    key: insurer
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "-"),
    insurer,
    logo: products[0]?.logo ?? "/icons/produkt.png",
    products,
  }));
}

function sameArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

export default function LifeInsuranceComparisonPage() {
  const [comparisonData, setComparisonData] =
    useState<ComparisonDataset>(EMPTY_COMPARISON_DATA);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [hasConfiguredView, setHasConfiguredView] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [setupProductIds, setSetupProductIds] = useState<string[]>([]);
  const [openSetupInsurerKeys, setOpenSetupInsurerKeys] = useState<string[]>([]);
  const [setupStep, setSetupStep] = useState<"insurers" | "categories">("insurers");
  const [setupCategoryTitles, setSetupCategoryTitles] = useState<string[]>([]);
  const [setupInsurerSearch, setSetupInsurerSearch] = useState("");
  const [setupCategorySearch, setSetupCategorySearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeInvaliditaInfoId, setActiveInvaliditaInfoId] = useState<string | null>(
    null
  );
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [dataReloadToken, setDataReloadToken] = useState(0);
  const [expandedInvaliditaAnswerKeys, setExpandedInvaliditaAnswerKeys] = useState<
    string[]
  >([]);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"table" | "assistant">(
    "table"
  );
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const productViews = useMemo(
    () => buildProductViews(comparisonData.products ?? []),
    [comparisonData.products]
  );
  const setupInsurerGroups = useMemo(
    () => buildSetupInsurerGroups(productViews),
    [productViews]
  );
  const filteredSetupInsurerGroups = useMemo(() => {
    const query = normalizeSearchValue(setupInsurerSearch);
    if (!query) return setupInsurerGroups;

    return setupInsurerGroups.filter((group) => {
      const insurerMatch = normalizeSearchValue(group.insurer).includes(query);
      if (insurerMatch) return true;
      return group.products.some((product) =>
        normalizeSearchValue(product.name).includes(query)
      );
    });
  }, [setupInsurerGroups, setupInsurerSearch]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const loadComparisonData = async () => {
      setIsLoadingData(true);
      setDataLoadError(null);

      try {
        const response = await fetch("/api/life-comparison", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          let upstreamMessage = `HTTP ${response.status}`;
          try {
            const errorPayload = (await response.json()) as { error?: string };
            if (errorPayload.error?.trim()) {
              upstreamMessage = errorPayload.error.trim();
            }
          } catch {
            // Keep generic status-only message.
          }
          throw new Error(upstreamMessage);
        }
        const payload = (await response.json()) as ComparisonDataset;
        if (!active) return;
        if (!Array.isArray(payload.products) || !Array.isArray(payload.sections)) {
          throw new Error("Invalid life comparison payload");
        }
        setComparisonData(payload);
        setDataLoadError(null);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        console.error("Failed to load life comparison data from API", error);
        setDataLoadError(
          `Nepodařilo se načíst online data srovnání. ${
            (error as Error).message || ""
          }`.trim()
        );
      } finally {
        if (active) setIsLoadingData(false);
      }
    };

    void loadComparisonData();

    return () => {
      active = false;
      controller.abort();
    };
  }, [dataReloadToken]);

  useEffect(() => {
    const availableProductIds = productViews.map((product) => product.id);
    const availableProductSet = new Set(availableProductIds);

    setSelectedProductIds((current) => {
      const next = current.filter((id) => availableProductSet.has(id));
      return sameArray(current, next) ? current : next;
    });

    setSetupProductIds((current) => {
      const next = current.filter((id) => availableProductSet.has(id));
      return sameArray(current, next) ? current : next;
    });
  }, [productViews]);

  useEffect(() => {
    const groupKeys = setupInsurerGroups.map((group) => group.key);
    setOpenSetupInsurerKeys((current) => {
      const next = current.filter((key) => groupKeys.includes(key));
      return sameArray(current, next) ? current : next;
    });
  }, [setupInsurerGroups]);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages, chatLoading]);

  const groupedSections = useMemo(
    () => uniqueSections(comparisonData.sections ?? []),
    [comparisonData.sections]
  );

  const categoryOptions = useMemo(() => {
    const baseOptions = groupedSections.map((section) => ({
      title: section.title,
      count: section.items.length,
    }));

    if (baseOptions.some((category) => category.title === MANUAL_SECTION_INVALIDITA)) {
      return baseOptions.map((category) =>
        category.title === MANUAL_SECTION_INVALIDITA
          ? { ...category, count: category.count + MANUAL_INVALIDITA_ITEMS.length }
          : category
      );
    }

    return [
      { title: MANUAL_SECTION_INVALIDITA, count: MANUAL_INVALIDITA_ITEMS.length },
      ...baseOptions,
    ];
  }, [groupedSections]);
  const filteredCategoryOptions = categoryOptions.filter((category) =>
    normalizeSearchValue(category.title).includes(normalizeSearchValue(categorySearch))
  );
  const filteredSetupCategoryOptions = useMemo(
    () =>
      categoryOptions.filter((category) =>
        normalizeSearchValue(category.title).includes(
          normalizeSearchValue(setupCategorySearch)
        )
      ),
    [categoryOptions, setupCategorySearch]
  );
  const sortedFilteredSetupCategoryOptions = useMemo(
    () =>
      [...filteredSetupCategoryOptions].sort((a, b) =>
        a.title.localeCompare(b.title, "cs", { sensitivity: "base" })
      ),
    [filteredSetupCategoryOptions]
  );
  const allSetupCategoriesSelected =
    categoryOptions.length > 0 && setupCategoryTitles.length === categoryOptions.length;

  const selectedProducts = productViews.filter((product) =>
    selectedProductIds.includes(product.id)
  );
  const canContinueSetupInsurers = setupProductIds.length > 0;

  const visibleManualInvaliditaItems = useMemo(() => {
    const query = normalizeSearchValue(searchQuery);
    const categorySet = new Set(selectedCategories);
    const categoryMatch =
      categorySet.size === 0 || categorySet.has(MANUAL_SECTION_INVALIDITA);

    if (!categoryMatch) return [];
    if (onlyDifferences) return [];
    if (!query) return MANUAL_INVALIDITA_ITEMS;

    return MANUAL_INVALIDITA_ITEMS.filter((item) =>
      [
        MANUAL_SECTION_INVALIDITA,
        item.subtitle,
        item.question,
        item.answer,
        ...Object.values(item.answerByProductId ?? {}),
        ...Object.values(item.answerDetailsByProductId ?? {}),
      ]
        .map(normalizeSearchValue)
        .some((value) => value.includes(query))
    );
  }, [onlyDifferences, searchQuery, selectedCategories]);

  const visibleApiSections = useMemo(() => {
    const query = normalizeSearchValue(searchQuery);
    const categorySet = new Set(selectedCategories);

    return groupedSections
      .filter((section) => categorySet.size === 0 || categorySet.has(section.title))
      .map((section) => ({
        ...section,
        items: section.items
          .filter((item) => (onlyDifferences ? valuesAreDifferent(item, selectedProducts) : true))
          .filter((item) => {
            if (!query) return true;
            const haystack = [
              section.title,
              item.question,
              ...selectedProducts.map((product) => productValue(item, product)),
            ]
              .map(normalizeSearchValue)
              .join(" ");
            return haystack.includes(query);
          }),
      }))
      .filter((section) => section.items.length > 0);
  }, [groupedSections, onlyDifferences, searchQuery, selectedCategories, selectedProducts]);

  const totalItems =
    visibleManualInvaliditaItems.length +
    visibleApiSections.reduce((sum, section) => sum + section.items.length, 0);
  const activeInvaliditaInfoItem =
    MANUAL_INVALIDITA_ITEMS.find((item) => item.id === activeInvaliditaInfoId) ?? null;
  const expandedInvaliditaAnswerSet = new Set(expandedInvaliditaAnswerKeys);

  const toggleInvaliditaAnswerDetail = (itemId: string, productId: string) => {
    const key = `${itemId}:${productId}`;
    setExpandedInvaliditaAnswerKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const retryLoadComparisonData = () => {
    setDataReloadToken((current) => current + 1);
  };

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

  const toggleSetupProduct = (productId: string) => {
    setSetupProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  };

  const toggleSetupInsurer = (group: SetupInsurerGroup) => {
    const groupIds = group.products.map((product) => product.id);
    setSetupProductIds((current) => {
      const allSelected = groupIds.every((id) => current.includes(id));
      if (allSelected) {
        return current.filter((id) => !groupIds.includes(id));
      }
      return Array.from(new Set([...current, ...groupIds]));
    });
  };

  const toggleSetupInsurerOpen = (groupKey: string) => {
    setOpenSetupInsurerKeys((current) =>
      current.includes(groupKey)
        ? current.filter((key) => key !== groupKey)
        : [...current, groupKey]
    );
  };

  const toggleSetupCategory = (title: string) => {
    setSetupCategoryTitles((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title]
    );
  };

  const openSetupMenu = () => {
    setSetupProductIds(selectedProductIds);
    setSetupStep("insurers");
    setSetupCategoryTitles(selectedCategories);
    setOpenSetupInsurerKeys([]);
    setFiltersOpen(false);
    setSetupInsurerSearch("");
    setSetupCategorySearch("");
    setHasConfiguredView(false);
    setActiveWorkspaceTab("table");
    setActiveInvaliditaInfoId(null);
    setExpandedInvaliditaAnswerKeys([]);
  };

  const continueSetupToCategories = () => {
    if (!canContinueSetupInsurers) return;
    setSetupStep("categories");
    setOpenSetupInsurerKeys([]);
  };

  const confirmSetup = () => {
    if (!canContinueSetupInsurers) return;
    setSelectedProductIds(setupProductIds);
    setSelectedCategories(setupCategoryTitles);
    setSearchQuery("");
    setCategorySearch("");
    setSetupInsurerSearch("");
    setSetupCategorySearch("");
    setFiltersOpen(false);
    setHasConfiguredView(true);
    setActiveWorkspaceTab("table");
    setActiveInvaliditaInfoId(null);
    setExpandedInvaliditaAnswerKeys([]);
  };

  const resetFilters = () => {
    setSelectedProductIds([]);
    setSelectedCategories([]);
    setSearchQuery("");
    setCategorySearch("");
    setOnlyDifferences(false);
    setActiveInvaliditaInfoId(null);
    setExpandedInvaliditaAnswerKeys([]);
  };

  const handleAskChat = async (quickPrompt?: string) => {
    if (chatLoading) return;

    const prompt = (quickPrompt ?? chatQuestion).trim();
    if (!prompt) {
      setChatError("Napiš dotaz pro AI asistenta.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setChatError("Pro AI asistenta je potřeba přihlášení.");
      return;
    }

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: prompt,
    };
    const requestHistory = chatMessages
      .slice(-6)
      .map((message) => ({
        role: message.role,
        text: message.text,
      }));
    setChatMessages((current) => [...current, userMessage]);
    setChatQuestion("");
    setChatLoading(true);
    setChatError(null);

    try {
      const payload = await fetchAuthedJsonOrThrow<LifeComparisonChatApiResponse>(
        user,
        LIFE_COMPARISON_CHAT_ENDPOINT,
        {
          method: "POST",
          body: JSON.stringify({
            prompt,
            selectedProductIds,
            selectedCategoryTitles: selectedCategories,
            onlyDifferences,
            history: requestHistory,
          }),
        }
      );

      const reply = String(payload.reply ?? "").trim();
      if (payload.ok === false || !reply) {
        throw new Error(payload.error || "AI asistent nevrátil odpověď.");
      }

      const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: reply,
        answer: payload.answer,
        warning: payload.warning,
      };
      setChatMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      console.error("Life comparison AI chat failed:", error);
      setChatError(
        error instanceof Error ? error.message : "AI asistent není teď dostupný."
      );
    } finally {
      setChatLoading(false);
    }
  };

  const clearChat = () => {
    setChatMessages([]);
    setChatQuestion("");
    setChatError(null);
  };

  const tableGridColumns =
    selectedProducts.length === 1
      ? "minmax(230px, 0.62fr) minmax(360px, 1fr)"
      : `minmax(230px, 0.62fr) repeat(${selectedProducts.length}, minmax(260px, 1fr))`;
  const baseTableMinWidth = Math.max(980, 240 + selectedProducts.length * 250);
  const tableMinWidth = baseTableMinWidth;
  const activeFilterCount =
    (selectedProductIds.length === productViews.length ? 0 : 1) +
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
            <div
              className={`min-w-0 space-y-1 ${
                hasConfiguredView ? "" : "text-center"
              }`}
            >
              {hasConfiguredView ? (
                <>
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
                </>
              ) : (
                <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                  <span className="block text-slate-900">Srovnej životní pojištění</span>
                  <span className="block text-sky-600">snadno a rychle</span>
                </h1>
              )}
            </div>

            {hasConfiguredView && (
              <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
                <div className="inline-flex shrink-0 items-center rounded-xl border border-slate-300 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setActiveWorkspaceTab("table")}
                    aria-pressed={activeWorkspaceTab === "table"}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition ${
                      activeWorkspaceTab === "table"
                        ? "bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.25)]"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Layers3 className="h-4 w-4" />
                    Tabulky
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveWorkspaceTab("assistant")}
                    aria-pressed={activeWorkspaceTab === "assistant"}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition ${
                      activeWorkspaceTab === "assistant"
                        ? "bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.25)]"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <MessageSquareText className="h-4 w-4" />
                    AI asistent
                  </button>
                </div>
                <button
                  type="button"
                  onClick={openSetupMenu}
                  className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-900"
                >
                  Výběr zobrazení
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((current) => !current)}
                  aria-expanded={filtersOpen}
                  className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-900"
                >
                  <Filter className="h-4 w-4" />
                  Filtry
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-slate-950 px-1.5 py-0.5 text-[10px] leading-none text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                {activeWorkspaceTab === "table" && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-900"
                  >
                    <Printer className="h-4 w-4" />
                    Tisk
                  </button>
                )}
                {activeWorkspaceTab === "assistant" && (
                  <button
                    type="button"
                    onClick={clearChat}
                    className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-900"
                  >
                    Nový chat
                  </button>
                )}
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-900"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </button>
              </div>
            )}

            {hasConfiguredView && filtersOpen && (
              <div className="rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-950">Filtry</h2>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {selectedProducts.length} z {productViews.length} produktů ·{" "}
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
                              productViews.map((product) => product.id)
                            )
                          }
                          className="text-xs font-bold text-slate-700 underline-offset-4 hover:underline"
                        >
                          Vybrat vše
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {productViews.map((product) => {
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

        {dataLoadError && productViews.length > 0 && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-amber-900">{dataLoadError}</p>
              <button
                type="button"
                onClick={retryLoadComparisonData}
                className="inline-flex h-8 items-center rounded-md border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 transition hover:border-amber-500"
              >
                Zkusit znovu
              </button>
            </div>
          </section>
        )}

        {isLoadingData && productViews.length === 0 ? (
          <section className="rounded-lg border border-slate-200 bg-white px-4 py-6">
            <p className="text-sm font-semibold text-slate-700">
              Načítám online data srovnání...
            </p>
          </section>
        ) : dataLoadError && productViews.length === 0 ? (
          <section className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-6">
            <p className="text-sm font-semibold text-rose-900">{dataLoadError}</p>
            <button
              type="button"
              onClick={retryLoadComparisonData}
              className="mt-3 inline-flex h-9 items-center rounded-md border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-900 transition hover:border-rose-500"
            >
              Zkusit znovu
            </button>
          </section>
        ) : !hasConfiguredView ? (
          <section className="mx-auto w-full max-w-6xl space-y-6 pb-2">
            {setupStep === "insurers" ? (
              <>
                <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSetupProductIds(productViews.map((product) => product.id))
                    }
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Vybrat vše
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetupProductIds([])}
                    className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                  >
                    Odebrat vše
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenSetupInsurerKeys(setupInsurerGroups.map((group) => group.key))
                    }
                    className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                  >
                    Rozbalit vše
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenSetupInsurerKeys([])}
                    className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                  >
                    Sbalit vše
                  </button>
                </div>

                <div className="mx-auto w-full max-w-5xl">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={setupInsurerSearch}
                      onChange={(event) => setSetupInsurerSearch(event.target.value)}
                      placeholder="Hledat pojišťovnu nebo produkt"
                      className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm font-medium outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>

                <div className="mx-auto w-full max-w-5xl">
                  <div className="grid gap-3 md:grid-cols-2">
                    {filteredSetupInsurerGroups.map((group) => {
                      const selectedCount = group.products.filter((product) =>
                        setupProductIds.includes(product.id)
                      ).length;
                      const totalCount = group.products.length;
                      const allSelected =
                        selectedCount > 0 && selectedCount === totalCount;
                      const partiallySelected = selectedCount > 0 && selectedCount < totalCount;
                      const isOpen = openSetupInsurerKeys.includes(group.key);
                      const hasAnySelected = selectedCount > 0;
                      const tintClass =
                        INSURER_CARD_TINTS[group.insurer] ?? INSURER_CARD_TINT_DEFAULT;
                      const ghostLogoClass =
                        group.insurer === "ČPP"
                          ? "object-contain p-0 opacity-[0.32] saturate-0 contrast-125 scale-[1.3]"
                          : group.insurer === "Pillow"
                            ? "object-contain p-1 opacity-[0.3] saturate-0 contrast-125 scale-[1.2]"
                            : group.insurer === "UNIQA"
                              ? "object-contain p-1 opacity-[0.3] saturate-0 contrast-125 scale-[1.12]"
                          : "object-contain p-4 opacity-[0.27] saturate-0 contrast-125";
                      const selectionBadgeLabel = allSelected
                        ? "Vybráno"
                        : partiallySelected
                          ? "Částečně"
                          : "Vybrat";

                      return (
                        <article key={group.key} className="group relative">
                          <div
                            onClick={() => toggleSetupInsurerOpen(group.key)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleSetupInsurerOpen(group.key);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-expanded={isOpen}
                            aria-label={
                              isOpen
                                ? `Skrýt produkty ${group.insurer}`
                                : `Zobrazit produkty ${group.insurer}`
                            }
                            className={`relative isolate min-h-[154px] cursor-pointer overflow-hidden rounded-2xl border bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_34px_rgba(15,23,42,0.12)] ${
                              hasAnySelected
                                ? "border-sky-300 ring-2 ring-sky-200/70"
                                : "border-slate-200"
                            }`}
                          >
                            <span
                              className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-white/65 via-white/90 to-white/65"
                              aria-hidden="true"
                            />
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 overflow-hidden"
                            >
                              <Image
                                src={group.logo}
                                alt=""
                                fill
                                sizes="(max-width: 768px) 100vw, 50vw"
                                className={ghostLogoClass}
                              />
                              <div className={`absolute inset-0 ${tintClass}`} />
                            </div>

                            <div className="relative flex h-full flex-col justify-between">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleSetupInsurer(group);
                                }}
                                aria-pressed={allSelected}
                                aria-label={
                                  allSelected
                                    ? `Odebrat výběr pro ${group.insurer}`
                                    : `Vybrat vše pro ${group.insurer}`
                                }
                                className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
                                  allSelected
                                    ? "border-sky-300 bg-sky-700 text-white"
                                    : partiallySelected
                                      ? "border-sky-200 bg-sky-100 text-sky-800"
                                      : "border-slate-200/90 bg-white/80 text-slate-600 hover:border-sky-200 hover:bg-sky-50"
                                }`}
                              >
                                {selectionBadgeLabel}
                              </button>

                              <div className="flex items-end justify-end gap-3">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleSetupInsurerOpen(group.key);
                                  }}
                                  aria-label={
                                    isOpen
                                      ? `Skrýt produkty ${group.insurer}`
                                      : `Zobrazit produkty ${group.insurer}`
                                  }
                                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300/90 bg-white/90 text-slate-700 transition ${
                                    isOpen
                                      ? "border-sky-300 bg-sky-700 text-white"
                                      : "group-hover:border-sky-300 group-hover:bg-sky-700 group-hover:text-white"
                                  }`}
                                >
                                  {isOpen ? (
                                    <ChevronDown className="h-4.5 w-4.5" />
                                  ) : (
                                    <ArrowUpRight className="h-4.5 w-4.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>

                          {isOpen && (
                            <div className="relative z-10 mt-2 space-y-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-[0_10px_20px_rgba(15,23,42,0.08)]">
                              {group.products.map((product) => {
                                const active = setupProductIds.includes(product.id);

                                return (
                                  <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => toggleSetupProduct(product.id)}
                                    aria-pressed={active}
                                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50"
                                  >
                                    <span
                                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                        active
                                          ? "border-sky-500 bg-sky-500 text-white"
                                          : "border-slate-300 bg-white text-slate-600"
                                      }`}
                                    >
                                      {active && <Check className="h-3.5 w-3.5" />}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                                      {product.name}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-400">
                                      {product.version}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>

                  {filteredSetupInsurerGroups.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-600">
                      Pro tento výraz jsme nic nenašli.
                    </div>
                  )}
                </div>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={continueSetupToCategories}
                    disabled={!canContinueSetupInsurers}
                    className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-6 text-sm font-bold transition ${
                      canContinueSetupInsurers
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : "cursor-not-allowed bg-slate-100 text-slate-400"
                    }`}
                  >
                    Pokračovat
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_38px_rgba(15,23,42,0.08)] sm:p-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                      Vyber kategorie
                    </h2>
                    <p className="mt-2 text-sm font-medium text-slate-600">
                      Zvol, co chceš porovnat. Když nic nevybereš, zobrazí se všechny
                      kategorie.
                    </p>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={setupCategorySearch}
                        onChange={(event) => setSetupCategorySearch(event.target.value)}
                        placeholder="Filtrovat kategorie"
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                        Vybráno {setupCategoryTitles.length} z {categoryOptions.length}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSetupCategoryTitles(
                              allSetupCategoriesSelected
                                ? []
                                : categoryOptions.map((category) => category.title)
                            )
                          }
                          className={`inline-flex h-9 items-center rounded-lg border px-3 text-xs font-semibold transition ${
                            allSetupCategoriesSelected
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-950"
                          }`}
                        >
                          {allSetupCategoriesSelected ? "Odebrat vše" : "Vybrat vše"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSetupCategoryTitles(
                              sortedFilteredSetupCategoryOptions.map(
                                (category) => category.title
                              )
                            )
                          }
                          className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                        >
                          Vybrat filtrované
                        </button>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                      Když nic nevybereš, pokračuješ se všemi kategoriemi.
                    </div>

                    <div className="max-h-[44vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {sortedFilteredSetupCategoryOptions.map((category) => {
                          const active = setupCategoryTitles.includes(category.title);
                          return (
                            <button
                              key={category.title}
                              type="button"
                              onClick={() => toggleSetupCategory(category.title)}
                              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                                active
                                  ? "border-slate-900 bg-slate-900 text-white"
                                  : "border-slate-200 bg-white text-slate-800 hover:border-slate-400"
                              }`}
                            >
                              <span className="min-w-0 flex items-center gap-2">
                                <span
                                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                    active
                                      ? "border-white/80 bg-white/20 text-white"
                                      : "border-slate-300 bg-white text-slate-400"
                                  }`}
                                >
                                  {active ? <Check className="h-3 w-3" /> : null}
                                </span>
                                <span className="truncate">{category.title}</span>
                              </span>
                              <span
                                className={`ml-2 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                  active
                                    ? "bg-white/15 text-white"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {category.count}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {sortedFilteredSetupCategoryOptions.length === 0 && (
                        <div className="px-2 py-4 text-center text-sm font-semibold text-slate-500">
                          Pro tento filtr nejsou dostupné žádné kategorie.
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSetupCategoryTitles([])}
                        className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                      >
                        Odebrat vše
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSetupStep("insurers")}
                    className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-800 transition hover:border-slate-900"
                  >
                    Zpět
                  </button>
                  <button
                    type="button"
                    onClick={confirmSetup}
                    disabled={!canContinueSetupInsurers}
                    className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-6 text-sm font-bold transition ${
                      canContinueSetupInsurers
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : "cursor-not-allowed bg-slate-100 text-slate-400"
                    }`}
                  >
                    Pokračovat
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </section>
        ) : activeWorkspaceTab === "assistant" ? (
          <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.15)]">
            <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-cyan-500/12 blur-3xl" />
            <div className="pointer-events-none absolute -right-16 bottom-8 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />

            <div className="relative flex min-h-[calc(100vh-260px)] flex-col">
              <header className="border-b border-slate-200 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-slate-950">
                      <Bot className="h-5 w-5 text-cyan-600" />
                      AI asistent srovnávače
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Odpovídá obecně k životnímu pojištění i z vybraných dat srovnávače.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                    <span>{selectedProducts.length} produktů</span>
                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                    <span>{onlyDifferences ? "Pouze rozdíly" : "Všechny řádky"}</span>
                  </div>
                </div>
              </header>

              <div ref={chatScrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
                {chatMessages.length === 0 ? (
                  <div className="mx-auto mt-4 w-full max-w-3xl space-y-5">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                      <p className="text-base font-semibold text-slate-900">
                        Zeptej se na rozdíly, výluky, invaliditu nebo doporučení podle priorit klienta.
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        Příklady dotazů:
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2.5">
                        {[
                          "Kde se nejvíc liší invalidita mezi vybranými produkty?",
                          "Jak vypovědět životní pojištění a co má klient poslat?",
                          "Shrň mi sekci výluky v 5 bodech.",
                          "Který produkt je lepší pro klienta, co řeší hlavně alkohol a čekací dobu?",
                        ].map((promptExample) => (
                          <button
                            key={promptExample}
                            type="button"
                            onClick={() => void handleAskChat(promptExample)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:border-cyan-300/70 hover:bg-cyan-50 hover:text-slate-950"
                          >
                            {promptExample}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto w-full max-w-4xl space-y-4">
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        {message.role === "assistant" && message.answer ? (
                          <article className="max-w-[95%] space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.06)] sm:max-w-[88%]">
                            <p className="text-sm font-semibold leading-6 text-slate-900">
                              {message.answer.summary}
                            </p>

                            {message.warning && (
                              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                                {message.warning}
                              </p>
                            )}

                            {message.answer.bullets.length > 0 && (
                              <div className="space-y-2.5">
                                {message.answer.bullets.map((bullet, index) => (
                                  <div
                                    key={`${message.id}-b-${index}-${bullet.title}`}
                                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                                  >
                                    <p className="text-sm font-bold text-slate-900">{bullet.title}</p>
                                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-700">
                                      {bullet.detail}
                                    </p>
                                    {bullet.citations.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        {bullet.citations.map((citation) => (
                                          <span
                                            key={`${message.id}-c-${citation.section}-${citation.id}-${citation.page}`}
                                            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600"
                                          >
                                            {citation.section} · str. {citation.page} · {citation.id}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {(message.answer.sources ?? []).length > 0 && (
                              <div className="space-y-1.5 border-t border-slate-200 pt-2.5">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                  Zdroje
                                </p>
                                <div className="space-y-1.5">
                                  {(message.answer.sources ?? []).map((source) => (
                                    <a
                                      key={`${message.id}-s-${source.url}`}
                                      href={source.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-cyan-800 transition hover:border-cyan-300 hover:bg-cyan-50"
                                    >
                                      {source.title}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {message.answer.followups.length > 0 && (
                              <div className="space-y-1.5 border-t border-slate-200 pt-2.5">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                  Co dál?
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {message.answer.followups.map((followup) => (
                                    <button
                                      key={`${message.id}-f-${followup}`}
                                      type="button"
                                      onClick={() => void handleAskChat(followup)}
                                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-cyan-300/80 hover:bg-cyan-50 hover:text-slate-900"
                                    >
                                      {followup}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </article>
                        ) : (
                          <div
                            className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[82%] ${
                              message.role === "user"
                                ? "bg-slate-900 text-white"
                                : "border border-slate-200 bg-white text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.06)]"
                            }`}
                          >
                            {message.warning && (
                              <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                                {message.warning}
                              </div>
                            )}
                            <div className="whitespace-pre-line">{message.text}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {chatLoading && (
                  <div className="mx-auto flex w-full max-w-4xl justify-start">
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
                      <span className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:240ms]" />
                      </span>
                      Připravuju odpověď…
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur sm:px-6">
                <div className="mx-auto w-full max-w-4xl space-y-3">
                  <div className="rounded-2xl border border-slate-300 bg-white p-2">
                    <textarea
                      value={chatQuestion}
                      onChange={(event) => setChatQuestion(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          if (!chatLoading) void handleAskChat();
                        }
                      }}
                      rows={1}
                      placeholder="Napiš dotaz k životnímu pojištění nebo datům srovnávače…"
                      className="max-h-36 min-h-[46px] w-full resize-y bg-transparent px-2 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    />
                    <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-0.5">
                      <p className="text-xs text-slate-400">Enter odešle, Shift+Enter nový řádek.</p>
                      <button
                        type="button"
                        onClick={() => void handleAskChat()}
                        disabled={chatLoading}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <SendHorizontal className="h-4 w-4" />
                        {chatLoading ? "Zpracovávám…" : "Odeslat"}
                      </button>
                    </div>
                  </div>

                  {chatError && (
                    <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
                      {chatError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : (
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

                  {visibleManualInvaliditaItems.length > 0 && (
                    <div className="mt-4 space-y-4">
                      {visibleManualInvaliditaItems.map((item) => (
                        <section
                          key={item.id}
                          className="overflow-hidden rounded-lg border border-slate-200 bg-white font-sans"
                        >
                          <div className="bg-slate-100 px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-slate-600">
                            {item.subtitle}
                          </div>
                          <div
                            className="grid border-t border-slate-200"
                            style={{ gridTemplateColumns: tableGridColumns }}
                          >
                            <div className="flex min-h-[62px] items-center border-r border-slate-100 bg-white px-3 py-2">
                              <div className="flex w-full items-start justify-between gap-2">
                                <p className="text-sm font-semibold leading-6 text-slate-900">
                                  {item.question}
                                </p>
                                {item.infoParagraphs.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setActiveInvaliditaInfoId(item.id)}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                    Info
                                  </button>
                                )}
                              </div>
                            </div>
                            {selectedProducts.map((product) => (
                              (() => {
                                const expansionKey = `${item.id}:${product.id}`;
                                const expanded =
                                  expandedInvaliditaAnswerSet.has(expansionKey);
                                const answerLabel =
                                  item.answerByProductId?.[product.id] ?? item.answer;
                                const canExpand = item.expandableProducts
                                  ? item.expandableProducts.includes(product.id)
                                  : Boolean(item.expandableAnswer);
                                const detailText =
                                  item.answerDetailsByProductId?.[product.id] ??
                                  "Bez doplňujícího komentáře.";

                                return (
                                  <div
                                    key={product.id}
                                    className="flex border-r border-slate-100 bg-white p-1.5 last:border-r-0"
                                  >
                                    <div className="flex h-full w-full flex-col rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
                                      {canExpand ? (
                                        expanded ? (
                                          <div className="space-y-2">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                toggleInvaliditaAnswerDetail(
                                                  item.id,
                                                  product.id
                                                )
                                              }
                                              className="inline-flex w-full items-start justify-between gap-2 text-left leading-5"
                                              aria-expanded={expanded}
                                              aria-label="Sbalit detail odpovědi"
                                            >
                                              <span>{answerLabel}</span>
                                              <ChevronUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                            </button>
                                            <p className="whitespace-pre-line border-t border-emerald-200 pt-2 text-left text-xs font-medium leading-5 text-emerald-900">
                                              {detailText}
                                            </p>
                                          </div>
                                        ) : (
                                          <div className="flex h-full min-h-[50px] items-center justify-center">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                toggleInvaliditaAnswerDetail(
                                                  item.id,
                                                  product.id
                                                )
                                              }
                                              className="inline-flex w-full items-start justify-between gap-2 text-left leading-5"
                                              aria-expanded={expanded}
                                              aria-label="Rozbalit detail odpovědi"
                                            >
                                              <span>{answerLabel}</span>
                                              <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                            </button>
                                          </div>
                                        )
                                      ) : (
                                        <div className="flex h-full min-h-[50px] items-center justify-center text-center">
                                          {answerLabel}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}

                  {visibleApiSections.length > 0 ? (
                    <div className="mt-4 space-y-4 font-sans">
                      {visibleApiSections.map((section) => (
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
                  ) : visibleManualInvaliditaItems.length === 0 ? (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                      Pro zadané filtry nejsou žádná kritéria.
                    </div>
                  ) : null}

                  {activeInvaliditaInfoItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                      <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Informace k otázce ${activeInvaliditaInfoItem.subtitle}`}
                        className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-4 shadow-2xl sm:p-5"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <h3 className="text-sm font-bold text-slate-900">
                            {activeInvaliditaInfoItem.infoTitle}
                          </h3>
                          <button
                            type="button"
                            onClick={() => setActiveInvaliditaInfoId(null)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                            aria-label="Zavřít"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                          {activeInvaliditaInfoItem.infoParagraphs.map((paragraph) => (
                            <p key={paragraph} className="text-sm leading-6 text-slate-700">
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </article>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
