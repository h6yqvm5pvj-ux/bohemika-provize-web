"use client";

import Image from "next/image";
import { ArrowRight, CarFront, ChevronDown, Coins, FileCheck2, FileText, HeartPulse, House, LoaderCircle, Package, UploadCloud } from "lucide-react";
import entryStyles from "./calculatorEntry.module.css";
import styles from "./calculatorForm.module.css";
import { type DragEvent, type ReactNode, type RefObject } from "react";

type CalculatorProductAndPdfSectionProps = {
  canImportFromPdf: boolean;
  pdfAttachmentOnly?: boolean;
  productOpen: boolean;
  productSelected?: boolean;
  large?: boolean;
  currentProductLabel: string;
  productLogoSrc?: string | null;
  productInstitutionId?: string | null;
  productLogoImageClass?: string;
  productLogoFrameClass?: string;
  pdfDropActive: boolean;
  pdfImporting: boolean;
  pdfImportStatus: string | null;
  pdfImportError: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onToggleProductPicker: () => void;
  onOpenFileDialog: () => void;
  onFileInputChange: (file: File | null) => void;
  allowMultiplePdf?: boolean;
  onFilesInputChange?: (files: File[]) => void;
  pdfAdditionalContent?: ReactNode;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
};

export function CalculatorProductAndPdfSection({
  canImportFromPdf,
  pdfAttachmentOnly = false,
  productOpen,
  productSelected = true,
  large = false,
  currentProductLabel,
  productLogoSrc,
  productLogoImageClass,
  pdfDropActive,
  pdfImporting,
  pdfImportStatus,
  pdfImportError,
  fileInputRef,
  onToggleProductPicker,
  onOpenFileDialog,
  onFileInputChange,
  allowMultiplePdf = false,
  onFilesInputChange,
  pdfAdditionalContent,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: CalculatorProductAndPdfSectionProps) {
  const hasProductLogo = productSelected && Boolean(productLogoSrc);
  const selectedLogoImageClass = productLogoImageClass ?? "object-contain";
  const handleFiles = (files: File[]) => {
    if (onFilesInputChange) onFilesInputChange(files);
    else onFileInputChange(files[0] ?? null);
  };

  if (large) {
    return (
      <section className={entryStyles.start} aria-label={canImportFromPdf ? "Způsob přidání smlouvy" : "Výběr produktu"}>
        {canImportFromPdf && (
          <ol className={entryStyles.workflow} aria-label="Postup přidání smlouvy">
            <li aria-current="step"><span>1</span>Zvol způsob vložení</li>
            <li><span>2</span>Zkontroluj údaje</li>
            <li><span>3</span>Ulož smlouvu</li>
          </ol>
        )}
        <div className={`${entryStyles.cards} ${!canImportFromPdf ? entryStyles.productOnly : ""}`}>
          {canImportFromPdf && (
            <div
              className={entryStyles.uploadCard}
              data-dragging={pdfDropActive && !pdfImporting}
              data-loading={pdfImporting}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              aria-busy={pdfImporting}
            >
              <div className={entryStyles.cardTop}>
                <span className={entryStyles.eyebrow}>Ze smlouvy v PDF</span>
                <span className={entryStyles.recommended}>{pdfAttachmentOnly ? "Příloha smlouvy" : "Automatické načtení"}</span>
              </div>
              <div className={entryStyles.uploadContent}>
                <div className={entryStyles.paperScene} aria-hidden="true">
                  <span className={entryStyles.paperGlow} />
                  <span className={entryStyles.paperBack} />
                  <span className={entryStyles.paperFront}>
                    <FileText size={25} strokeWidth={1.5} />
                    <i /><i /><i />
                    <span className={entryStyles.pdfTag}>PDF</span>
                  </span>
                  <span className={entryStyles.paperUpload}>
                    {pdfImporting ? <LoaderCircle className={entryStyles.spin} size={24} strokeWidth={1.8} /> : <UploadCloud size={24} strokeWidth={1.8} />}
                  </span>
                </div>
                <h2 className={entryStyles.cardTitle}>
                  {pdfImporting ? "Načítám smlouvu" : pdfDropActive ? "Sem pusť PDF" : "Přetáhni sem smlouvu"}
                </h2>
                <p className={entryStyles.cardDescription}>
                  {pdfImporting ? "Rozpoznávám produkt a hledám údaje ve smlouvě."
                    : pdfAttachmentOnly ? "PDF přiložíme ke smlouvě. Údaje vyplň ručně."
                    : "Z PDF zkusíme rozpoznat produkt a předvyplnit údaje za tebe."}
                </p>
                <button
                  type="button"
                  onClick={onOpenFileDialog}
                  disabled={pdfImporting}
                  className={entryStyles.uploadButton}
                >
                  {pdfImporting ? <LoaderCircle className={entryStyles.spin} size={17} aria-hidden="true" /> : <UploadCloud size={17} strokeWidth={1.9} aria-hidden="true" />}
                  {pdfImporting ? "Načítám PDF…" : "Vybrat PDF ze zařízení"}
                </button>
                <span className={entryStyles.fileHint}>nebo soubor přetáhni do této plochy</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple={allowMultiplePdf}
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    handleFiles(files);
                  }}
                />
              </div>
              {pdfImporting && <span className={entryStyles.loadingTrack} role="progressbar" aria-label="Načítání PDF"><span /></span>}
            </div>
          )}

          <button
            type="button"
            onClick={onToggleProductPicker}
            disabled={pdfImporting}
            aria-haspopup="dialog"
            aria-expanded={productOpen}
            className={entryStyles.manualCard}
          >
            <span className={entryStyles.cardTop}>
              <span className={entryStyles.eyebrow}>{canImportFromPdf ? "Ruční vložení" : "Kalkulačka provizí"}</span>
              <span className={entryStyles.manualTopIcon}><Package size={17} strokeWidth={1.6} aria-hidden="true" /></span>
            </span>
            <span className={entryStyles.manualContent}>
              <span className={entryStyles.categoryScene} aria-hidden="true">
                {hasProductLogo && productLogoSrc ? (
                  <span className={entryStyles.productLogo}><Image src={productLogoSrc} alt="" fill sizes="76px" className={selectedLogoImageClass} /></span>
                ) : (
                  <>
                    <span><HeartPulse size={24} strokeWidth={1.5} /></span>
                    <span><CarFront size={24} strokeWidth={1.5} /></span>
                    <span><House size={24} strokeWidth={1.5} /></span>
                    <span><Coins size={24} strokeWidth={1.5} /></span>
                  </>
                )}
              </span>
              <span role="heading" aria-level={2} className={entryStyles.cardTitle}>
                {productSelected ? currentProductLabel : canImportFromPdf ? "Vyplnit ručně" : "Vybrat produkt"}
              </span>
              <span className={entryStyles.cardDescription}>
                {canImportFromPdf ? "Vyber produkt ze seznamu a doplň údaje podle smlouvy."
                  : "Vyber produkt, pro který chceš spočítat provizi."}
              </span>
              <span className={entryStyles.manualAction}>
                {productSelected ? "Změnit produkt" : "Vybrat produkt"}
                <ArrowRight size={17} strokeWidth={1.9} aria-hidden="true" />
              </span>
            </span>
          </button>
        </div>

        {canImportFromPdf && (pdfImportStatus || pdfImportError) && (
          <div className={entryStyles.feedback}>
            {pdfImportStatus && <p role="status" className={entryStyles.statusMessage}>{pdfImporting ? <LoaderCircle className={entryStyles.spin} size={17} aria-hidden="true" /> : <FileText size={17} aria-hidden="true" />}<span>{pdfImportStatus}</span></p>}
            {pdfImportError && <p role="alert" className={entryStyles.errorMessage}>{pdfImportError}</p>}
          </div>
        )}
        {canImportFromPdf && <p className={entryStyles.attachmentHint}><FileCheck2 size={15} strokeWidth={1.7} aria-hidden="true" />Nahrané PDF přiložíme ke smlouvě při uložení.</p>}
      </section>
    );
  }

  return (
    <section className={styles.productCard} aria-label="Produkt a PDF smlouvy">
      <button
        type="button"
        onClick={onToggleProductPicker}
        className={styles.productButton}
        aria-haspopup="dialog"
        aria-expanded={productOpen}
        disabled={pdfImporting}
      >
        <span className={styles.productLogo}>
          {hasProductLogo && productLogoSrc
            ? <Image src={productLogoSrc} alt="" fill sizes="64px" className={selectedLogoImageClass} />
            : <Package size={24} strokeWidth={1.6} aria-hidden="true" />}
        </span>
        <span className={styles.productInfo}>
          <span className={styles.eyebrow}>Produkt smlouvy</span>
          <span className={styles.productName}>{currentProductLabel}</span>
        </span>
        <span className={styles.changeProduct}>
          <span>Změnit</span><ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
        </span>
      </button>
      {canImportFromPdf && (
        <div className={styles.pdfSection}>
          <div
            className={styles.pdfDropzone}
            data-dragging={pdfDropActive && !pdfImporting}
            aria-busy={pdfImporting}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <span className={styles.pdfIcon}>
              {pdfImporting ? <LoaderCircle size={20} className={entryStyles.spin} aria-hidden="true" />
                : <UploadCloud size={20} strokeWidth={1.7} aria-hidden="true" />}
            </span>
            <span className={styles.pdfCopy}>
              <strong>{pdfImporting ? "Zpracovávám PDF…" : pdfDropActive ? "Sem pusť PDF" : allowMultiplePdf ? "Jedna smlouva, nebo více najednou" : "Máš smlouvu v PDF?"}</strong>
              <span>{pdfAttachmentOnly ? "PDF přiložíme ke smlouvě. Údaje vyplň ručně." : allowMultiplePdf ? "Jedno PDF předvyplní formulář. Více PDF se zpracuje a uloží hromadně." : "Nahraj ji nebo přetáhni sem."}</span>
            </span>
            <button type="button" onClick={onOpenFileDialog} disabled={pdfImporting} className={styles.secondaryButton}>
              {pdfImporting ? "Zpracovávám…" : "Vybrat PDF"}
            </button>
            <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" multiple={allowMultiplePdf} className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                handleFiles(files);
              }} />
          </div>
          {pdfImporting && <span className={styles.importProgress} role="progressbar" aria-label="Načítání PDF"><span /></span>}
          {pdfImportStatus && <p role="status" className={styles.importStatus}>{pdfImportStatus}</p>}
          {pdfImportError && <p role="alert" className={styles.importError}>{pdfImportError}</p>}
          {pdfAdditionalContent}
        </div>
      )}
    </section>
  );
}
