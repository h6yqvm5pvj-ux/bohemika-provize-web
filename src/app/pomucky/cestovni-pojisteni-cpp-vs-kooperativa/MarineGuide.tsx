"use client";

import { useState } from "react";
import { Anchor, ArrowDown, FileText } from "lucide-react";
import { DOCUMENT_GROUPS, type ComparisonRow } from "./comparisonData";
import { sourceReferences } from "./comparisonSources";
import styles from "./comparison.module.css";

const SCENARIOS = ["Výletní loď / trajekt", "Jachting do 3 mil", "Nad 3 do 12 mil", "Nad 12 do 200 mil", "Oceán / nad 200 mil"];

export function MarineGuide({ rows }: { rows: ComparisonRow[] }) {
  const [scenario, setScenario] = useState(0);
  const sailing = rows.find(row => row.id === "marine-sailing");
  const cruise = rows.find(row => row.id === "marine-cruise");
  if (!sailing || !cruise) return null;
  const row = scenario === 0 ? cruise : sailing;
  const band = scenario > 0 ? sailing.differences?.[scenario - 1] : undefined;

  return <section className={styles.marineGuide} aria-label="Rychlá orientace pro plavbu">
    <div className={styles.marineIntro}>
      <span className={styles.marineIcon}><Anchor size={22} aria-hidden="true" /></span>
      <div><span className={styles.marineEyebrow}>RYCHLÁ ORIENTACE PRO PORADCE</span><h3>Začněte typem plavby</h3><p>U jachtingu vyberte největší vzdálenost od pobřeží na celé trase. Pásma níže zahrnují horní hranici.</p></div>
    </div>
    <fieldset className={styles.marineScenarios}>
      <legend className="sr-only">Typ plavby a vzdálenost od pobřeží</legend>
      {SCENARIOS.map((label, index) => <button key={label} type="button" aria-pressed={scenario === index} onClick={() => setScenario(index)}>{label}</button>)}
    </fieldset>
    <div className={styles.marineResult} aria-live="polite" aria-atomic="true">
      <h4>{band?.label ?? "Cestující na výletní lodi nebo trajektu"}</h4>
      <div className={styles.marineGrid}>
        {DOCUMENT_GROUPS.map(group => {
          const value = row[group.tone];
          const source = sourceReferences(group.tone, value.source)[0];
          return <div key={group.tone} className={styles.marineCard} data-tone={group.tone}>
            <strong>{group.insurer}</strong><p>{band ? band[group.tone] : `${value.headline}. ${value.detail}`}</p>
            {source && <a href={source.url} target="_blank" rel="noopener noreferrer"><FileText size={13} aria-hidden="true" />Pojistné podmínky<span className="sr-only"> {group.insurer}</span></a>}
          </div>;
        })}
      </div>
      <p className={styles.marineScope}>{scenario === 0
        ? "Jde o cestujícího, který loď neřídí ani nepracuje v posádce. Samostatné sportovní aktivity a území všech úseků cesty posuďte zvlášť. U Kooperativy a AXA není uvedené pravidlo pro jachting výslovným potvrzením libovolné výletní plavby."
        : "Přehled určuje sportovní rozsah pro rekreační jachting bez závodů. U všech variant platí sjednané území a výluky. U Kooperativy absence hranice mil nepotvrzuje mezinárodní vody; oceánská trasa vyžaduje písemné potvrzení."}</p>
    </div>
    <div className={styles.marineChecklist}>
      <h4>Co zjistit od klienta před sjednáním</h4>
      <ul><li><b>Role a loď:</b> cestující, posádka, kapitán; plachetnice, katamarán, motorová či výletní loď.</li><li><b>Celá trasa:</b> země, mezinárodní vody, největší vzdálenost od pobřeží; u ČPP i pobřežní ostrovy.</li><li><b>Účel:</b> rekreace, závod, výcvik nebo práce za odměnu; odpovídající oprávnění.</li><li><b>Potřebné krytí:</b> léčení, pátrání a evakuace člověka; zvlášť odpovědnost kapitána, loď a kauce.</li></ul>
    </div>
    <a className={styles.marineDetailLink} href={`#${row.id}`}>Přesné podmínky a výluky níže <ArrowDown size={14} aria-hidden="true" /></a>
  </section>;
}
