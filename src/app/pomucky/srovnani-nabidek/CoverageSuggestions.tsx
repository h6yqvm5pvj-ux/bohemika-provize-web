import { useState } from "react";
import { Layers3, Plus, Search } from "lucide-react";
import { ALL_COVERAGES, type CoverageKind } from "./coverage";
import { ComparisonIcon } from "./icons";
import { normalizeSearch } from "./insurers";
import styles from "./comparison.module.css";

const QUICK_AUTO: CoverageKind[] = ["auto-liability", "auto-collision", "auto-glass", "auto-assistance"];
export function CoverageSuggestions({ category, onAdd, onTemplate }: { category: "life" | "auto"; onAdd: (kind: CoverageKind) => void; onTemplate: () => void }) {
  const [search, setSearch] = useState("");
  const options = ALL_COVERAGES.filter(item => item.category === category);
  const quick = options.filter(item => category === "life" ? item.group === "Základní rizika" : QUICK_AUTO.includes(item.id));
  const filtered = options.filter(item => normalizeSearch(`${item.label} ${item.group}`).includes(normalizeSearch(search)));
  const groups = Array.from(new Set(filtered.map(item => item.group)));
  const addButton = (item: typeof options[number]) => <button type="button" key={item.id} aria-label={`Přidat: ${item.label}`} onClick={() => onAdd(item.id)}><ComparisonIcon name={item.icon} size={15} />{item.label}<Plus size={13} /></button>;
  const results = <div className={styles.coverageGroups}>
    {groups.map(group => <div key={group}><h3>{group}</h3><div>{filtered.filter(item => item.group === group).map(addButton)}</div></div>)}
    {!filtered.length && <p className={styles.smartHint}>Nic nenalezeno. Libovolné riziko můžeš přidat tlačítkem Přidat položku pod tabulkou.</p>}
  </div>;
  return <div className={styles.coverageCatalog}>
    <div className={styles.templateBar}><span><Plus size={15} />Rychle přidat:</span>{!search && quick.map(addButton)}<button type="button" onClick={onTemplate}><Layers3 size={15} />Přidat základní sadu</button></div>
    <div className={styles.catalogBody}>
      <div className={styles.search}><Search size={17} /><input aria-label="Hledat riziko nebo připojištění" placeholder={category === "life" ? "Hledat riziko… třeba cukrovka, pomůcka, pracovní neschopnost" : "Hledat připojištění… třeba GAP, skla, náhradní vozidlo"} value={search} onChange={event => setSearch(event.target.value)} /></div>
      {search ? results : <details className={styles.catalogDetails}><summary>Všechna rizika a připojištění <span>{options.length} položek</span></summary>{results}</details>}
      <p className={styles.catalogHint}>Vyber položky ze srovnávaných smluv. Rozsah, limity a podmínky doplň samostatně pro každou nabídku.</p>
    </div>
  </div>;
}
