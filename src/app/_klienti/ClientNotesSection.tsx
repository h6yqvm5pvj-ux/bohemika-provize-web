"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "firebase/auth";
import styles from "./clientCard.module.css";
import { BellRing, CalendarDays, ChevronDown, History, LoaderCircle, Pencil, Phone, Plus, StickyNote, Trash2 } from "lucide-react";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  CLIENT_NOTE_KINDS, CLIENT_NOTE_MAX_LENGTH, clientNoteDefaultDate, clientNoteReminderAt,
  clientNoteReminderDate, isClientNoteId, type ClientNote, type ClientNoteKind, type ClientNotesResponse,
} from "./clientNotes";

type Editor = { id: string; revision: number; text: string; kind: ClientNoteKind; reminderEnabled: boolean; date: string };
const timestamp = (ms: number) => new Intl.DateTimeFormat("cs-CZ", {
  timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(ms);
const reminderDay = (ms: number) => new Intl.DateTimeFormat("cs-CZ", {
  timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric",
}).format(ms);
const mergeNotes = (notes: ClientNote[]) => [...new Map(notes.map(note => [note.id, note])).values()]
  .sort((a, b) => b.createdAtMs - a.createdAtMs || b.id.localeCompare(a.id));
const smallButton = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-40";
const primaryButton = styles.primaryButton;
const inputClass = styles.fieldInput;

export function ClientNotesSection({ user, slug, clientName }: { user: User; slug: string; clientName: string }) {
  const params = useSearchParams();
  const requestedNote = params.get("noteId");
  const linkedNoteId = isClientNoteId(requestedNote) ? requestedNote : null;
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const [expanded, setExpanded] = useState(Boolean(linkedNoteId));
  const [missingLinkedNote, setMissingLinkedNote] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const linkedRef = useRef<HTMLElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const endpoint = `/api/client-cards/${encodeURIComponent(slug)}/notes`;

  useEffect(() => {
    const controller = new AbortController();
    requestController.current = controller;
    return () => controller.abort();
  }, [endpoint, user]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchAuthedJsonOrThrow<ClientNotesResponse>(user,
      `${endpoint}${linkedNoteId ? `?noteId=${encodeURIComponent(linkedNoteId)}` : ""}`,
      { signal: controller.signal },
    ).then(response => {
      if (controller.signal.aborted) return;
      setNotes(mergeNotes([...response.notes, ...(response.focusedNote ? [response.focusedNote] : [])]));
      setNextCursor(response.nextCursor);
      setMissingLinkedNote(Boolean(linkedNoteId && !response.focusedNote));
      setLoaded(true);
      if (linkedNoteId) setExpanded(true);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Historii jednání se nepodařilo načíst. Zkus to znovu.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, user, linkedNoteId, reload]);

  useEffect(() => {
    if (!loading && expanded && linkedNoteId && linkedRef.current) {
      linkedRef.current.scrollIntoView?.({ block: "center", behavior: "instant" });
      linkedRef.current.focus({ preventScroll: true });
    }
  }, [loading, expanded, linkedNoteId]);

  useEffect(() => { if (editor) editorRef.current?.focus(); }, [editor?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!editor) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [editor]);

  const startEditor = (note?: ClientNote) => {
    setEditor(note ? {
      id: note.id, revision: note.revision, text: note.text, kind: note.kind,
      reminderEnabled: note.reminderEnabled, date: clientNoteReminderDate(note.reminderAtMs) || clientNoteDefaultDate(),
    } : { id: crypto.randomUUID(), revision: 0, text: "", kind: "note", reminderEnabled: false, date: clientNoteDefaultDate() });
    setDeleteId(null); setError(null); setStatus(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editor || busy) return;
    if (!editor.text.trim()) { setError("Napiš text zápisu."); return; }
    const reminderAtMs = editor.reminderEnabled ? clientNoteReminderAt(editor.date) : null;
    if (editor.reminderEnabled && (reminderAtMs == null || reminderAtMs <= Date.now())) {
      setError("Vyber budoucí datum připomínky."); return;
    }
    setBusy(true); setError(null); setStatus(null);
    const signal = requestController.current?.signal;
    try {
      const response = await fetchAuthedJsonOrThrow<{ ok: true; note: ClientNote }>(user, endpoint, {
        method: editor.revision === 0 ? "POST" : "PATCH", signal,
        body: JSON.stringify({ noteId: editor.id, expectedRevision: editor.revision, clientName,
          kind: editor.kind, text: editor.text.trim(), reminderEnabled: editor.reminderEnabled, reminderAtMs }),
      });
      if (signal?.aborted) return;
      setNotes(current => mergeNotes([...current, response.note]));
      setStatus(editor.reminderEnabled ? "Zápis a připomínka byly uloženy." : "Zápis byl uložen.");
      setEditor(null);
    } catch (error) {
      if (!signal?.aborted) setError(error instanceof Error ? error.message : "Zápis se nepodařilo uložit.");
    } finally { if (!signal?.aborted) setBusy(false); }
  };

  const remove = async (note: ClientNote) => {
    if (busy) return;
    setBusy(true); setError(null); setStatus(null);
    const signal = requestController.current?.signal;
    try {
      await fetchAuthedJsonOrThrow(user, endpoint, { method: "DELETE", signal,
        body: JSON.stringify({ noteId: note.id, expectedRevision: note.revision }),
      });
      if (signal?.aborted) return;
      setNotes(current => current.filter(item => item.id !== note.id));
      setDeleteId(null); setStatus("Zápis byl smazán včetně případné připomínky.");
    } catch (error) {
      if (!signal?.aborted) setError(error instanceof Error ? error.message : "Zápis se nepodařilo smazat.");
    } finally { if (!signal?.aborted) setBusy(false); }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true); setError(null);
    const signal = requestController.current?.signal;
    try {
      const response = await fetchAuthedJsonOrThrow<ClientNotesResponse>(user, `${endpoint}?before=${encodeURIComponent(nextCursor)}`, { signal });
      if (signal?.aborted) return;
      setNotes(current => mergeNotes([...current, ...response.notes]));
      setNextCursor(response.nextCursor);
    } catch { if (!signal?.aborted) setError("Starší zápisy se nepodařilo načíst. Zkus to znovu."); }
    finally { if (!signal?.aborted) setLoadingMore(false); }
  };

  const visibleNotes = expanded ? notes : notes.slice(0, 3);
  const deliveryAt = editor ? clientNoteReminderAt(editor.date) : null;
  const deliveryTime = deliveryAt ? new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit",
  }).format(deliveryAt) : "ráno";

  return <section id="client-notes" aria-labelledby="client-notes-title" className={`${styles.panel} ${styles.notes}`}>
    <div className={`${styles.panelHeader} ${styles.notesHeader}`}>
      <div className={styles.sectionTitle}>
        <span className={styles.sectionIcon}><History size={20} aria-hidden="true" /></span>
        <div><h2 id="client-notes-title">Historie jednání</h2>
          <p>Tvoje poznámky a připomínky</p></div>
      </div>
      <button type="button" disabled={!loaded || loading || busy || Boolean(editor)} onClick={() => startEditor()} className={primaryButton}><Plus size={16} aria-hidden="true" />Přidat zápis</button>
    </div>
    <div className={styles.notesBody}>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
        <p>{error}</p><button type="button" disabled={busy || loading} className={`${smallButton} mt-1 underline`} onClick={() => setReload(value => value + 1)}>Načíst historii znovu</button>
      </div>}
      {status && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>}
      {missingLinkedNote && <p role="status" className="text-sm text-slate-600">Zápis z notifikace už není dostupný v této kartě.</p>}
      {editor && <form onSubmit={save} className={`${styles.noteForm} space-y-3`} aria-label={editor.revision ? "Upravit zápis" : "Nový zápis"}>
        <label className="block max-w-xs text-xs font-semibold text-slate-700">Typ zápisu
          <select value={editor.kind} disabled={busy} onChange={event => setEditor({ ...editor, kind: event.target.value as ClientNoteKind })} className={`${inputClass} mt-1`}>
            {Object.entries(CLIENT_NOTE_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-700">Text zápisu
          <textarea ref={editorRef} value={editor.text} rows={4} maxLength={CLIENT_NOTE_MAX_LENGTH} required disabled={busy}
            onChange={event => setEditor({ ...editor, text: event.target.value })} className={`${inputClass} mt-1 resize-y`}
            placeholder="Co jste řešili a na čem jste se domluvili…" />
        </label>
        <p className="text-right text-xs tabular-nums text-slate-500">{editor.text.length} / {CLIENT_NOTE_MAX_LENGTH}</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={editor.reminderEnabled} disabled={busy} onChange={event => setEditor({ ...editor, reminderEnabled: event.target.checked })} className="h-4 w-4 accent-violet-600" />
            <BellRing size={16} aria-hidden="true" />Připomenout
          </label>
          {editor.reminderEnabled && <label className="text-xs font-semibold text-slate-700">Datum připomínky
            <input type="date" required disabled={busy} value={editor.date} onChange={event => setEditor({ ...editor, date: event.target.value })} className={`${inputClass} mt-1`} />
          </label>}
        </div>
        {editor.reminderEnabled && <p className="text-xs leading-5 text-slate-600">Ve vybraný den přibližně v {deliveryTime} přijde připomínka do Pošty a při povolených push notifikacích také na zařízení. Otevře tuto kartu u zápisu.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={() => { setEditor(null); setError(null); }} className={`${smallButton} text-slate-600 hover:bg-white`}>Zrušit</button>
          <button type="submit" disabled={busy || loading} className={primaryButton}>{busy && <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}{busy ? "Ukládám…" : "Uložit zápis"}</button>
        </div>
      </form>}
      {loading ? <p role="status" className={styles.loading}><LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Načítám historii jednání…</p>
        : loaded && !notes.length && !editor ? <div className={styles.notesEmpty}><StickyNote size={28} strokeWidth={1.3} aria-hidden="true" /><strong>Zatím žádné zápisy</strong><p>Zapiš, co jste řešili, a naplánuj další kontakt s klientem.</p></div> : null}
      {!loading && notes.length > 0 && <div className={styles.timeline}>
        {visibleNotes.map(note => {
          const Icon = note.kind === "call" ? Phone : note.kind === "meeting" ? CalendarDays : StickyNote;
          const linked = note.id === linkedNoteId;
          return <article key={note.id} ref={linked ? linkedRef : undefined} tabIndex={linked ? -1 : undefined}
            className={`${styles.note} ${linked ? styles.linkedNote : ""}`}>
            <span className={styles.noteIcon} data-kind={note.kind}><Icon size={13} strokeWidth={1.8} aria-hidden="true" /></span>
            <div className={styles.noteContent}>
              <div className={styles.noteHeading}>
                <span className={styles.noteKind}>{CLIENT_NOTE_KINDS[note.kind]}</span>
                <div className={styles.noteActions}>
                  <button type="button" title="Upravit zápis" aria-label="Upravit zápis" disabled={busy || Boolean(editor)} onClick={() => startEditor(note)} className={styles.iconButton}><Pencil size={12} aria-hidden="true" /></button>
                  <button type="button" title="Smazat zápis" aria-label="Smazat zápis" disabled={busy || Boolean(editor)} onClick={() => { setDeleteId(note.id); setError(null); }} className={styles.iconButton}><Trash2 size={12} aria-hidden="true" /></button>
                </div>
              </div>
              <div className={styles.noteMeta}>
                <time dateTime={new Date(note.createdAtMs).toISOString()}>{timestamp(note.createdAtMs)}</time>
                <span className="break-all">· {note.authorEmail === user.email ? "Ty" : note.authorEmail}</span>
              </div>
              {linked && <span className={styles.linkedBadge}>Otevřeno z notifikace</span>}
              <p className={styles.noteText}>{note.text}</p>
              {note.updatedAtMs > note.createdAtMs && <p className={styles.noteEdited}>Upraveno {timestamp(note.updatedAtMs)}</p>}
              {note.reminderEnabled && note.reminderAtMs != null ? <span className={styles.reminder}><BellRing size={12} aria-hidden="true" />Připomenout {reminderDay(note.reminderAtMs)}</span>
                : note.reminderSentAtMs != null ? <span className={styles.reminder} data-sent="true"><BellRing size={12} aria-hidden="true" />Připomenuto {reminderDay(note.reminderSentAtMs)}</span> : null}
            {deleteId === note.id && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 p-3">
              <p className="mr-auto text-xs font-semibold text-rose-800">Smazat zápis i případnou připomínku?</p>
              <button type="button" disabled={busy} onClick={() => setDeleteId(null)} className={`${smallButton} text-slate-600`}>Zrušit</button>
              <button type="button" disabled={busy} onClick={() => void remove(note)} className={`${smallButton} bg-rose-600 text-white hover:bg-rose-700`}>{busy ? "Mažu…" : "Smazat"}</button>
            </div>}
            </div>
          </article>;
        })}
      </div>}
      {!loading && (notes.length > 3 || nextCursor) && <div className={styles.notesFooter}>
        <button type="button" onClick={() => setExpanded(value => !value)} className={styles.textButton}><ChevronDown size={15} className={expanded ? "rotate-180" : ""} aria-hidden="true" />{expanded ? "Zobrazit jen poslední zápisy" : "Zobrazit historii"}</button>
        {expanded && nextCursor && <button type="button" disabled={loadingMore || busy} onClick={() => void loadMore()} className={styles.textButton}>{loadingMore ? "Načítám…" : "Načíst starší zápisy"}</button>}
      </div>}
    </div>
  </section>;
}
