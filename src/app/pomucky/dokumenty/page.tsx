// src/app/pomucky/dokumenty/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Clock3,
  FileStack,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { DocumentsArtwork, DocumentsSearch } from "./DocumentsUi";
import { DocumentCategoryIllustration, type DocumentCategoryKey } from "./DocumentCategoryIllustration";
import styles from "./documents.module.css";

type DocumentSection = {
  key: DocumentCategoryKey;
  title: string;
  description: string;
  items: string[];
  href?: string;
};

const DOCUMENT_SECTIONS: readonly DocumentSection[] = [
  {
    key: "zivotni",
    title: "Životní pojištění",
    description: "Dokumenty a podklady pro životní pojištění.",
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
      <div className={`${styles.page} ${styles.landing}`}>
        <div className={styles.landingIntro}>
          <header>
            <p className={styles.eyebrow}><FileStack size={14} aria-hidden="true" />Knihovna · Pomůcky</p>
            <h1 className={styles.landingTitle}>Dokumenty<span>.</span></h1>
            <p className={styles.landingDescription}>
              Všechny podklady pro tvoji práci na jednom místě. Vyber oblast a najdi dokument, který právě potřebuješ.
            </p>
          </header>
          <div className={styles.landingSearch}>
            <DocumentsSearch id="documents-search" label="Hledat v dokumentech" placeholder="Hledat oblast nebo klíčové slovo…" value={search} onChange={setSearch} />
            <span role="status">{filteredSections.length} z {DOCUMENT_SECTIONS.length} oblastí</span>
          </div>
          <div className={styles.introArtwork}><DocumentsArtwork /></div>
          <p className={styles.introNote}>Oblast <ArrowUpRight size={12} aria-hidden="true" /> Pojišťovna <ArrowUpRight size={12} aria-hidden="true" /> Dokument</p>
        </div>

        <section className={styles.landingCategories} aria-label="Oblasti dokumentů">
          <div className={styles.landingListHeading}>
            <h2>Co právě řešíš?</h2>
            <span>Vyber oblast</span>
          </div>
          <div className={styles.categoryGrid}>
            {filteredSections.map(section => {
              const content = <>
                <div className={styles.categoryIllustration}><DocumentCategoryIllustration category={section.key} /></div>
                <div className={styles.categoryCopy}>
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                  <div className={styles.categoryRowFooter}>
                    <span>{section.href ? "Vybrat pojišťovnu" : "Sekci připravujeme"}</span>
                    <span className={styles.categoryBadge}>{section.href ? "Dostupné" : "Připravujeme"}</span>
                  </div>
                </div>
                <span className={styles.rowArrow}>{section.href ? <ArrowUpRight size={17} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />}</span>
              </>;
              return section.href ? (
                <Link key={section.key} href={section.href} className={styles.categoryCard} data-category={section.key}>{content}</Link>
              ) : (
                <article key={section.key} className={styles.categoryCard} data-category={section.key} data-unavailable="true">{content}</article>
              );
            })}
          </div>
          {filteredSections.length === 0 && <div className={styles.emptyState}>
            <FileStack size={28} aria-hidden="true" />
            <h3>Pro tento výraz nic nemáme.</h3>
            <p>Zkus jiné klíčové slovo nebo se vrať ke všem oblastem.</p>
            <button type="button" className={styles.secondaryButton} onClick={() => setSearch("")}>Zobrazit všechny oblasti</button>
          </div>}
        </section>
      </div>
    </AppLayout>
  );
}
