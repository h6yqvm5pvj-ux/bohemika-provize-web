"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Activity, Baby, Check, ChevronDown, ChevronsDownUp, ChevronsUpDown, CircleMinus, HeartPulse, Info, Layers3, Search, ShieldCheck, SlidersHorizontal, Stethoscope, Umbrella, X } from "lucide-react";
import { institutionLogoImageClass } from "@/app/lib/institutionLogoDisplay";
import type { ComparisonRow } from "./comparisonData";
import { ComparisonDocuments } from "./ComparisonDocuments";
import { ComparisonExport } from "./ComparisonExport";
import styles from "./comparison.module.css";

const GROUPS = [
  { id: "all", label: "Všechna témata", icon: Layers3 },
  { id: "accident", label: "Úraz a následky", icon: Activity },
  { id: "disability", label: "Invalidita a péče", icon: ShieldCheck },
  { id: "illness", label: "Závažná onemocnění", icon: HeartPulse },
  { id: "income", label: "Pracovní neschopnost", icon: Stethoscope },
  { id: "family", label: "Rodina a děti", icon: Baby },
  { id: "general", label: "Obecné podmínky", icon: SlidersHorizontal },
];

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-–—]/g, "").toLocaleLowerCase("cs");
}

function ProductLabel({ product }: { product: "neon" | "metlife" }) {
  return <span className={styles.productLabel} data-product={product}><span aria-hidden="true" />{product === "neon" ? "ČPP Životní pojištění NEON Life" : "MetLife · OneGuard"}</span>;
}

function Summary({ summary, product }: { summary: ComparisonRow["neonSummary"]; product: "neon" | "metlife" }) {
  const StatusIcon = summary.tone === "positive" ? Check : summary.tone === "info" ? Info : CircleMinus;
  return <span className={styles.summaryValue}>
    <span className={styles.mobileProduct}><ProductLabel product={product} /></span>
    <span className={styles.summaryStatus} data-tone={summary.tone}>
      <StatusIcon size={12} aria-hidden="true" />
      {summary.status || "Není v nabídce"}
    </span>
    <span className={styles.summaryTitle}>{summary.title}</span>
  </span>;
}

function ProductCard({ product }: { product: "neon" | "metlife" }) {
  const isNeon = product === "neon";
  return <section className={styles.productCard} data-product={product} aria-label={isNeon ? "ČPP Životní pojištění NEON Life" : "MetLife OneGuard"}>
    <span className={styles.productLogo}><Image src={isNeon ? "/icons/cpp.png" : "/icons/metlife.png"} alt={isNeon ? "ČPP" : "MetLife"} fill sizes="82px" className={institutionLogoImageClass(isNeon ? "cpp" : "metlife")} /></span>
    <div className={styles.productIdentity}><span>{isNeon ? "Česká podnikatelská pojišťovna" : "MetLife"}</span><h2>{isNeon ? "NEON Life" : "OneGuard"}</h2><p>Pojistné podmínky {isNeon ? "04/2026" : "09/2024"}</p></div>
  </section>;
}

export function LifeInsuranceComparison({ rows }: { rows: ComparisonRow[] }) {
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(rows.slice(0, 1).map(row => row.id)));
  const visibleRows = useMemo(() => {
    const words = normalize(query).trim().split(/\s+/).filter(Boolean);
    return rows.filter(row => (group === "all" || row.group === group) && words.every(word => normalize(row.searchText).includes(word)));
  }, [rows, group, query]);
  const allExpanded = visibleRows.length > 0 && visibleRows.every(row => expanded.has(row.id));

  function toggleRow(id: string) {
    setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}><Umbrella size={14} aria-hidden="true" />Životní pojištění pod lupou</p>
          <h1>NEON Life <span>vs.</span> OneGuard</h1>
          <p className={styles.description}>Rozdíly v krytí, podmínkách a plnění. Přehledně vedle sebe.</p>
          <div className={styles.heroMeta}><span><strong>{rows.length}</strong> srovnávaných témat</span><span><strong>2</strong> pojistné produkty</span></div>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <div className={styles.artOrbit} />
          <div className={styles.artShieldBack}><ShieldCheck strokeWidth={1.25} /></div>
          <div className={styles.artShieldFront}><HeartPulse strokeWidth={1.35} /></div>
          <span className={styles.artCheck}><Check size={17} strokeWidth={2.5} /></span>
        </div>
      </header>

      <div className={styles.productsHeading}><p>Porovnávané produkty</p><div className={styles.documentActions}><ComparisonDocuments /><ComparisonExport rows={rows} visibleRows={visibleRows} filterLabel={[GROUPS.find(item => item.id === group)?.label, query.trim() ? `Hledání: ${query.trim().slice(0, 120)}` : ""].filter(Boolean).join(" · ")} /></div></div>
      <div className={styles.productCards}><ProductCard product="neon" /><span className={styles.versus} aria-hidden="true">vs.</span><ProductCard product="metlife" /></div>

      <section className={styles.explorer} aria-label="Porovnání pojistných podmínek">
        <div className={styles.controls}>
          <div className={styles.controlHeading}><h2>Co vás zajímá?</h2><span>Vyberte oblast nebo vyhledejte konkrétní téma.</span></div>
          <div className={styles.search}><Search size={17} aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Např. invalidita, čekací doba…" aria-label="Hledat ve srovnání" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Vymazat hledání"><X size={15} aria-hidden="true" /></button>}</div>
        </div>
        <div className={styles.filters} role="group" aria-label="Oblast pojištění">
          {GROUPS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={group === id} onClick={() => setGroup(id)}><Icon size={14} aria-hidden="true" />{label}<span>{id === "all" ? rows.length : rows.filter(row => row.group === id).length}</span></button>)}
        </div>

        <div className={styles.resultToolbar}>
          <p role="status">Zobrazeno <strong>{visibleRows.length}</strong> z {rows.length} témat</p>
          {visibleRows.length > 0 && <button type="button" onClick={() => setExpanded(current => {
            const next = new Set(current); visibleRows.forEach(row => { if (allExpanded) next.delete(row.id); else next.add(row.id); }); return next;
          })}>{allExpanded ? <ChevronsDownUp size={15} aria-hidden="true" /> : <ChevronsUpDown size={15} aria-hidden="true" />}{allExpanded ? "Sbalit vše" : "Rozbalit vše"}</button>}
        </div>

        {visibleRows.length > 0 ? <>
          <div className={styles.columnHeader} aria-hidden="true"><span>Oblast a téma</span><ProductLabel product="neon" /><ProductLabel product="metlife" /></div>
          <div className={styles.rows}>
            {visibleRows.map(row => {
              const isExpanded = expanded.has(row.id);
              const category = GROUPS.find(group => group.id === row.group)!;
              const Icon = category.icon;
              return <section key={row.id} id={row.id} className={styles.row} data-expanded={isExpanded} aria-labelledby={`${row.id}-title`}>
                <h2 className={styles.rowHeading}>
                  <button type="button" className={styles.rowToggle} onClick={() => toggleRow(row.id)} aria-expanded={isExpanded} aria-controls={`${row.id}-detail`} aria-label={`${isExpanded ? "Sbalit" : "Rozbalit"}: ${row.title}`}>
                    <span className={styles.rowTopic}><span className={styles.topicIcon}><Icon size={18} aria-hidden="true" /></span><span><span className={styles.categoryLabel}>{category.label}</span><span id={`${row.id}-title`} className={styles.topicTitle}>{row.title}</span></span></span>
                    <Summary summary={row.neonSummary} product="neon" /><Summary summary={row.oneGuardSummary} product="metlife" />
                    <ChevronDown className={styles.chevron} size={17} aria-hidden="true" />
                  </button>
                </h2>
                <div id={`${row.id}-detail`} className={styles.rowDetail} hidden={!isExpanded}>
                  <div className={styles.topic}>{row.topic}</div>
                  <div className={styles.productContent} data-product="neon"><div className={styles.detailProduct}><ProductLabel product="neon" /></div>{row.neonLife}</div>
                  <div className={styles.productContent} data-product="metlife"><div className={styles.detailProduct}><ProductLabel product="metlife" /></div>{row.oneGuard}</div>
                </div>
              </section>;
            })}
          </div>
        </> : <div className={styles.empty}><Search size={29} aria-hidden="true" /><h3>Takové téma jsme nenašli</h3><p>Zkuste jiný výraz nebo zobrazte všechny oblasti.</p><button type="button" onClick={() => { setQuery(""); setGroup("all"); }}>Zobrazit všechna témata</button></div>}
      </section>
    </div>
  );
}
