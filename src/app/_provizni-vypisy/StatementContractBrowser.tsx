"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Link2Off, Search, X } from "lucide-react";
import { formatMoney } from "./statementParsing";
import { statementContractCount } from "./StatementSection";
import styles from "./statementWorkspace.module.css";

export type StatementBrowserItem = {
  key: string;
  searchText: string;
  amount: number;
  issueCount: number;
  unpaired: boolean;
};

type ReviewFilter = "all" | "issues" | "unpaired";

export const normalizeStatementSearch = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs-CZ").trim();

export function filterStatementBrowserItems<T extends StatementBrowserItem>(items: T[], query: string, filter: ReviewFilter): T[] {
  const terms = normalizeStatementSearch(query).split(/\s+/).filter(Boolean);
  return items.filter(item =>
    (filter !== "issues" || item.issueCount > 0 || item.unpaired) &&
    (filter !== "unpaired" || item.unpaired) &&
    terms.every(term => normalizeStatementSearch(item.searchText).includes(term))
  );
}

const BrowserContext = createContext<ReadonlySet<string> | null>(null);

export function useStatementBrowserItems<T extends StatementBrowserItem>(items: T[]) {
  const visibleKeys = useContext(BrowserContext);
  return {
    items: visibleKeys ? items.filter(item => visibleKeys.has(item.key)) : items,
    inBrowser: visibleKeys !== null,
  };
}

export function StatementWorkflow({ saved }: { saved: boolean }) {
  return (
    <ol className={styles.workflow} aria-label="Postup zpracování výpisu">
      <li data-complete="true"><CheckCircle2 size={17} aria-hidden="true" /><span>Výpis načtený</span></li>
      <li aria-hidden="true"><ArrowRight size={14} /></li>
      <li data-current={!saved}><span className={styles.stepNumber}>2</span><span>Zkontrolovat smlouvy</span></li>
      <li aria-hidden="true"><ArrowRight size={14} /></li>
      <li data-current={saved} data-complete={saved}>{saved ? <CheckCircle2 size={17} aria-hidden="true" /> : <span className={styles.stepNumber}>3</span>}<span>{saved ? "Výpis zpracovaný" : "Zpracovat výpis"}</span></li>
    </ol>
  );
}

export function StatementContractBrowser({ items, children }: { items: StatementBrowserItem[]; children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const resultsId = useId();
  const visible = filterStatementBrowserItems(items, query, filter);
  const visibleKeys = new Set(visible.map(item => item.key));
  const issueCount = items.filter(item => item.issueCount > 0 || item.unpaired).length;
  const unpairedCount = items.filter(item => item.unpaired).length;
  const filtered = query.trim() !== "" || filter !== "all";
  const reset = () => { setQuery(""); setFilter("all"); };

  return (
    <section className={styles.browser} aria-label="Smlouvy ve výpisu">
      <div className={styles.breakdownHeading}>
        <div><h3>Smlouvy ve výpisu <span>{items.length}</span></h3><p>Vyber smlouvu a zobrazí se její podrobnosti.</p></div>
        <span className={styles.browserScope}>Vlastní smlouvy</span>
      </div>
      <div className={styles.browserToolbar}>
        <div className={styles.reviewFilters} role="group" aria-label="Zobrazit smlouvy podle výsledku kontroly">
          <button type="button" aria-pressed={filter === "all"} aria-controls={resultsId} onClick={() => setFilter("all")}>Všechny <span>{items.length}</span></button>
          <button type="button" data-tone="warning" aria-pressed={filter === "issues"} aria-controls={resultsId} onClick={() => setFilter("issues")}><AlertCircle size={15} aria-hidden="true" />K prověření <span>{issueCount}</span></button>
          <button type="button" aria-pressed={filter === "unpaired"} aria-controls={resultsId} onClick={() => setFilter("unpaired")}><Link2Off size={15} aria-hidden="true" />Bez propojení <span>{unpairedCount}</span></button>
        </div>
        <label className={styles.browserSearch}><Search size={17} aria-hidden="true" /><input type="search" aria-label="Hledat ve všech vlastních smlouvách" aria-controls={resultsId} placeholder="Hledat jméno, číslo smlouvy, produkt…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      </div>
      <div className={styles.browserResult} role="status" aria-live="polite" aria-atomic="true">
        <span>{filtered ? `Zobrazeno ${visible.length} z ${items.length} smluv` : statementContractCount(items.length)}<span> · Provize {formatMoney(visible.reduce((sum, item) => sum + item.amount, 0))} Kč</span></span>
        {filtered && <button type="button" onClick={reset}><X size={13} aria-hidden="true" />Zrušit filtry</button>}
      </div>
      <div id={resultsId}>
        <BrowserContext.Provider value={visibleKeys}>
          <div key={`${query}\u0000${filter}`}>{children}</div>
        </BrowserContext.Provider>
        {visible.length === 0 && <div className={styles.browserEmpty}><Search size={24} aria-hidden="true" /><strong>{items.length === 0 ? "V tomto výpisu nejsou vlastní smlouvy." : "Žádná smlouva neodpovídá výběru."}</strong><p>{items.length === 0 ? "Další položky výpisu najdeš níže, například v provizích manažera." : "Zkus jiné jméno, číslo smlouvy nebo zobraz všechny smlouvy."}</p>{filtered && <button type="button" className={styles.secondaryButton} onClick={reset}>Zobrazit všechny smlouvy</button>}</div>}
      </div>
    </section>
  );
}
