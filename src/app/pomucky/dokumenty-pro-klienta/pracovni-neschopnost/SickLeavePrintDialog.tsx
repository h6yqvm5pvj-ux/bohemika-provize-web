import { onAuthStateChanged } from "firebase/auth";
import { Pencil, Printer, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { auth } from "@/app/firebase-auth";
import { ADMIN_IMPERSONATION_EVENT } from "@/app/lib/adminImpersonation";
import { PdfAdvisorFields } from "../../srovnavac-trvalych-nasledku/PdfPersonalization";
import {
  createPdfAdvisorCard, loadPdfAdvisorDetails, PdfAdvisorCardError,
  type PdfAdvisorDetails, type PdfAdvisorDraft,
} from "../../srovnavac-trvalych-nasledku/pdfAdvisorCard";
import styles from "../clientDocuments.module.css";
import type { Comparison } from "./sickLeaveComparison";
import type { SickLeaveReportLayout } from "./sickLeaveReport";

type Preview = {
  html: string;
  hasAdvisor: boolean;
  buildPaginatedReport?: (layout: SickLeaveReportLayout) => string;
};

type ReportInput = {
  comparison: Comparison;
  clientName: string;
  advisorName: string;
};

type AdvisorSource = Awaited<ReturnType<typeof loadPdfAdvisorDetails>>;

async function preparePreview(input: ReportInput, source: AdvisorSource): Promise<Preview> {
  source.assertSession();
  const [advisor, { buildSickLeaveReport }] = await Promise.all([
    createPdfAdvisorCard(source.details, source.url),
    import("./sickLeaveReport"),
  ]);
  source.assertSession();
  const generatedAt = new Date().toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" });
  const report = { ...input, advisor, generatedAt };
  return {
    html: buildSickLeaveReport(report),
    hasAdvisor: Boolean(advisor),
    buildPaginatedReport: layout => buildSickLeaveReport({ ...report, layout }),
  };
}

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof PdfAdvisorCardError ? cause.message : fallback;

export function SickLeavePrintDialog({ comparison, clientName, advisorName, advisorDraft, onClose }: ReportInput & {
  advisorDraft: PdfAdvisorDraft | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const advisorForm = useRef<HTMLFormElement>(null);
  const editAdvisorButton = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [advisorSource, setAdvisorSource] = useState<AdvisorSource | null>(null);
  const [editingDetails, setEditingDetails] = useState<PdfAdvisorDetails | null>(null);
  const [applying, setApplying] = useState(false);
  const [editorError, setEditorError] = useState("");
  const assertSession = advisorSource?.assertSession;
  const editing = editingDetails !== null;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      try {
        advisorDraft?.assertSession();
        const profile = await loadPdfAdvisorDetails();
        if (cancelled) return;
        advisorDraft?.assertSession();
        const source = { ...profile, details: { ...profile.details, ...advisorDraft?.overrides } };
        const result = await preparePreview({ comparison, clientName, advisorName }, source).then(
          preview => ({ preview, error: "" }),
          cause => ({ preview: null, error: errorMessage(cause, "Náhled PDF se nepodařilo připravit.") }),
        );
        if (cancelled) return;
        source.assertSession();
        setAdvisorSource(source);
        setPreview(result.preview);
        setError(result.error);
      } catch (cause) {
        if (!cancelled) {
          setError(errorMessage(cause, "Náhled PDF se nepodařilo připravit."));
        }
      }
    }
    void prepare();
    return () => { cancelled = true; };
  }, [comparison, clientName, advisorName, advisorDraft]);

  useEffect(() => {
    if (!assertSession) return;
    const checkSession = () => {
      try {
        assertSession();
      } catch {
        dialog.current?.close();
      }
    };
    const unsubscribe = onAuthStateChanged(auth, checkSession);
    window.addEventListener(ADMIN_IMPERSONATION_EVENT, checkSession);
    window.addEventListener("storage", checkSession);
    return () => {
      unsubscribe();
      window.removeEventListener(ADMIN_IMPERSONATION_EVENT, checkSession);
      window.removeEventListener("storage", checkSession);
    };
  }, [assertSession]);

  useEffect(() => {
    if (editing) advisorForm.current?.querySelector("input")?.focus();
  }, [editing]);

  function openAdvisorEditor() {
    if (!advisorSource) return;
    setReady(false);
    setEditorError("");
    setEditingDetails(advisorSource.details);
  }

  function closeAdvisorEditor() {
    setEditingDetails(null);
    requestAnimationFrame(() => editAdvisorButton.current?.focus());
  }

  async function applyAdvisorDetails() {
    if (!advisorSource || !editingDetails || applying) return;
    const updated = { ...advisorSource, details: editingDetails };
    setApplying(true);
    setEditorError("");
    try {
      const updatedPreview = await preparePreview({ comparison, clientName, advisorName }, updated);
      if (!dialog.current?.open) return;
      setAdvisorSource(updated);
      setPreview(updatedPreview);
      setError("");
      closeAdvisorEditor();
    } catch (cause) {
      setEditorError(errorMessage(cause, "Vizitku se nepodařilo upravit."));
    } finally {
      setApplying(false);
    }
  }

  async function prepareFrame() {
    const previewDocument = frame.current?.contentDocument;
    if (!previewDocument || !preview) return;
    await previewDocument.fonts?.ready;
    if (previewDocument !== frame.current?.contentDocument) return;
    const content = previewDocument.querySelector(".pdf-content")?.getBoundingClientRect();
    const footer = previewDocument.querySelector(".pdf-footer")?.getBoundingClientRect();
    if (!content || !footer) return;
    const contentLimit = footer.top - content.width * 0.02;
    if (preview.buildPaginatedReport && content.bottom > contentLimit) {
      const sources = previewDocument.querySelector(".pn-sources")?.getBoundingClientRect();
      const layout = preview.hasAdvisor && sources && sources.bottom <= contentLimit ? "advisor-page" : "insight-page";
      setPreview({ ...preview, html: preview.buildPaginatedReport(layout), buildPaginatedReport: undefined });
    } else {
      setReady(true);
    }
  }

  async function print() {
    const previewFrame = frame.current;
    if (!previewFrame || !assertSession || !ready || editing) return;
    try {
      assertSession();
      await previewFrame.contentDocument?.fonts?.ready;
      if (!previewFrame.isConnected) return;
      assertSession();
      previewFrame.contentWindow?.focus();
      previewFrame.contentWindow?.print();
    } catch (cause) {
      setError(errorMessage(cause, "Tisk se nepodařilo otevřít."));
    }
  }

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="sick-leave-print-title" onClose={onClose}>
      <header className={styles.dialogHeader}>
        <h2 id="sick-leave-print-title">{editing ? "Úprava vizitky poradce" : "Náhled dokumentu"}</h2>
        <button type="button" className={styles.closeButton} onClick={() => dialog.current?.close()} aria-label="Zavřít náhled">
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      {editingDetails ? (
        <form className={styles.dialogAdvisorForm} ref={advisorForm} noValidate onSubmit={event => {
          event.preventDefault();
          void applyAdvisorDetails();
        }}>
          <p className={styles.advisorHelp}>Změny platí jen pro tento dokument.</p>
          <fieldset disabled={applying}>
            <legend className="sr-only">Kontaktní údaje na vizitce</legend>
            <PdfAdvisorFields details={editingDetails} onChange={(field, value) => {
              setEditingDetails({ ...editingDetails, [field]: value });
              setEditorError("");
            }} />
          </fieldset>
          {editorError && <p className={styles.advisorFormError} role="alert">{editorError}</p>}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.secondaryButton} onClick={closeAdvisorEditor} disabled={applying}>Zrušit úpravy</button>
            <button type="submit" className={styles.printButton} disabled={applying}>{applying ? "Aktualizuji náhled…" : "Použít v PDF"}</button>
          </div>
        </form>
      ) : (
        <>
          {error && <p className={styles.dialogError} role="alert">{error}</p>}
          {preview ? (
            <iframe
              ref={frame}
              className={styles.preview}
              srcDoc={preview.html}
              title="Pracovní neschopnost – náhled PDF"
              sandbox="allow-same-origin allow-modals"
              onLoad={() => void prepareFrame()}
            />
          ) : !error && <p className={styles.dialogMessage} role="status">Připravuji náhled…</p>}
          <footer className={styles.dialogFooter}>
            <p>{preview?.hasAdvisor === false
              ? "Do PDF můžete doplnit kontaktní údaje poradce."
              : "Pro uložení vyberte v dialogu tisku možnost Uložit jako PDF."}</p>
            <div className={styles.dialogActions}>
              <button type="button" ref={editAdvisorButton} className={styles.secondaryButton} onClick={openAdvisorEditor} disabled={!advisorSource}>
                <Pencil size={15} aria-hidden="true" /> Upravit vizitku
              </button>
              <button type="button" className={styles.printButton} onClick={() => void print()} disabled={!ready || Boolean(error)}>
                <Printer size={16} aria-hidden="true" /> Tisk / Uložit jako PDF
              </button>
            </div>
          </footer>
        </>
      )}
    </dialog>
  );
}
