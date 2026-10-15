"use client";

import { useId, type ReactNode } from "react";
import { AlertCircle, Check, ClipboardCopy } from "lucide-react";
import styles from "./results.module.css";
import type { RecordCopyFeedback } from "./useRecordClipboard";

export { useRecordClipboard } from "./useRecordClipboard";

export type CopyHandler = (text: string) => void;

export function CopyFeedback({ feedback }: { feedback: RecordCopyFeedback }) {
  return (
    <div
      role={feedback?.kind === "error" ? "alert" : "status"}
      aria-atomic="true"
      className={feedback ? `${styles.feedback} ${feedback.kind === "error" ? styles.feedbackError : ""}` : undefined}
    >
      {feedback && <>{feedback.kind === "error" ? <AlertCircle size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}<span>{feedback.message}</span></>}
    </div>
  );
}

export function CopyAction({ text, copiedText, onCopy, label = "Kopírovat" }: {
  text: string;
  copiedText: string | null;
  onCopy: CopyHandler;
  label?: string;
}) {
  const copied = copiedText === text;
  return (
    <button type="button" onClick={() => onCopy(text)} className={styles.copyAction} data-copied={copied}>
      {copied ? <Check size={15} aria-hidden="true" /> : <ClipboardCopy size={15} aria-hidden="true" />}
      <span>{copied ? "Zkopírováno" : label}</span>
    </button>
  );
}

export function ResultSection({ id, eyebrow, title, description, countLabel, copyText, copiedText, onCopy, children }: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  countLabel?: string;
  copyText?: string;
  copiedText: string | null;
  onCopy: CopyHandler;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section id={id} className={styles.section} aria-labelledby={headingId}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeading}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2 id={headingId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {(countLabel || copyText) && <div className={styles.sectionActions}>
          {countLabel && <span className={styles.count}>{countLabel}</span>}
          {copyText && <CopyAction text={copyText} copiedText={copiedText} onCopy={onCopy} label="Kopírovat vše" />}
        </div>}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

export function ResultTextRow({ index, text, copiedText, onCopy, copyable = true, reason }: {
  index: number;
  text: string;
  copiedText: string | null;
  onCopy: CopyHandler;
  copyable?: boolean;
  reason?: string;
}) {
  return (
    <article className={styles.textRow}>
      <span className={styles.rowNumber} aria-hidden="true">{String(index).padStart(2, "0")}</span>
      <div className={styles.rowContent}>
        {reason && <span className={styles.reason}>{reason}</span>}
        <p>{text}</p>
      </div>
      {copyable ? <CopyAction text={text} copiedText={copiedText} onCopy={onCopy} /> : <span className={styles.manual}>doplnit ručně</span>}
    </article>
  );
}
