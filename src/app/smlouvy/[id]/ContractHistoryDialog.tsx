"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ArrowRightLeft, ChevronDown, Clock3, FileText, History, Loader2, MessageSquare, Paperclip, UserRound, X } from "lucide-react";
import type { ContractHistoryEvent, ContractHistoryPage } from "@/app/lib/contractHistory";
import styles from "./contractHistory.module.css";

type Props = {
  ownerEmail: string;
  entryId: string;
  contractNumber: string;
  management: ReactNode;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  onClose: () => void;
};

const icons = { created: FileText, updated: History, transfer: ArrowRightLeft, note: MessageSquare, attachment: Paperclip, review: Clock3, legacy: Clock3 };
function Event({ event }: { event: ContractHistoryEvent }) {
  const Icon = icons[event.kind] ?? History;
  return <li className={styles.event}>
    <span className={`${styles.eventIcon} ${event.kind === "transfer" ? styles.transfer : ""}`}><Icon size={16} aria-hidden="true" /></span>
    <div className={styles.eventBody}>
      <div className={styles.eventHeading}><h3>{event.title}</h3><time dateTime={event.atMs === null ? undefined : new Date(event.atMs).toISOString()}>{event.atMs === null ? "Starší záznam" : new Date(event.atMs).toLocaleString("cs-CZ", { dateStyle: "medium", timeStyle: "short" })}</time></div>
      <p className={styles.actor}>{event.actorEmail ?? (event.kind === "legacy" ? "Dříve uložené údaje" : "Automaticky · systém")}</p>
      {event.changes.length > 0 && <details className={styles.changes} open={event.kind === "transfer"}>
        <summary><span>{event.changes.length === 1 ? event.changes[0].label : `Podrobnosti · ${event.changes.length}`}</span><ChevronDown size={14} aria-hidden="true" /></summary>
        <dl>{event.changes.map((change, index) => <div className={styles.change} key={`${index}-${change.label}`}>
          <dt>{change.label}</dt>
          <dd><span className={styles.before}>{change.before ?? "—"}</span><ArrowRight size={13} aria-label="změněno na" /><span className={styles.after}>{change.after ?? "—"}</span></dd>
        </div>)}</dl>
      </details>}
    </div>
  </li>;
}

export function ContractHistoryDialog({ ownerEmail, entryId, contractNumber, management, request, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"history" | "management">("history");
  const [events, setEvents] = useState<ContractHistoryEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (next: string | null) => {
    const current = ++generation.current;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ ownerEmail, entryId });
      if (next) params.set("cursor", next);
      const page = await request<ContractHistoryPage>(`/api/contracts/history?${params}`);
      if (generation.current !== current) return;
      setEvents(previous => next ? [...previous, ...page.events.filter(event => !previous.some(old => old.id === event.id))] : page.events);
      setCursor(page.nextCursor);
    } catch (err) {
      if (generation.current === current) setError(err instanceof Error ? err.message : "Historii se nepodařilo načíst.");
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [ownerEmail, entryId, request]);

  useEffect(() => { const pending = generation; void load(null); return () => { pending.current++; }; }, [load]);
  useEffect(() => {
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = "hidden";
    return () => {
      dialog?.close(); document.body.style.overflow = overflow;
      document.querySelector<HTMLButtonElement>("[data-contract-menu]")?.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="contract-history-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
    <header className={styles.header}>
      <span className={styles.headerIcon}><History size={23} aria-hidden="true" /></span>
      <div><p>Smlouva {contractNumber || "bez čísla"}</p><h2 id="contract-history-title">Historie a správa</h2></div>
      <button type="button" className={styles.close} aria-label="Zavřít historii" onClick={onClose}><X size={19} aria-hidden="true" /></button>
    </header>
    <div className={styles.tabs} aria-label="Obsah historie a správy">
      <button type="button" aria-pressed={tab === "history"} onClick={() => setTab("history")}><History size={16} aria-hidden="true" />Historie změn</button>
      <button type="button" aria-pressed={tab === "management"} onClick={() => setTab("management")}><UserRound size={16} aria-hidden="true" />Správa smlouvy</button>
    </div>
    <div className={styles.content}>
      {tab === "management" ? <div className={styles.management}>{management}</div> : <>
        <p className={styles.intro}>Záznamy zůstávají u smlouvy i při změně správce.</p>
        {events.length > 0 && <ol className={styles.timeline}>{events.map(event => <Event key={event.id} event={event} />)}</ol>}
        {loading && <div className={styles.state} role="status"><Loader2 size={20} className={styles.spinner} aria-hidden="true" />Načítám historii…</div>}
        {error && <div className={styles.error} role="alert"><p>{error}</p><button type="button" onClick={() => void load(events.length ? cursor : null)}>Zkusit znovu</button></div>}
        {!loading && !error && !events.length && <div className={styles.empty}><Clock3 size={28} aria-hidden="true" /><h3>Zatím bez záznamů</h3><p>Další úpravy smlouvy se tady uloží s datem a autorem změny.</p></div>}
        {!loading && !error && cursor && <button type="button" className={styles.more} onClick={() => void load(cursor)}>Načíst starší záznamy<ChevronDown size={15} aria-hidden="true" /></button>}
        <p className={styles.footnote}>U starších smluv jsou dostupné dříve uložené záznamy. Změny před zavedením historie nelze zpětně doplnit.</p>
      </>}
    </div>
    <footer className={styles.footer}><span><FileText size={14} aria-hidden="true" />Historie této smlouvy</span><button type="button" onClick={onClose}>Hotovo</button></footer>
  </dialog>;
}
