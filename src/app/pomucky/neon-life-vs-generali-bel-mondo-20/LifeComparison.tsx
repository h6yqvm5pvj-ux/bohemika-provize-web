"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BookOpen, Check, CircleHelp, Download, FileCheck2, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { BENCHMARKS, COMPARISON_TITLE, COUNTERWEIGHTS, REVIEW_DATE, SCOPE, SECTIONS, SOURCES, STATUS_LABELS, TOPICS, evidenceHref, evidenceLabel, formatMoney, progression, topicMatches, type Evidence, type ReviewStatus, type SectionId } from "./comparisonData";
import styles from "./comparison.module.css";

function References({ evidence }: { evidence: readonly Evidence[] }) {
  return <div className={styles.references}>{evidence.map((source) => <a key={`${source.insurer}-${source.pdfPage}-${source.reference}`} href={evidenceHref(source)} target="_blank" rel="noopener noreferrer">{evidenceLabel(source)}<ArrowUpRight size={12} aria-hidden="true" /></a>)}</div>;
}
const topicCount = (count: number) => `${count} ${count === 1 ? "téma" : count >= 2 && count <= 4 ? "témata" : "témat"}`;

function ProgressionModel({ insuredSum, setInsuredSum, percent, setPercent }: {
  insuredSum: string; setInsuredSum: (value: string) => void; percent: number; setPercent: (value: number) => void;
}) {
  let result: ReturnType<typeof progression> | undefined;
  try { result = progression(percent, Number(insuredSum)); } catch { /* Validation stays next to the input. */ }
  const points = Array.from({ length: 100 }, (_, index) => progression(index + 1, 1_000_000));
  const path = (insurer: "cppPercent" | "generaliPercent") => points.map((point, index) => `${index === 0 ? "M" : "L"}${52 + index * 4.55},${235 - point[insurer] * .2}`).join(" ");
  return <section className={styles.model} aria-labelledby="progression-heading">
    <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>U01 · Stejná částka, stejné procento</p><h2 id="progression-heading">Jak se liší progrese?</h2></div><span className={styles.tag}>Obě až 1 000 %</span></div>
    <div className={styles.modelGrid}>
      <div>
        <label className={styles.inputLabel} htmlFor="insured-sum">Základní pojistná částka (Kč)</label>
        <input id="insured-sum" className={styles.input} type="number" inputMode="numeric" min="1" max="10000000" step="1" value={insuredSum} onChange={(event) => setInsuredSum(event.target.value)} aria-invalid={!result} aria-describedby={!result ? "sum-error" : undefined} />
        {!result && <p id="sum-error" className={styles.error} role="alert">Zadej celou částku od 1 do 10 000 000 Kč.</p>}
        <label className={styles.inputLabel} htmlFor="consequence-percent">Ohodnocení trvalých následků <strong>{percent} %</strong></label>
        <input id="consequence-percent" className={styles.range} type="range" min="1" max="100" step="1" value={percent} onChange={(event) => setPercent(Number(event.target.value))} />
        <div className={styles.benchmarks}>{BENCHMARKS.map((value) => <button type="button" key={value} onClick={() => setPercent(value)} aria-pressed={percent === value}>{value} %</button>)}</div>
        <div className={styles.results} aria-live="polite">
          <div><span>ČPP NEON Life</span><strong>{result ? formatMoney(result.cpp) : "—"}</strong><small>{result?.cppPercent ?? "—"} % základní částky</small></div>
          <div><span>Generali Bel Mondo 20</span><strong>{result ? formatMoney(result.generali) : "—"}</strong><small>{result?.generaliPercent ?? "—"} % základní částky</small></div>
        </div>
        {result && <p className={styles.difference}>Rozdíl v tomto modelu <strong>{formatMoney(result.difference)}</strong></p>}
      </div>
      <div className={styles.chart}>
        <svg viewBox="0 0 540 276" role="img" aria-labelledby="progression-chart-title progression-chart-description">
          <title id="progression-chart-title">Plnění v procentech základní pojistné částky</title>
          <desc id="progression-chart-description">Při 50 procentech následků je plnění ČPP 250 procent a Generali 145 procent. Při 100 procentech mají obě 1 000 procent. Přesné vybrané hodnoty jsou uvedené v tabulce pod grafem.</desc>
          {[0,250,500,750,1000].map((value) => <g key={value}><line x1="52" x2="512" y1={235 - value * .2} y2={235 - value * .2} stroke="#e7e1ed" /><text x="43" y={239 - value * .2} textAnchor="end">{value} %</text></g>)}
          {[10,30,50,70,90,100].map((value) => <text key={value} x={52 + (value - 1) * 4.55} y="257" textAnchor="middle">{value} %</text>)}
          <path d={path("cppPercent")} stroke="#77508d" strokeWidth="3" fill="none" /><path d={path("generaliPercent")} stroke="#c87658" strokeWidth="3" fill="none" />
          <line x1={52 + (percent - 1) * 4.55} x2={52 + (percent - 1) * 4.55} y1="35" y2="235" stroke="#bdb1c8" strokeDasharray="4 4" />
          <text x="282" y="274" textAnchor="middle">Ohodnocení následků</text>
        </svg>
        <div className={styles.legend}><span>ČPP NEON Life</span><span>Generali Bel Mondo 20</span></div>
      </div>
    </div>
    <div className={styles.tableScroll}><table className={styles.benchmarkTable}><caption>Plnění v % základní částky, bez bonusů</caption><thead><tr><th scope="col">Následky</th><th scope="col">ČPP</th><th scope="col">Generali</th></tr></thead><tbody>{BENCHMARKS.map((value) => { const row = progression(value, 1_000_000); return <tr key={value}><th scope="row">{value} %</th><td>{row.cppPercent} %</td><td>{row.generaliPercent} %</td></tr>; })}</tbody></table></div>
    <p className={styles.modelNote}>Konkrétní úraz mohou oceňovací tabulky hodnotit odlišně. Model porovnává průběh progrese při stejném procentu následků a základní částce, bez dalších bonusů.</p>
    <References evidence={TOPICS.find((topic) => topic.id === "U01")!.evidence} />
  </section>;
}

export function LifeComparison() {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<SectionId | "all">("all");
  const [status, setStatus] = useState<ReviewStatus | "all">("all");
  const [selected, setSelected] = useState(() => new Set(TOPICS.map((topic) => topic.id)));
  const [insuredSum, setInsuredSum] = useState("1000000");
  const [percent, setPercent] = useState(50);
  const [busy, setBusy] = useState(false);
  const downloading = useRef(false);
  const [message, setMessage] = useState("");
  const visible = useMemo(() => TOPICS.filter((topic) => (section === "all" || topic.section === section) && (status === "all" || topic.status === status) && topicMatches(topic, query)), [query, section, status]);
  const modelValid = Number.isSafeInteger(Number(insuredSum)) && Number(insuredSum) > 0 && Number(insuredSum) <= 10_000_000;
  async function download() {
    if (downloading.current || !selected.size || !modelValid) return;
    downloading.current = true; setBusy(true); setMessage("");
    try {
      const { downloadComparison } = await import("./downloadComparison");
      await downloadComparison({ selectedIds: [...selected], insuredSum: Number(insuredSum), percent });
      setMessage("PDF je připravené ke stažení.");
    } catch (error) {
      // Known errors contain only user-facing text. Never render arbitrary API errors.
      const safeMessages = ["Pro PDF s vizitkou se přihlas.", "Přihlášení se během přípravy změnilo. Spusť stažení znovu.", "Vizitku se nepodařilo načíst. Zkontroluj svůj profil a zkus to znovu."];
      setMessage(error instanceof Error && safeMessages.includes(error.message) ? error.message : "PDF se nepodařilo připravit. Zkus stažení znovu.");
    } finally { downloading.current = false; setBusy(false); }
  }
  function toggle(id: string) { setSelected((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  return <div className={styles.page}>
    <Link href="/pomucky/dokumenty/zivotni-pojisteni" className={styles.back}><ArrowLeft size={14} aria-hidden="true" />Dokumenty životního pojištění</Link>
    <header className={styles.hero}>
      <div className={styles.heroCopy}><p className={styles.eyebrow}><FileCheck2 size={15} aria-hidden="true" />Pomůcka pro poradce · podmínky 2026</p><h1>NEON Life <span>vs.</span><br />Bel Mondo 20<span>.</span></h1><p>{SCOPE}</p><div className={styles.heroTags}><span>49 témat</span><span>8 oblastí</span><span>PDF s vizitkou</span></div></div>
      <div className={styles.productCards}>
        <div><Image src="/icons/cpp.png" alt="ČPP" width={84} height={46} className={styles.logo} /><strong>NEON Life</strong><span>DPP 0426 · brožura 16.1</span><small>Účinnost 1. 4. 2026</small></div>
        <span className={styles.versus} aria-hidden="true">vs.</span>
        <div><Image src="/icons/generali.png" alt="Generali Česká pojišťovna" width={100} height={46} className={styles.logo} /><strong>Bel Mondo 20</strong><span>Riziková varianta</span><small>02/2024 v03</small></div>
      </div>
    </header>
    <div className={styles.context}><ShieldCheck size={21} aria-hidden="true" /><p>Kontrola zdrojů <strong>{REVIEW_DATE}</strong>. Přehled vychází z dodaného podkladu a uvedených verzí podmínek. U každého tématu najdeš jeho omezení; výklad P02 zůstává k potvrzení.</p></div>
    <ProgressionModel insuredSum={insuredSum} setInsuredSum={setInsuredSum} percent={percent} setPercent={setPercent} />
    <section className={styles.browser} aria-labelledby="topics-heading">
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Rozdíly, které mohou rozhodovat</p><h2 id="topics-heading">Porovnej konkrétní téma</h2></div><span role="status" className={styles.tag}>{visible.length} z {TOPICS.length} témat</span></div>
      <div className={styles.searchRow}><div className={styles.search}><Search size={17} aria-hidden="true" /><label className={styles.srOnly} htmlFor="topic-search">Hledat ve srovnání</label><input id="topic-search" type="search" placeholder="Invalidita, IVF, rakovina, S01…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><label className={styles.statusFilter}><SlidersHorizontal size={15} aria-hidden="true" /><span className={styles.srOnly}>Stav ověření</span><select value={status} onChange={(event) => setStatus(event.target.value as ReviewStatus | "all")}><option value="all">Všechny stavy</option>{Object.entries(STATUS_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label></div>
      <nav className={styles.filters} aria-label="Oblast srovnání"><button type="button" aria-pressed={section === "all"} onClick={() => setSection("all")}>Vše</button>{SECTIONS.map((area) => <button type="button" key={area.id} aria-pressed={section === area.id} onClick={() => setSection(area.id)}>{area.title}</button>)}</nav>
      <div className={styles.exportBar}><div><strong>{topicCount(selected.size)} v PDF</strong><small>PDF vždy zahrnuje podmínky, zdroje a všech 6 protivah. Hledání výběr nemění.</small></div><div className={styles.exportActions}><button type="button" className={styles.textButton} onClick={() => setSelected(new Set(TOPICS.map((topic) => topic.id)))}>Vybrat vše</button><button type="button" className={styles.textButton} onClick={() => setSelected(new Set(visible.map((topic) => topic.id)))}>Pouze zobrazená</button><button type="button" className={styles.textButton} onClick={() => setSelected(new Set())}>Zrušit výběr</button><button type="button" className={styles.download} disabled={busy || !selected.size || !modelValid} onClick={download}><Download size={16} aria-hidden="true" />{busy ? "Připravuji PDF…" : "Stáhnout PDF"}</button></div></div>
      {message && <p className={styles.exportMessage} role="status">{message}</p>}
      {!modelValid && <p className={styles.error}>Pro export oprav základní pojistnou částku v modelu progrese.</p>}
      <div className={styles.columnHeading} aria-hidden="true"><span>Téma / výběr do PDF</span><span>ČPP NEON Life</span><span>Generali Bel Mondo 20</span></div>
      <div className={styles.topics}>{visible.map((topic) => <article className={styles.topic} key={topic.id} id={`topic-${topic.id}`}>
        <div className={styles.topicGrid}>
          <div className={styles.topicLabel}><label><input type="checkbox" checked={selected.has(topic.id)} onChange={() => toggle(topic.id)} aria-label={`Zahrnout ${topic.id}: ${topic.title} do PDF`} /><span className={styles.id}>{topic.id}</span></label><h3>{topic.title}</h3><span className={styles.kind}>{topic.kind}</span><span className={`${styles.review} ${topic.status === "převzato_neověřeno" ? styles.pending : ""}`}>{topic.status === "převzato_neověřeno" ? <CircleHelp size={12} aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}{STATUS_LABELS[topic.status]}</span></div>
          <div className={styles.answer}><span className={styles.mobileInsurer}>ČPP NEON Life</span><p>{topic.cpp}</p></div>
          <div className={styles.answer}><span className={styles.mobileInsurer}>Generali Bel Mondo 20</span><p>{topic.generali}</p></div>
        </div>
        <div className={styles.conditions}><strong>Podmínky a omezení</strong><p>{topic.conditions}</p></div>
        <details className={styles.sourceDetails}><summary><BookOpen size={13} aria-hidden="true" />Zdroje v pojistných podmínkách</summary><References evidence={topic.evidence} /></details>
      </article>)}</div>
      {!visible.length && <div className={styles.empty}><Search size={25} aria-hidden="true" /><h3>Žádné téma neodpovídá filtrům.</h3><button type="button" onClick={() => { setQuery(""); setSection("all"); setStatus("all"); }}>Zobrazit všechna témata</button></div>}
    </section>
    <section className={styles.counterweights} aria-labelledby="counterweight-heading"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Součást každého PDF</p><h2 id="counterweight-heading">Co může výsledek změnit</h2></div><span className={styles.tag}>6 důležitých protivah</span></div><p className={styles.counterIntro}>Tyto body posuzuj společně s možnými výhodami ČPP. U konkrétního klienta mohou rozhodnout ve prospěch Generali nebo zachování stávající smlouvy.</p><div className={styles.counterGrid}>{COUNTERWEIGHTS.map((row) => <article key={row.id}><span className={styles.id}>{row.id}</span><h3>{row.title}</h3><p><strong>ČPP:</strong> {row.cpp}</p><p><strong>Generali:</strong> {row.generali}</p><p className={styles.counterCondition}>{row.conditions}</p>{row.evidence.length > 0 && <details className={styles.sourceDetails}><summary>Zdroje</summary><References evidence={row.evidence} /></details>}</article>)}</div></section>
    <footer className={styles.footer}><div><p className={styles.eyebrow}>Použité dokumenty</p><h2>Podmínky, ze kterých vycházíme</h2><p>{COMPARISON_TITLE} · kontrola {REVIEW_DATE}</p></div><div className={styles.sourceCards}>{Object.values(SOURCES).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"><BookOpen size={20} aria-hidden="true" /><div><strong>{source.label}</strong><span>{source.version}</span></div><ArrowUpRight size={18} aria-hidden="true" /></a>)}</div><p className={styles.footerNote}>Stav „Ověřeno“ potvrzuje uvedený parametr. Vhodnost pro klienta vždy závisí na jeho potřebách, zdravotním přijetí a konkrétní smlouvě. PDF přebírá vizitku z tvého profilu; QR odkaz přidává při zapnuté online vizitce.</p></footer>
  </div>;
}
