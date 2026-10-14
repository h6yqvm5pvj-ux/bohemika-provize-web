"use client";

import { useId, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, CirclePlay, ClipboardPaste, Info } from "lucide-react";
import { CareerImportHelpDialog, type CareerImportContext } from "./CareerImportHelpDialog";
import styles from "./careerTimelineImport.module.css";
import {
  CAREER_IMPORT_MAX_LENGTH,
  parseCareerTimelineImport,
  type ImportedCareerPeriod,
} from "@/app/lib/careerTimelineImport";

type CareerTimelineImportProps = {
  disabled?: boolean;
  tone?: "light" | "dark";
  context?: CareerImportContext;
  onImport: (rows: ImportedCareerPeriod[]) => void;
  onHelp?: () => void;
};

export function CareerTimelineImport({ disabled = false, tone = "light", context = "settings", onImport, onHelp }: CareerTimelineImportProps) {
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [expanded, setExpanded] = useState(context === "setup");
  const nextAction = context === "setup" ? "zvol Pokračovat" : "ulož ji";

  const importTimeline = () => {
    if (disabled) return;
    const result = parseCareerTimelineImport(text);
    if (!result.ok) {
      setError(result.error);
      setImported(false);
      return;
    }
    onImport(result.rows);
    setText("");
    setError(null);
    setImported(true);
  };

  return (
    <div className={styles.root} data-tone={tone}>
      <details className={styles.card} open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary className={styles.summary}>
          <span className={styles.iconTile} aria-hidden="true">
            <ClipboardPaste size={20} strokeWidth={1.8} />
          </span>
          <span className={styles.summaryCopy}>
            <span className={styles.title}>Vložit kariéru z Maxxu</span>
            <span className={styles.subtitle}>Celou historii doplníš jedním vložením.</span>
          </span>
          <ChevronDown size={18} className={styles.chevron} aria-hidden="true" />
        </summary>
        <div className={styles.body}>
          <p id={`${id}-help`} className={styles.description}>
            V Maxxu označ a zkopíruj tabulku v záložce Kariéra. Vlož ji sem a nech doplnit pozice i data.
            <span className={styles.codes}>Čísla 1–10 odpovídají poradcům, 104–110 manažerům 4–10.</span>
          </p>
          <div className={styles.inputGroup}>
            <label htmlFor={id} className={styles.label}>Zkopírovaná tabulka kariéry</label>
            <textarea
              id={id}
              value={text}
              onChange={(event) => { setText(event.target.value); setError(null); setImported(false); }}
              rows={5}
              maxLength={CAREER_IMPORT_MAX_LENGTH + 1}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`${id}-help ${id}-replacement${error ? ` ${id}-error` : ""}`}
              aria-invalid={Boolean(error)}
              placeholder={"Finanční poradce\t7 - V.I.P. konzultant\t01.01.2020 - 01.01.2025\nFinanční poradce\t106 - Řídící manažer\t01.01.2025 - současnost"}
              className={styles.textarea}
            />
          </div>
          {error && <p id={`${id}-error`} role="alert" className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <p id={`${id}-replacement`} className={styles.notice}>
              <Info size={15} aria-hidden="true" />
              <span>Předvyplnění nahradí rozepsaná období. {context === "setup" ? "Zkontroluj je a zvol Pokračovat." : "Zkontroluj je a potom historii ulož."}</span>
            </p>
            <button
              type="button"
              onClick={importTimeline}
              disabled={disabled || !text.trim()}
              className={styles.importButton}
            >
              Předvyplnit historii
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
          <p role="status" className={styles.success}>
            {imported && <><CheckCircle2 size={16} aria-hidden="true" /><span>Historie je předvyplněná. Zkontroluj období a {nextAction}.</span></>}
          </p>
        </div>
      </details>
      <div className={styles.helpRow}>
        <button
          type="button"
          onClick={() => { if (onHelp) onHelp(); else setHelpOpen(true); }}
          className={styles.helpButton}
        >
          <CirclePlay size={15} aria-hidden="true" />
          Jak zkopírovat kariéru
        </button>
      </div>
      {helpOpen && <CareerImportHelpDialog context={context} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
