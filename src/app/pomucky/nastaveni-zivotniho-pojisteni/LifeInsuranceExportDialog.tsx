"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileDown, Loader2, Printer, X } from "lucide-react";
import type { LifeInsuranceResultData, PdfLanguage } from "./lifeInsuranceShared";
import { buildLifeInsuranceReportHtml } from "./lifeInsuranceReport";
import styles from "./lifeInsuranceSetup.module.css";

const LANGUAGES: { id: PdfLanguage; label: string }[] = [
  { id: "cs", label: "Čeština" }, { id: "en", label: "English" }, { id: "uk", label: "Українська" },
  { id: "ne", label: "नेपाली" }, { id: "hi", label: "हिन्दी" },
];

export function LifeInsuranceExportDialog({ data, onClose }: { data: LifeInsuranceResultData; onClose: () => void }) {
  const [language, setLanguage] = useState<PdfLanguage>("cs");
  const [created] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onClose, busy });
  useEffect(() => { callbacks.current = { onClose, busy }; }, [onClose, busy]);
  const html = useMemo(() => buildLifeInsuranceReportHtml(data, language, created, window.location.origin), [data, language, created]);
  const previewHtml = html.replace("</head>", "<style>@media screen and (max-width:804px){body{padding:14px}.page{zoom:calc((100vw - 28px) / 760px);margin:0}}</style></head>");

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !callbacks.current.busy) { event.preventDefault(); callbacks.current.onClose(); }
      if (event.key !== "Tab") return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),select:not([disabled])') ?? [])];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, []);

  const download = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const { withBestPdfSource, renderPdfBlobFromElement, downloadBlobFile } = await import("../export-produkce/productionPdf");
      const blob = await withBestPdfSource(html, async element => {
        await element.ownerDocument.fonts?.ready;
        return renderPdfBlobFromElement(element, { marginPt: 24, scale: 2, title: "Nastavení životního pojištění · Bohemika", subject: "Návrh pojistného krytí" });
      });
      downloadBlobFile(blob, `nastaveni-zivotniho-pojisteni-${language}-${created.toISOString().slice(0, 10)}.pdf`);
    } catch (cause) {
      console.error("PDF export nastavení životního pojištění selhal:", cause);
      setError("Dokument se nepodařilo připravit. Zkus stažení znovu.");
    } finally { setBusy(false); }
  };

  const print = async () => {
    const frame = preview.current?.contentWindow;
    if (!frame || !ready) return;
    await preview.current?.contentDocument?.fonts?.ready;
    frame.focus(); frame.print();
  };

  return <div className={styles.exportOverlay} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={dialog} className={styles.exportDialog} role="dialog" aria-modal="true" aria-labelledby="life-export-title" aria-busy={busy}>
      <header className={styles.exportHeader}><div><h2 id="life-export-title">Dokument pro klienta</h2><p>Zkontroluj návrh před tiskem nebo stažením.</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Zavřít náhled dokumentu"><X size={19} /></button></header>
      <div className={styles.exportBody}>
        <aside className={styles.exportSettings}><label htmlFor="life-export-language">Jazyk dokumentu</label><select id="life-export-language" value={language} disabled={busy} onChange={event => { setReady(false); setLanguage(event.target.value as PdfLanguage); setError(null); }}>{LANGUAGES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><p>Formát A4 s firemní hlavičkou a kontaktem poradce. Stažené PDF obsahuje číslování stran.</p></aside>
        <div className={styles.exportPreview}><iframe ref={preview} title="Náhled návrhu pojistného krytí" srcDoc={previewHtml} sandbox="allow-same-origin allow-modals" tabIndex={-1} onLoad={() => setReady(true)} /></div>
      </div>
      <footer className={styles.exportFooter}>{error && <p role="alert" className={styles.error}>{error}</p>}<button type="button" className={styles.secondaryButton} onClick={onClose} disabled={busy}>Zavřít</button><button type="button" className={styles.secondaryButton} onClick={print} disabled={busy || !ready}><Printer size={15} />Vytisknout</button><button type="button" className={styles.primaryButton} onClick={download} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}{busy ? "Připravuji PDF…" : "Stáhnout PDF"}</button></footer>
    </div>
  </div>;
}
