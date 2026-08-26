// src/app/pomucky/page.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BanknoteArrowDown,
  BarChart3,
  Bike,
  Bot,
  Building2,
  CalendarClock,
  CarFront,
  ChartNoAxesColumn,
  Clock3,
  Files,
  FileSignature,
  Gauge,
  HeartPulse,
  Home,
  Landmark,
  Plane,
  PenTool,
  PiggyBank,
  Scale,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  WalletCards,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { InstitutionPortalLinksModal } from "./InstitutionPortalLinksModal";
import styles from "./pomuckyWallArt.module.css";
import { systemSansFont } from "@/lib/fonts";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { ADMIN_IMPERSONATION_HEADER } from "@/app/lib/adminImpersonation";
import {
  effectiveUserEmail,
  useEffectiveUserEmail,
} from "@/app/lib/useAdminImpersonation";
import {
  compareToolHubUsage,
  normalizeToolHubUsageMetric,
  type ToolHubSortMode,
  type ToolHubToolKey,
  type ToolHubUsageMetric,
} from "./toolHub";

const toolsFont = systemSansFont;

const FILTERS = [
  "Všechny",
  "Životní pojištění",
  "Pojištění majetku",
  "Pojištění vozidel",
  "Cestovní pojištění",
  "Finance",
  "Investice",
  "Obecné",
] as const;

type FilterKey = (typeof FILTERS)[number];
type ToolCategory = Exclude<FilterKey, "Všechny">;

const FILTER_TAB_LABEL: Record<FilterKey, string> = {
  Všechny: "Všechny",
  "Pojištění majetku": "Majetek",
  "Pojištění vozidel": "Auto",
  "Cestovní pojištění": "Cestovní",
  "Životní pojištění": "Život",
  Finance: "Finance",
  Investice: "Investice",
  Obecné: "Obecné",
};

const CATEGORY_RANK: Record<ToolCategory, number> = {
  "Životní pojištění": 0,
  "Pojištění majetku": 1,
  "Pojištění vozidel": 2,
  "Cestovní pojištění": 3,
  Finance: 4,
  Investice: 5,
  Obecné: 6,
};

type FilterVisual = {
  icon: LucideIcon;
  active: string;
  glow: string;
  inactive: string;
  helper: string;
};

const FILTER_VISUALS: Record<FilterKey, FilterVisual> = {
  Všechny: {
    icon: Sparkles,
    active:
      "border-slate-700 bg-[linear-gradient(135deg,#334155_0%,#0f172a_100%)] !text-white",
    glow: "shadow-[0_16px_36px_rgba(15,23,42,0.34)]",
    inactive:
      "border-slate-300/90 bg-white/85 text-slate-700 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white",
    helper: "Všechny interní pomůcky na jednom místě.",
  },
  "Pojištění majetku": {
    icon: Home,
    active:
      "border-cyan-500 bg-[linear-gradient(135deg,#22d3ee_0%,#0e7490_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(14,116,144,0.32)]",
    inactive:
      "border-cyan-200/90 bg-white/88 text-cyan-800 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50/75",
    helper: "Nástroje pro katastr, majetek a kalkulace hodnoty nemovitostí.",
  },
  "Pojištění vozidel": {
    icon: CarFront,
    active:
      "border-blue-500 bg-[linear-gradient(135deg,#60a5fa_0%,#1d4ed8_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(29,78,216,0.34)]",
    inactive:
      "border-blue-200/90 bg-white/88 text-blue-800 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/75",
    helper: "VIN, tachometry i další auto utility.",
  },
  "Životní pojištění": {
    icon: HeartPulse,
    active:
      "border-rose-500 bg-[linear-gradient(135deg,#fb7185_0%,#be123c_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(190,24,93,0.34)]",
    inactive:
      "border-rose-200/90 bg-white/88 text-rose-800 hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-50/75",
    helper: "Invalidita, pracovní neschopnost a srovnání životních produktů.",
  },
  "Cestovní pojištění": {
    icon: Plane,
    active:
      "border-sky-500 bg-[linear-gradient(135deg,#38bdf8_0%,#0369a1_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(3,105,161,0.32)]",
    inactive:
      "border-sky-200/90 bg-white/88 text-sky-800 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50/75",
    helper: "Srovnání limitů, připojištění a situací na cestách.",
  },
  Finance: {
    icon: BarChart3,
    active:
      "border-emerald-500 bg-[linear-gradient(135deg,#34d399_0%,#047857_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(4,120,87,0.34)]",
    inactive:
      "border-emerald-200/90 bg-white/88 text-emerald-800 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/75",
    helper: "Statistika, export a plánování výkonu v jednom flow.",
  },
  Investice: {
    icon: TrendingUp,
    active:
      "border-amber-500 bg-[linear-gradient(135deg,#f59e0b_0%,#b45309_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(180,83,9,0.34)]",
    inactive:
      "border-amber-200/90 bg-white/88 text-amber-800 hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/75",
    helper: "Kalkulačky a podklady pro investiční schůzky.",
  },
  Obecné: {
    icon: ShieldCheck,
    active:
      "border-indigo-500 bg-[linear-gradient(135deg,#818cf8_0%,#4338ca_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(67,56,202,0.34)]",
    inactive:
      "border-indigo-200/90 bg-white/88 text-indigo-800 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/75",
    helper: "Školení, argumenty, dokumenty a týmové workflow pomůcky.",
  },
};

const CATEGORY_VISUALS: Record<
  ToolCategory,
  {
    icon: string;
  }
> = {
  "Pojištění majetku": {
    icon: "text-cyan-100 group-hover:text-cyan-50",
  },
  "Pojištění vozidel": {
    icon: "text-blue-100 group-hover:text-blue-50",
  },
  "Životní pojištění": {
    icon: "text-rose-100 group-hover:text-rose-50",
  },
  "Cestovní pojištění": {
    icon: "text-sky-100 group-hover:text-sky-50",
  },
  Finance: {
    icon: "text-emerald-100 group-hover:text-emerald-50",
  },
  Investice: {
    icon: "text-amber-100 group-hover:text-amber-50",
  },
  Obecné: {
    icon: "text-indigo-100 group-hover:text-indigo-50",
  },
};

const CATEGORY_BADGE_LABEL: Record<ToolCategory, string> = {
  "Pojištění majetku": "MAJETEK",
  "Pojištění vozidel": "AUTO",
  "Životní pojištění": "ŽIVOT",
  "Cestovní pojištění": "CESTOVNÍ",
  Finance: "FINANCE",
  Investice: "INVESTICE",
  Obecné: "OBECNÉ",
};

const TACHOMETER_UPLOAD_TARGETS = [
  {
    key: "allianz",
    label: "Allianz",
    href: "https://www.allianz.cz/cs_CZ/apps/kilometry-nahrani.html",
    logoPath: "/icons/allianz.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(59,130,246,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(67,56,202,0.2)_0%,transparent_66%)]",
  },
  {
    key: "pillow",
    label: "Pillow",
    href: "https://portal.pillow.cz/nahrat_kilometry/step1",
    logoPath: "/icons/pillow.png",
    tintClass:
      "bg-[radial-gradient(circle_at_22%_20%,rgba(34,197,94,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(20,184,166,0.18)_0%,transparent_66%)]",
  },
] as const;

type Tool = {
  key: ToolHubToolKey;
  category: ToolCategory;
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  external?: boolean;
  render?: () => ReactElement;
  onClick?: () => void;
};

type ToolHubUsageResponse = {
  ok?: boolean;
  usage?: Partial<Record<ToolHubToolKey, ToolHubUsageMetric>>;
  error?: string;
};

const SORT_OPTIONS: Array<{ key: ToolHubSortMode; label: string }> = [
  { key: "personal", label: "Pro mě" },
  { key: "popular", label: "Nejpoužívanější" },
  { key: "alphabetical", label: "A–Z" },
];

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toolMatchesSearch(tool: Tool, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;

  return [tool.title, tool.description, tool.category]
    .map(normalizeSearchValue)
    .some((value) => value.includes(normalizedQuery));
}

function CategoryBadge({ category }: { category: ToolCategory }) {
  const Icon = FILTER_VISUALS[category].icon;

  return (
    <span className="pomucky-category-badge inline-flex items-center gap-1.5 rounded-xl border border-violet-200/70 bg-[linear-gradient(135deg,#c084fc_0%,#a855f7_100%)] px-3 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.14em] !text-white shadow-[0_8px_18px_rgba(168,85,247,0.34)] sm:px-3.5 sm:text-[0.7rem] sm:tracking-[0.16em] sm:shadow-[0_10px_22px_rgba(168,85,247,0.42)] [&_*]:!text-white">
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.35} aria-hidden="true" />
      <span>{CATEGORY_BADGE_LABEL[category]}</span>
    </span>
  );
}

function FavoriteButton({
  active,
  disabled,
  title,
  onToggle,
}: {
  active: boolean;
  disabled: boolean;
  title: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={`absolute right-3 top-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_10px_22px_rgba(15,23,42,0.24)] backdrop-blur transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? "border-amber-300 bg-amber-300 text-amber-950"
          : "border-white/35 bg-slate-950/55 text-white hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
      }`}
      aria-label={active ? `Odebrat ${title} z oblíbených` : `Přidat ${title} do oblíbených`}
      title={active ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
    >
      <Star className={`h-4.5 w-4.5 ${active ? "fill-current" : ""}`} />
    </button>
  );
}

function ToolCardContent({ tool }: { tool: Tool }) {
  const ToolIcon = tool.icon;
  const style = CATEGORY_VISUALS[tool.category];

  return (
    <>
      <span
        className="pointer-events-none absolute -left-12 -top-16 hidden h-44 w-44 rounded-full bg-violet-300/24 blur-3xl sm:block"
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute -right-16 bottom-4 hidden h-40 w-40 rounded-full bg-fuchsia-400/18 blur-3xl sm:block"
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(124deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_34%)]"
        aria-hidden="true"
      />
      <ToolIcon
        className={`pointer-events-none absolute right-4 top-5 z-[1] h-[4.5rem] w-[4.5rem] opacity-[0.22] transition duration-250 group-hover:scale-105 group-hover:opacity-[0.3] sm:right-5 sm:top-5 sm:h-[5.25rem] sm:w-[5.25rem] ${style.icon}`}
        strokeWidth={1.35}
        aria-hidden="true"
      />

      <div className="relative z-10 flex w-full flex-col gap-2.5">
        <div className="flex items-start">
          <CategoryBadge category={tool.category} />
        </div>

        <div className="min-w-0 pr-8">
          <h2 className="text-[1.18rem] font-bold leading-[1.1] text-[#f8fafc] sm:text-[1.34rem]">
            {tool.title}
          </h2>
          <p className="mt-1.5 text-[0.82rem] leading-5 text-violet-100/75 sm:text-[0.9rem] sm:leading-6">
            {tool.description}
          </p>
        </div>

        <div className="mt-auto">
          <span className="inline-flex items-center justify-between rounded-xl border border-violet-300/55 bg-[linear-gradient(135deg,#c084fc_0%,#a855f7_56%,#8b5cf6_100%)] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_8px_16px_rgba(82,25,147,0.26)] sm:px-3 sm:shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_10px_18px_rgba(82,25,147,0.28)]">
            <span className="text-[0.8rem] font-bold tracking-normal text-[#1b1036] sm:text-[0.84rem]">
              Otevřít pomůcku
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-[#1b1036]" />
          </span>
        </div>
      </div>
    </>
  );
}

function QuickAccessTool({
  tool,
  favorite,
  onOpen,
}: {
  tool: Tool;
  favorite: boolean;
  onOpen: (toolKey: ToolHubToolKey) => void;
}) {
  const Icon = tool.icon;
  const className =
    "group inline-flex min-w-[220px] flex-1 items-center gap-3 rounded-2xl border border-violet-200/80 bg-white px-3 py-3 text-left shadow-[0_10px_26px_rgba(88,28,135,0.09)] transition hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_16px_34px_rgba(88,28,135,0.14)]";
  const content = (
    <>
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#8b5cf6_0%,#6d28d9_100%)] text-white shadow-[0_8px_18px_rgba(109,40,217,0.28)]">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-950">
          {tool.title}
        </span>
        <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-violet-700">
          {favorite ? "Oblíbené" : "Naposledy použité"}
        </span>
      </span>
      {favorite ? (
        <Star className="h-4 w-4 shrink-0 fill-amber-300 text-amber-500" />
      ) : (
        <Clock3 className="h-4 w-4 shrink-0 text-slate-400" />
      )}
    </>
  );

  if (tool.onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          onOpen(tool.key);
          tool.onClick?.();
        }}
      >
        {content}
      </button>
    );
  }

  if (tool.external) {
    return (
      <a
        href={tool.href ?? "#"}
        target="_blank"
        rel="noreferrer"
        className={className}
        onClick={() => onOpen(tool.key)}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={tool.href ?? "#"}
      className={className}
      onClick={() => onOpen(tool.key)}
    >
      {content}
    </Link>
  );
}

export default function ToolsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("Všechny");
  const [searchQuery, setSearchQuery] = useState("");
  const [tachometerModalOpen, setTachometerModalOpen] = useState(false);
  const [linksModalOpen, setLinksModalOpen] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [usageByKey, setUsageByKey] = useState<
    Partial<Record<ToolHubToolKey, ToolHubUsageMetric>>
  >({});
  const [sortMode, setSortMode] = useState<ToolHubSortMode>("personal");
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [favoritePendingKeys, setFavoritePendingKeys] = useState<
    Set<ToolHubToolKey>
  >(new Set());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !effectiveEmail) {
      setUsageByKey({});
      setUsageLoading(false);
      setUsageError(null);
      return;
    }

    let cancelled = false;
    const scopeEmail = effectiveEmail;
    setUsageByKey({});
    setUsageLoading(true);
    setUsageError(null);

    void fetchAuthedJsonOrThrow<ToolHubUsageResponse>(user, "/api/tool-usage", {
      headers: { [ADMIN_IMPERSONATION_HEADER]: scopeEmail },
    })
      .then((payload) => {
        if (
          cancelled ||
          effectiveUserEmail(auth.currentUser?.email) !== scopeEmail
        ) {
          return;
        }
        const next: Partial<Record<ToolHubToolKey, ToolHubUsageMetric>> = {};
        Object.entries(payload.usage ?? {}).forEach(([key, value]) => {
          next[key as ToolHubToolKey] = normalizeToolHubUsageMetric(value);
        });
        setUsageByKey(next);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("Načtení používání pomůcek selhalo:", error);
        setUsageError("Oblíbené a historie se teď nepodařily načíst.");
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveEmail, user]);

  const tools: Tool[] = useMemo(
    () => [
      {
        key: "argumenty",
        category: "Obecné",
        title: "Argumenty",
        description: "Přehled Argumentů na různé typy námitek od klienta.",
        icon: Scale,
        href: "/pomucky/argumenty",
      },
      {
        key: "dokumenty",
        category: "Obecné",
        title: "Dokumenty",
        description: "Centrální místo pro interní šablony, podklady a materiály.",
        icon: Files,
        href: "/pomucky/dokumenty",
      },
      {
        key: "zaznam",
        category: "Obecné",
        title: "Záznam z jednání",
        description: "Pomůcka pro správně vypsaný Záznam z jednání.",
        icon: FileSignature,
        href: "/pomucky/zaznam",
      },
      {
        key: "vypoved-smlouvy",
        category: "Obecné",
        title: "Výpověď smlouvy",
        description: "Pomůcka pro přípravu výpovědi smlouvy.",
        icon: ScrollText,
        href: "/pomucky/vypoved-smlouvy",
      },
      {
        key: "jak-stiham-vypoved-smlouvy",
        category: "Obecné",
        title: "Jak stíhám výpověď smlouvy?",
        description: "Ověření výpovědních lhůt a výpočet data ukončení smlouvy.",
        icon: Clock3,
        href: "/pomucky/jak-stiham-vypoved-smlouvy",
      },
      {
        key: "radar-vyroci",
        category: "Obecné",
        title: "Radar výročí",
        description: "Přehled klientů, kterým se blíží výročí smlouvy, s kontrolním checklistem na obvolání.",
        icon: CalendarClock,
        href: "/pomucky/radar-vyroci",
      },
      {
        key: "tvorba",
        category: "Obecné",
        title: "Tvorba PDF",
        description: "Interaktivní A4 editor dokumentu s pevnou hlavičkou, patičkou a stažením do PDF.",
        icon: PenTool,
        href: "/pomucky/tvorba",
      },
      {
        key: "ai-asistent",
        category: "Obecné",
        title: "AI Asistent",
        description:
          "Bohemka Asistent jako interní pomocník pro pojištění, investice a investiční zlato (bez přístupu ke smlouvám).",
        icon: Bot,
        href: "/pomucky/ai-asistent",
      },
      {
        key: "online-vizitka",
        category: "Obecné",
        title: "Online Vizitka",
        description: "Editor pro tvou vlastní online vizitku.",
        icon: WalletCards,
        href: "/nastaveni?tab=onlineCard",
      },
      {
        key: "hypoteka-vlastni-zdroje",
        category: "Investice",
        title: "Hypotéka: vlastní zdroje",
        description: "Spočítej, kolik je potřeba naspořit na hypotéku a za jak dlouho to vyjde při různých strategiích.",
        icon: PiggyBank,
        href: "/pomucky/hypoteka-vlastni-zdroje",
      },
      {
        key: "statistika",
        category: "Finance",
        title: "Statistika",
        description: "Denní statistika oslovení, schůzek a smluv s výpočtem provize.",
        icon: BarChart3,
        href: "/pomucky/statistika",
      },
      {
        key: "export-produkce",
        category: "Finance",
        title: "Export produkce",
        description: "Statistika s možností stažení v PDF a Odeslání mailem.",
        icon: BanknoteArrowDown,
        href: "/pomucky/export-produkce",
      },
      {
        key: "plan-produkce",
        category: "Finance",
        title: "Plán produkce",
        description: "Naplánuj si cíleně Produkci a rovnou uvidíš svou odměnu. Můžeš i stáhnout v PDF.",
        icon: Trophy,
        href: "/pomucky/plan-produkce",
      },
      {
        key: "zlato",
        category: "Investice",
        title: "Zlato",
        description: "Přehled a kalkulace pro investice do zlata.",
        icon: Landmark,
        href: "/pomucky/zlato",
      },
      {
        key: "katastr",
        category: "Pojištění majetku",
        title: "Nahlížení do katastru nemovitostí",
        description: "Vyhledej údaje z CUZK podle kódu adresního místa (RÚIAN) s autorizací přes tvůj účet.",
        icon: Home,
        href: "/cuzk",
      },
      {
        key: "proklepka-vozidla",
        category: "Pojištění vozidel",
        title: "Proklepka vozidla",
        description: "Zjisti informace o vozidle jako například nájezd, tržní cenu, cenu skel, vlastníky, STK, data z ORV a další.",
        icon: ShieldCheck,
        href: "/pomucky/proklepka-vozidla",
      },
      {
        key: "nahrat-tachometr",
        category: "Pojištění vozidel",
        title: "Nahrát tachometr",
        description: "Odkaz pro nahrání stavu tachometru pro pojišťovny Allianz a Pillow.",
        icon: Gauge,
        onClick: () => setTachometerModalOpen(true),
      },
      {
        key: "odkazy-instituce",
        category: "Obecné",
        title: "Odkazy",
        description: "Odkazy na portály institucí.",
        icon: Landmark,
        onClick: () => setLinksModalOpen(true),
      },
      {
        key: "ares",
        category: "Obecné",
        title: "ARES",
        description: "Vyhledání ekonomických subjektů v ARES podle IČO, názvu firmy a obce.",
        icon: Building2,
        href: "/pomucky/ares",
      },
      {
        key: "projekce-vykonu",
        category: "Finance",
        title: "Projekce výkonu",
        description: "Vizualizuj si výplatu do budoucna.",
        icon: TrendingUp,
        href: "/pomucky/projekce-vykonu",
      },
      {
        key: "cestovni-pojisteni-cpp-vs-kooperativa",
        category: "Cestovní pojištění",
        title: "ČPP vs. Kooperativa vs. AXA — cestovní pojištění",
        description: "Interaktivní porovnání variant, limitů, výluk a připojištění tří cestovních pojištění.",
        icon: Plane,
        href: "/pomucky/cestovni-pojisteni-cpp-vs-kooperativa",
      },
      {
        key: "nastaveni-zivotniho-pojisteni",
        category: "Životní pojištění",
        title: "Jak nastavit Životní pojištění",
        description: "Stepper pro nastavení smrti, invalidity a pracovní neschopnosti podle příjmu, závazků a dluhů.",
        icon: HeartPulse,
        href: "/pomucky/nastaveni-zivotniho-pojisteni",
      },
      {
        key: "srovnavac-trvalych-nasledku",
        category: "Životní pojištění",
        title: "Srovnavač Trvalých následků",
        description: "Otevři srovnavač pro trvalé následky úrazu.",
        icon: Bike,
        href: "/pomucky/srovnavac-trvalych-nasledku",
      },
      {
        key: "srovnavac-pracovni-neschopnosti",
        category: "Životní pojištění",
        title: "Srovnavač Pracovní neschopnosti",
        description: "Výběr produktů pro srovnání pracovní neschopnosti.",
        icon: HeartPulse,
        href: "/pomucky/srovnavac-pracovni-neschopnosti",
      },
      {
        key: "srovnavac-zivotniho-pojisteni",
        category: "Životní pojištění",
        title: "Srovnavač životního pojištění",
        description: "Porovnání produktových podmínek životního pojištění podle pojišťoven a kategorií.",
        icon: ShieldCheck,
        href: "/pomucky/srovnavac-zivotniho-pojisteni",
      },
      {
        key: "neon-life-vs-metlife-oneguard",
        category: "Životní pojištění",
        title: "NEON Life vs. MetLife OneGuard",
        description: "Přehledné srovnání produktů ČPP NEON Life a MetLife OneGuard.",
        icon: ChartNoAxesColumn,
        href: "/pomucky/neon-life-vs-metlife-oneguard",
      },
    ],
    [setLinksModalOpen, setTachometerModalOpen]
  );

  const recordToolOpen = useCallback(
    (toolKey: ToolHubToolKey) => {
      if (
        !user ||
        !effectiveEmail ||
        effectiveUserEmail(user.email) !== effectiveEmail
      ) {
        return;
      }

      const nowMs = Date.now();
      setUsageByKey((current) => {
        const metric = normalizeToolHubUsageMetric(current[toolKey]);
        return {
          ...current,
          [toolKey]: {
            ...metric,
            personalOpens: metric.personalOpens + 1,
            globalOpens: metric.globalOpens + 1,
            lastOpenedAtMs: nowMs,
          },
        };
      });

      void fetchAuthedJsonOrThrow(user, "/api/tool-usage", {
        method: "POST",
        headers: { [ADMIN_IMPERSONATION_HEADER]: effectiveEmail },
        body: JSON.stringify({ action: "open", toolKey }),
      }).catch((error) => {
        console.warn(`Zápis otevření pomůcky ${toolKey} selhal:`, error);
      });
    },
    [effectiveEmail, user]
  );

  const toggleFavorite = useCallback(
    async (toolKey: ToolHubToolKey) => {
      if (
        !user ||
        !effectiveEmail ||
        favoritePendingKeys.has(toolKey) ||
        effectiveUserEmail(user.email) !== effectiveEmail
      ) {
        return;
      }

      const previous = normalizeToolHubUsageMetric(usageByKey[toolKey]);
      const favorite = !previous.favorite;
      setFavoritePendingKeys((current) => new Set(current).add(toolKey));
      setUsageByKey((current) => ({
        ...current,
        [toolKey]: {
          ...normalizeToolHubUsageMetric(current[toolKey]),
          favorite,
        },
      }));
      setUsageError(null);

      try {
        await fetchAuthedJsonOrThrow(user, "/api/tool-usage", {
          method: "POST",
          headers: { [ADMIN_IMPERSONATION_HEADER]: effectiveEmail },
          body: JSON.stringify({ action: "favorite", toolKey, favorite }),
        });
      } catch (error) {
        console.warn(`Uložení oblíbené pomůcky ${toolKey} selhalo:`, error);
        if (effectiveUserEmail(auth.currentUser?.email) === effectiveEmail) {
          setUsageByKey((current) => ({
            ...current,
            [toolKey]: {
              ...normalizeToolHubUsageMetric(current[toolKey]),
              favorite: previous.favorite,
            },
          }));
          setUsageError("Změnu oblíbených se nepodařilo uložit.");
        }
      } finally {
        setFavoritePendingKeys((current) => {
          const next = new Set(current);
          next.delete(toolKey);
          return next;
        });
      }
    },
    [effectiveEmail, favoritePendingKeys, usageByKey, user]
  );

  const favoriteTools = useMemo(
    () =>
      tools
        .filter((tool) => usageByKey[tool.key]?.favorite === true)
        .sort(
          (a, b) =>
            (usageByKey[b.key]?.lastOpenedAtMs ?? 0) -
              (usageByKey[a.key]?.lastOpenedAtMs ?? 0) ||
            a.title.localeCompare(b.title, "cs")
        ),
    [tools, usageByKey]
  );

  const recentTools = useMemo(
    () =>
      tools
        .filter(
          (tool) =>
            !usageByKey[tool.key]?.favorite &&
            (usageByKey[tool.key]?.lastOpenedAtMs ?? 0) > 0
        )
        .sort(
          (a, b) =>
            (usageByKey[b.key]?.lastOpenedAtMs ?? 0) -
            (usageByKey[a.key]?.lastOpenedAtMs ?? 0)
        )
        .slice(0, 6),
    [tools, usageByKey]
  );

  const filterCounts = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(searchQuery);
    const counts = Object.fromEntries(FILTERS.map((filter) => [filter, 0])) as Record<FilterKey, number>;

    tools.forEach((tool) => {
      if (!toolMatchesSearch(tool, normalizedQuery)) return;
      counts.Všechny += 1;
      counts[tool.category] += 1;
    });

    return counts;
  }, [searchQuery, tools]);

  const filteredTools = useMemo(
    () => {
      const q = normalizeSearchValue(searchQuery);
      const filtered = tools.filter((tool) => {
        const categoryMatch = activeFilter === "Všechny" || tool.category === activeFilter;
        if (!categoryMatch) return false;
        return toolMatchesSearch(tool, q);
      });

      return filtered.sort((a, b) => {
        if (sortMode === "alphabetical") {
          return a.title.localeCompare(b.title, "cs");
        }

        const usageDiff = compareToolHubUsage(
          usageByKey[a.key],
          usageByKey[b.key],
          sortMode
        );
        if (usageDiff !== 0) return usageDiff;

        if (activeFilter === "Všechny") {
          const rankDiff = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
          if (rankDiff !== 0) return rankDiff;
        }
        return a.title.localeCompare(b.title, "cs");
      });
    },
    [activeFilter, searchQuery, sortMode, tools, usageByKey]
  );

  return (
    <AppLayout active="tools">
      <div className={`${toolsFont.className} pomucky-tools-root relative w-full overflow-visible px-0 pb-8 pt-1 sm:px-3 sm:pb-10 sm:pt-2`}>
        <div className="relative z-10 mx-auto max-w-7xl space-y-4 px-0 sm:space-y-5 sm:px-2 lg:px-3">
          <section className="py-0 sm:py-2">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-2 sm:space-y-4">
                <span className="pomucky-hub-badge inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-800 sm:gap-2 sm:px-3 sm:text-xs sm:tracking-[0.18em]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Nástrojový Hub
                </span>

                <div>
                  <h1 className="text-3xl font-bold tracking-[-0.015em] text-slate-900 sm:text-5xl">
                    Pomůcky
                  </h1>
                </div>
              </div>

              <div className="w-full max-w-xl xl:w-[32rem]">
                <label htmlFor="tools-search" className="sr-only">
                  Hledat pomůcky
                </label>
                <div className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white/90 shadow-[0_10px_24px_rgba(15,23,42,0.08)] sm:rounded-2xl sm:shadow-[0_16px_38px_rgba(15,23,42,0.12)]">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-500 sm:left-4 sm:h-5 sm:w-5" />
                  <input
                    id="tools-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Název, kategorie nebo klíčové slovo..."
                    className="h-11 w-full bg-transparent py-2.5 pl-10 pr-3 text-base text-slate-900 outline-none placeholder:text-slate-500 sm:h-14 sm:py-3 sm:pl-12 sm:pr-4"
                  />
                </div>
              </div>
            </div>
          </section>

          <nav
            className="sticky top-1 z-30 rounded-[18px] border border-white/75 bg-white/90 p-1.5 shadow-[0_12px_30px_rgba(88,28,135,0.12)] backdrop-blur-xl sm:top-2 sm:rounded-[24px] sm:p-2 sm:shadow-[0_18px_44px_rgba(88,28,135,0.14)]"
            aria-label="Sekce pomůcek"
          >
            <div className="flex gap-2 overflow-x-auto pb-1">
              {FILTERS.map((filter) => {
                const visual = FILTER_VISUALS[filter];
                const Icon = visual.icon;
                const active = filter === activeFilter;
                const count = filterCounts[filter];

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={[
                      styles.filterChip,
                      "pomucky-filter-chip inline-flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-semibold transition sm:px-4",
                      active
                        ? "border-violet-500 bg-[linear-gradient(135deg,#8b5cf6_0%,#6d28d9_52%,#4c1d95_100%)] !text-white shadow-[0_16px_34px_rgba(109,40,217,0.32)] ring-2 ring-violet-100 [&_*]:!text-white"
                        : "border-violet-100 bg-white/88 text-slate-700 hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50/80",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                    {FILTER_TAB_LABEL[filter]}
                    <span
                      className={[
                        "ml-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold leading-none",
                        active
                          ? "border border-white/35 bg-white/20 text-white"
                          : "border border-violet-100 bg-violet-50 text-violet-700",
                      ].join(" ")}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>

          {favoriteTools.length > 0 || recentTools.length > 0 ? (
            <section className="overflow-hidden rounded-[24px] border border-violet-200/80 bg-[linear-gradient(145deg,#ffffff_0%,#fbf8ff_55%,#f5f3ff_100%)] p-3.5 shadow-[0_18px_44px_rgba(88,28,135,0.1)] sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-violet-700">
                    Rychlý přístup
                  </p>
                  <h2 className="mt-0.5 text-lg font-bold text-slate-950">
                    Oblíbené a naposledy použité
                  </h2>
                </div>
                <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-[11px] font-semibold text-violet-800">
                  Jen pro tento účet
                </span>
              </div>

              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {favoriteTools.slice(0, 8).map((tool) => (
                  <QuickAccessTool
                    key={`favorite-${tool.key}`}
                    tool={tool}
                    favorite
                    onOpen={recordToolOpen}
                  />
                ))}
                {recentTools.map((tool) => (
                  <QuickAccessTool
                    key={`recent-${tool.key}`}
                    tool={tool}
                    favorite={false}
                    onOpen={recordToolOpen}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-slate-200/85 bg-white/90 px-3.5 py-3 shadow-[0_10px_26px_rgba(15,23,42,0.06)] sm:px-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Řazení katalogu
              </p>
              <p className="mt-0.5 text-sm text-slate-600">
                {sortMode === "personal"
                  ? "Oblíbené a tvoje naposledy používané nástroje jsou první."
                  : sortMode === "popular"
                    ? "Pořadí vychází z anonymního celkového počtu otevření."
                    : "Pomůcky jsou seřazené podle názvu."}
              </p>
            </div>
            <div className="flex max-w-full gap-1.5 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
              {SORT_OPTIONS.map((option) => {
                const active = option.key === sortMode;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSortMode(option.key)}
                    className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition sm:text-sm ${
                      active
                        ? "bg-slate-950 text-white shadow-[0_8px_18px_rgba(15,23,42,0.24)]"
                        : "bg-transparent text-slate-600 hover:bg-white hover:text-slate-950"
                    }`}
                    aria-pressed={active}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {usageLoading ? (
              <p className="w-full text-xs font-medium text-slate-500">
                Načítám osobní pořadí…
              </p>
            ) : usageError ? (
              <p className="w-full text-xs font-semibold text-rose-700">
                {usageError}
              </p>
            ) : null}
          </section>

          {filteredTools.length === 0 ? (
            <div className="rounded-[30px] border border-slate-200/80 bg-white/82 px-6 py-10 text-center shadow-[0_20px_58px_rgba(15,23,42,0.1)] backdrop-blur-xl">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.14)]">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-slate-900">
                Nic neodpovídá aktuálnímu filtru
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
                Pro filtr <strong>{activeFilter}</strong> a zadané hledání se nenašla žádná pomůcka.
              </p>
            </div>
          ) : (
            <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredTools.map((tool, index) => {
                if (tool.render) {
                  return <div key={tool.key}>{tool.render()}</div>;
                }

                const favorite = usageByKey[tool.key]?.favorite === true;
                const favoriteDisabled =
                  !user ||
                  !effectiveEmail ||
                  favoritePendingKeys.has(tool.key);
                const cardClassName = `${styles.toolCard} pomucky-tool-card group relative isolate flex h-full min-h-[162px] w-full overflow-hidden rounded-[22px] border border-violet-400/45 bg-[linear-gradient(155deg,#2f165e_0%,#1a0f3a_58%,#100726_100%)] p-3.5 text-left shadow-[0_18px_42px_rgba(11,6,30,0.42)] ring-1 ring-violet-300/25 transition-[transform,border-color,box-shadow] duration-250 hover:-translate-y-1.5 hover:border-violet-300/70 hover:shadow-[0_30px_72px_rgba(10,5,30,0.54)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80 sm:min-h-[188px] sm:rounded-[26px] sm:p-4 sm:shadow-[0_24px_58px_rgba(11,6,30,0.46)]`;
                const favoriteControl = (
                  <FavoriteButton
                    active={favorite}
                    disabled={favoriteDisabled}
                    title={tool.title}
                    onToggle={() => void toggleFavorite(tool.key)}
                  />
                );
                const animationStyle = {
                  animationDelay: `${Math.min(index * 45, 260)}ms`,
                };

                if (tool.onClick) {
                  return (
                    <div key={tool.key} className="relative h-full">
                      {favoriteControl}
                      <button
                        type="button"
                        onClick={() => {
                          recordToolOpen(tool.key);
                          tool.onClick?.();
                        }}
                        className={cardClassName}
                        style={animationStyle}
                      >
                        <ToolCardContent tool={tool} />
                      </button>
                    </div>
                  );
                }

                if (tool.external) {
                  return (
                    <div key={tool.key} className="relative h-full">
                      {favoriteControl}
                      <a
                        href={tool.href ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => recordToolOpen(tool.key)}
                        className={cardClassName}
                        style={animationStyle}
                      >
                        <ToolCardContent tool={tool} />
                      </a>
                    </div>
                  );
                }

                return (
                  <div key={tool.key} className="relative h-full">
                    {favoriteControl}
                    <Link
                      href={tool.href ?? "#"}
                      onClick={() => recordToolOpen(tool.key)}
                      className={cardClassName}
                      style={animationStyle}
                    >
                      <ToolCardContent tool={tool} />
                    </Link>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      </div>

      {tachometerModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Výběr pojišťovny pro nahrání tachometru">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/58 backdrop-blur-sm"
            onClick={() => setTachometerModalOpen(false)}
            aria-label="Zavřít dialog"
          />

          <div className="pomucky-modal-panel relative z-10 w-full max-w-3xl overflow-hidden rounded-[30px] border border-white/75 bg-[linear-gradient(160deg,rgba(255,255,255,0.97)_0%,rgba(248,250,252,0.97)_100%)] p-5 shadow-[0_32px_90px_rgba(2,6,23,0.38)] sm:p-7">
            <button
              type="button"
              onClick={() => setTachometerModalOpen(false)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              aria-label="Zavřít"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div className="pr-12">
              <p className="pomucky-modal-category text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">Pojištění vozidel</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-slate-950 sm:text-3xl">Nahrát tachometr</h2>
              <p className="mt-2 text-sm text-slate-600 sm:text-base">
                Vyber pojišťovnu a otevři odkaz pro nahrání aktuálního stavu tachometru.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TACHOMETER_UPLOAD_TARGETS.map((target) => (
                <a
                  key={target.key}
                  href={target.href}
                  target="_blank"
                  rel="noreferrer"
                  className="pomucky-portal-card group relative isolate min-h-[154px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_34px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/80"
                  onClick={() => setTachometerModalOpen(false)}
                >
                  <Image
                    src={target.logoPath}
                    alt={`Logo ${target.label}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="pointer-events-none object-contain p-4 opacity-[0.18] saturate-0 contrast-125"
                  />
                  <div className={`pomucky-portal-tint pointer-events-none absolute inset-0 ${target.tintClass}`} />

                  <div className="relative flex h-full flex-col justify-between">
                    <h3 className="max-w-[calc(100%-3rem)] text-2xl font-bold tracking-[-0.015em] text-slate-900">
                      {target.label}
                    </h3>

                    <div className="flex justify-end">
                      <span className="pomucky-portal-arrow inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/90 bg-white/90 text-slate-700 transition group-hover:border-blue-300 group-hover:bg-blue-700 group-hover:text-white">
                        <ArrowUpRight className="h-4.5 w-4.5" />
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {linksModalOpen && (
        <InstitutionPortalLinksModal onClose={() => setLinksModalOpen(false)} />
      )}
      <style jsx global>{`
        body.simple-bg.simple-bg-white .app-content .pomucky-category-badge,
        body.simple-bg.simple-bg-white .app-content .pomucky-category-badge * {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          stroke: currentColor !important;
        }
      `}</style>
    </AppLayout>
  );
}
