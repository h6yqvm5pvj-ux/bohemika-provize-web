"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Link2Off, Search, TrendingDown, TrendingUp, X } from "lucide-react";
import { formatMoney } from "./statementParsing";
import { statementContractCount } from "./StatementSection";
import type { StatementContractReview, StatementReviewStatus } from "./statementContractReview";
import styles from "./statementWorkspace.module.css";

export type StatementBrowserItem = {
  key: string;
  searchText: string;
  amount: number;
  issueCount: number;
  unpaired: boolean;
  review?: StatementContractReview;
};

export type ReviewFilter = "all" | "issues" | "unpaired" | "increase" | "decrease" | "commission-error" | "higher" | "ok";

export const STATEMENT_REVIEW_FILTERS = [
  { key: "all", label: "Všechny", icon: null, tone: undefined },
  { key: "increase", label: "Navýšení", icon: TrendingUp, tone: "success" },
  { key: "decrease", label: "Ponížení", icon: TrendingDown, tone: "warning" },
  { key: "commission-error", label: "Špatná provize", icon: AlertCircle, tone: "error" },
  { key: "higher", label: "Vyšší provize", icon: TrendingUp, tone: "success" },
  { key: "ok", label: "Vše OK", icon: CheckCircle2, tone: "success" },
  { key: "issues", label: "K prověření", icon: AlertCircle, tone: "warning" },
  { key: "unpaired", label: "Bez propojení", icon: Link2Off, tone: undefined },
] as const;

const STATUS_ORDER: Record<StatementReviewStatus, number> = {
  "commission-error": 0, issues: 1, increase: 2, decrease: 3, higher: 4, ok: 5, corrected: 6, review: 7, unpaired: 8,
};
export function sortStatementBrowserItems<T extends StatementBrowserItem>(items: T[]): T[] {
  const status = (item: T) => item.review?.status ?? (item.unpaired ? "unpaired" : item.issueCount > 0 ? "issues" : "review");
  return [...items].sort((left, right) => STATUS_ORDER[status(left)] - STATUS_ORDER[status(right)]);
}

export const normalizeStatementSearch = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs-CZ").trim();

export function filterStatementBrowserItems<T extends StatementBrowserItem>(items: T[], query: string, filter: ReviewFilter): T[] {
  const terms = normalizeStatementSearch(query).split(/\s+/).filter(Boolean);
  return items.filter(item =>
    (filter !== "issues" || item.issueCount > 0 || item.review?.hasCommissionError || (item.review ? item.review.status === "unpaired" : item.unpaired)) &&
    (filter !== "unpaired" || (item.review ? item.review.status === "unpaired" : item.unpaired)) &&
    (filter !== "increase" && filter !== "decrease" || item.review?.premiumChange === filter) &&
    (filter !== "commission-error" || item.review?.hasCommissionError === true) &&
    (filter !== "higher" || item.review?.hasHigherCommission === true) &&
    (filter !== "ok" || item.review?.verified === true) &&
    terms.every(term => normalizeStatementSearch(item.searchText).includes(term))
  );
}

const BrowserContext = createContext<{ visibleKeys: ReadonlySet<string>; reviews: ReadonlyMap<string, StatementContractReview> } | null>(null);

export function useStatementBrowserReview(key: string) {
  return useContext(BrowserContext)?.reviews.get(key);
}

export function useStatementBrowserItems<T extends StatementBrowserItem>(items: T[]) {
  const browser = useContext(BrowserContext);
  const enriched = items.map(item => ({ ...item, review: browser?.reviews.get(item.key) ?? item.review }));
  return {
    items: sortStatementBrowserItems(browser ? enriched.filter(item => browser.visibleKeys.has(item.key)) : enriched),
    inBrowser: browser !== null,
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
  const reviews = new Map(items.flatMap(item => item.review ? [[item.key, item.review] as const] : []));
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
          {STATEMENT_REVIEW_FILTERS.map(({ key, label, icon: Icon, tone }) => (
            <button key={key} type="button" data-tone={tone} aria-pressed={filter === key} aria-controls={resultsId} onClick={() => setFilter(key)}>
              {Icon && <Icon size={15} aria-hidden="true" />}{label} <span>{filterStatementBrowserItems(items, "", key).length}</span>
            </button>
          ))}
        </div>
        <label className={styles.browserSearch}><Search size={17} aria-hidden="true" /><input type="search" aria-label="Hledat ve všech vlastních smlouvách" aria-controls={resultsId} placeholder="Hledat jméno, číslo smlouvy, produkt…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      </div>
      <div className={styles.browserResult} role="status" aria-live="polite" aria-atomic="true">
        <span>{filtered ? `Zobrazeno ${visible.length} z ${items.length} smluv` : statementContractCount(items.length)}<span> · Provize {formatMoney(visible.reduce((sum, item) => sum + item.amount, 0))} Kč</span></span>
        {filtered && <button type="button" onClick={reset}><X size={13} aria-hidden="true" />Zrušit filtry</button>}
      </div>
      <div id={resultsId}>
        <BrowserContext.Provider value={{ visibleKeys, reviews }}>
          <div key={`${query}\u0000${filter}`}>{children}</div>
        </BrowserContext.Provider>
        {visible.length === 0 && <div className={styles.browserEmpty}><Search size={24} aria-hidden="true" /><strong>{items.length === 0 ? "V tomto výpisu nejsou vlastní smlouvy." : "Žádná smlouva neodpovídá výběru."}</strong><p>{items.length === 0 ? "Další položky výpisu najdeš níže, například v provizích manažera." : "Zkus jiné jméno, číslo smlouvy nebo zobraz všechny smlouvy."}</p>{filtered && <button type="button" className={styles.secondaryButton} onClick={reset}>Zobrazit všechny smlouvy</button>}</div>}
      </div>
    </section>
  );
}
