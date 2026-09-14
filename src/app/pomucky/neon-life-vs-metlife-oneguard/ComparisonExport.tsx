"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { ChevronLeft, ChevronRight, FileDown, Loader2, Pin, Search, UserRound, X } from "lucide-react";
import { auth } from "@/app/firebase-auth";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import { useEffectiveUserEmail } from "@/app/lib/useAdminImpersonation";
import type { ComparisonRow } from "./comparisonData";
import { reportAdvisorFromProfile, type ReportAdvisor } from "./comparisonReportContent";
import { EMPTY_PERSONALIZATION, PERSONALIZATION_LIMITS, normalizeComparisonPersonalization, prioritizeComparisonRows, type ComparisonPersonalization } from "./comparisonPersonalization";
import styles from "./comparison.module.css";

type ExportProps = { rows: ComparisonRow[]; visibleRows: ComparisonRow[]; filterLabel: string };
type SessionProps = ExportProps & { user: User | null; effectiveEmail: string };
type ExportDraft = { selectedIds: string[]; pinnedIds: string[]; personalization: ComparisonPersonalization };
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs");

function ExportDialog({ rows, visibleRows, filterLabel, user, effectiveEmail, draft, setDraft, onClose }: SessionProps & {
  draft: ExportDraft; setDraft: (draft: ExportDraft) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<"topics" | "client">("topics");
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<{ advisor?: ReportAdvisor; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const exporting = useRef(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const selected = prioritizeComparisonRows(rows.filter(row => draft.selectedIds.includes(row.id)), draft.pinnedIds);
  const pinned = selected.filter(row => draft.pinnedIds.includes(row.id));
  const searchWords = normalizeSearch(search).trim().split(/\s+/).filter(Boolean);
  const matchingRows = rows.filter(row => searchWords.every(word => normalizeSearch(row.searchText).includes(word)));

  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setProfile(null);
      if (!user) { setProfile({ error: "Pro načtení vizitky se přihlaste." }); return; }
      try {
        const payload = await getUserProfileCached(user, { force: retry > 0 });
        if (cancelled) return;
        if (!payload.profile) throw new Error("Profil poradce chybí.");
        setProfile({ advisor: reportAdvisorFromProfile(payload.profile, effectiveEmail, window.location.origin) });
      } catch {
        if (!cancelled) setProfile({ error: "Vizitku poradce se nepodařilo načíst." });
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [effectiveEmail, retry, user]);

  function selectTopics(ids: string[]) {
    setDraft({ ...draft, selectedIds: ids, pinnedIds: draft.pinnedIds.filter(id => ids.includes(id)) });
  }
  function togglePin(id: string) {
    const alreadyPinned = draft.pinnedIds.includes(id);
    setDraft({ ...draft,
      selectedIds: draft.selectedIds.includes(id) ? draft.selectedIds : [...draft.selectedIds, id],
      pinnedIds: alreadyPinned ? draft.pinnedIds.filter(value => value !== id) : [...draft.pinnedIds, id],
    });
  }
  function updatePersonalization(key: keyof ComparisonPersonalization, value: string) {
    setDraft({ ...draft, personalization: { ...draft.personalization, [key]: value } });
  }
  function changeStep(next: typeof step) {
    setStep(next); scrollRef.current?.scrollTo({ top: 0 });
  }

  async function download() {
    if (!profile?.advisor || !selected.length || exporting.current) return;
    setError("");
    let personalization: ComparisonPersonalization;
    try { personalization = normalizeComparisonPersonalization(draft.personalization); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Zkontrolujte údaje pro klienta."); changeStep("client"); return; }
    exporting.current = true; setBusy(true);
    try {
      const { downloadComparisonPdf } = await import("./comparisonPdf");
      await downloadComparisonPdf({ rows: selected.map(row => row.report), advisor: profile.advisor,
        pinnedTopicIds: pinned.map(row => row.id), personalization,
        scopeLabel: selected.length === rows.length ? `Úplné srovnání · ${rows.length} témat` : `Výběr témat · ${selected.length} z ${rows.length}`,
        origin: window.location.origin });
      onClose();
    } catch {
      setError("PDF se nepodařilo vytvořit. Zkuste stažení znovu.");
    } finally { exporting.current = false; setBusy(false); }
  }

  return <dialog ref={ref} className={styles.exportDialog} aria-labelledby="comparison-export-title" aria-describedby="comparison-export-description"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className={styles.exportHeader}>
      <span className={styles.exportIcon}><FileDown size={23} aria-hidden="true" /></span>
      <div><h2 id="comparison-export-title">Srovnání do PDF</h2><p id="comparison-export-description">Vyberte témata a připravte srovnání pro svého klienta.</p></div>
      <button type="button" className={styles.exportClose} onClick={onClose} disabled={busy} aria-label="Zavřít export PDF"><X size={20} /></button>
    </header>
    <div className={styles.exportSteps} role="tablist" aria-label="Příprava PDF">
      {([['topics', 'Témata a priority'], ['client', 'Pro klienta']] as const).map(([id, label], index) => <button key={id} type="button" role="tab" id={`export-tab-${id}`} aria-selected={step === id} aria-controls={`export-panel-${id}`} disabled={busy}
        onClick={() => changeStep(id)} onKeyDown={event => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault(); const next = event.key === "Home" ? "topics" : event.key === "End" ? "client" : step === "topics" ? "client" : "topics";
            changeStep(next); document.getElementById(`export-tab-${next}`)?.focus();
          }
        }} tabIndex={step === id ? 0 : -1}><span>{index + 1}</span>{label}</button>)}
    </div>
    <div className={styles.exportBody} ref={scrollRef}>
      <section role="tabpanel" id="export-panel-topics" aria-labelledby="export-tab-topics" hidden={step !== "topics"}>
        <p className={styles.selectionHint}>Zaškrtnutá témata se vloží se všemi detaily. Připnutá témata budou v PDF první.</p>
        <div className={styles.selectionActions}>
          <button type="button" onClick={() => selectTopics(rows.map(row => row.id))} disabled={busy}>Vybrat vše</button>
          <button type="button" onClick={() => selectTopics(visibleRows.map(row => row.id))} disabled={busy || !visibleRows.length} title={filterLabel}>Použít filtr ze srovnání ({visibleRows.length})</button>
          <button type="button" onClick={() => selectTopics([])} disabled={busy || !selected.length}>Zrušit výběr</button>
        </div>
        <div className={styles.topicSearch}><Search size={16} aria-hidden="true" /><input type="search" aria-label="Hledat téma pro PDF" placeholder="Hledat téma…" value={search} onChange={event => setSearch(event.target.value)} disabled={busy} /></div>
        <p className={styles.selectionCount} role="status">Vybráno {selected.length} z {rows.length} témat · Připnuto {pinned.length}</p>
        <ul className={styles.topicSelection} aria-label="Témata v PDF">
          {matchingRows.map(row => {
            const isSelected = draft.selectedIds.includes(row.id), isPinned = draft.pinnedIds.includes(row.id);
            return <li key={row.id} data-selected={isSelected} data-pinned={isPinned}>
              <label><input type="checkbox" checked={isSelected} disabled={busy} aria-label={`Zařadit do PDF: ${row.title}`} onChange={() => selectTopics(isSelected ? draft.selectedIds.filter(id => id !== row.id) : [...draft.selectedIds, row.id])} /><span>{row.title}{isPinned && <small>Důležité · na začátku PDF</small>}</span></label>
              <button type="button" className={styles.pinTopic} aria-pressed={isPinned} title={isPinned ? "Odepnout téma" : "Připnout na začátek PDF"} aria-label={`${isPinned ? "Odepnout" : "Připnout"} téma: ${row.title}`} onClick={() => togglePin(row.id)} disabled={busy}><Pin size={16} aria-hidden="true" /></button>
            </li>;
          })}
        </ul>
        {!matchingRows.length && <p className={styles.selectionHint}>Žádné téma neodpovídá hledání. Vybraná témata zůstávají zachována.</p>}
        {!selected.length && <p className={styles.exportError}>Pro stažení PDF vyberte alespoň jedno téma.</p>}
      </section>
      <section role="tabpanel" id="export-panel-client" aria-labelledby="export-tab-client" hidden={step !== "client"}>
        <div className={styles.personalizationHeading}><div><h3>Srovnání na míru</h3><p>Vše je volitelné. Vyplněné údaje budou součástí PDF.</p></div><button type="button" onClick={() => setDraft({ ...draft, personalization: { ...EMPTY_PERSONALIZATION } })} disabled={busy || !Object.values(draft.personalization).some(Boolean)}>Vymazat údaje</button></div>
        <fieldset className={styles.clientFields} disabled={busy} aria-label="Údaje pro klienta">
          <div className={styles.clientIdentityFields}>
            <label>Jméno klienta<input type="text" value={draft.personalization.clientName} maxLength={PERSONALIZATION_LIMITS.clientName} autoComplete="off" placeholder="Např. Jan Novák" onChange={event => updatePersonalization("clientName", event.target.value)} /></label>
            <label>Datum schůzky<input type="date" value={draft.personalization.meetingDate} min="1900-01-01" max="9999-12-31" onChange={event => updatePersonalization("meetingDate", event.target.value)} /></label>
          </div>
          <label>Co klient potřebuje řešit<textarea value={draft.personalization.clientNeeds} rows={3} maxLength={PERSONALIZATION_LIMITS.clientNeeds} placeholder="Např. zajištění příjmu při nemoci a ochrana rodiny při invaliditě." onChange={event => updatePersonalization("clientNeeds", event.target.value)} /><small>{draft.personalization.clientNeeds.length} / {PERSONALIZATION_LIMITS.clientNeeds} znaků</small></label>
          <label>Komentář poradce<textarea value={draft.personalization.advisorComment} rows={4} maxLength={PERSONALIZATION_LIMITS.advisorComment} placeholder="Co je pro tohoto klienta podstatné a proč se věnujete vybraným tématům." onChange={event => updatePersonalization("advisorComment", event.target.value)} /><small>{draft.personalization.advisorComment.length} / {PERSONALIZATION_LIMITS.advisorComment} znaků</small></label>
        </fieldset>
        {!!pinned.length && <div className={styles.priorityPreview}><h4><Pin size={14} aria-hidden="true" />Na začátku PDF</h4><ol>{pinned.map(row => <li key={row.id}>{row.title}</li>)}</ol></div>}
        <section className={styles.advisorPreview} aria-label="Vizitka poradce v PDF">
          <UserRound size={22} aria-hidden="true" />
          <div>{profile?.advisor ? <><strong>{profile.advisor.fullName || profile.advisor.email}</strong><span>{profile.advisor.title}</span><p>{[profile.advisor.phone, profile.advisor.email].filter(Boolean).join(" · ")}</p><small>{profile.advisor.cardUrl ? "V PDF také QR kód na vaši online vizitku." : "Kontaktní údaje z vašeho profilu."}</small>{!profile.advisor.phone && <small>Telefon můžete doplnit v nastavení profilu.</small>}</>
            : profile?.error ? <p role="alert">{profile.error} <button type="button" onClick={() => setRetry(value => value + 1)}>Zkusit znovu</button></p>
            : <p role="status">Načítám vizitku poradce…</p>}</div>
        </section>
      </section>
    </div>
    <footer className={styles.exportFooter}>
      {profile?.error && step === "topics" && <p className={styles.exportError} role="alert">{profile.error} <button type="button" onClick={() => setRetry(value => value + 1)}>Zkusit znovu</button></p>}
      {error && <p className={styles.exportError} role="alert">{error}</p>}
      <p className={styles.exportSelectionSummary}>Vybráno {selected.length} z {rows.length} témat{pinned.length > 0 ? ` · ${pinned.length} připnuto` : ""}</p>
      <div className={styles.exportFooterActions}>
        <button type="button" onClick={() => step === "topics" ? onClose() : changeStep("topics")} disabled={busy}>{step === "client" && <ChevronLeft size={15} aria-hidden="true" />}{step === "topics" ? "Zrušit" : "Zpět"}</button>
        {step === "topics" && <button type="button" className={styles.personalizeButton} onClick={() => changeStep("client")} disabled={busy}>Pro klienta<ChevronRight size={15} aria-hidden="true" /></button>}
        <button type="button" className={styles.exportPrimary} onClick={download} disabled={busy || !profile?.advisor || !selected.length} aria-busy={busy}>
          {busy ? <Loader2 size={17} className={styles.spinning} aria-hidden="true" /> : <FileDown size={17} aria-hidden="true" />}{busy ? "Vytvářím PDF…" : "Stáhnout PDF s detaily"}
        </button>
      </div>
    </footer>
  </dialog>;
}

function ExportSession(props: SessionProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ExportDraft>(() => ({ selectedIds: props.rows.map(row => row.id), pinnedIds: [], personalization: { ...EMPTY_PERSONALIZATION } }));
  return <><button type="button" className={styles.exportTrigger} onClick={() => setOpen(true)} aria-haspopup="dialog"><FileDown size={17} aria-hidden="true" />Stáhnout PDF</button>
    {open && <ExportDialog {...props} draft={draft} setDraft={setDraft} onClose={() => setOpen(false)} />}</>;
}

export function ComparisonExport(props: ExportProps) {
  const [user, setUser] = useState(() => auth.currentUser);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  // Keep drafts while the dialog is closed, and discard them on account changes.
  return <ExportSession key={`${user?.uid ?? "signed-out"}:${effectiveEmail}`} {...props} user={user} effectiveEmail={effectiveEmail} />;
}
