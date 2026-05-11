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
  dot: string;
  arrowHover: string;
};

const SECTION_VISUALS: Record<DocumentSectionKey, SectionVisual> = {
  zivotni: {
    border: "border-rose-200/80 hover:border-rose-300",
    accent: "from-rose-500 via-pink-500 to-fuchsia-500",
    iconWrap: "bg-rose-50 border-rose-200 group-hover:bg-rose-100 group-hover:border-rose-300",
    iconColor: "text-rose-700",
    chip: "text-rose-700",
    dot: "bg-rose-400",
    arrowHover: "group-hover:border-rose-300 group-hover:bg-rose-700 group-hover:text-white",
  },
  majetek: {
    border: "border-cyan-200/80 hover:border-cyan-300",
    accent: "from-cyan-400 via-sky-500 to-blue-500",
    iconWrap: "bg-cyan-50 border-cyan-200 group-hover:bg-cyan-100 group-hover:border-cyan-300",
    iconColor: "text-cyan-800",
    chip: "text-cyan-700",
    dot: "bg-cyan-500",
    arrowHover: "group-hover:border-cyan-300 group-hover:bg-cyan-700 group-hover:text-white",
  },
  auto: {
    border: "border-blue-200/80 hover:border-blue-300",
    accent: "from-blue-500 via-indigo-500 to-violet-500",
    iconWrap: "bg-blue-50 border-blue-200 group-hover:bg-blue-100 group-hover:border-blue-300",
    iconColor: "text-blue-700",
    chip: "text-blue-700",
    dot: "bg-blue-500",
    arrowHover: "group-hover:border-blue-300 group-hover:bg-blue-700 group-hover:text-white",
  },
  investice: {
    border: "border-amber-200/80 hover:border-amber-300",
    accent: "from-amber-400 via-orange-500 to-orange-600",
    iconWrap: "bg-amber-50 border-amber-200 group-hover:bg-amber-100 group-hover:border-amber-300",
    iconColor: "text-amber-700",
    chip: "text-amber-700",
    dot: "bg-amber-500",
    arrowHover: "group-hover:border-amber-300 group-hover:bg-amber-700 group-hover:text-white",
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
      <div className={`${documentsFont.className} relative w-full overflow-visible px-2 pb-10 pt-2 sm:px-3`}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className={styles.canvas}>
            <span className={`${styles.orb} ${styles.orbA}`} />
            <span className={`${styles.orb} ${styles.orbB}`} />
            <span className={`${styles.orb} ${styles.orbC}`} />
            <span className={styles.mesh} />
          </div>
          <div className={styles.grain} />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl space-y-5 px-1 sm:px-2 lg:px-3">
          <header
            className={`${styles.heroPanel} relative overflow-hidden rounded-[32px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.95)_0%,rgba(240,249,255,0.95)_48%,rgba(238,242,255,0.94)_100%)] px-5 py-6 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.14)] sm:px-8 sm:py-8`}
          >
            <div className="relative z-10 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">
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

          <section className="rounded-[30px] border border-white/70 bg-white/82 px-4 py-4 shadow-[0_20px_54px_rgba(15,23,42,0.11)] backdrop-blur-xl sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label htmlFor="documents-search" className="sr-only">
                Hledat v dokumentech
              </label>
              <div className="relative w-full sm:max-w-2xl">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="documents-search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Hledat název, klíčové slovo nebo workflow..."
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 placeholder:text-slate-500 sm:text-base"
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
                "group relative flex min-h-[272px] flex-col overflow-hidden rounded-[28px] border bg-white/92 p-5 shadow-[0_22px_60px_rgba(15,23,42,0.12)] backdrop-blur-sm transition-[transform,border-color,box-shadow] duration-200",
                visual.border,
                section.href ? "hover:-translate-y-1 hover:shadow-[0_30px_80px_rgba(15,23,42,0.16)]" : "opacity-95",
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
                        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition ${
                          section.href ? visual.arrowHover : ""
                        }`}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>

                    <p className="text-[0.95rem] leading-relaxed text-slate-600">{section.description}</p>

                    <ul className="space-y-2 text-sm text-slate-600">
                      {section.items.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${visual.dot}`} aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>

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
              <div className="md:col-span-2 rounded-[28px] border border-slate-200/90 bg-white/88 px-6 py-10 text-center shadow-[0_18px_48px_rgba(15,23,42,0.1)]">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
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
