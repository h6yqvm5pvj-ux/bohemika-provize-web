// src/app/pomucky/dokumenty/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowUpRight, CarFront, HeartPulse, Home, Landmark, Search, Sparkles } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../plan-produkce/SplitTitle";
import styles from "../pomuckyWallArt.module.css";

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

type SectionVisual = {
  border: string;
  accent: string;
  iconWrap: string;
  iconColor: string;
  chip: string;
  arrowHover: string;
};

const SECTION_VISUALS: Record<DocumentSectionKey, SectionVisual> = {
  zivotni: {
    border: "border-violet-100/90 hover:border-violet-300",
    accent: "from-violet-200 via-purple-300 to-indigo-200",
    iconWrap: "bg-violet-50 border-violet-100 group-hover:bg-violet-100 group-hover:border-violet-200",
    iconColor: "text-violet-700",
    chip: "text-violet-700",
    arrowHover: "group-hover:border-violet-300 group-hover:bg-violet-700 group-hover:text-white",
  },
  majetek: {
    border: "border-violet-100/90 hover:border-violet-300",
    accent: "from-violet-200 via-purple-300 to-indigo-200",
    iconWrap: "bg-violet-50 border-violet-100 group-hover:bg-violet-100 group-hover:border-violet-200",
    iconColor: "text-violet-700",
    chip: "text-violet-700",
    arrowHover: "group-hover:border-violet-300 group-hover:bg-violet-700 group-hover:text-white",
  },
  auto: {
    border: "border-violet-100/90 hover:border-violet-300",
    accent: "from-violet-200 via-purple-300 to-indigo-200",
    iconWrap: "bg-violet-50 border-violet-100 group-hover:bg-violet-100 group-hover:border-violet-200",
    iconColor: "text-violet-700",
    chip: "text-violet-700",
    arrowHover: "group-hover:border-violet-300 group-hover:bg-violet-700 group-hover:text-white",
  },
  investice: {
    border: "border-violet-100/90 hover:border-violet-300",
    accent: "from-violet-200 via-purple-300 to-indigo-200",
    iconWrap: "bg-violet-50 border-violet-100 group-hover:bg-violet-100 group-hover:border-violet-200",
    iconColor: "text-violet-700",
    chip: "text-violet-700",
    arrowHover: "group-hover:border-violet-300 group-hover:bg-violet-700 group-hover:text-white",
  },
};

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
      <div className={`${documentsFont.className} relative w-full overflow-visible bg-[linear-gradient(180deg,#fbfaff_0%,#ffffff_44%,#fbfaff_100%)] px-2 pb-10 pt-2 sm:px-3`}>
        <div className="relative z-10 mx-auto max-w-7xl space-y-5 px-1 sm:px-2 lg:px-3">
          <header
            className="relative overflow-hidden rounded-[32px] border border-violet-100/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(250,245,255,0.96)_54%,rgba(245,243,255,0.94)_100%)] px-5 py-6 text-slate-900 shadow-[0_24px_70px_rgba(76,29,149,0.10)] sm:px-8 sm:py-8"
          >
            <div className="relative z-10 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  Premium Dokument Hub
                </span>
                <Link
                  href="/pomucky"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Zpět na pomůcky
                </Link>
              </div>

              <SplitTitle text="Dokumenty" className="!text-4xl !text-slate-900 sm:!text-5xl" />

              <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Centrální místo pro interní dokumenty, metodiky a pracovní podklady. Rychle vyber sekci a otevři navazující workflow.
              </p>
            </div>
          </header>

          <section className="rounded-[30px] border border-violet-100/80 bg-white px-4 py-4 shadow-[0_18px_44px_rgba(76,29,149,0.08)] sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label htmlFor="documents-search" className="sr-only">
                Hledat v dokumentech
              </label>
              <div className="relative w-full sm:max-w-2xl">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" />
                <input
                  id="documents-search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Hledat název, klíčové slovo nebo workflow..."
                  className="h-12 w-full rounded-2xl border border-violet-100 bg-white px-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100 placeholder:text-slate-500 sm:text-base"
                />
              </div>

              <p className="text-xs font-medium text-slate-600 sm:text-sm">
                Nalezeno <span className="font-semibold text-slate-900">{filteredSections.length}</span> z{" "}
                <span className="font-semibold text-slate-900">{DOCUMENT_SECTIONS.length}</span> sekcí
              </p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            {filteredSections.map((section, index) => {
              const Icon = section.icon;
              const visual = SECTION_VISUALS[section.key];
              const cardClassName = [
                styles.toolCard,
                "group relative flex min-h-[218px] flex-col overflow-hidden rounded-[28px] border bg-white p-5 shadow-[0_18px_48px_rgba(76,29,149,0.08)] transition-[transform,border-color,box-shadow] duration-200",
                visual.border,
                section.href ? "hover:-translate-y-1 hover:shadow-[0_26px_64px_rgba(76,29,149,0.13)]" : "opacity-95",
              ].join(" ");

              const content = (
                <>
                  <span className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${visual.accent}`} aria-hidden="true" />
                  <div className="flex min-h-full flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition ${visual.iconWrap}`}
                        >
                          <Icon className={`h-5 w-5 ${visual.iconColor}`} />
                        </span>
                        <div className="min-w-0">
                          <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${visual.chip}`}>
                            {section.href ? "Workflow" : "Připravujeme"}
                          </p>
                          <h2 className="mt-1 text-[1.45rem] font-bold leading-tight tracking-[-0.015em] text-slate-950">
                            {section.title}
                          </h2>
                        </div>
                      </div>

                      <span
                        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-100 bg-white text-violet-500 transition ${
                          section.href ? visual.arrowHover : ""
                        }`}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>

                    <p className="text-[0.95rem] leading-relaxed text-slate-600">{section.description}</p>

                    <div className="mt-auto pt-1">
                      <span className={`text-xs font-semibold uppercase tracking-[0.16em] ${visual.chip}`}>
                        {section.href ? "Otevřít sekci" : "Doplníme v další verzi"}
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
                    style={{ animationDelay: `${Math.min(index * 55, 280)}ms` }}
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <article
                  key={section.key}
                  className={cardClassName}
                  style={{ animationDelay: `${Math.min(index * 55, 280)}ms` }}
                >
                  {content}
                </article>
              );
            })}
            {filteredSections.length === 0 ? (
              <div className="md:col-span-2 rounded-[28px] border border-violet-100 bg-white px-6 py-10 text-center shadow-[0_18px_48px_rgba(76,29,149,0.08)]">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-700">
                  <Sparkles className="h-5 w-5" />
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
