// src/app/pomucky/dokumenty/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowUpRight,
  CarFront,
  CheckCircle2,
  Clock3,
  FileStack,
  HeartPulse,
  Home,
  Landmark,
  Search,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../plan-produkce/SplitTitle";

const documentsFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type DocumentSectionKey = "zivotni" | "majetek" | "auto" | "investice";

type DocumentSection = {
  key: DocumentSectionKey;
  title: string;
  description: string;
  icon: LucideIcon;
  items: string[];
  href?: string;
};

const DOCUMENT_SECTIONS: readonly DocumentSection[] = [
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
    href: "/pomucky/dokumenty/majetek",
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
    href: "/pomucky/dokumenty/auto",
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
];

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function DokumentyPage() {
  const [search, setSearch] = useState("");

  const filteredSections = useMemo(() => {
    const term = normalizeSearchValue(search);
    if (!term) return DOCUMENT_SECTIONS;

    return DOCUMENT_SECTIONS.filter((section) => {
      const haystack = [section.title, section.description, ...section.items]
        .map(normalizeSearchValue)
        .join(" ");
      return haystack.includes(term);
    });
  }, [search]);

  return (
    <AppLayout active="tools">
      <div className={`${documentsFont.className} w-full bg-white px-2 pb-10 pt-4 sm:px-3`}>
        <div className="mx-auto max-w-7xl space-y-6 px-1 sm:px-2 lg:px-3">
          <header className="border-b border-slate-200 pb-6">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                  <FileStack className="h-3.5 w-3.5" />
                  Dokument hub
                </span>
                <Link
                  href="/pomucky"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Zpět na pomůcky
                </Link>
              </div>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)] lg:items-end">
                <div>
                  <SplitTitle text="Dokumenty" className="!text-4xl !text-slate-900 sm:!text-5xl" />
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                    Interní dokumenty, metodiky a pracovní podklady rozdělené podle oblasti poradenství.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <label htmlFor="documents-search" className="sr-only">
                    Hledat v dokumentech
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="documents-search"
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Hledat sekci nebo klíčové slovo..."
                      className="h-9 w-full border-0 bg-transparent pl-7 pr-2 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </header>

          <section className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">
                Sekce dokumentů
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Nalezeno <span className="font-semibold text-slate-900">{filteredSections.length}</span> z{" "}
                <span className="font-semibold text-slate-900">{DOCUMENT_SECTIONS.length}</span> sekcí
              </p>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            {filteredSections.map((section) => {
              const Icon = section.icon;
              const cardClassName = [
                "group flex min-h-[190px] flex-col rounded-[24px] border border-slate-200 bg-white p-5 transition-colors duration-200",
                section.href ? "hover:border-slate-300" : "bg-slate-50",
              ].join(" ");

              const content = (
                <>
                  <div className="flex min-h-full flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 transition group-hover:bg-white"
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {section.href ? "Workflow" : "Připravujeme"}
                          </p>
                          <h2 className="mt-1 text-[1.45rem] font-bold leading-tight tracking-[-0.015em] text-slate-950">
                            {section.title}
                          </h2>
                        </div>
                      </div>

                      <span
                        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition ${
                          section.href ? "group-hover:border-slate-300 group-hover:bg-slate-900 group-hover:text-white" : ""
                        }`}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>

                    <p className="text-[0.95rem] leading-relaxed text-slate-600">{section.description}</p>

                    <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                        {section.href ? "Otevřít sekci" : "Doplníme v další verzi"}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          section.href
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-500"
                        }`}
                      >
                        {section.href ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                        {section.href ? "Aktivní" : "Brzy"}
                      </span>
                    </div>
                  </div>
                </>
              );

              if (section.href) {
                return (
                  <Link
                    key={section.key}
                    href={section.href}
                    className={cardClassName}
                  >
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
              <div className="md:col-span-2 rounded-[24px] border border-slate-200 bg-white px-6 py-10 text-center">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
                  <FileStack className="h-5 w-5" />
                </span>
                <h2 className="mt-4 text-xl font-semibold text-slate-900">Pro tento výraz nic nemáme</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Zkus jiné klíčové slovo nebo otevři některou z hlavních sekcí dokumentů.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
