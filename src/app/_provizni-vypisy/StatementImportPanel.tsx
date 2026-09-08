"use client";

import { useRef, useState, type CSSProperties, type DragEvent } from "react";
import { ArrowUpRight, Check, FileCode2, FileText, Upload } from "lucide-react";
import styles from "./statementImport.module.css";

export function StatementDocumentVisual({ active = false }: { active?: boolean }) {
  return (
    <div className={styles.documentScene} data-active={active} aria-hidden="true">
      <div className={styles.documentHalo} />
      <div className={styles.documentStack}>
        <div className={styles.backSheet} />
        <div className={styles.paper}>
          <div className={styles.paperTop}><span className={styles.paperMark}><FileText /></span><span>BOHEMKA<span>PROVIZNÍ VÝPIS</span></span><span className={styles.paperFormat}>HTML</span></div>
          <div className={styles.paperHeading}>Přehled provizí<span>SMLOUVY A PROVIZNÍ POLOŽKY</span></div>
          <div className={styles.paperColumns}><span>SMLOUVA</span><span>PROVIZE</span></div>
          {[0, 1, 2, 3].map(index => (
            <div key={index} className={styles.paperRow} style={{ "--row": index } as CSSProperties}>
              <span className={styles.paperRowIcon}><Check /></span><span className={styles.paperLines}><i /><i /></span><span className={styles.paperAmount} />
            </div>
          ))}
          <div className={styles.paperTotal}><span>CELKEM</span><i /></div>
          <div className={styles.scanLine} />
        </div>
      </div>
      <span className={styles.documentTag}><FileCode2 size={16} strokeWidth={1.7} />.html<span>Provizní výpis</span></span>
    </div>
  );
}

export function StatementImportSteps({ active = -1, saving = false }: { active?: number; saving?: boolean }) {
  const steps = saving
    ? ["Kontrola výpisu", "Zápis položek", "Potvrzení zpracování"]
    : ["Nahraj výpis", "Spárujeme smlouvy", "Projdi výsledky"];
  return (
    <ol className={styles.steps} aria-label="Postup zpracování">
      {steps.map((label, index) => (
        <li key={label} data-state={index < active ? "done" : index === active ? "active" : "waiting"} aria-current={index === active ? "step" : undefined}>
          <span className={styles.stepNumber}>{index < active ? <Check size={14} aria-hidden="true" /> : `0${index + 1}`}</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

export function StatementImportPanel({ onChooseFiles, onDropFiles }: {
  onChooseFiles: () => void;
  onDropFiles: (files: File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const isFileDrag = (event: DragEvent) => event.dataTransfer.types.includes("Files");

  return (
    <section className={styles.importPanel} aria-label="Nahrání provizního výpisu">
      <div className={styles.importMain}>
        <div className={styles.importVisual}>
          <p className={styles.visualEyebrow}><span />OD VÝPISU K PŘEHLEDU</p>
          <StatementDocumentVisual />
          <p className={styles.visualCaption}>Smlouvy. Provize. Souvislosti.</p>
        </div>
        <div className={styles.dropArea} data-dragging={dragging}
          onDragEnter={event => { if (!isFileDrag(event)) return; event.preventDefault(); dragDepth.current += 1; setDragging(true); }}
          onDragOver={event => { if (!isFileDrag(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDragLeave={event => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
          onDrop={event => { event.preventDefault(); dragDepth.current = 0; setDragging(false); onDropFiles(Array.from(event.dataTransfer.files)); }}
        >
          <button type="button" className={styles.dropTarget} onClick={onChooseFiles} aria-label="Vybrat HTML soubory provizního výpisu">
            <span className={styles.uploadSymbol}><Upload size={28} strokeWidth={1.6} /></span>
            <span className={styles.dropTitle}>{dragging ? "Pusť soubory sem" : "Přetáhni výpis sem"}</span>
            <span className={styles.dropDescription}>Vyber výpis ze zařízení nebo ho přetáhni do této plochy.</span>
            <span className={styles.chooseButton}>Vybrat soubor<ArrowUpRight size={17} aria-hidden="true" /></span>
            <span className={styles.fileHint}><FileCode2 size={14} aria-hidden="true" />HTML / HTM<span>·</span>I více souborů najednou</span>
          </button>
          <p className={styles.importNote}><Check size={15} aria-hidden="true" />Nejdřív kontrola. Zápis potvrdíš až potom.</p>
        </div>
      </div>
      <StatementImportSteps />
    </section>
  );
}
