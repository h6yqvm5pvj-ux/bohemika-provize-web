// src/app/pomucky/dokumenty/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CarFront, HeartPulse, Home, Landmark, Search } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../plan-produkce/SplitTitle";

type DocumentSection = {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  items: string[];
  href?: string;
};

const DOCUMENT_SECTIONS = [
  {
    key: "zivotni",
    title: "Životní pojištění",
    description: "Dokumenty a podklady pro životní pojištění.",
    icon: HeartPulse,
    href: "/pomucky/dokumenty/zivotni-pojisteni",
    items: [
      "Checklist vstupních údajů klienta",
      "Vzory doporučení pojistné částky",
      "Shrnutí rizik a potřeb klienta",
    ],
  },
  {
    key: "majetek",
    title: "Majetek",
    description: "Podklady pro pojištění nemovitostí a domácností.",
    icon: Home,
    items: [
      "Kontrolní seznam majetkového pojištění",
      "Postup revize limitů a rizik",
      "Šablona porovnání variant krytí",
    ],
  },
  {
    key: "auto",
    title: "Auto",
    description: "Materiály pro povinné ručení a havarijní pojištění.",
    icon: CarFront,
    items: [
      "Checklist pro sjednání pojištění vozidla",
      "Podklady k posouzení historie škod",
      "Vzor komunikace při změně smlouvy",
    ],
  },
  {
    key: "investice",
    title: "Investice",
    description: "Dokumenty a metodiky pro investiční část poradenství.",
    icon: Landmark,
    items: [
      "Šablona investičního profilu klienta",
      "Přehled rizikových profilů",
      "Kontrolní body před uzavřením investice",
    ],
  },
] as const satisfies readonly DocumentSection[];

export default function DokumentyPage() {
  const [search, setSearch] = useState("");

  const filteredSections = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return DOCUMENT_SECTIONS;

    return DOCUMENT_SECTIONS.filter((section) => {
      const haystack = [
        section.title,
        section.description,
        ...section.items,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [search]);

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-6xl space-y-6 px-1 py-1 font-mono text-slate-900 sm:px-2 sm:py-2">
        <header className="space-y-2">
          <SplitTitle text="Dokumenty" className="!text-slate-900" />
          <p className="max-w-3xl text-sm text-slate-600">
            Centrální místo pro interní dokumenty a pracovní podklady. Obsah můžeš postupně doplňovat podle svého workflow.
          </p>
          <Link
            href="/pomucky"
            className="inline-flex items-center text-xs text-slate-600 transition hover:text-slate-900"
          >
            ← Zpět na pomůcky
          </Link>
        </header>

        <section className="rounded-3xl border border-slate-300 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.06)]">
          <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hledat v dokumentech..."
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
            />
          </label>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {filteredSections.map((section) => {
            const Icon = section.icon;
            const cardClassName = `rounded-3xl border border-slate-300 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${
              section.href ? "transition hover:-translate-y-0.5 hover:border-slate-900 hover:shadow-[0_14px_30px_rgba(15,23,42,0.1)]" : ""
            }`;

            const content = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-slate-50">
                      <Icon className="h-5 w-5 text-slate-700" />
                    </span>
                    <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
                  </div>
                  {section.href ? <ArrowRight className="h-4 w-4 text-slate-500" /> : null}
                </div>
                <p className="mt-3 text-sm text-slate-600">{section.description}</p>
                <ul className="mt-3 space-y-1 text-xs text-slate-500">
                  {section.items.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </>
            );

            if (section.href) {
              return (
                <Link key={section.key} href={section.href} className={cardClassName}>
                  {content}
                </Link>
              );
            }

            return (
              <article key={section.key} className={cardClassName}>
                {content}
              </article>
            );
          })}
          {filteredSections.length === 0 ? (
            <div className="md:col-span-2 rounded-3xl border border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              Pro hledaný výraz jsme nic nenašli.
            </div>
          ) : null}
        </section>
      </div>
    </AppLayout>
  );
}
