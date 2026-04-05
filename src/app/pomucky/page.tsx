// src/app/pomucky/page.tsx
"use client";

import { useMemo, useState, type ReactElement } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BanknoteArrowDown,
  BarChart3,
  Bike,
  CarFront,
  Calculator,
  FileSignature,
  Gauge,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  PenTool,
  Scale,
  ShieldCheck,
  TrendingUp,
  Trophy,
  WalletCards,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "./plan-produkce/SplitTitle";

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
        title: "Tvorba",
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
        key: "kontrola-tachometru",
        category: "Pojištění vozidel",
        title: "Kontrola tachometru",
        description: "Ověř si nájezd vozidla online během pár vteřin.",
        icon: Gauge,
        href: "https://www.kontrolatachometru.cz/",
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
        icon: ShieldCheck,
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
    () =>
      tools.filter(
        (tool) => activeFilter === "Všechny" || tool.category === activeFilter
      ),
    [activeFilter, tools]
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
                className="group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 px-5 py-6 shadow-[0_12px_28px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_16px_34px_rgba(15,23,42,0.36)]"
              >
                <div className="relative z-10 flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-400/40 bg-slate-900 transition group-hover:border-slate-200/80">
                    <ToolIcon className="h-5 w-5 text-white" />
                  </span>
                  <h2 className="text-xl font-semibold tracking-tight text-white group-hover:underline">
                    {tool.title}
                  </h2>
                </div>
              </CardWrapper>
            );
          })}
        </section>
      </div>
    </AppLayout>
  );
}
