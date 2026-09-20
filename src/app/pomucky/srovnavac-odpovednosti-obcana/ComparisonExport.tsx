"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { FileDown, Loader2, Minus, Plus, UserRound, X } from "lucide-react";
import { auth } from "@/app/firebase-auth";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import { useEffectiveUserEmail } from "@/app/lib/useAdminImpersonation";
import { reportAdvisorFromProfile, type ReportAdvisor } from "../neon-life-vs-metlife-oneguard/comparisonReportContent";
import type { ComparisonSectionData } from "./comparisonData";
import type { LiabilityProduct } from "./products";
import { SECTION_ICONS } from "./comparisonIcons";
import { buildLiabilityReport, initialExportSettings, type ExportSettings } from "./exportData";
import styles from "./export.module.css";

type ExportProps = { sections: ComparisonSectionData[]; products: LiabilityProduct[]; activeSection: string };

function SectionCheckbox({ checked, mixed, disabled, title, onChange }: { checked: boolean; mixed: boolean; disabled: boolean; title: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  return <input ref={ref} type="checkbox" checked={checked} aria-checked={mixed ? "mixed" : checked} aria-label={`Zařadit sekci: ${title}`} disabled={disabled} onChange={onChange} />;
}

function ExportDialog({ sections, products, activeSection, settings, setSettings, user, effectiveEmail, onClose }: ExportProps & {
  settings: ExportSettings; setSettings: (settings: ExportSettings) => void;
  user: User | null; effectiveEmail: string; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const exporting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<{ advisor?: ReportAdvisor; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState<string[]>([]);
  const report = buildLiabilityReport(sections, products, settings);
  const rowCount = report.sections.reduce((sum, section) => sum + section.rows.length, 0);

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
      if (!user) { setProfile({ error: "Pro načtení vizitky se přihlas." }); return; }
      try {
        const payload = await getUserProfileCached(user, { force: retry > 0 });
        if (cancelled) return;
        if (!payload.profile) throw new Error("Profil chybí.");
        setProfile({ advisor: reportAdvisorFromProfile(payload.profile, effectiveEmail, window.location.origin) });
      } catch { if (!cancelled) setProfile({ error: "Vizitku poradce se nepodařilo načíst." }); }
    }
    void load(); return () => { cancelled = true; };
  }, [user, effectiveEmail, retry]);

  function selectSections(ids: string[]) {
    setSettings({ ...settings, selectedCriteria: Object.fromEntries(sections.map((section) => [section.id, ids.includes(section.id) ? section.criteria.map((row) => row.id) : []])) });
  }
  function selectCriteria(sectionId: string, ids: string[]) {
    setSettings({ ...settings, selectedCriteria: { ...settings.selectedCriteria, [sectionId]: ids } });
  }
  async function download() {
    if (!rowCount || !profile?.advisor || exporting.current) return;
    exporting.current = true; setBusy(true); setError("");
    try {
      const { downloadLiabilityPdf } = await import("./comparisonPdf");
      await downloadLiabilityPdf({ report, advisor: profile.advisor });
      onClose();
    } catch { setError("PDF se nepodařilo vytvořit. Výběr zůstal zachovaný, zkus stažení znovu."); }
    finally { exporting.current = false; setBusy(false); }
  }

  return <dialog ref={ref} className={styles.dialog} aria-labelledby="liability-export-title" aria-describedby="liability-export-description"
    onCancel={(event) => { event.preventDefault(); if (!exporting.current) onClose(); }}>
    <header className={styles.header}>
      <FileDown size={23} aria-hidden="true" />
      <div><h2 id="liability-export-title">Srovnání do PDF</h2><p id="liability-export-description">Vyber obsah pro stažení a tisk. PDF obsahuje firemní hlavičku a tvoji vizitku.</p></div>
      <button type="button" className={styles.close} aria-label="Zavřít export PDF" disabled={busy} onClick={onClose}><X size={19} /></button>
    </header>
    <div className={styles.body}>
      <p className={styles.products}><strong>Produkty v PDF:</strong> {products.map((product) => `${product.insurerName} · ${product.productName}`).join(" / ")}</p>
      <fieldset className={styles.options} disabled={busy}>
        <legend>Rozsah srovnání</legend>
        <label><input type="checkbox" checked={settings.includeSubcriteria} onChange={(event) => setSettings({ ...settings, includeSubcriteria: event.target.checked })} /> Zahrnout podkritéria</label>
        <label><input type="checkbox" checked={settings.includeDetails} onChange={(event) => setSettings({ ...settings, includeDetails: event.target.checked })} /> Včetně podrobností a výjimek</label>
        <label><input type="checkbox" checked={settings.onlyDifferences} disabled={products.length < 2} onChange={(event) => setSettings({ ...settings, onlyDifferences: event.target.checked })} /> Pouze rozdíly</label>
      </fieldset>
      <div className={styles.selectionActions}>
        <button type="button" disabled={busy} onClick={() => selectSections(sections.map((section) => section.id))}>Vybrat vše</button>
        <button type="button" disabled={busy} onClick={() => selectSections([activeSection])}>Jen aktuální sekce</button>
        <button type="button" disabled={busy} onClick={() => selectSections([])}>Zrušit výběr</button>
      </div>
      <div className={styles.sections}>
        {sections.map((section) => {
          const criteria = section.criteria.filter((row) => settings.includeSubcriteria || !row.parentId);
          const selected = settings.selectedCriteria[section.id] ?? [];
          const count = criteria.filter((row) => selected.includes(row.id)).length;
          const open = expanded.includes(section.id);
          const Icon = SECTION_ICONS[section.id];
          return <section className={styles.section} key={section.id}>
            <div className={styles.sectionHeader}>
              <SectionCheckbox checked={count === criteria.length} mixed={count > 0 && count < criteria.length} disabled={busy} title={section.title}
                onChange={() => selectCriteria(section.id, count === criteria.length ? [] : section.criteria.map((row) => row.id))} />
              <button type="button" disabled={busy} aria-expanded={open} aria-controls={`export-criteria-${section.id}`}
                onClick={() => setExpanded((current) => open ? current.filter((id) => id !== section.id) : [...current, section.id])}>
                <Icon size={16} aria-hidden="true" /><strong>{section.title}</strong><small>{count} / {criteria.length}</small>
                <span className={styles.disclosure}>{open ? <Minus size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}{open ? "Skrýt" : "Zobrazit"}</span>
              </button>
            </div>
            <div id={`export-criteria-${section.id}`} hidden={!open} className={styles.criteria}>
              {criteria.map((row) => <label key={row.id} data-subcriterion={!!row.parentId}>
                <input type="checkbox" disabled={busy} checked={selected.includes(row.id)} aria-label={`Zařadit kritérium: ${section.title} – ${row.parentLabel ? `${row.parentLabel} – ` : ""}${row.title}`}
                  onChange={() => selectCriteria(section.id, selected.includes(row.id) ? selected.filter((id) => id !== row.id) : [...selected, row.id])} />
                <span>{row.parentLabel && <small>{row.parentLabel}</small>}{row.title}</span>
              </label>)}
            </div>
          </section>;
        })}
      </div>
      <section className={styles.advisor} aria-label="Vizitka poradce v PDF">
        <UserRound size={20} aria-hidden="true" />
        <div>{profile?.advisor ? <><strong>{profile.advisor.fullName || profile.advisor.email}</strong><span>{profile.advisor.title}</span><p>{[profile.advisor.phone, profile.advisor.email].filter(Boolean).join(" · ")}</p><small>Hlavička Bohemika a.s.{profile.advisor.cardUrl ? " · QR kód na online vizitku" : " · Kontaktní údaje z profilu"}</small></>
          : profile?.error ? <p role="alert">{profile.error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Zkusit znovu</button></p>
          : <p role="status">Načítám vizitku poradce…</p>}</div>
      </section>
    </div>
    <footer className={styles.footer}>
      <div className={styles.summary} role="status" aria-live="polite">Do PDF: <strong>{products.length} produktů · {report.sections.length} sekcí · {rowCount} kritérií</strong><small>A4 na šířku · {settings.includeDetails ? "s podrobnostmi" : "stručný přehled bez podrobností"}</small></div>
      {!rowCount && <p className={styles.error}>{settings.onlyDifferences ? "Výběr neobsahuje žádné rozdíly. Uprav kritéria nebo vypni filtr rozdílů." : "Vyber alespoň jednu sekci nebo kritérium."}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.footerActions}>
        <button type="button" disabled={busy} onClick={onClose}>Zrušit</button>
        <button type="button" className={styles.primary} disabled={busy || !rowCount || !profile?.advisor} aria-busy={busy} onClick={download}>
          {busy ? <Loader2 size={16} className={styles.spinning} aria-hidden="true" /> : <FileDown size={16} aria-hidden="true" />}{busy ? "Vytvářím PDF…" : "Stáhnout PDF"}
        </button>
      </div>
    </footer>
  </dialog>;
}

function ExportSession(props: ExportProps & { user: User | null; effectiveEmail: string }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(() => initialExportSettings(props.sections));
  return <><button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"><FileDown size={14} aria-hidden="true" /> PDF / tisk</button>
    {open && <ExportDialog {...props} settings={settings} setSettings={setSettings} onClose={() => setOpen(false)} />}</>;
}

export function ComparisonExport(props: ExportProps) {
  const [user, setUser] = useState(() => auth.currentUser);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  return <ExportSession key={`${user?.uid ?? "signed-out"}:${effectiveEmail}`} {...props} user={user} effectiveEmail={effectiveEmail} />;
}
