import Image from "next/image";
import { Check, ChevronDown, Minus, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import styles from "./comparison.module.css";

type Group = { insurerName: string; options: { value: string; productName: string; badges: string[] }[] };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs").trim();

export function InsurerPicker({ groups, selected, expanded, onToggleOption, onToggleGroup, onToggleExpanded, getLogo, compact = false, searchQuery, layout }: {
  groups: Group[]; selected: string[]; expanded: string[];
  onToggleOption: (value: string) => void; onToggleGroup: (values: string[]) => void;
  onToggleExpanded: (name: string) => void; getLogo: (name: string) => string | null;
  compact?: boolean;
  searchQuery?: string;
  layout?: "centered";
}) {
  const [query, setQuery] = useState("");
  const term = normalize(searchQuery ?? query);
  const visible = groups.map(group => ({ ...group, visibleOptions: group.options.filter(option => normalize(`${group.insurerName} ${option.productName} ${option.badges.join(" ")}`).includes(term)) })).filter(group => group.visibleOptions.length);
  return <div className={styles.insurerPicker} data-compact={compact} data-layout={layout}>
    {searchQuery === undefined && <div className={styles.pickerSearch}><Search size={17} aria-hidden="true" /><input type="search" aria-label="Hledat pojišťovnu nebo produkt" placeholder="Pojišťovna, produkt nebo ročník…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" onClick={() => setQuery("")} aria-label="Vymazat hledání"><X size={16} /></button>}</div>}
    <div className={styles.insurerGrid}>{visible.map(group => {
      const count = group.options.filter(option => selected.includes(option.value)).length;
      const all = count === group.options.length;
      const open = expanded.includes(group.insurerName) || !!term;
      const logo = getLogo(group.insurerName);
      return <section key={group.insurerName} className={styles.insurerCard} data-selected={count > 0}>
        <div className={styles.insurerHeader}>
          <button type="button" className={styles.groupSelect} onClick={() => onToggleGroup(group.options.map(option => option.value))} aria-pressed={all} aria-label={`Vybrat všechny produkty: ${group.insurerName}`}><span className={styles.checkbox} data-checked={count > 0}>{all ? <Check size={14} /> : count > 0 ? "−" : null}</span></button>
          <button type="button" className={styles.groupExpand} onClick={() => onToggleExpanded(group.insurerName)} aria-expanded={open} aria-label={`${open ? "Sbalit" : "Rozbalit"} ${group.insurerName}`}>
            <span className={styles.pickerLogo}>{logo ? <Image src={logo} alt="" width={56} height={34} /> : null}</span><span><strong>{group.insurerName}</strong><small>{layout === "centered" && group.options.length === 1 ? group.options[0].productName : <>{group.options.length} {group.options.length === 1 ? "varianta" : group.options.length < 5 ? "varianty" : "variant"}{count > 0 ? ` · ${count} vybráno` : ""}</>}</small></span>
            {layout === "centered" ? <span className={styles.groupDisclosure}><span>{open ? "Skrýt" : "Produkty"}</span><ChevronDown size={16} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }} /></span>
              : compact ? <span className={styles.groupDisclosure}>{open ? <Minus size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}{open ? "Skrýt" : "Produkty"}</span>
              : <ChevronDown size={17} aria-hidden="true" style={{transform:open ? "rotate(180deg)" : undefined}} />}
          </button>
        </div>
        {open && <div className={styles.productOptions}>{group.visibleOptions.map(option => <button type="button" key={option.value} onClick={() => onToggleOption(option.value)} aria-pressed={selected.includes(option.value)}><span className={styles.checkbox} data-checked={selected.includes(option.value)}>{selected.includes(option.value) && <Check size={13} />}</span><span><strong>{option.productName}</strong><small>{option.badges.join(" · ")}</small></span></button>)}</div>}
      </section>;
    })}</div>
    {visible.length === 0 && <p className={styles.empty}>Žádná pojišťovna ani produkt neodpovídá hledání.</p>}
  </div>;
}
