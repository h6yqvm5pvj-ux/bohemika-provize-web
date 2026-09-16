"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Download, FileWarning, FolderOpen, Loader2, X } from "lucide-react";
import { institutionLogoImageClass } from "@/app/lib/institutionLogoDisplay";
import { useSecureDocumentBlob } from "@/app/lib/secureDocuments";
import styles from "./comparisonDocuments.module.css";

const DOCUMENTS = [
  {
    id: "cpp-neon-conditions-2026",
    product: "ČPP Životní pojištění NEON Life",
    insurer: "cpp",
    logo: "/icons/cpp.png",
    period: "04/2026",
    fileName: "cpp-neon-04-2026.pdf",
  },
  {
    id: "metlife-oneguard-conditions-2024",
    product: "MetLife OneGuard",
    insurer: "metlife",
    logo: "/icons/metlife.png",
    period: "09/2024",
    fileName: "2024_09_OneGuard_Pojistne_podminky_PR059_PP_OGR0924.pdf",
  },
] as const;

function DocumentDownload({ file }: { file: (typeof DOCUMENTS)[number] }) {
  const document = useSecureDocumentBlob(file.id);

  if (document.error) {
    return <span className={styles.error} role="status"><FileWarning size={15} aria-hidden="true" />Soubor se nepodařilo načíst. Otevřete okno znovu.</span>;
  }
  if (!document.url) {
    return <span className={styles.loading} role="status"><Loader2 size={15} className="animate-spin" aria-hidden="true" />Načítání…</span>;
  }
  return <a className={styles.download} href={document.url} download={file.fileName} aria-label={`Stáhnout pojistné podmínky ${file.product}`}><Download size={15} aria-hidden="true" />Stáhnout</a>;
}

function DocumentsDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);

  return <dialog
    ref={dialogRef}
    className={styles.dialog}
    id="comparison-documents"
    aria-labelledby="comparison-documents-title"
    aria-describedby="comparison-documents-description"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}
  >
    <header className={styles.header}>
      <span className={styles.headerIcon}><FolderOpen size={22} aria-hidden="true" /></span>
      <div><h2 id="comparison-documents-title">Dokumenty</h2><p id="comparison-documents-description">Pojistné podmínky ke srovnávaným produktům.</p></div>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Zavřít dokumenty"><X size={18} aria-hidden="true" /></button>
    </header>
    <ul className={styles.files}>
      {DOCUMENTS.map(file => <li key={file.id} className={styles.file}>
        <span className={styles.logo}><Image src={file.logo} alt="" fill sizes="64px" className={institutionLogoImageClass(file.insurer)} /></span>
        <div className={styles.identity}><h3>{file.product}</h3><p>Pojistné podmínky · {file.period}</p><span>PDF</span></div>
        <DocumentDownload file={file} />
      </li>)}
    </ul>
    <footer className={styles.footer}><span>{DOCUMENTS.length} soubory ke stažení</span><button type="button" onClick={onClose}>Hotovo</button></footer>
  </dialog>;
}

export function ComparisonDocuments() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={styles.trigger} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? "comparison-documents" : undefined}><FolderOpen size={16} aria-hidden="true" />Dokumenty<span>{DOCUMENTS.length}</span></button>
    {open && <DocumentsDialog onClose={() => setOpen(false)} />}
  </>;
}
