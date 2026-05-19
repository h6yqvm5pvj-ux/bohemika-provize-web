// src/app/pomucky/page.tsx
"use client";

import { useMemo, useState, type ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";
import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  ArrowUpRight,
  BanknoteArrowDown,
  BarChart3,
  Bike,
  Bot,
  Calculator,
  CarFront,
  Files,
  FileSignature,
  Gauge,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  PenTool,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  WalletCards,
  Wind,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import styles from "./pomuckyWallArt.module.css";

const toolsFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const FILTERS = [
  "Všechny",
  "Pojištění majetku",
  "Pojištění vozidel",
  "Životní pojištění",
  "Finance",
  "Investice",
  "Obecné",
] as const;

type FilterKey = (typeof FILTERS)[number];
type ToolCategory = Exclude<FilterKey, "Všechny">;

const CATEGORY_RANK: Record<ToolCategory, number> = {
  "Pojištění majetku": 0,
  "Pojištění vozidel": 1,
  "Životní pojištění": 2,
  Finance: 3,
  Investice: 4,
  Obecné: 5,
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
    helper: "VIN, nacenění, tachometry i další auto utility.",
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
    badge: string;
    icon: string;
    cardHover: string;
    arrow: string;
    accent: string;
    wash: string;
    ring: string;
  }
> = {
  "Pojištění majetku": {
    badge: "text-cyan-700",
    icon: "border-cyan-200/90 bg-cyan-50 text-cyan-700 group-hover:border-cyan-300 group-hover:bg-cyan-100 group-hover:text-cyan-900",
    cardHover: "hover:border-cyan-300/90",
    arrow: "group-hover:border-cyan-300 group-hover:bg-cyan-700 group-hover:text-white",
    accent: "from-cyan-400 via-sky-500 to-blue-500",
    wash: "bg-[linear-gradient(135deg,rgba(236,254,255,0.92)_0%,rgba(255,255,255,0.98)_52%,rgba(240,249,255,0.9)_100%)]",
    ring: "ring-cyan-100/70",
  },
  "Pojištění vozidel": {
    badge: "text-blue-700",
    icon: "border-blue-200/90 bg-blue-50 text-blue-700 group-hover:border-blue-300 group-hover:bg-blue-100 group-hover:text-blue-900",
    cardHover: "hover:border-blue-300/90",
    arrow: "group-hover:border-blue-300 group-hover:bg-blue-700 group-hover:text-white",
    accent: "from-blue-500 via-indigo-500 to-violet-500",
    wash: "bg-[linear-gradient(135deg,rgba(239,246,255,0.92)_0%,rgba(255,255,255,0.98)_52%,rgba(238,242,255,0.9)_100%)]",
    ring: "ring-blue-100/70",
  },
  "Životní pojištění": {
    badge: "text-rose-700",
    icon: "border-rose-200/90 bg-rose-50 text-rose-700 group-hover:border-rose-300 group-hover:bg-rose-100 group-hover:text-rose-900",
    cardHover: "hover:border-rose-300/90",
    arrow: "group-hover:border-rose-300 group-hover:bg-rose-700 group-hover:text-white",
    accent: "from-rose-500 via-pink-500 to-fuchsia-500",
    wash: "bg-[linear-gradient(135deg,rgba(255,241,242,0.92)_0%,rgba(255,255,255,0.98)_52%,rgba(253,242,248,0.9)_100%)]",
    ring: "ring-rose-100/70",
  },
  Finance: {
    badge: "text-emerald-700",
    icon: "border-emerald-200/90 bg-emerald-50 text-emerald-700 group-hover:border-emerald-300 group-hover:bg-emerald-100 group-hover:text-emerald-900",
    cardHover: "hover:border-emerald-300/90",
    arrow: "group-hover:border-emerald-300 group-hover:bg-emerald-700 group-hover:text-white",
    accent: "from-emerald-400 via-emerald-500 to-teal-500",
    wash: "bg-[linear-gradient(135deg,rgba(236,253,245,0.92)_0%,rgba(255,255,255,0.98)_52%,rgba(240,253,250,0.9)_100%)]",
    ring: "ring-emerald-100/70",
  },
  Investice: {
    badge: "text-amber-700",
    icon: "border-amber-200/90 bg-amber-50 text-amber-700 group-hover:border-amber-300 group-hover:bg-amber-100 group-hover:text-amber-900",
    cardHover: "hover:border-amber-300/90",
    arrow: "group-hover:border-amber-300 group-hover:bg-amber-700 group-hover:text-white",
    accent: "from-amber-400 via-orange-500 to-orange-600",
    wash: "bg-[linear-gradient(135deg,rgba(255,251,235,0.92)_0%,rgba(255,255,255,0.98)_52%,rgba(255,247,237,0.9)_100%)]",
    ring: "ring-amber-100/70",
  },
  Obecné: {
    badge: "text-indigo-700",
    icon: "border-indigo-200/90 bg-indigo-50 text-indigo-700 group-hover:border-indigo-300 group-hover:bg-indigo-100 group-hover:text-indigo-900",
    cardHover: "hover:border-indigo-300/90",
    arrow: "group-hover:border-indigo-300 group-hover:bg-indigo-700 group-hover:text-white",
    accent: "from-indigo-400 via-indigo-500 to-blue-600",
    wash: "bg-[linear-gradient(135deg,rgba(238,242,255,0.92)_0%,rgba(255,255,255,0.98)_52%,rgba(239,246,255,0.9)_100%)]",
    ring: "ring-indigo-100/70",
  },
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

const INSTITUTION_PORTAL_TARGETS = [
  {
    key: "maxx",
    label: "Maxx",
    href: "https://sjednatel.bohemiaservis.cz/login",
    logoPath: "/icons/bohemikalogo.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(37,99,235,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(6,182,212,0.16)_0%,transparent_66%)]",
  },
  {
    key: "bsf-aplikace",
    label: "BSF Aplikace",
    href: "https://bsfaplikace.cz/sign/",
    logoPath: "/icons/bohemikalogo.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(79,70,229,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(34,197,94,0.16)_0%,transparent_66%)]",
  },
  {
    key: "cpp-sus",
    label: "ČPP SUS",
    href: "https://susp-landing-page.cpp.cz/",
    logoPath: "/icons/cpp.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(16,185,129,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(37,99,235,0.16)_0%,transparent_66%)]",
  },
  {
    key: "allianz-alfa",
    label: "Allianz Alfa",
    href: "https://allfa.allianz.cz/login/?ref=/homepage",
    logoPath: "/icons/allianz.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(37,99,235,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(99,102,241,0.16)_0%,transparent_66%)]",
  },
  {
    key: "kooperativa-knz",
    label: "Kooperativa KNZ",
    href: "https://knz-landing-page.koop.cz/",
    logoPath: "/icons/koop.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(14,165,233,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(59,130,246,0.16)_0%,transparent_66%)]",
  },
  {
    key: "csob-zeus",
    label: "ČSOB Zeus",
    href: "https://cassell.csobpoj.cz/cas/login?service=https%3A%2F%2Fzeus.csobpoj.cz%2Fzeus%2Flogin%2Fcas",
    logoPath: "/icons/csob.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(245,158,11,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(234,179,8,0.16)_0%,transparent_66%)]",
  },
  {
    key: "pillow-portal",
    label: "Pillow",
    href: "https://portal.pillow.cz/login",
    logoPath: "/icons/pillow.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(34,197,94,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(20,184,166,0.16)_0%,transparent_66%)]",
  },
  {
    key: "investika",
    label: "iNVESTiKA",
    href: "https://portal.investika.cz/login",
    logoPath: "/icons/invstk.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(168,85,247,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(236,72,153,0.16)_0%,transparent_66%)]",
  },
] as const;

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function ToolsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("Všechny");
  const [searchQuery, setSearchQuery] = useState("");
  const [tachometerModalOpen, setTachometerModalOpen] = useState(false);
  const [linksModalOpen, setLinksModalOpen] = useState(false);

  type Tool = {
    key: string;
    category: ToolCategory;
    title: string;
    description: string;
    icon: LucideIcon;
    href?: string;
    external?: boolean;
    render?: () => ReactElement;
    onClick?: () => void;
  };

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
        key: "skolici-materialy",
        category: "Obecné",
        title: "Školící materiály",
        description: "Rozcestník pro onboarding i produktová školení na jednom místě.",
        icon: GraduationCap,
        href: "/pomucky/skolici-materialy",
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
          "Top Premium Chat jako interní pomocník pro pojištění, investice a investiční zlato (bez přístupu ke smlouvám).",
        icon: Bot,
        href: "/pomucky/ai-asistent",
      },
      {
        key: "investicni-kalkulacka",
        category: "Investice",
        title: "Investiční kalkulačka",
        description: "Spočítej konečnou hodnotu investice při pravidelných vkladech.",
        icon: Calculator,
        href: "/pomucky/investicni-kalkulacka",
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
        title: "Katastr nemovitostí",
        description: "Vyhledej údaje z CUZK podle kódu adresního místa (RÚIAN) s autorizací přes tvůj účet.",
        icon: Home,
        href: "/cuzk",
      },
      {
        key: "cap-kalkulacka",
        category: "Pojištění majetku",
        title: "ČAP Kalkulačka",
        description: "Kalkulace orientační pojistné hodnoty rodinného domu.",
        icon: WalletCards,
        href: "https://www.cap.cz/kophn",
        external: true,
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
        key: "naceneni-celniho-skla",
        category: "Pojištění vozidel",
        title: "Nacenění čelního skla",
        description: "Odhad ceny výměny čelního skla a doporučeného limitu pojištění podle VIN.",
        icon: Wind,
        href: "/pomucky/naceneni-celniho-skla",
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
        key: "projekce-vykonu",
        category: "Finance",
        title: "Projekce výkonu",
        description: "Vizualizuj si výplatu do budoucna.",
        icon: TrendingUp,
        href: "/pomucky/projekce-vykonu",
      },
      {
        key: "pracovni-neschopenka",
        category: "Životní pojištění",
        title: "Jak nastavit Pracovní neschopnost",
        description: "Kalkulačka na stanovení pojistné částky pro případ pracovní neschopnosti.",
        icon: HeartPulse,
        href: "/pomucky/pracovni-neschopenka",
      },
      {
        key: "invalidita",
        category: "Životní pojištění",
        title: "Jak nastavit Invaliditu",
        description: "Kalkulačka na stanovení pojistné částky pro Invaliditu 1., 2. a 3. stupně dle poklesu příjmu.",
        icon: Accessibility,
        href: "/pomucky/invalidita",
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
        key: "srovnavac-zivotniho-pojisteni",
        category: "Životní pojištění",
        title: "Srovnavač životního pojištění",
        description: "Porovnání produktových podmínek životního pojištění podle pojišťoven a kategorií.",
        icon: ShieldCheck,
        href: "/pomucky/srovnavac-zivotniho-pojisteni",
      },
    ],
    [setLinksModalOpen, setTachometerModalOpen]
  );

  const filteredTools = useMemo(
    () => {
      const q = normalizeSearchValue(searchQuery);
      const filtered = tools.filter((tool) => {
        const categoryMatch = activeFilter === "Všechny" || tool.category === activeFilter;
        if (!categoryMatch) return false;
        if (!q) return true;

        return [tool.title, tool.description, tool.category]
          .map(normalizeSearchValue)
          .some((value) => value.includes(q));
      });

      return filtered.sort((a, b) => {
        if (activeFilter === "Všechny") {
          const rankDiff = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
          if (rankDiff !== 0) return rankDiff;
        }
        return a.title.localeCompare(b.title, "cs");
      });
    },
    [activeFilter, searchQuery, tools]
  );

  const activeFilterVisual = FILTER_VISUALS[activeFilter];

  return (
    <AppLayout active="tools">
      <div className={`${toolsFont.className} relative w-full overflow-visible px-2 pb-10 pt-2 sm:px-3`}>
        <div className="relative z-10 mx-auto max-w-7xl space-y-5 px-1 sm:px-2 lg:px-3">
          <section className="py-1 sm:py-2">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  Nástrojový Hub
                </span>

                <div>
                  <h1 className="text-4xl font-bold tracking-[-0.025em] text-slate-900 sm:text-5xl">
                    Pomůcky
                  </h1>
                </div>
              </div>

              <div className="w-full max-w-xl xl:w-[32rem]">
                <label htmlFor="tools-search" className="sr-only">
                  Hledat pomůcky
                </label>
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_16px_38px_rgba(15,23,42,0.12)]">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  <input
                    id="tools-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Název, kategorie nebo klíčové slovo..."
                    className="h-14 w-full bg-transparent py-3 pl-12 pr-4 text-base text-slate-900 outline-none placeholder:text-slate-500"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="pt-1 sm:pt-2">
            <div className="flex flex-wrap gap-2.5">
              {FILTERS.map((filter) => {
                const visual = FILTER_VISUALS[filter];
                const Icon = visual.icon;
                const active = filter === activeFilter;

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={[
                      styles.filterChip,
                      "inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition",
                      active
                        ? `${visual.active} ${visual.glow}`
                        : visual.inactive,
                      active && filter === "Všechny" ? "!text-white" : "",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                    {filter}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-slate-600">
              {activeFilterVisual.helper}
            </p>
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
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredTools.map((tool, index) => {
                if (tool.render) {
                  return <div key={tool.key}>{tool.render()}</div>;
                }

                if (tool.onClick) {
                  const ToolIcon = tool.icon;
                  const style = CATEGORY_VISUALS[tool.category];
                  return (
                    <button
                      key={tool.key}
                      type="button"
                      onClick={tool.onClick}
                      className={`${styles.toolCard} group relative flex min-h-[184px] w-full overflow-hidden rounded-[30px] border border-white/70 ${style.wash} p-4 text-left shadow-[0_20px_54px_rgba(15,23,42,0.12)] ring-1 ${style.ring} transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 ${style.cardHover} hover:shadow-[0_26px_66px_rgba(15,23,42,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80`}
                      style={{ animationDelay: `${Math.min(index * 45, 260)}ms` }}
                    >
                      <span className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${style.accent}`} aria-hidden="true" />

                      <div className="flex w-full flex-col justify-between gap-4">
                        <div className="flex items-start justify-between gap-4">
                          <span
                            className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition ${style.icon}`}
                          >
                            <ToolIcon className="h-5 w-5" />
                          </span>

                          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-white/88 text-slate-500 transition ${style.arrow}`}>
                            <ArrowUpRight className="h-4.5 w-4.5" />
                          </span>
                        </div>

                        <div className="min-w-0">
                          <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${style.badge}`}>
                            {tool.category}
                          </p>
                          <h2 className="mt-2 text-[1.45rem] font-bold leading-[1.12] tracking-[-0.015em] text-slate-950">
                            {tool.title}
                          </h2>
                          <p className="mt-2 text-[0.95rem] leading-relaxed text-slate-600">
                            {tool.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                }

                const CardWrapper = tool.external ? "a" : Link;
                const ToolIcon = tool.icon;
                const style = CATEGORY_VISUALS[tool.category];
                const wrapperProps = tool.external
                  ? { href: tool.href ?? "#", target: "_blank", rel: "noreferrer" }
                  : { href: tool.href ?? "#" };

                return (
                  <CardWrapper
                    key={tool.key}
                    {...wrapperProps}
                    className={`${styles.toolCard} group relative flex min-h-[184px] overflow-hidden rounded-[30px] border border-white/70 ${style.wash} p-4 shadow-[0_20px_54px_rgba(15,23,42,0.12)] ring-1 ${style.ring} transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 ${style.cardHover} hover:shadow-[0_26px_66px_rgba(15,23,42,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80`}
                    style={{ animationDelay: `${Math.min(index * 45, 260)}ms` }}
                  >
                    <span className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${style.accent}`} aria-hidden="true" />

                    <div className="flex w-full flex-col justify-between gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <span
                          className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition ${style.icon}`}
                        >
                          <ToolIcon className="h-5 w-5" />
                        </span>

                        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-white/88 text-slate-500 transition ${style.arrow}`}>
                          <ArrowUpRight className="h-4.5 w-4.5" />
                        </span>
                      </div>

                      <div className="min-w-0">
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${style.badge}`}>
                          {tool.category}
                        </p>
                        <h2 className="mt-2 text-[1.45rem] font-bold leading-[1.12] tracking-[-0.015em] text-slate-950">
                          {tool.title}
                        </h2>
                        <p className="mt-2 text-[0.95rem] leading-relaxed text-slate-600">
                          {tool.description}
                        </p>
                      </div>
                    </div>
                  </CardWrapper>
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

          <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-[30px] border border-white/75 bg-[linear-gradient(160deg,rgba(255,255,255,0.97)_0%,rgba(248,250,252,0.97)_100%)] p-5 shadow-[0_32px_90px_rgba(2,6,23,0.38)] sm:p-7">
            <button
              type="button"
              onClick={() => setTachometerModalOpen(false)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              aria-label="Zavřít"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div className="pr-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">Pojištění vozidel</p>
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
                  className="group relative isolate min-h-[154px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_34px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/80"
                  onClick={() => setTachometerModalOpen(false)}
                >
                  <Image
                    src={target.logoPath}
                    alt={`Logo ${target.label}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="pointer-events-none object-contain p-4 opacity-[0.18] saturate-0 contrast-125"
                  />
                  <div className={`pointer-events-none absolute inset-0 ${target.tintClass}`} />

                  <div className="relative flex h-full flex-col justify-between">
                    <div className="inline-flex w-fit items-center rounded-full border border-slate-200/90 bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      Otevřít
                    </div>

                    <div className="flex items-end justify-between gap-3">
                      <h3 className="text-2xl font-bold tracking-[-0.015em] text-slate-900">{target.label}</h3>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/90 bg-white/90 text-slate-700 transition group-hover:border-blue-300 group-hover:bg-blue-700 group-hover:text-white">
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
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Odkazy na portály institucí">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/58 backdrop-blur-sm"
            onClick={() => setLinksModalOpen(false)}
            aria-label="Zavřít dialog"
          />

          <div className="relative z-10 my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[30px] border border-white/75 bg-[linear-gradient(160deg,rgba(255,255,255,0.97)_0%,rgba(248,250,252,0.97)_100%)] p-5 shadow-[0_32px_90px_rgba(2,6,23,0.38)] sm:max-h-[calc(100dvh-3rem)] sm:p-7">
            <button
              type="button"
              onClick={() => setLinksModalOpen(false)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              aria-label="Zavřít"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div className="pr-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700">Obecné</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-slate-950 sm:text-3xl">Odkazy</h2>
              <p className="mt-2 text-sm text-slate-600 sm:text-base">
                Odkazy na portály institucí.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {INSTITUTION_PORTAL_TARGETS.map((target) => (
                <a
                  key={target.key}
                  href={target.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative isolate min-h-[154px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_34px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/80"
                  onClick={() => setLinksModalOpen(false)}
                >
                  <Image
                    src={target.logoPath}
                    alt={`Logo ${target.label}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="pointer-events-none object-contain p-4 opacity-[0.18] saturate-0 contrast-125"
                  />
                  <div className={`pointer-events-none absolute inset-0 ${target.tintClass}`} />

                  <div className="relative flex h-full flex-col justify-between">
                    <div className="inline-flex w-fit items-center rounded-full border border-slate-200/90 bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      Otevřít
                    </div>

                    <div className="flex items-end justify-between gap-3">
                      <h3 className="text-2xl font-bold tracking-[-0.015em] text-slate-900">{target.label}</h3>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/90 bg-white/90 text-slate-700 transition group-hover:border-indigo-300 group-hover:bg-indigo-700 group-hover:text-white">
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
    </AppLayout>
  );
}
