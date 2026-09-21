"use client";

import { useState } from "react";
import { Check, ChevronDown, History } from "lucide-react";
import { InsurerPicker } from "../srovnavac-trvalych-nasledku/InsurerPicker";
import { HISTORICAL_LIABILITY_INSURERS, HISTORICAL_LIABILITY_PRODUCTS } from "./historicalProducts";
import styles from "./comparison.module.css";

const GROUPS = HISTORICAL_LIABILITY_INSURERS.map((insurer) => ({
  insurerName: insurer.name,
  options: insurer.products.map((product) => ({ value: `${insurer.id}:${product.id}`, productName: product.name, badges: [product.date] })),
}));
const IDS = HISTORICAL_LIABILITY_PRODUCTS.map((product) => product.id);
const INSURERS = GROUPS.map((group) => group.insurerName);
const LOGOS = new Map(HISTORICAL_LIABILITY_INSURERS.map((insurer) => [insurer.name, insurer.logoPath]));
const getLogo = (name: string) => LOGOS.get(name) ?? null;

export function HistoricalProductsPicker({ selected, query, selectedOnly, onToggleOption, onToggleGroup }: {
  selected: string[];
  query: string;
  selectedOnly: boolean;
  onToggleOption: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
}) {
  const selectedCount = IDS.filter((id) => selected.includes(id)).length;
  const [open, setOpen] = useState(selectedCount > 0);
  const [expanded, setExpanded] = useState<string[]>([]);
  const allExpanded = INSURERS.every((name) => expanded.includes(name));
  const groups = selectedOnly ? GROUPS.filter((group) => group.options.some((option) => selected.includes(option.value))) : GROUPS;

  return <div className={styles.historicalPicker}>
    <button type="button" className={styles.historyToggle} aria-expanded={open} aria-controls="historical-liability-products" onClick={() => setOpen(!open)}>
      <History size={19} aria-hidden="true" />
      <span>{open ? "Skrýt historické produkty" : "Zobrazit historické produkty"}<small>{HISTORICAL_LIABILITY_INSURERS.length} pojišťoven · {IDS.length} starších variant{selectedCount > 0 ? ` · ${selectedCount} vybráno` : ""}</small></span>
      <ChevronDown size={17} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }} />
    </button>
    <section id="historical-liability-products" hidden={!open} className={styles.historicalContent} aria-labelledby="historical-liability-title">
      <div className={styles.pickerToolbar}>
        <div className={styles.heading}>
          <h2 id="historical-liability-title">Historické produkty</h2>
          <span className={styles.selectionCount} role="status" aria-live="polite" aria-atomic="true">Vybráno {selectedCount} z {IDS.length} produktů</span>
        </div>
        <div className={styles.pickerActions}>
          <button type="button" onClick={() => onToggleGroup(IDS)}><Check size={15} aria-hidden="true" />{selectedCount === IDS.length ? "Zrušit historický výběr" : "Vybrat všechny historické"}</button>
          <button type="button" onClick={() => setExpanded(allExpanded ? [] : INSURERS)}><ChevronDown size={15} aria-hidden="true" style={{ transform: allExpanded ? "rotate(180deg)" : undefined }} />{allExpanded ? "Sbalit historické" : "Rozbalit historické"}</button>
        </div>
      </div>
      <p className={styles.historyNotice}>Starší verze produktů pro stávající smlouvy. Údaje pro jejich srovnání doplňujeme postupně.</p>
      {selectedOnly && groups.length === 0
        ? <p className={styles.historyNotice}>Zatím nejsou vybrané historické produkty. Pro výběr přepněte filtr na „Všechny“.</p>
        : <InsurerPicker compact layout="centered" searchQuery={query} groups={groups} selected={selected} expanded={expanded}
          onToggleOption={onToggleOption} onToggleGroup={onToggleGroup}
          onToggleExpanded={(name) => setExpanded(current => current.includes(name) ? current.filter(value => value !== name) : [...current, name])}
          getLogo={getLogo} />}
    </section>
  </div>;
}
