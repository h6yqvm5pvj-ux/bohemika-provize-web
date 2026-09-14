"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, CarFront, Check, ChevronDown, Copy, Heart, HelpCircle, House, Plus, Printer, RotateCcw, SlidersHorizontal, Sparkles, Target, Trash2, TrendingUp, UserRound, Users, X } from "lucide-react";
import { POSITION_LABELS, formatMoney } from "@/app/lib/formatters";
import type { Position } from "@/app/types/domain";
import { ProjectionChart, formatPeriod, type ChartMetric } from "./ProjectionChart";
import { ProjectionPrintReport } from "./ProjectionPrintReport";
import { PRODUCTS, calculateProjection, defaultSettings, emptyProduction, finiteNumber, goalProgress, projectionCsv, readDraft, type PlannerDraft, type ProductKey, type Production, type ProjectionSettings, type Storno } from "./projectionModel";
import styles from "./projection.module.css";

const PRODUCT_META = {
  life: { title: "Životní pojištění", short: "Život", hint: "Součet měsíčního pojistného", icon: Heart },
  auto: { title: "Pojištění vozidel", short: "Auto", hint: "Součet ročního pojistného", icon: CarFront },
  property: { title: "Pojištění majetku", short: "Majetek", hint: "Součet ročního pojistného", icon: House },
};
const POSITIONS = Object.keys(POSITION_LABELS) as Position[];
const formatDate = (date: Date) => date.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
const percent = (value: number) => new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(value);

function NumberField({ label, value, onChange, unit = "Kč", max = 10000000, min = 0, hint, icon }: {
  label: string; value: number; onChange: (value: number) => void; unit?: string; max?: number; min?: number; hint?: string; icon?: ReactNode;
}) {
  const id = useId();
  return <div className={styles.field}>
    <label htmlFor={id}>{icon}{label}</label>
    <div className={styles.numberWrap}><input id={id} type="number" inputMode="decimal" min={min} max={max} step="any" value={value || ""} placeholder="0" onChange={event => onChange(finiteNumber(event.target.value, max, min))} aria-describedby={hint ? `${id}-hint` : undefined} /><span>{unit}</span></div>
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </div>;
}

function PositionField({ value, onChange, manager = false, label = "Kariérní pozice" }: { value: Position; onChange: (value: Position) => void; manager?: boolean; label?: string }) {
  const id = useId();
  return <div className={styles.field}><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={event => onChange(event.target.value as Position)}>{POSITIONS.filter(position => !manager || position.startsWith("manazer")).map(position => <option key={position} value={position}>{POSITION_LABELS[position]}</option>)}</select></div>;
}

export function ProjectionPlanner({ storageKey, initialPosition = "poradce1" }: { storageKey: string; initialPosition?: Position }) {
  const [draft, setDraft] = useState<PlannerDraft>(() => {
    const defaults = defaultSettings(initialPosition);
    try { return readDraft(localStorage.getItem(storageKey), defaults); } catch { return { settings: defaults, baseline: null }; }
  });
  const { settings, baseline } = draft;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [metric, setMetric] = useState<ChartMetric>("annual");
  const [notice, setNotice] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);
  const helpRef = useRef<HTMLDialogElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const scenarioInputId = useId();
  const [scenarioName, setScenarioName] = useState("Výchozí plán");

  useEffect(() => {
    const save = window.setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, ...draft })); setStorageFailed(false); }
      catch { setStorageFailed(true); }
    }, 0);
    return () => window.clearTimeout(save);
  }, [draft, storageKey]);

  const update = (patch: Partial<ProjectionSettings>) => setDraft(previous => ({ ...previous, settings: { ...previous.settings, ...patch } }));
  const updateProduction = (key: ProductKey, value: number) => {
    const field = settings.mode === "team" ? "managerProduction" : "production";
    update({ [field]: { ...settings[field], [key]: value } });
  };
  const result = useMemo(() => calculateProjection(settings), [settings]);
  const comparison = useMemo(() => baseline ? calculateProjection({ ...baseline.settings, startMonth: settings.startMonth, horizon: settings.horizon }) : null, [baseline, settings.startMonth, settings.horizon]);
  const goal = useMemo(() => goalProgress(result, settings.target), [result, settings.target]);
  const selected = Math.min(selectedIndex, settings.horizon - 1);
  const year = result.years[selected];
  const lastYear = result.years.at(-1)!;
  const ownProduction = settings.mode === "team" ? settings.managerProduction : settings.production;
  const hasData = result.total > 0;
  const baselineDifference = comparison ? result.total - comparison.total : 0;
  const totalProduction: Production = { ...ownProduction };
  if (settings.mode === "team") settings.members.forEach(member => PRODUCTS.forEach(key => { totalProduction[key] += member.production[key]; }));
  const annualizedProduction = totalProduction.life * 12 + totalProduction.auto + totalProduction.property;

  const loadExample = () => {
    const production = { life: 5000, auto: 30000, property: 15000 };
    update(settings.mode === "team" ? { managerProduction: production, members: [{ id: crypto.randomUUID(), name: "Poradce 1", position: "poradce1", production: { life: 3000, auto: 20000, property: 10000 } }] } : { production });
    setNotice("Ukázková produkce je vyplněná. Uprav ji podle svého plánu.");
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([projectionCsv(result, comparison)], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = `projekce-vykonu-${settings.startMonth}-${settings.horizon}-let.csv`;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Měsíční přehled je připravený ke stažení v CSV.");
  };

  return <div className={styles.page}>
    <nav className={styles.breadcrumb} aria-label="Drobečková navigace"><Link href="/pomucky"><ArrowLeft size={14} />Pomůcky</Link><span>/</span><span>Projekce výkonu</span></nav>
    <header className={styles.header}>
      <div><div className={styles.eyebrow}><span />PROSTOR PRO TVŮJ RŮST</div><h1>Projekce výkonu<span>.</span></h1><p>Dnešní produkce. Jasnější představa o budoucím příjmu.</p></div>
      <div className={styles.headerActions}><button ref={helpButtonRef} className={styles.iconButton} type="button" aria-label="Jak projekce funguje" onClick={() => helpRef.current?.showModal()}><HelpCircle size={19} /></button><button className={styles.secondaryButton} type="button" onClick={exportCsv} disabled={!hasData}><ArrowDownToLine size={16} />Export CSV</button><button className={styles.primaryButton} type="button" onClick={() => window.print()} disabled={!hasData && !comparison} title="Vytisknout plán nebo uložit jako PDF. Zahrnuje měsíční detail vybraného roku."><Printer size={16} />Tisk / PDF</button></div>
    </header>

    <div className={styles.topbar}>
      <div className={styles.modeSwitch} aria-label="Typ projekce">{([{ value: "individual", label: "Moje produkce", icon: UserRound }, { value: "team", label: "Můj tým", icon: Users }] as const).map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-pressed={settings.mode === value} onClick={() => update({ mode: value })}><Icon size={17} />{label}</button>)}</div>
      <span className={styles.saveStatus}>{storageFailed ? <><HelpCircle size={14} />Uložení v prohlížeči není dostupné</> : <><Check size={14} />Plán se ukládá v tomto prohlížeči</>}</span>
    </div>

    <div className={styles.workspace}>
      <aside className={styles.sidebar} aria-label="Nastavení projekce">
        <section className={styles.panel}>
          <div className={styles.sectionHeading}><h2><span className={styles.step}>01</span>{settings.mode === "team" ? "Tvoje vlastní produkce" : "Tvoje měsíční produkce"}</h2><SlidersHorizontal size={16} /></div>
          <p className={styles.intro}>Kolik nového pojistného sjednáš každý měsíc? Stejný výkon opakujeme do dalších měsíců.</p>
          <PositionField value={settings.mode === "team" ? settings.managerPosition : settings.position} manager={settings.mode === "team"} onChange={value => update(settings.mode === "team" ? { managerPosition: value } : { position: value })} />
          <div className={styles.productionFields}>{PRODUCTS.map(key => {
            const meta = PRODUCT_META[key]; const Icon = meta.icon;
            return <div className={styles.productField} data-product={key} key={key}><NumberField label={meta.title} hint={meta.hint} value={ownProduction[key]} onChange={value => updateProduction(key, value)} icon={<Icon size={16} />} /></div>;
          })}</div>
          <div className={styles.productionTotal}><span>Nová roční báze za měsíc{settings.mode === "team" ? " · celý tým" : ""}</span><strong>{formatMoney(annualizedProduction)}</strong></div>
          {!annualizedProduction && <button type="button" className={styles.textButton} onClick={loadExample}><Sparkles size={14} />Vyzkoušet na příkladu<ArrowRight size={14} /></button>}
        </section>

        {settings.mode === "team" && <section className={styles.panel}>
          <div className={styles.sectionHeading}><h2>Poradci v týmu <span className={styles.count}>{settings.members.length}/20</span></h2><Users size={16} /></div>
          <p className={styles.intro}>Do tvého příjmu přičteme kladný rozdíl mezi tvojí provizí a provizí poradce.</p>
          <div className={styles.members}>{settings.members.map((member, index) => <details className={styles.member} key={member.id} open>
            <summary><span><span className={styles.avatar}>{index + 1}</span>{member.name || `Poradce ${index + 1}`}</span><ChevronDown size={15} /></summary>
            <div className={styles.memberBody}>
              <label className={styles.field}><span>Jméno / označení</span><input type="text" maxLength={60} value={member.name} placeholder={`Poradce ${index + 1}`} onChange={event => update({ members: settings.members.map(item => item.id === member.id ? { ...item, name: event.target.value } : item) })} /></label>
              <PositionField label={`Pozice poradce ${index + 1}`} value={member.position} onChange={position => update({ members: settings.members.map(item => item.id === member.id ? { ...item, position } : item) })} />
              {PRODUCTS.map(key => <NumberField key={key} label={`${PRODUCT_META[key].short} · ${key === "life" ? "měsíční" : "roční"} pojistné`} value={member.production[key]} onChange={value => update({ members: settings.members.map(item => item.id === member.id ? { ...item, production: { ...item.production, [key]: value } } : item) })} />)}
              <div className={styles.memberActions}><button type="button" className={styles.textButton} disabled={settings.members.length >= 20} onClick={() => update({ members: [...settings.members, { ...member, id: crypto.randomUUID(), name: `${member.name || "Poradce"} (kopie)`.slice(0, 60) }] })}><Copy size={13} />Duplikovat</button><button type="button" className={styles.textButton} onClick={() => update({ members: settings.members.filter(item => item.id !== member.id) })}><Trash2 size={13} />Odebrat</button></div>
            </div>
          </details>)}</div>
          <button className={styles.addButton} type="button" disabled={settings.members.length >= 20} onClick={() => update({ members: [...settings.members, { id: crypto.randomUUID(), name: "", position: "poradce1", production: emptyProduction() }] })}><Plus size={16} />Přidat poradce</button>
        </section>}

        <section className={styles.panel}>
          <div className={styles.sectionHeading}><h2><span className={styles.step}>02</span>Předpoklady růstu</h2><TrendingUp size={17} /></div>
          <div className={styles.growthHeading}><label htmlFor="projection-growth">Roční změna nové produkce</label><strong>{settings.growth > 0 ? "+" : ""}{settings.growth} %</strong></div>
          <input id="projection-growth" className={styles.range} type="range" min={-20} max={30} step={1} value={settings.growth} onChange={event => update({ growth: Number(event.target.value) })} />
          <div className={styles.rangeLabels}><span>−20 %</span><button type="button" onClick={() => update({ growth: 0 })}>Stejný výkon</button><span>+30 %</span></div>
          <details className={styles.assumptions}><summary>Stornovost a výplata provizí<ChevronDown size={15} /></summary><div className={styles.assumptionsBody}>
            <p className={styles.intro}>Roční úbytek budoucích výplat. V týmu platí pro všechny poradce.</p>
            {PRODUCTS.map(key => <fieldset className={styles.storno} key={key}><legend>{PRODUCT_META[key].title}</legend><div>{([0, 3, 5, 10] as Storno[]).map(value => <button type="button" key={value} aria-pressed={settings.storno[key] === value} onClick={() => update({ storno: { ...settings.storno, [key]: value } })}>{value} %</button>)}</div></fieldset>)}
            <label className={styles.field}><span>Výplata životního pojištění</span><select value={settings.commissionMode} onChange={event => update({ commissionMode: event.target.value as ProjectionSettings["commissionMode"] })}><option value="accelerated">Zrychlená</option><option value="standard">Standardní</option></select></label>
            <label className={styles.toggle}><input type="checkbox" checked={settings.care} onChange={event => update({ care: event.target.checked })} /><span>Modelovat růst pojistného při péči</span></label>
            <p className={styles.finePrint}>Volitelný model: život +2 % ročně, auto +5 % ročně, majetek +20 % po 3 letech a poté +3 % ročně. Navyšuje budoucí provize ze sjednané produkce.</p>
          </div></details>
          <div className={styles.activeAssumptions}>{settings.growth === 0 ? "Stejná nová produkce" : `${settings.growth > 0 ? "+" : ""}${settings.growth} % produkce ročně`}<span>·</span>{settings.care ? "S růstem pojistného" : "Bez růstu pojistného"}<span>·</span>Storno Ž / A / M: {PRODUCTS.map(key => `${settings.storno[key]} %`).join(" / ")}</div>
        </section>

        <section className={`${styles.panel} ${styles.scenarioPanel}`}>
          <div className={styles.sectionHeading}><h2><Copy size={16} />Porovnej dvě možnosti</h2></div>
          <p className={styles.intro}>Ulož si výchozí plán a zkus změnit produkci, pozici nebo velikost týmu.</p>
          {!baseline ? <><label className={styles.srOnly} htmlFor={scenarioInputId}>Název scénáře</label><input id={scenarioInputId} className={styles.scenarioName} value={scenarioName} maxLength={60} onChange={event => setScenarioName(event.target.value)} /><button type="button" className={styles.secondaryButton} disabled={!hasData} onClick={() => { setDraft(previous => ({ ...previous, baseline: { name: scenarioName.trim() || "Výchozí plán", settings: structuredClone(previous.settings) } })); setNotice("Scénář uložen. Teď uprav vstupy a porovnej rozdíl v grafu."); }}><Plus size={15} />Uložit pro srovnání</button></> : <div className={styles.savedScenario}><div><span className={styles.comparisonDot} /><strong>{baseline.name}</strong><button type="button" className={styles.iconButton} aria-label="Zrušit porovnání" onClick={() => setDraft(previous => ({ ...previous, baseline: null }))}><X size={15} /></button></div><span>{baseline.settings.mode === "team" ? "Tým" : "Vlastní produkce"} · {POSITIONS.includes(baseline.settings.position) ? POSITION_LABELS[baseline.settings.mode === "team" ? baseline.settings.managerPosition : baseline.settings.position] : ""}</span><button type="button" className={styles.textButton} onClick={() => { update({ ...structuredClone(baseline.settings), startMonth: settings.startMonth, horizon: settings.horizon, target: settings.target }); setNotice("Vstupy obnoveny z uloženého scénáře."); }}><RotateCcw size={13} />Obnovit jeho vstupy</button></div>}
        </section>
      </aside>

      <div className={styles.results} id="projection-results">
        <div className={styles.resultToolbar}><span><span className={styles.liveDot} />Tvůj výhled</span><div><label className={styles.startMonth}>Od<input aria-label="Začátek projekce" type="month" min="2000-01" max="2099-12" value={settings.startMonth} onChange={event => { if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value)) update({ startMonth: event.target.value }); }} /></label><div className={styles.horizon} aria-label="Délka projekce">{([5, 10, 15] as const).map(value => <button type="button" aria-pressed={settings.horizon === value} key={value} onClick={() => update({ horizon: value })}>{value} let</button>)}</div></div></div>

        <section className={styles.metrics} aria-label="Výsledky projekce">
          <article className={styles.mainMetric}><span>Průměrný měsíční příjem v {settings.horizon}. roce<ArrowUpRight size={18} /></span><strong>{formatMoney(lastYear.total / 12)}</strong><p>{formatPeriod(lastYear.start, lastYear.end)}</p><div><span className={styles.liveDot} />{settings.mode === "team" ? "Tvoje produkce + provize ze struktury" : "Z vlastní pravidelné produkce"}</div></article>
          <article className={styles.metric}><span>Celkem za {settings.horizon} let</span><strong>{formatMoney(result.total)}</strong>{comparison ? <p className={baselineDifference >= 0 ? styles.positive : styles.negative}>{baselineDifference >= 0 ? "+" : "−"}{formatMoney(Math.abs(baselineDifference))} proti scénáři</p> : <p>Součet všech výplat v projekci</p>}<span className={styles.metricBottom}>První rok <b>{formatMoney(result.years[0].total)}</b></span></article>
        </section>

        <section className={`${styles.panel} ${styles.chartPanel}`}>
          <div className={styles.chartHeader}><div><h2>Jak poroste tvůj příjem</h2><p>{metric === "annual" ? "Každý sloupec je 12 měsíců od začátku projekce." : "Součet výplat od začátku do konce vybraného roku."}</p></div><div className={styles.metricSwitch}>{([{ value: "annual", label: "Ročně" }, { value: "cumulative", label: "Kumulativně" }] as const).map(item => <button type="button" key={item.value} aria-pressed={metric === item.value} onClick={() => setMetric(item.value)}>{item.label}</button>)}</div></div>
          {hasData || comparison ? <>
            <div className={styles.chartSelection}>
              <div className={styles.chartSummary}>
                <dl className={styles.chartAmounts} aria-label="Příjem ve vybraném roce">
                  <div><dt>{metric === "annual" ? "Celkem za rok" : "Celkem od začátku"}</dt><dd>{formatMoney(metric === "annual" ? year.total : year.cumulative)}</dd></div>
                  <div className={styles.monthlyAverage}><dt>Průměr za měsíc v {selected + 1}. roce</dt><dd>{formatMoney(year.total / 12)}</dd></div>
                </dl>
                <span>{selected + 1}. rok · {formatPeriod(year.start, year.end)}</span>
              </div>
              <div className={styles.legend}><span><i />Aktuální plán</span>{baseline && <span><i className={styles.comparisonDot} />{baseline.name}</span>}</div>
            </div>
            <ProjectionChart result={result} baseline={comparison} selected={selected} onSelect={setSelectedIndex} metric={metric} />
            <div className={styles.chartHint}><span>Klikni na rok a prohlédni si měsíční výplaty.</span><span>{settings.growth > 0 ? "+" : ""}{settings.growth} % nové produkce ročně</span></div>
          </> : <div className={styles.emptyState}><div className={styles.emptyBars} aria-hidden="true">{[26, 40, 54, 65, 80, 96, 112].map((height, index) => <span key={height} style={{ height, opacity: .35 + index * .1 }} />)}</div><h3>Tvůj budoucí příjem začíná tady</h3><p>Zadej měsíční produkci a sleduj, jak se okamžité a následné provize skládají v čase.</p><button type="button" className={styles.primaryButton} onClick={loadExample}><Sparkles size={16} />Vyzkoušet na příkladu<ArrowRight size={15} /></button></div>}
        </section>

        <section className={`${styles.panel} ${styles.goalPanel}`}>
          <div className={styles.goalTitle}><span className={styles.goalIcon}><Target size={21} /></span><div><h2>Kam se chceš dostat?</h2><p>Cíl pro průměrný měsíční příjem</p></div></div>
          <div className={styles.goalContent}><NumberField label="Můj měsíční cíl" value={settings.target} onChange={target => update({ target })} unit="Kč / měs." /><div className={styles.goalResult}>
            <strong>{!settings.target ? "Nastav si vlastní cíl" : !hasData ? "Nejprve doplň produkci" : goal.reached ? `Cíl poprvé dosáhneš: ${formatDate(goal.reached)}` : `Za ${settings.horizon} let dosáhneš na ${percent(goal.percent)} % cíle`}</strong>
            <p>{goal.reached ? "Podle klouzavého průměru výplat za posledních 12 měsíců." : hasData && settings.target > 0 ? `Na konci horizontu chybí ${formatMoney(Math.max(0, settings.target - goal.finalAverage))} měsíčně.` : "Uvidíš, kdy se tvůj plán přiblíží požadovanému příjmu."}</p>
            <div className={styles.progress} role="progressbar" aria-label="Splnění měsíčního cíle na konci projekce" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(goal.percent)}><span style={{ width: `${goal.percent}%` }} /></div>
            {hasData && !goal.reached && goal.requiredScale && goal.requiredScale > 1 && <p className={styles.goalTip}><TrendingUp size={14} />Při stejném mixu potřebuješ přibližně {percent((goal.requiredScale - 1) * 100)} % nové produkce navíc{settings.mode === "team" ? " u sebe i v týmu" : ""}.</p>}
          </div></div>
        </section>

        {hasData && <section className={`${styles.panel} ${styles.detailPanel}`}>
          <div className={styles.chartHeader}><div><h2>Detail {selected + 1}. roku</h2><p>{formatPeriod(year.start, year.end)} · skutečné měsíce výplaty</p></div><select aria-label="Rok měsíčního přehledu" value={selected} onChange={event => setSelectedIndex(Number(event.target.value))}>{result.years.map(item => <option key={item.index} value={item.index}>{item.index + 1}. rok</option>)}</select></div>
          <div className={styles.breakdown}>{PRODUCTS.map(key => <div key={key} data-product={key}><span><i />{PRODUCT_META[key].short}</span><strong>{formatMoney(year[key])}</strong><div className={styles.breakdownBar}><span style={{ width: `${year.total > 0 ? year[key] / year.total * 100 : 0}%` }} /></div></div>)}</div>
          {settings.mode === "team" && <div className={styles.teamTotals}><span>Vlastní provize <b>{formatMoney(year.own)}</b></span><span>Provize ze struktury <b>{formatMoney(year.team)}</b></span></div>}
          <div className={styles.tableScroll}><table className={styles.monthTable}><caption className={styles.srOnly}>Měsíční výplaty v {selected + 1}. roce projekce</caption><thead><tr><th scope="col">Měsíc</th><th scope="col">Život</th><th scope="col">Auto</th><th scope="col">Majetek</th><th scope="col">Celkem</th>{comparison && <th scope="col">Rozdíl proti scénáři</th>}</tr></thead><tbody>{year.months.map((month, index) => {
            const diff = comparison ? month.total - comparison.years[selected].months[index].total : 0;
            return <tr key={month.date.getTime()}><th scope="row">{formatDate(month.date)}</th>{PRODUCTS.map(key => <td key={key}>{formatMoney(month[key])}</td>)}<td><strong>{formatMoney(month.total)}</strong></td>{comparison && <td className={diff >= 0 ? styles.positive : styles.negative}>{diff > 0 ? "+" : ""}{formatMoney(diff)}</td>}</tr>;
          })}</tbody><tfoot><tr><th scope="row">Celkem za rok</th>{PRODUCTS.map(key => <td key={key}>{formatMoney(year[key])}</td>)}<td>{formatMoney(year.total)}</td>{comparison && <td>{formatMoney(year.total - comparison.years[selected].total)}</td>}</tr></tfoot></table></div>
        </section>}

        <footer className={styles.disclaimer}><HelpCircle size={15} /><p>Modelový odhad provizí před zdaněním a náklady. Výpočet vychází z produktů NEON, ČPP Auto a DOMEX a zahrnuje novou produkci od zvoleného měsíce. Stávající smlouvy se do něj nenačítají. První výplata přichází nejdříve následující měsíc.</p></footer>
      </div>
    </div>
    <div className={styles.mobileResult}><div><span>Průměr v {settings.horizon}. roce</span><strong>{formatMoney(lastYear.total / 12)} <small>/ měs.</small></strong></div><a href="#projection-results">Zobrazit výhled<ArrowRight size={15} /></a></div>
    <div className={styles.notice} role="status" aria-live="polite">{notice && <><Check size={16} /><span>{notice}</span><button type="button" aria-label="Zavřít oznámení" onClick={() => setNotice("")}><X size={15} /></button></>}</div>
    <dialog ref={helpRef} className={styles.helpDialog} onClick={event => { if (event.target === event.currentTarget) helpRef.current?.close(); }} onClose={() => helpButtonRef.current?.focus()} aria-labelledby="projection-help-title"><div className={styles.helpContent}><div className={styles.sectionHeading}><h2 id="projection-help-title">Jak projekce funguje</h2><button type="button" className={styles.iconButton} aria-label="Zavřít nápovědu" onClick={() => helpRef.current?.close()}><X size={19} /></button></div>
      <ol><li><strong>Zadej pravidelnou měsíční produkci.</strong> U života jde o součet měsíčního pojistného nově sjednaných smluv. U aut a majetku o součet jejich ročního pojistného. Například 3 nové životní smlouvy po 1 000 Kč měsíčně znamenají vstup 3 000 Kč.</li><li><strong>Nastav realistické předpoklady.</strong> Nová produkce se mění jednou za 12 měsíců podle zadaného růstu. Stornovost snižuje budoucí výplaty podle stáří smlouvy; nemodeluje vracení již vyplacené provize. Růst pojistného při péči je samostatný volitelný předpoklad.</li><li><strong>Porovnej plány.</strong> Ulož výchozí scénář a pak změň vstupy. Oba scénáře zobrazujeme se stejným začátkem a horizontem. Uložený plán i srovnání zůstávají v tomto prohlížeči pro tvůj účet.</li><li><strong>Sleduj svůj cíl.</strong> Hledáme první měsíc, kdy průměr za posledních 12 měsíců dosáhne cíle. Příjem se může později změnit. Údaj o potřebné produkci navíc zachovává pozice, produktový mix, růst i stornovost.</li><li><strong>Tým ukazuje tvůj příjem.</strong> Vlastní provize manažera doplňují kladné rozdílové provize z přímo zadaných poradců. Nejde o součet výdělků celého týmu a nepočítáme další patra struktury.</li></ol>
      <p className={styles.finePrint}>Sazby vycházejí z výpočetních pravidel aplikace. Jde o model budoucích výplat, který nezaručuje konkrétní příjem.</p>
    </div></dialog>
    <ProjectionPrintReport settings={settings} result={result} baseline={baseline} comparison={comparison} selected={selected} />
  </div>;
}
