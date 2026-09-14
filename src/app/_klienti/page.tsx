"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { User } from "firebase/auth";
import { AlertCircle, ArrowDownUp, ArrowRight, Check, ChevronLeft, ChevronRight, FileText, Phone, Plus, RefreshCw, Search, SearchX, UsersRound, X } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { ClientSession } from "./ClientSession";
import styles from "./clientDirectory.module.css";
import { ClientDirectoryLoader } from "./ClientDirectoryLoader";
import { ClientRow } from "./ClientRow";
import { ClientScopeFilter } from "./ClientScopeFilter";
import { clientScopeQuery, readClientScope, selectClientContracts, type ClientScopeSelection } from "./clientScope";
import { buildClientDirectory, filterClientDirectory, type ClientCardSummary, type ClientFilter, type ClientSort } from "./clientDirectory";
import { loadClientContracts } from "./loadClientContracts";
import type { ClientAdviser, ClientContractItem } from "./clientCardHelpers";

const PAGE_SIZE = 24;
const FILTERS: { value: ClientFilter; label: string }[] = [
  { value: "all", label: "Všichni" }, { value: "active", label: "S aktivní smlouvou" },
  { value: "archived", label: "Pouze archiv" }, { value: "missing-contact", label: "Chybí kontakt" },
  { value: "review", label: "Ke kontrole" },
];

export default function ClientsPage() {
  return <ClientSession>{(user) => <ClientDirectory user={user} />}</ClientSession>;
}

function ClientDirectory({ user }: { user: User }) {
  const [contracts, setContracts] = useState<ClientContractItem[]>([]);
  const [cards, setCards] = useState<ClientCardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [sort, setSort] = useState<ClientSort>("name");
  const searchParams = useSearchParams();
  const [selection, setSelection] = useState(() => readClientScope(searchParams));
  const [teamAdvisers, setTeamAdvisers] = useState<ClientAdviser[]>([]);
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLElement>(null);
  const scopeQuery = clientScopeQuery(selection);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setProgress(0);
    setError("");
    const load = async () => {
      try {
        const [items, saved] = await Promise.all([
          loadClientContracts(user, controller.signal, setProgress, setTeamAdvisers, { selection: readClientScope(new URLSearchParams(scopeQuery)) }),
          fetchAuthedJsonOrThrow<{ ok: true; cards: ClientCardSummary[] }>(user, "/api/client-cards", { signal: controller.signal }),
        ]);
        controller.signal.throwIfAborted();
        if (!saved?.ok || !Array.isArray(saved.cards)) throw new Error();
        setContracts(items);
        setCards(saved.cards);
      } catch {
        if (!controller.signal.aborted) {
          setContracts([]);
          setCards([]);
          setError("Klienty se nepodařilo načíst. Zkus to prosím znovu.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [user, reload, scopeQuery]);

  useEffect(() => {
    const refresh = () => setReload((value) => value + 1);
    window.addEventListener("contracts:updated", refresh);
    return () => window.removeEventListener("contracts:updated", refresh);
  }, []);

  const ownEmail = user.email?.trim().toLowerCase() ?? "";
  const scoped = useMemo(() => buildClientDirectory(selectClientContracts(contracts, ownEmail, selection, teamAdvisers), cards), [contracts, cards, ownEmail, selection, teamAdvisers]);
  const changeScope = (next: ClientScopeSelection) => {
    setSelection(next);
    setPage(1);
    window.history.replaceState(null, "", `/klienti?${clientScopeQuery(next)}`);
  };
  const hasFilters = Boolean(search.trim() || filter !== "all" || (selection.scope === "team" && selection.advisers.length));
  const visible = useMemo(() => filterClientDirectory(scoped, search, filter, sort), [scoped, search, filter, sort]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const activeCount = scoped.filter((client) => client.activeCount > 0).length;
  const missingCount = scoped.filter((client) => !client.phone || !client.email).length;
  const reviewCount = scoped.filter((client) => client.contactConflicts.length > 0).length;
  const reset = () => { setSearch(""); setFilter("all"); changeScope({ ...selection, advisers: [] }); };
  const changePage = (next: number) => {
    setPage(next);
    listRef.current?.scrollIntoView({ block: "start" });
  };

  const filterCounts: Record<ClientFilter, number> = { all: scoped.length, active: activeCount, archived: scoped.length - activeCount, "missing-contact": missingCount, review: reviewCount };
  const chooseFilter = (next: ClientFilter) => { setFilter(next); setPage(1); };

  return (
    <AppLayout active="clients">
      <div className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}><UsersRound size={13} aria-hidden="true" /> Klientská agenda</p>
              <h1>Klienti</h1>
              <p className={styles.description}>Tvoji klienti, jejich kontakty a smlouvy. Všechno na jednom místě.</p>
            </div>
            <div className={styles.headerActions}>
              <button type="button" onClick={() => setReload((value) => value + 1)} disabled={loading} className={styles.refresh}>
                <RefreshCw size={15} aria-hidden="true" className={loading ? "animate-spin" : ""} /> Obnovit
              </button>
              <Link href="/kalkulacka" className={styles.addContract}><Plus size={16} aria-hidden="true" /> Přidat smlouvu</Link>
            </div>
          </header>

          <div className={styles.stats}>
            {([
              { label: "Klientů celkem", value: scoped.length, icon: UsersRound, tone: "purple", filter: "all" },
              { label: "S aktivní smlouvou", value: activeCount, icon: FileText, tone: "green", filter: "active" },
              { label: "Chybí telefon či e-mail", value: missingCount, icon: Phone, tone: "blue", filter: "missing-contact" },
              { label: "Kontakty ke kontrole", value: reviewCount, icon: AlertCircle, tone: "amber", filter: "review" },
            ] as const).map((stat, index) => (
              <button key={stat.label} type="button" className={`${styles.stat} ${index === 0 ? styles.statFeatured : ""}`} disabled={loading || Boolean(error)} aria-pressed={filter === stat.filter} onClick={() => chooseFilter(stat.filter)}>
                <span className={styles.statTop}>
                  <span className={styles.statValue}>{loading ? <span className={styles.statSkeleton} aria-label="Načítání" /> : error ? "—" : stat.value}</span>
                  <span className={styles.statIcon} data-tone={stat.tone}><stat.icon size={16} aria-hidden="true" /></span>
                </span>
                <span className={styles.statLabel}>{stat.label}</span>
              </button>
            ))}
          </div>

          <section ref={listRef} aria-label="Seznam klientů" className={styles.panel}>
            <div className={styles.toolbar}>
              <ClientScopeFilter value={selection} advisers={teamAdvisers} onChange={changeScope}>
                <div className={styles.search}>
                  <Search size={18} aria-hidden="true" />
                  <label htmlFor="clients-search" className="sr-only">Hledat klienta</label>
                  <input id="clients-search" type="search" autoComplete="off" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Jméno, telefon, e-mail nebo číslo smlouvy…" />
                  {search && <button type="button" onClick={() => { setSearch(""); setPage(1); }} aria-label="Vymazat hledání" className={styles.searchClear}><X size={16} /></button>}
                </div>
              </ClientScopeFilter>
              <div className={styles.filterBar}>
                <div className={styles.filters}>
                  {FILTERS.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => chooseFilter(item.value)} className={styles.filter}>
                    {item.label}{!loading && !error && <span className={styles.filterCount}>{filterCounts[item.value]}</span>}
                  </button>)}
                </div>
                <label className={styles.sort}><ArrowDownUp size={13} aria-hidden="true" /><span className="sr-only">Řazení klientů</span><select value={sort} onChange={(event) => { setSort(event.target.value as ClientSort); setPage(1); }}><option value="name">Podle jména A–Z</option><option value="contracts">Nejvíce smluv</option><option value="recent">Nejnovější smlouva</option></select></label>
              </div>
            </div>

            <div className={styles.resultsBar}>
              <p role="status" aria-live="polite">{loading ? "Načítání portfolia" : error ? "Načtení se nezdařilo" : <>Nalezeno <strong>{visible.length}</strong> z {scoped.length} klientů</>}</p>
              <span className={styles.syncNote}><Check size={12} aria-hidden="true" /> Automaticky ze smluv</span>
            </div>

            {loading ? <ClientDirectoryLoader loadedContracts={progress} />
              : error ? <div role="alert" className={styles.empty}><AlertCircle size={30} /><p>{error}</p><button type="button" onClick={() => setReload((value) => value + 1)}>Zkusit znovu</button></div>
              : visible.length ? <><div className={styles.columnHead} aria-hidden="true"><span>Klient</span><span>Kontaktní údaje</span><span>Smlouvy</span></div><div>{visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((client) => <ClientRow key={client.slug} client={client} query={clientScopeQuery(selection)} />)}</div></>
              : <div className={styles.empty}><SearchX size={36} aria-hidden="true" /><h2>{hasFilters ? "Žádný klient neodpovídá hledání" : selection.scope === "my" ? "Zatím nemáš vlastní klienty" : "Žádní týmoví klienti"}</h2><p>{hasFilters ? "Zkus část jména nebo změň vybrané filtry a poradce." : selection.scope === "my" ? "Tady se objeví klienti, kterým osobně sjednáš smlouvu." : "Klienti se objeví, jakmile poradci ve tvém týmu sjednají smlouvy."}</p>{hasFilters ? <button type="button" onClick={reset}>Vymazat hledání a filtry</button> : selection.scope === "my" ? <Link href="/kalkulacka">Přidat smlouvu <ArrowRight size={15} /></Link> : null}</div>}

            {!loading && !error && pages > 1 && <div className={styles.pagination}><span>Strana {currentPage} z {pages}</span><div><button type="button" aria-label="Předchozí strana" disabled={currentPage <= 1} onClick={() => changePage(currentPage - 1)}><ChevronLeft size={16} /></button><button type="button" aria-label="Další strana" disabled={currentPage >= pages} onClick={() => changePage(currentPage + 1)}><ChevronRight size={16} /></button></div></div>}
          </section>
          <p className={styles.footnote}><Check size={14} aria-hidden="true" />Jména s titulem i bez něj patří do společné karty. U shodných jmen s různými kontakty doporučujeme ověřit, zda jde o stejnou osobu.</p>
        </div>
      </div>
    </AppLayout>
  );
}
