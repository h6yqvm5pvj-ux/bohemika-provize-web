"use client";

import type { ReactNode } from "react";
import { Check, ClipboardCopy, Info } from "lucide-react";
import styles from "./forms.module.css";

export function RecordNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className={styles.notice}>
      <Info size={17} aria-hidden="true" />
      <div><strong>{title}</strong><p>{children}</p></div>
    </aside>
  );
}

export function RecordSection({
  eyebrow, title, description, children,
}: {
  eyebrow: string; title: string; description?: string; children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {description && <p className={styles.sectionDescription}>{description}</p>}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

export function RecordCopyButton({
  text, copiedText, onCopy,
}: { text: string; copiedText: string | null; onCopy: (text: string) => void }) {
  const copied = copiedText === text;
  return (
    <button type="button" onClick={() => onCopy(text)} className={styles.copyButton} data-copied={copied}>
      {copied ? <Check size={14} aria-hidden="true" /> : <ClipboardCopy size={14} aria-hidden="true" />}
      {copied ? "Zkopírováno" : "Kopírovat"}
    </button>
  );
}

export function RecordPhraseRow({
  index, text, copiedText, onCopy, helper,
}: {
  index?: number; text: string; copiedText: string | null;
  onCopy: (text: string) => void; helper?: string;
}) {
  return (
    <article className={styles.phraseRow}>
      {index && <span className={styles.rowNumber} aria-hidden="true">{String(index).padStart(2, "0")}</span>}
      <div className={styles.phraseText}>
        <p>{text}</p>
        {helper && <p className={styles.helper}>{helper}</p>}
      </div>
      <RecordCopyButton text={text} copiedText={copiedText} onCopy={onCopy} />
    </article>
  );
}

export function RecordCopyFeedback({ copiedText, copyError }: { copiedText: string | null; copyError: boolean }) {
  return (
    <p className={`${styles.feedback} ${copyError ? styles.copyError : ""}`} role="status" aria-live="polite">
      {copyError ? "Kopírování se nepodařilo. Označ text a zkopíruj jej ručně." : copiedText ? "Text byl zkopírován do schránky." : ""}
    </p>
  );
}
