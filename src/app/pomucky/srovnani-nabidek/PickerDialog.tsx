"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./comparison.module.css";

export function PickerDialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const initialFocus = ref.current?.querySelector<HTMLElement>("input") ?? ref.current?.querySelector<HTMLElement>("button, [tabindex='0']");
    initialFocus?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const targets = Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, select:not(:disabled), a[href], iframe, [tabindex='0']") ?? []);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = originalOverflow; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);
  return <div className={styles.backdrop} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} className={`${styles.dialog} ${wide ? styles.wideDialog : ""}`} role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <header><h2 id={headingId}>{title}</h2><button type="button" className={styles.iconButton} aria-label="Zavřít dialog" onClick={onClose}><X size={20} /></button></header>
      {children}
    </div>
  </div>;
}
