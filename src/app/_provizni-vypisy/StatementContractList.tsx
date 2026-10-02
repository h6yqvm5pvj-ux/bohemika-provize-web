"use client";

import { useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { formatMoney } from "./statementParsing";
import styles from "./statementContractDetail.module.css";

type ContractListItem = {
  key: string;
  searchText: string;
  amount: number;
  issueCount: number;
  unpaired: boolean;
  hasA101?: boolean;
  render: () => ReactNode;
};

const normalizeSearch = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs-CZ").trim();

export function StatementContractList({ items, enableA101Filter = false }: {
  items: ContractListItem[];
  enableA101Filter?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "issues" | "unpaired">("all");
  const [onlyA101, setOnlyA101] = useState(false);
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const issueCount = items.filter(item => item.issueCount > 0).length;
  const unpairedCount = items.filter(item => item.unpaired).length;
  const a101Count = items.filter(item => item.hasA101).length;
  const visible = items.filter(item =>
    (statusFilter !== "issues" || item.issueCount > 0) &&
    (statusFilter !== "unpaired" || item.unpaired) &&
    (!enableA101Filter || !onlyA101 || item.hasA101) &&
    terms.every(term => normalizeSearch(item.searchText).includes(term))
  );
  const filtered = terms.length > 0 || statusFilter !== "all" || (enableA101Filter && onlyA101);
  const reset = () => { setQuery(""); setStatusFilter("all"); setOnlyA101(false); };

  return (
    <div className={styles.contractList}>
      <div className={styles.listToolbar}>
        <label className={styles.listSearch}>
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label="Hledat klienta, smlouvu nebo produkt" placeholder="Klient, číslo smlouvy, produkt…" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        <div className={styles.listFilters} aria-label="Filtry smluv">
          <button type="button" aria-pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")}>Vše <span>{items.length}</span></button>
          <button type="button" data-tone="warning" aria-pressed={statusFilter === "issues"} onClick={() => setStatusFilter("issues")}>Nesrovnalosti <span>{issueCount}</span></button>
          {(unpairedCount > 0 || statusFilter === "unpaired") && <button type="button" data-tone="info" aria-pressed={statusFilter === "unpaired"} onClick={() => setStatusFilter("unpaired")}>Nespárované <span>{unpairedCount}</span></button>}
          {enableA101Filter && <button type="button" aria-pressed={onlyA101} onClick={() => setOnlyA101(value => !value)}>Pouze A101 <span>{a101Count}</span></button>}
        </div>
      </div>
      <div className={styles.listSummary}>
        <span role="status">Zobrazeno {visible.length} z {items.length} smluv <span>· Provize {formatMoney(visible.reduce((sum, item) => sum + item.amount, 0))} Kč</span></span>
        {filtered && <button type="button" onClick={reset}><X size={12} aria-hidden="true" />Zrušit filtry</button>}
      </div>
      {visible.length > 0 ? <>
        <div className={styles.listColumns} aria-hidden="true"><span>Klient / smlouva</span><span>Pojišťovna / produkt</span><span>Provize</span><span>Výsledek kontroly</span><span /></div>
        <div className={styles.listRows}>{visible.map(item => <div key={item.key}>{item.render()}</div>)}</div>
      </> : <div className={styles.listEmpty}><strong>Žádná smlouva neodpovídá filtrům.</strong><span>Zkus jiné jméno nebo číslo smlouvy, případně zruš filtry.</span><button type="button" onClick={reset}>Zobrazit všechny smlouvy</button></div>}
    </div>
  );
}
