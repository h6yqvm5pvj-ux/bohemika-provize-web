"use client";

import { createPortal } from "react-dom";
import { POSITION_LABELS, formatMoney } from "@/app/lib/formatters";
import { ProjectionChart, formatPeriod } from "./ProjectionChart";
import { goalProgress, type ProjectionResult, type ProjectionSettings, type SavedScenario } from "./projectionModel";
import styles from "./projectionPrint.module.css";

function PlanInputs({ settings, name }: { settings: ProjectionSettings; name: string }) {
  const ownProduction = settings.mode === "team" ? settings.managerProduction : settings.production;
  const position = settings.mode === "team" ? settings.managerPosition : settings.position;
  const producers = [
    { id: "own", name: settings.mode === "team" ? "Vlastní produkce manažera" : "Vlastní produkce", position, production: ownProduction },
    ...(settings.mode === "team" ? settings.members.map((member, index) => ({ ...member, name: member.name || `Poradce ${index + 1}` })) : []),
  ];

  return <section className={styles.planInputs}>
    <h3>{name}</h3>
    <p className={styles.assumptions}>
      {settings.mode === "team" ? "Týmová projekce" : "Vlastní produkce"} · Roční změna nové produkce: {settings.growth > 0 ? "+" : ""}{settings.growth} %.
      {" "}Stornovost život / auto / majetek: {settings.storno.life} / {settings.storno.auto} / {settings.storno.property} %.
      {" "}Výplata životního pojištění: {settings.commissionMode === "accelerated" ? "zrychlená" : "standardní"}.
      {" "}{settings.care ? "Růst pojistného při péči: život +2 % ročně, auto +5 % ročně; majetek +20 % po 3 letech, poté +3 % ročně." : "Bez růstu pojistného při péči."}
    </p>
    <table className={styles.productionTable}>
      <caption>Nová produkce sjednávaná každý měsíc</caption>
      <thead><tr><th scope="col">Poradce / pozice</th><th scope="col">Život<small>měsíční pojistné</small></th><th scope="col">Auto<small>roční pojistné</small></th><th scope="col">Majetek<small>roční pojistné</small></th></tr></thead>
      <tbody>{producers.map(producer => <tr key={producer.id}><th scope="row">{producer.name}<small>{POSITION_LABELS[producer.position]}</small></th><td>{formatMoney(producer.production.life)}</td><td>{formatMoney(producer.production.auto)}</td><td>{formatMoney(producer.production.property)}</td></tr>)}</tbody>
    </table>
  </section>;
}

export function ProjectionPrintReport({ settings, result, baseline, comparison, selected }: {
  settings: ProjectionSettings;
  result: ProjectionResult;
  baseline: SavedScenario | null;
  comparison: ProjectionResult | null;
  selected: number;
}) {
  if (typeof document === "undefined") return null;
  const year = result.years[selected];
  const lastYear = result.years.at(-1)!;
  const goal = goalProgress(result, settings.target);
  const comparisonName = baseline?.name || "Výchozí plán";

  return createPortal(<article className={styles.report} data-projection-print="true" aria-label="Tisková verze projekce výkonu">
    <header className={styles.header}>
      <div><p className={styles.brand}>BOHEMKA.APP / PLÁNOVÁNÍ PŘÍJMU</p><h1>Projekce výkonu</h1><p>{settings.mode === "team" ? "Týmový plán" : "Vlastní produkce"} · {formatPeriod(result.years[0].start, lastYear.end)} · {settings.horizon} let</p></div>
      <span>{POSITION_LABELS[settings.mode === "team" ? settings.managerPosition : settings.position]}</span>
    </header>

    <dl className={styles.metrics}>
      <div><dt>Celkem za {settings.horizon} let</dt><dd>{formatMoney(result.total)}</dd></div>
      <div><dt>Průměr za měsíc v {settings.horizon}. roce</dt><dd>{formatMoney(lastYear.total / 12)}</dd></div>
      <div><dt>Měsíční příjmový cíl</dt><dd>{settings.target > 0 ? formatMoney(settings.target) : "Nenastaven"}</dd></div>
    </dl>

    <section className={styles.chartSection}>
      <h2>Vývoj ročních provizí</h2>
      <div className={styles.legend}><span>━ Aktuální plán</span>{comparison && <span>┄ {comparisonName}</span>}</div>
      <ProjectionChart result={result} baseline={comparison} selected={selected} onSelect={() => {}} metric="annual" compact />
    </section>

    <section className={styles.annualSection}>
      <h2>Roční výdělek a měsíční průměr</h2>
      {comparison && <p className={styles.caption}>Srovnání s plánem „{comparisonName}“ při stejném začátku a horizontu.</p>}
      <table className={styles.annualTable}>
        <thead><tr><th scope="col">Rok</th><th scope="col">Období</th><th scope="col">Za rok</th><th scope="col">Průměr / měsíc</th>{comparison && <><th scope="col">Scénář / rok</th><th scope="col">Rozdíl / rok</th></>}</tr></thead>
        <tbody>{result.years.map(item => <tr key={item.index} data-selected={item.index === selected}><th scope="row">{item.index + 1}.</th><td>{formatPeriod(item.start, item.end)}</td><td>{formatMoney(item.total)}</td><td><strong>{formatMoney(item.total / 12)}</strong></td>{comparison && <><td>{formatMoney(comparison.years[item.index].total)}</td><td>{formatMoney(item.total - comparison.years[item.index].total)}</td></>}</tr>)}</tbody>
        <tfoot><tr><th scope="row" colSpan={2}>Celý horizont</th><td>{formatMoney(result.total)}</td><td>{formatMoney(result.total / (settings.horizon * 12))}</td>{comparison && <><td>{formatMoney(comparison.total)}</td><td>{formatMoney(result.total - comparison.total)}</td></>}</tr></tfoot>
      </table>
      <p className={styles.caption}>Měsíční průměr = výplaty v daném roce ÷ 12. V souhrnném řádku jde o průměr za celý horizont. Jednotlivé měsíce se mohou lišit.</p>
    </section>

    <p className={styles.goal}>
      {settings.target <= 0 ? "Měsíční příjmový cíl není nastaven." : goal.reached ? `Cíl ${formatMoney(settings.target)} měsíčně poprvé vychází na ${goal.reached.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })}.` : `Cíle ${formatMoney(settings.target)} měsíčně plán ve zvoleném horizontu nedosáhne.`}
      {settings.target > 0 && " Posuzujeme průměr výplat za posledních 12 měsíců."}
    </p>
    <p className={styles.caption}>Modelový odhad provizí před zdaněním a náklady. Nejde o záruku budoucího příjmu. Částky jsou zaokrouhlené na celé koruny.</p>

    <div className={styles.detailPage}>
      <header className={styles.detailHeader}><p className={styles.brand}>BOHEMKA.APP / PODKLADY K PROJEKCI</p><h2>Nastavení plánu a měsíční výplaty</h2></header>
      <PlanInputs settings={settings} name="Aktuální plán" />
      {baseline && comparison && <PlanInputs settings={baseline.settings} name={`Srovnávací scénář: ${comparisonName}`} />}

      <section className={styles.monthSection}>
        <h2>Měsíční výplaty · {selected + 1}. rok</h2>
        <p className={styles.caption}>{formatPeriod(year.start, year.end)} · celkem {formatMoney(year.total)} · průměr {formatMoney(year.total / 12)} / měsíc</p>
        {settings.mode === "team" && <p className={styles.caption}>Vlastní provize: {formatMoney(year.own)} · provize ze struktury: {formatMoney(year.team)}</p>}
        <table>
          <thead><tr><th scope="col">Měsíc</th><th scope="col">Život</th><th scope="col">Auto</th><th scope="col">Majetek</th><th scope="col">Celkem</th>{comparison && <th scope="col">Rozdíl proti scénáři</th>}</tr></thead>
          <tbody>{year.months.map((month, index) => <tr key={month.date.getTime()}><th scope="row">{month.date.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })}</th><td>{formatMoney(month.life)}</td><td>{formatMoney(month.auto)}</td><td>{formatMoney(month.property)}</td><td><strong>{formatMoney(month.total)}</strong></td>{comparison && <td>{formatMoney(month.total - comparison.years[selected].months[index].total)}</td>}</tr>)}</tbody>
          <tfoot><tr><th scope="row">Celkem za rok</th><td>{formatMoney(year.life)}</td><td>{formatMoney(year.auto)}</td><td>{formatMoney(year.property)}</td><td>{formatMoney(year.total)}</td>{comparison && <td>{formatMoney(year.total - comparison.years[selected].total)}</td>}</tr></tfoot>
        </table>
      </section>

      <footer className={styles.notes}>
        <h3>Jak číst projekci</h3>
        <p>Výpočet vychází z produktů NEON, ČPP Auto a DOMEX a z nové produkce od zvoleného měsíce. Stávající smlouvy se nenačítají. Každý rok zahrnuje celých 12 měsíců, první výplata přichází nejdříve následující měsíc. Roční změna produkce se uplatní jednou za 12 měsíců.</p>
        <p>Stornovost snižuje budoucí výplaty podle stáří smlouvy; nemodeluje vracení již vyplacených provizí. Týmová projekce zahrnuje vlastní provize manažera a kladné rozdílové provize z přímo zadaných poradců, nikoli součet příjmů celého týmu.</p>
        <p>Měsíční detail odpovídá roku vybranému na stránce před tiskem. Úplný rozpis všech měsíců lze stáhnout přes Export CSV.</p>
      </footer>
    </div>
  </article>, document.body);
}
