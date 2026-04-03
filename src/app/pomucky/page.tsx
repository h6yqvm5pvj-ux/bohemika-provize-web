// src/app/pomucky/page.tsx
"use client";

import { useMemo, useState, type ReactElement } from "react";
import Link from "next/link";

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
        href: "/pomucky/argumenty",
      },
      {
        key: "skolici-materialy",
        category: "Obecné",
        title: "Školící materiály",
        description: "Rozcestník pro onboarding i produktová školení na jednom místě.",
        href: "/pomucky/skolici-materialy",
      },
      {
        key: "zaznam",
        category: "Obecné",
        title: "Záznam z jednání",
        description: "Pomůcka pro správně vypsaný Záznam z jednání.",
        href: "/pomucky/zaznam",
      },
      {
        key: "tvorba",
        category: "Obecné",
        title: "Tvorba",
        description: "Interaktivní A4 editor dokumentu s pevnou hlavičkou, patičkou a stažením do PDF.",
        href: "/pomucky/tvorba",
      },
      {
        key: "investicni-kalkulacka",
        category: "Investice",
        title: "Investiční kalkulačka",
        description: "Spočítej konečnou hodnotu investice při pravidelných vkladech.",
        href: "/pomucky/investicni-kalkulacka",
      },
      {
        key: "statistika",
        category: "Finance",
        title: "Statistika",
        description: "Denní statistika oslovení, schůzek a smluv s výpočtem provize.",
        href: "/pomucky/statistika",
      },
      {
        key: "export-produkce",
        category: "Finance",
        title: "Export produkce",
        description: "Statistika s možností stažení v PDF a Odeslání mailem.",
        href: "/pomucky/export-produkce",
      },
      {
        key: "plan-produkce",
        category: "Finance",
        title: "Plán produkce",
        description: "Naplánuj si cíleně Produkci a rovnou uvidíš svou odměnu. Můžeš i stáhnout v PDF.",
        href: "/pomucky/plan-produkce",
      },
      {
        key: "zlato",
        category: "Investice",
        title: "Zlato",
        description: "Přehled a kalkulace pro investice do zlata.",
        href: "/pomucky/zlato",
      },
      {
        key: "katastr",
        category: "Pojištění majetku",
        title: "Katastr nemovitostí",
        description: "Vyhledej údaje z CUZK podle kódu adresního místa (RÚIAN) s autorizací přes tvůj účet.",
        href: "/cuzk",
      },
      {
        key: "cap-kalkulacka",
        category: "Pojištění majetku",
        title: "ČAP Kalkulačka",
        description: "Kalkulace orientační pojistné hodnoty rodinného domu.",
        href: "https://www.cap.cz/kophn",
        external: true,
      },
      {
        key: "data-o-vozidle",
        category: "Pojištění vozidel",
        title: "Data o vozidle",
        description: "Přehledné místo pro technické údaje, VIN a historii vozu.",
        href: "/pomucky/data-o-vozidle",
      },
      {
        key: "kontrola-tachometru",
        category: "Pojištění vozidel",
        title: "Kontrola tachometru",
        description: "Ověř si nájezd vozidla online během pár vteřin.",
        href: "https://www.kontrolatachometru.cz/",
        external: true,
      },
      {
        key: "projekce-vykonu",
        category: "Finance",
        title: "Projekce výkonu",
        description: "Vizualizuj si výplatu do budoucna.",
        href: "/pomucky/projekce-vykonu",
      },
      {
        key: "pracovni-neschopenka",
        category: "Životní pojištění",
        title: "Jak nastavit Pracovní neschopnost",
        description: "Kalkulačka na stanovení pojistné částky pro případ pracovní neschopnosti.",
        href: "/pomucky/pracovni-neschopenka",
      },
      {
        key: "invalidita",
        category: "Životní pojištění",
        title: "Jak nastavit Invaliditu",
        description: "Kalkulačka na stanovení pojistné částky pro Invaliditu 1., 2. a 3. stupně dle poklesu příjmu.",
        href: "/pomucky/invalidita",
      },
      {
        key: "srovnavac-trvalych-nasledku",
        category: "Životní pojištění",
        title: "Srovnavač Trvalých následků",
        description: "Otevři srovnavač pro trvalé následky úrazu.",
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
            const wrapperProps = tool.external
              ? { href: tool.href ?? "#", target: "_blank", rel: "noreferrer" }
              : { href: tool.href ?? "#" };

            return (
              <CardWrapper
                key={tool.key}
                {...wrapperProps}
                className="group relative overflow-hidden rounded-3xl border border-slate-900 bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.1)] transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-[0_14px_30px_rgba(15,23,42,0.14)]"
              >
                <div className="relative z-10 space-y-2">
                  <span className="inline-flex rounded-full border border-slate-900 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-900">
                    {tool.category}
                  </span>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">{tool.title}</h2>
                  <p className="text-sm leading-relaxed text-slate-600">{tool.description}</p>
                  <div className="pt-1 text-sm font-semibold text-slate-900 group-hover:underline">
                    Otevřít →
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
