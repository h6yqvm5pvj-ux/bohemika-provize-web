"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./tipDialogs.module.css";

export function TipDialog({
  title,
  subtitle,
  children,
  actions,
  onClose,
  busy = false,
  size = "large",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  size?: "large" | "small";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      aria-modal="true"
      className={`${styles.dialog} ${size === "small" ? styles.small : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className={styles.surface}>
        <header className={styles.header}>
          <div className={styles.title}>
            <span className={styles.windowDot} />
            <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
          </div>
          <div className={styles.actions}>
            {actions}
            <button type="button" onClick={onClose} disabled={busy} aria-label={`Zavřít ${title.toLocaleLowerCase("cs")}`} className={styles.close}>
              <X size={19} />
            </button>
          </div>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}
