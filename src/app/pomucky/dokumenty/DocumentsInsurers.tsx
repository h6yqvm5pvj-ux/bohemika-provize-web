"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, FileStack, FolderOpen } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import type { ToolDocumentInsurer } from "@/app/lib/toolDocuments";
import { DocumentsArtwork, DocumentsHeader, DocumentsLogo, DocumentsSearch } from "./DocumentsUi";
import styles from "./documents.module.css";

export function DocumentsInsurers({ title, description, category, insurers, layout = "grid" }: {
  title: string; description: string; category: string; insurers: readonly ToolDocumentInsurer[];
  layout?: "grid" | "landing";
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const query = normalize(search);
    return insurers.filter(insurer => normalize(`${insurer.title} ${insurer.description}`).includes(query));
  }, [search, insurers]);

  const emptyState = filtered.length === 0 && <div className={styles.emptyState}><FolderOpen size={28} aria-hidden="true" /><h2>Pojišťovnu jsme nenašli.</h2><p>Zkus její název nebo vymaž hledání.</p><button type="button" className={styles.secondaryButton} onClick={() => setSearch("")}>Zobrazit všechny pojišťovny</button></div>;

  if (layout === "landing") {
    return (
      <AppLayout active="tools">
        <div className={`${styles.page} ${styles.landing}`}>
          <div className={styles.landingIntro}>
            <Link href="/pomucky/dokumenty" className={styles.backLink}><ArrowLeft size={14} aria-hidden="true" />Zpět na dokumenty</Link>
            <header>
              <p className={styles.eyebrow}><FileStack size={14} aria-hidden="true" />Dokumenty · Výběr pojišťovny</p>
              <h1 className={styles.landingTitle}>{title}<span>.</span></h1>
              <p className={styles.landingDescription}>{description}</p>
            </header>
            <div className={styles.landingSearch}>
              <DocumentsSearch id="documents-insurer-search" label="Hledat pojišťovnu" placeholder="Najdi pojišťovnu…" value={search} onChange={setSearch} />
              <span role="status">{filtered.length} z {insurers.length} pojišťoven</span>
            </div>
            <div className={styles.introArtwork}><DocumentsArtwork /></div>
            <p className={styles.introNote}>Oblast <ArrowUpRight size={12} aria-hidden="true" /> Pojišťovna <ArrowUpRight size={12} aria-hidden="true" /> Dokument</p>
          </div>

          <section className={styles.landingCategories} aria-label="Pojišťovny">
            <div className={styles.landingListHeading}>
              <h2>Vyber pojišťovnu</h2>
              <span>Otevři dokumenty</span>
            </div>
            <div className={styles.categoryGrid}>
              {filtered.map((insurer, index) => (
                <Link key={insurer.key} href={`/pomucky/dokumenty/${category}/${insurer.slug}`} className={styles.categoryCard} aria-label={`Dokumenty ${insurer.title}`}>
                  <div className={`${styles.categoryIllustration} ${styles.insurerRowLogo}`}><DocumentsLogo src={insurer.logo} label={insurer.title} index={index} /></div>
                  <div className={styles.categoryCopy}>
                    <h3>{insurer.title}</h3>
                    <p>{insurer.description}</p>
                    <div className={styles.categoryRowFooter}><span>Otevřít dokumenty</span></div>
                  </div>
                  <span className={styles.rowArrow}><ArrowUpRight size={17} aria-hidden="true" /></span>
                </Link>
              ))}
            </div>
            {emptyState}
          </section>
        </div>
      </AppLayout>
    );
  }

  return <AppLayout active="tools"><div className={styles.page}>
    <DocumentsHeader title={title} description={description} kicker="Dokumenty · Výběr pojišťovny" backHref="/pomucky/dokumenty">
      <div className={styles.heroMeta}><span><FolderOpen size={14} aria-hidden="true" />{insurers.length} pojišťoven v této oblasti</span></div>
    </DocumentsHeader>
    <div className={styles.browserToolbar}><DocumentsSearch id="documents-insurer-search" label="Hledat pojišťovnu" placeholder="Najdi pojišťovnu…" value={search} onChange={setSearch} /><span role="status">{filtered.length} z {insurers.length} pojišťoven</span></div>
    <div className={styles.insurerGrid}>
      {filtered.map((insurer, index) => <Link key={insurer.key} href={`/pomucky/dokumenty/${category}/${insurer.slug}`} className={styles.insurerCard} aria-label={`Dokumenty ${insurer.title}`}>
        <div className={styles.insurerArtwork}><DocumentsLogo src={insurer.logo} label={insurer.title} index={index} /></div>
        <div className={styles.insurerFooter}><span><FolderOpen size={14} aria-hidden="true" />Otevřít dokumenty</span><ArrowRight size={16} aria-hidden="true" /></div>
      </Link>)}
    </div>
    {emptyState}
    <p className={styles.libraryNote}><FolderOpen size={15} aria-hidden="true" />Vyber pojišťovnu. V její knihovně najdeš dostupné soubory a interní podklady.</p>
  </div></AppLayout>;
}
