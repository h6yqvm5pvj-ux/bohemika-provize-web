"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { filterStatementBrowserItems, sortStatementBrowserItems, STATEMENT_REVIEW_FILTERS, type ReviewFilter, type StatementBrowserItem } from "./StatementContractBrowser";
import { formatMoney } from "./statementParsing";
import styles from "./statementContractDetail.module.css";

type ContractListItem = StatementBrowserItem & {
  hasA101?: boolean;
  render: () => ReactNode;
};

const PAGE_SIZE = 15;

export function StatementContractList({ items, enableA101Filter = false, showFilters = true }: {
  items: ContractListItem[];
  enableA101Filter?: boolean;
  showFilters?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReviewFilter>("all");
  const [onlyA101, setOnlyA101] = useState(false);
  const [page, setPage] = useState(0);
  const a101Count = items.filter(item => item.hasA101).length;
  const visible = sortStatementBrowserItems(filterStatementBrowserItems(items, query, statusFilter)
    .filter(item => !enableA101Filter || !onlyA101 || item.hasA101));
  const filtered = query.trim() !== "" || statusFilter !== "all" || (enableA101Filter && onlyA101);
  const reset = () => { setQuery(""); setStatusFilter("all"); setOnlyA101(false); setPage(0); };
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <div className={styles.contractList}>
      {(showFilters || enableA101Filter) && <div className={styles.listToolbar}>
        {showFilters && <>
        <label className={styles.listSearch}>
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label="Hledat klienta, smlouvu nebo produkt" placeholder="Klient, číslo smlouvy, produkt…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
        </label>
        <div className={styles.listFilters} role="group" aria-label="Filtry smluv">
          {STATEMENT_REVIEW_FILTERS.map(({ key, label, icon: Icon, tone }) => (
            <button key={key} type="button" data-tone={tone} aria-pressed={statusFilter === key} onClick={() => { setStatusFilter(key); setPage(0); }}>
              {Icon && <Icon size={14} aria-hidden="true" />}{label} <span>{filterStatementBrowserItems(items, "", key).length}</span>
            </button>
          ))}
        </div>
        </>}
        {enableA101Filter && <label className={styles.a101Filter}><input type="checkbox" checked={onlyA101} onChange={event => { setOnlyA101(event.target.checked); setPage(0); }} />Jen získatelské provize (A101) <span>{a101Count}</span></label>}
      </div>}
      {(showFilters || filtered) && <div className={styles.listSummary}>
        <span role="status">Zobrazeno {visible.length} z {items.length} smluv <span>· Provize {formatMoney(visible.reduce((sum, item) => sum + item.amount, 0))} Kč</span></span>
        {filtered && <button type="button" onClick={reset}><X size={12} aria-hidden="true" />Zrušit filtry</button>}
      </div>}
      {visible.length > 0 ? <>
        <div className={styles.listColumns} aria-hidden="true"><span>Klient / smlouva</span><span>Pojišťovna / produkt</span><span>Provize</span><span>Výsledek kontroly</span><span>Detail</span></div>
        <div className={styles.listRows}>{pageItems.map(item => <div key={item.key}>{item.render()}</div>)}</div>
        {pageCount > 1 && <nav className={styles.pagination} aria-label="Stránkování smluv v kategorii">
          <span role="status">Smlouvy {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, visible.length)} z {visible.length}</span>
          <div><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15} aria-hidden="true" />Předchozí</button><span>{currentPage + 1} / {pageCount}</span><button type="button" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Další<ChevronRight size={15} aria-hidden="true" /></button></div>
        </nav>}
      </> : <div className={styles.listEmpty}><strong>Žádná smlouva neodpovídá filtrům.</strong><span>Zkus jiné jméno nebo číslo smlouvy, případně zruš filtry.</span><button type="button" onClick={reset}>Zobrazit všechny smlouvy</button></div>}
    </div>
  );
}
