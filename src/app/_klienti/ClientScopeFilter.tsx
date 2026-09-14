"use client";

import styles from "./clientDirectory.module.css";
import { useState, type ReactNode } from "react";
import { ChevronDown, Search, UserRound, UsersRound } from "lucide-react";
import type { ClientAdviser } from "./clientCardHelpers";
import type { ClientScopeSelection } from "./clientScope";
import { normalizeClientSearch } from "./clientIdentity";

export function ClientScopeFilter({ value, advisers, onChange, children }: {
  value: ClientScopeSelection;
  advisers: ClientAdviser[];
  onChange: (selection: ClientScopeSelection) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const words = normalizeClientSearch(query).split(/\s+/).filter(Boolean);
  const visibleAdvisers = advisers.filter((adviser) => words.every((word) => normalizeClientSearch(`${adviser.name ?? ""} ${adviser.email}`).includes(word)))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "cs-CZ"));
  return <div className={styles.scopeFilter}>
    <div className={styles.searchRow}>
      {children}
      <div role="group" aria-label="Rozsah klientů" className={styles.scopeButtons}>
        {([{ scope: "my", label: "Moji klienti", icon: UserRound }, { scope: "team", label: "Týmoví klienti", icon: UsersRound }] as const).map((item) => (
          <button key={item.scope} type="button" aria-pressed={value.scope === item.scope} onClick={() => onChange({ ...value, scope: item.scope })}
            className={styles.scopeButton}>
            <item.icon aria-hidden="true" className="h-4 w-4" />{item.label}
          </button>
        ))}
      </div>
    </div>
    <div className={styles.scopeBar}>
      <p className={styles.scopeDescription}>{value.scope === "my" ? "Klienti, kterým jsi osobně sjednal alespoň jednu smlouvu." : "Klienti se smlouvami sjednanými vybranými poradci z tvého týmu."}</p>
      {value.scope === "team" && advisers.length > 0 && <button type="button" aria-expanded={open} aria-controls="client-adviser-filter" onClick={() => setOpen((current) => !current)}
        className={styles.adviserButton}>
        <UsersRound aria-hidden="true" className="h-4 w-4" />{value.advisers.length ? `Vybraní poradci: ${value.advisers.length}` : "Všichni poradci"}
        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>}
    </div>
    {value.scope === "team" && open && advisers.length > 0 && <fieldset id="client-adviser-filter" className={styles.adviserPanel}>
      <legend >Poradci v týmu</legend>
      <div className={styles.adviserSearch}>
        <label ><span className="sr-only">Hledat poradce</span><Search aria-hidden="true" size={15} />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hledat poradce…"  />
        </label>
        <button type="button" onClick={() => onChange({ scope: "team", advisers: [] })} >Zobrazit celý tým</button>
      </div>
      <div className={styles.adviserOptions}>
        {visibleAdvisers.map((adviser) => <label key={adviser.email} className={styles.adviserOption}>
          <input type="checkbox" checked={value.advisers.includes(adviser.email)} onChange={(event) => onChange({ scope: "team", advisers: event.target.checked ? [...value.advisers, adviser.email] : value.advisers.filter((email) => email !== adviser.email) })}  />
          <span className="min-w-0"><span className={styles.adviserName}>{adviser.name || adviser.email}</span>{adviser.name && <span className={styles.adviserEmail}>{adviser.email}</span>}</span>
        </label>)}
      </div>
      {!visibleAdvisers.length && <p className={styles.adviserEmpty}>Žádný poradce neodpovídá hledání.</p>}
    </fieldset>}
  </div>;
}
