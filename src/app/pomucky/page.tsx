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
  TrendingUp,
  Trophy,
  WalletCards,
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

  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]>("Všechny");
  const [searchQuery, setSearchQuery] = useState("");

  type Tool = {
    key: string;
    category: (typeof FILTERS)[number];
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
    ],
    []
  );

  const filteredTools = useMemo(
    () => {
      const q = normalizeSearchValue(searchQuery);
      return tools.filter((tool) => {
        const categoryMatch =
          activeFilter === "Všechny" || tool.category === activeFilter;
        if (!categoryMatch) return false;
        if (!q) return true;

        return [tool.title, tool.description, tool.category]
          .map(normalizeSearchValue)
          .some((value) => value.includes(q));
      });
    },
    [activeFilter, searchQuery, tools]
  );

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-6xl px-1 py-1 font-mono text-slate-900 sm:px-2 sm:py-2">
        <header className="mb-5">
          <SplitTitle text="Pomůcky" className="font-mono !text-slate-900" />
          <p className="mt-2 text-base text-slate-600">
            Rychlé nástroje pro efektivnější práci.
          </p>
        </header>

        <div className="mb-4 max-w-xl">
          <label htmlFor="tools-search" className="mb-1 block text-sm text-slate-600">
            Hledat pomůcku
          </label>
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
            return (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-[#f8fafc]"
                    : "border-slate-900 bg-white text-slate-900 hover:bg-slate-50"
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
            const wrapperProps = tool.external
              ? { href: tool.href ?? "#", target: "_blank", rel: "noreferrer" }
              : { href: tool.href ?? "#" };

            return (
              <CardWrapper
                key={tool.key}
                {...wrapperProps}
                className="group relative flex h-full items-center gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4 transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-[1px] hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-[0_12px_24px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition group-hover:border-slate-300 group-hover:bg-white group-hover:text-slate-900">
                  <ToolIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {tool.category}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold leading-snug tracking-tight text-slate-900">
                    {tool.title}
                  </h2>
                </div>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition group-hover:border-slate-300 group-hover:text-slate-900">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </CardWrapper>
            );
          })}
        </section>
      </div>
    </AppLayout>
  );
}
