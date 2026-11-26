"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CalendarDays, X } from "lucide-react";
import { endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import { PDF_DATA_IMPORT_TIMEOUT_MS, withPdfImportTimeout } from "@/app/kalkulacka/pdfImportOperation";
import { contractPdfFileError } from "./ContractPdfUploadButton";
import styles from "./contractManagement.module.css";

type Props = {
  ownerEmail: string;
  entryId: string;
  contractNumber?: string | null;
  request: (url: string, init?: RequestInit) => Promise<unknown>;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type AmendmentFields = Partial<Record<"effectiveDate" | "signedDate" | "premium", string>>;

const validDate = (value: string | null | undefined) =>
  value && value >= "1900-01-01" && value <= "2199-12-31" && endorsementCommissionDay(value) === value ? value : undefined;

export function NeonEndorsementDialog({ ownerEmail, entryId, contractNumber, request, onClose, onSaved }: Props) {
  const heading = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfRead = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const saving = useRef(false);
  const [uploaded, setUploaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [readingPdf, setReadingPdf] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<string | null>(null);
  const [pdfFields, setPdfFields] = useState<AmendmentFields>({});
  const [manualFields, setManualFields] = useState<AmendmentFields>({});
  const [file, setFile] = useState<File | null>(null);
  const effectiveDate = manualFields.effectiveDate ?? pdfFields.effectiveDate ?? "";
  const signedDate = manualFields.signedDate ?? pdfFields.signedDate ?? "";
  const premium = manualFields.premium ?? pdfFields.premium ?? "";

  function editField(field: keyof AmendmentFields, value: string) {
    setManualFields(previous => ({ ...previous, [field]: value }));
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    mounted.current = true;
    return () => {
      mounted.current = false;
      pdfRead.current?.abort();
      dialog?.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  async function selectFile(candidate: File) {
    if (saving.current || uploaded) return;
    const validation = contractPdfFileError(candidate);
    setFileError(validation);
    if (validation) return;

    pdfRead.current?.abort();
    const controller = new AbortController();
    pdfRead.current = controller;
    setFile(candidate);
    if (!savedId) setPdfFields({});
    setReadingPdf(true);
    setPdfStatus(null);
    setError(null);
    let ocrActive = false;
    try {
      const parsed = await withPdfImportTimeout(async (signal) => {
        const { parseNeonPdf } = await import("@/app/lib/parseNeonPdf");
        return parseNeonPdf(candidate, { signal, endorsementOnly: true, allowOcr: true, onOcrStart: () => { ocrActive = true; } });
      }, PDF_DATA_IMPORT_TIMEOUT_MS, "Čtení PDF trvalo příliš dlouho.", () => ocrActive, controller.signal);
      if (controller.signal.aborted) return;
      if (!parsed.isEndorsement || parsed.isRefresh) {
        setPdfStatus("PDF zůstalo jako příloha. Údaje o změně doplň ručně.");
        return;
      }

      const expectedNumber = contractNumber?.replace(/\s+/g, "");
      if (expectedNumber && parsed.contractNumber && parsed.contractNumber !== expectedNumber) {
        setFile(null);
        setFileError("PDF je k jiné smlouvě. Vyber správný soubor nebo pokračuj bez přílohy.");
        return;
      }

      const amount = parsed.amount;
      const fields = {
        effectiveDate: validDate(parsed.policyStartDate),
        signedDate: validDate(parsed.contractSignedDate),
        premium: typeof amount === "number" && amount > 0 && amount <= 1e9 ? String(amount) : undefined,
      };
      if (!savedId) setPdfFields(fields);
      const count = Object.values(fields).filter(value => value !== undefined).length;
      const status = savedId ? "PDF je připravené k připojení."
        : count === 3 ? "Údaje z PDF jsou načtené. Zkontroluj je před uložením."
        : count > 0 ? "Část údajů je načtená. Zkontroluj je a zbytek doplň ručně."
        : "Údaje z PDF se nepodařilo načíst. Doplň je ručně.";
      setPdfStatus(parsed.contractNumber ? status : `${status} Číslo smlouvy se v PDF nepodařilo přečíst.`);
    } catch {
      if (!controller.signal.aborted) setPdfStatus("PDF zůstalo jako příloha. Údaje z něj se nepodařilo načíst, doplň je ručně.");
    } finally {
      if (!controller.signal.aborted) {
        pdfRead.current = null;
        setReadingPdf(false);
      }
    }
  }

  function removeFile() {
    pdfRead.current?.abort();
    pdfRead.current = null;
    setFile(null);
    setFileError(null);
    setPdfStatus(null);
    setReadingPdf(false);
    if (!savedId) setPdfFields({});
  }

  async function save({ skipAttachment = false }: { skipAttachment?: boolean } = {}) {
    if (saving.current || (!skipAttachment && (fileError || pdfRead.current)) || (!savedId && (!effectiveDate || !signedDate || !premium))) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    let amendmentId = savedId;
    try {
      if (!amendmentId) {
        const result = await request("/api/contracts/neon-endorsement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerEmail, entryId, effectiveDate, signedDate, monthlyPremium: Number(premium) }),
        }) as { entryId?: string };
        if (!result.entryId) throw new Error("Uložení dodatku se nepodařilo potvrdit. Zkus to znovu.");
        amendmentId = result.entryId;
        try {
          sessionStorage.removeItem("contracts_cache_v2");
          sessionStorage.removeItem("contracts_cache_v3");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch { /* The server has already saved the amendment. */ }
        if (!mounted.current) return;
        setSavedId(amendmentId);
      }
      if (file && !skipAttachment && !uploaded) {
        const form = new FormData();
        form.set("ownerEmail", ownerEmail);
        form.set("entryId", amendmentId);
        form.set("file", file);
        form.set("onlyIfMissing", "1");
        try {
          await request("/api/contracts/attachment", { method: "POST", body: form });
          if (mounted.current) setUploaded(true);
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "PDF se nepodařilo připojit.";
          throw new Error(`Dodatek je uložený. ${message}`);
        }
      }
      if (mounted.current) {
        try { await onSaved(); }
        catch { setError("Dodatek je uložený. Detail se nepodařilo obnovit, zkus ho načíst znovu."); }
      }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : "Dodatek se nepodařilo uložit.");
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  return (
    <dialog ref={dialogRef} aria-labelledby={heading} className={styles.dialog} onCancel={event => {
      event.preventDefault();
      if (!saving.current) onClose();
    }}>
      <header className={styles.header}>
        <span className={styles.headerIcon}><CalendarDays size={23} aria-hidden="true" /></span>
        <div><p>ČPP Neon · {contractNumber}</p><h2 id={heading}>Změna na smlouvě</h2></div>
        <button type="button" className={styles.close} disabled={busy} onClick={onClose} aria-label="Zavřít"><X size={19} /></button>
      </header>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.content}>
          {savedId && <p role="status" className="text-sm">Dodatek je uložený.</p>}
          <label className={styles.field}>
            <span>Datum počátku změny</span>
            <input type="date" required min="1900-01-01" max="2199-12-31" value={effectiveDate} disabled={busy || !!savedId}
              onChange={event => editField("effectiveDate", event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Datum sjednání změny</span>
            <input type="date" required min="1900-01-01" max={effectiveDate || "2199-12-31"} value={signedDate} disabled={busy || !!savedId}
              onChange={event => editField("signedDate", event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Nové měsíční pojistné (Kč)</span>
            <input type="number" required min="0.01" max="1000000000" step="0.01" value={premium} disabled={busy || !!savedId}
              onChange={event => editField("premium", event.target.value)} />
          </label>
          <div className="mt-5 rounded-xl border-2 border-dashed border-violet-200 px-4 pb-4" onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              if (saving.current || uploaded) return;
              if (event.dataTransfer.files.length !== 1) setFileError("Přetáhni právě jedno PDF.");
              else void selectFile(event.dataTransfer.files[0]);
            }}>
            <p className="mb-2 mt-4 text-sm font-semibold">PDF dodatku (volitelné) – přetáhni sem nebo vyber</p>
            <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,application/pdf" disabled={busy || uploaded} onChange={event => {
              const candidate = event.currentTarget.files?.[0];
              if (candidate) void selectFile(candidate);
              event.currentTarget.value = "";
            }} />
            <button type="button" disabled={busy || uploaded} className={styles.back} onClick={() => fileInputRef.current?.click()}>
              {file ? "Vybrat jiné PDF" : "Vybrat PDF"}
            </button>
            {file && <p className="mt-2 break-all text-sm">{file.name}{!uploaded && <button type="button"
              className="ml-2 underline" disabled={busy} onClick={removeFile}>Odebrat přílohu</button>}</p>}
            <p className="mt-2 text-xs">Nejvýše 12 MB a 100 stran.</p>
            {(readingPdf || pdfStatus) && <p role="status" className="mt-2 text-sm">{readingPdf ? "Čtu údaje z PDF…" : pdfStatus}</p>}
            {fileError && <p role="alert" className={styles.error}>{fileError} <button type="button" className="underline" onClick={() => setFileError(null)}>Zavřít upozornění</button></p>}
          </div>
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.back} disabled={busy} onClick={() => {
            if (savedId) void save({ skipAttachment: true });
            else onClose();
          }}>{savedId ? uploaded ? "Zpět k detailu" : "Dokončit bez přílohy" : "Zrušit"}</button>
          <button type="submit" className={styles.primary} disabled={busy || readingPdf || !!fileError || (!savedId && (!effectiveDate || !signedDate || !premium))}>
            {busy ? "Ukládám…" : savedId ? "Dokončit uložení" : "Uložit dodatek"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
