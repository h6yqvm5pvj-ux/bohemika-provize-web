"use client";

import { useEffect, useId, useRef } from "react";
import { Briefcase, ShieldCheck, X } from "lucide-react";
import type { RecordLiabilityKind } from "./types";
import styles from "./liabilityTypeDialog.module.css";

export function LiabilityTypeDialog({ onSelect, onClose }: {
  onSelect: (kind: RecordLiabilityKind) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    firstChoiceRef.current?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={styles.dialog}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <header className={styles.header}>
        <h2 id={titleId}>Jakou odpovědnost řešíš?</h2>
        <button type="button" className={styles.close} aria-label="Zavřít výběr odpovědnosti" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.choices}>
        <button ref={firstChoiceRef} type="button" aria-label="Občan" className={styles.choice} onClick={() => onSelect("citizen")}>
          <ShieldCheck size={28} strokeWidth={1.6} aria-hidden="true" />
          <strong>Občan</strong>
          <span>Odpovědnost v běžném životě</span>
        </button>
        <button type="button" aria-label="Zaměstnanec" className={styles.choice} onClick={() => onSelect("employee")}>
          <Briefcase size={28} strokeWidth={1.6} aria-hidden="true" />
          <strong>Zaměstnanec</strong>
          <span>Odpovědnost vůči zaměstnavateli</span>
        </button>
      </div>
    </dialog>
  );
}
