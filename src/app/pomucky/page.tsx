// src/app/pomucky/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "./plan-produkce/SplitTitle";
import { TeamMessageToolCard } from "./TeamMessageToolCard";

export default function ToolsPage() {
  const FILTERS = [
    "Všechny",
    "Pojištění majetku",
    "Životní pojištění",
    "Finance",
    "Obecné",
  ] as const;

  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]>("Všechny");

  const tools = useMemo(
    () => [
      {
        key: "argumenty",
        category: "Obecné",
        title: "Argumenty",
        description: "Přehled Argumentů na různé typy námitek od klienta.",
        href: "/pomucky/argumenty",
      },
      {
        key: "zaznam",
        category: "Obecné",
        title: "Záznam z jednání",
        description: "Pomůcka pro správně vypsaný Záznam z jednání.",
        href: "/pomucky/zaznam",
      },
      {
        key: "investicni-kalkulacka",
        category: "Obecné",
        title: "Investiční kalkulačka",
        description: "Spočítej konečnou hodnotu investice při pravidelných vkladech.",
        href: "/pomucky/investicni-kalkulacka",
      },
      {
        key: "statistika",
        category: "Finance",
        title: "Statistika",
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
        key: "zprava-tymu",
        category: "Obecné",
        render: () => <TeamMessageToolCard key="zprava-tymu" />,
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
      <div className="w-full max-w-5xl space-y-6">
        <header className="mb-2">
          <SplitTitle text="Pomůcky" />
          <p className="text-sm text-slate-300 mt-1">
            Rychlé nástroje pro efektivnější práci.
          </p>
        </header>

        <div className="flex flex-wrap gap-3">
          {FILTERS.map((filter) => {
            const active = filter === activeFilter;
            return (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                  active
                    ? "bg-white/15 border-sky-400/70 text-white shadow-[0_12px_40px_rgba(59,130,246,0.25)]"
                    : "bg-white/5 border-white/15 text-slate-200 hover:border-sky-300/60 hover:text-white"
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
                className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)] hover:bg-white/10 hover:border-sky-400/70 transition cursor-pointer"
              >
                <h2 className="text-lg font-semibold mb-2">{tool.title}</h2>
                <p className="text-sm text-slate-300">{tool.description}</p>
              </CardWrapper>
            );
          })}
        </section>
      </div>
    </AppLayout>
  );
}
