// src/app/pomucky/page.tsx
"use client";

import { useMemo, useState, type ReactElement } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  ArrowUpRight,
  BanknoteArrowDown,
  BarChart3,
  Bike,
  CarFront,
  Calculator,
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
  TrendingUp,
  Trophy,
  WalletCards,
  Wind,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "./plan-produkce/SplitTitle";

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const CATEGORY_RANK: Record<string, number> = {
  "Pojištění majetku": 0,
  "Pojištění vozidel": 1,
  "Životní pojištění": 2,
  Finance: 3,
  Investice: 4,
  Obecné: 5,
};

export default function ToolsPage() {
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

  const FILTER_VISUALS: Record<FilterKey, { active: string; inactive: string }> = {
    Všechny: {
      active: "border-slate-900 bg-slate-900 text-slate-50",
      inactive: "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
    },
    "Pojištění majetku": {
      active: "border-cyan-700 bg-cyan-700 text-white",
      inactive: "border-cyan-200 bg-white text-cyan-700 hover:border-cyan-300 hover:bg-cyan-50",
    },
    "Pojištění vozidel": {
      active: "border-blue-700 bg-blue-700 text-white",
      inactive: "border-blue-200 bg-white text-blue-700 hover:border-blue-300 hover:bg-blue-50",
    },
    "Životní pojištění": {
      active: "border-rose-700 bg-rose-700 text-white",
      inactive: "border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50",
    },
    Finance: {
      active: "border-emerald-700 bg-emerald-700 text-white",
      inactive: "border-emerald-200 bg-white text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50",
    },
    Investice: {
      active: "border-amber-700 bg-amber-700 text-white",
      inactive: "border-amber-200 bg-white text-amber-700 hover:border-amber-300 hover:bg-amber-50",
    },
    Obecné: {
      active: "border-indigo-700 bg-indigo-700 text-white",
      inactive: "border-indigo-200 bg-white text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50",
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
    }
  > = {
    "Pojištění majetku": {
      badge: "text-cyan-700",
      icon: "border-cyan-200 bg-cyan-50 text-cyan-700 group-hover:border-cyan-300 group-hover:bg-cyan-100 group-hover:text-cyan-900",
      cardHover: "hover:border-cyan-300 hover:shadow-[0_18px_40px_rgba(8,145,178,0.14)]",
      arrow: "group-hover:border-cyan-300 group-hover:bg-cyan-700 group-hover:text-white",
      accent: "bg-[linear-gradient(90deg,#0891b2_0%,#67e8f9_100%)]",
      wash: "bg-[linear-gradient(135deg,rgba(236,254,255,0.96)_0%,rgba(255,255,255,1)_58%,rgba(248,250,252,1)_100%)]",
    },
    "Pojištění vozidel": {
      badge: "text-blue-700",
      icon: "border-blue-200 bg-blue-50 text-blue-700 group-hover:border-blue-300 group-hover:bg-blue-100 group-hover:text-blue-900",
      cardHover: "hover:border-blue-300 hover:shadow-[0_18px_40px_rgba(37,99,235,0.13)]",
      arrow: "group-hover:border-blue-300 group-hover:bg-blue-700 group-hover:text-white",
      accent: "bg-[linear-gradient(90deg,#2563eb_0%,#93c5fd_100%)]",
      wash: "bg-[linear-gradient(135deg,rgba(239,246,255,0.98)_0%,rgba(255,255,255,1)_58%,rgba(248,250,252,1)_100%)]",
    },
    "Životní pojištění": {
      badge: "text-rose-700",
      icon: "border-rose-200 bg-rose-50 text-rose-700 group-hover:border-rose-300 group-hover:bg-rose-100 group-hover:text-rose-900",
      cardHover: "hover:border-rose-300 hover:shadow-[0_18px_40px_rgba(225,29,72,0.13)]",
      arrow: "group-hover:border-rose-300 group-hover:bg-rose-700 group-hover:text-white",
      accent: "bg-[linear-gradient(90deg,#be123c_0%,#fda4af_100%)]",
      wash: "bg-[linear-gradient(135deg,rgba(255,241,242,0.98)_0%,rgba(255,255,255,1)_58%,rgba(248,250,252,1)_100%)]",
    },
    Finance: {
      badge: "text-emerald-700",
      icon: "border-emerald-200 bg-emerald-50 text-emerald-700 group-hover:border-emerald-300 group-hover:bg-emerald-100 group-hover:text-emerald-900",
      cardHover: "hover:border-emerald-300 hover:shadow-[0_18px_40px_rgba(5,150,105,0.14)]",
      arrow: "group-hover:border-emerald-300 group-hover:bg-emerald-700 group-hover:text-white",
      accent: "bg-[linear-gradient(90deg,#059669_0%,#86efac_100%)]",
      wash: "bg-[linear-gradient(135deg,rgba(236,253,245,0.98)_0%,rgba(255,255,255,1)_58%,rgba(248,250,252,1)_100%)]",
    },
    Investice: {
      badge: "text-amber-700",
      icon: "border-amber-200 bg-amber-50 text-amber-700 group-hover:border-amber-300 group-hover:bg-amber-100 group-hover:text-amber-900",
      cardHover: "hover:border-amber-300 hover:shadow-[0_18px_40px_rgba(180,83,9,0.14)]",
      arrow: "group-hover:border-amber-300 group-hover:bg-amber-700 group-hover:text-white",
      accent: "bg-[linear-gradient(90deg,#b45309_0%,#facc15_100%)]",
      wash: "bg-[linear-gradient(135deg,rgba(255,251,235,0.98)_0%,rgba(255,255,255,1)_58%,rgba(248,250,252,1)_100%)]",
    },
    Obecné: {
      badge: "text-indigo-700",
      icon: "border-indigo-200 bg-indigo-50 text-indigo-700 group-hover:border-indigo-300 group-hover:bg-indigo-100 group-hover:text-indigo-900",
      cardHover: "hover:border-indigo-300 hover:shadow-[0_18px_40px_rgba(79,70,229,0.13)]",
      arrow: "group-hover:border-indigo-300 group-hover:bg-indigo-700 group-hover:text-white",
      accent: "bg-[linear-gradient(90deg,#4f46e5_0%,#a5b4fc_100%)]",
      wash: "bg-[linear-gradient(135deg,rgba(238,242,255,0.98)_0%,rgba(255,255,255,1)_58%,rgba(248,250,252,1)_100%)]",
    },
  };

  const [activeFilter, setActiveFilter] = useState<FilterKey>("Všechny");
  const [searchQuery, setSearchQuery] = useState("");

  type Tool = {
    key: string;
    category: ToolCategory;
    title: string;
    description: string;
    icon: LucideIcon;
    href?: string;
    external?: boolean;
    render?: () => ReactElement;
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
        key: "data-o-vozidle",
        category: "Pojištění vozidel",
        title: "Data o vozidle",
        description: "Přehledné místo pro technické údaje, VIN a historii vozu.",
        icon: CarFront,
        href: "/pomucky/data-o-vozidle",
      },
      {
        key: "naceneni-vozidla",
        category: "Pojištění vozidel",
        title: "Nacenění vozidla",
        description: "Odhad doporučené a obvyklé ceny vozidla pro havarijní pojištění.",
        icon: Calculator,
        href: "/pomucky/naceneni-vozidla",
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
        key: "kontrola-tachometru",
        category: "Pojištění vozidel",
        title: "Kontrola tachometru",
        description: "Ověř si nájezd vozidla online během pár vteřin.",
        icon: Gauge,
        href: "https://www.kontrolatachometru.cz/",
        external: true,
      },
      {
        key: "pillow-nahrat-tachometr",
        category: "Pojištění vozidel",
        title: "Pillow Nahrát tachometr",
        description: "Nahraj stav tachometru do portálu Pillow.",
        icon: Gauge,
        href: "https://portal.pillow.cz/nahrat_kilometry/step1",
        external: true,
      },
      {
        key: "allianz-nahrat-tachometr",
        category: "Pojištění vozidel",
        title: "Allianz Nahrát tachometr",
        description: "Nahraj stav tachometru do portálu Allianz.",
        icon: Gauge,
        href: "https://www.allianz.cz/cs_CZ/apps/kilometry-nahrani.html",
        external: true,
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
    []
  );

  const filteredTools = useMemo(
    () => {
      const q = normalizeSearchValue(searchQuery);
      const filtered = tools.filter((tool) => {
        const categoryMatch =
          activeFilter === "Všechny" || tool.category === activeFilter;
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

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-6xl px-1 py-1 font-mono text-slate-900 sm:px-2 sm:py-2">
        <header className="mb-5">
          <SplitTitle text="Pomůcky" className="font-mono !text-slate-900" />
        </header>

        <div className="mb-4 max-w-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              id="tools-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Název, kategorie nebo klíčové slovo…"
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300"
            />
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2.5">
          {FILTERS.map((filter) => {
            const active = filter === activeFilter;
            const style = FILTER_VISUALS[filter];
            return (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? style.active
                    : style.inactive
                }`}
              >
                {filter}
              </button>
            );
          })}
        </div>

        {filteredTools.length === 0 && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Pro zadaný filtr a hledání nebyla nalezena žádná pomůcka.
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredTools.map((tool) => {
            if (tool.render) {
              return tool.render();
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
                className={`group relative flex min-h-[132px] overflow-hidden rounded-2xl border border-slate-200 ${style.wash} px-5 py-5 shadow-[0_10px_26px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 ${style.cardHover} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300`}
              >
                <span className={`absolute inset-x-0 top-0 h-1 ${style.accent}`} aria-hidden="true" />
                <div className="flex w-full flex-col justify-between gap-5">
                  <div className="flex items-start justify-between gap-4">
                    <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-[0_10px_22px_rgba(15,23,42,0.08)] transition ${style.icon}`}>
                      <ToolIcon className="h-5 w-5" />
                    </span>

                    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition ${style.arrow}`}>
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${style.badge}`}>
                      {tool.category}
                    </p>
                    <h2 className="mt-1.5 text-xl font-semibold leading-tight tracking-tight text-slate-950">
                      {tool.title}
                    </h2>
                  </div>
                </div>
              </CardWrapper>
            );
          })}
        </section>
      </div>
    </AppLayout>
  );
}
