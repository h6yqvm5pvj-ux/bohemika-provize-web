"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CircleHelp, X } from "lucide-react";
import styles from "./calculatorHelp.module.css";

export function CalculatorNeonInvestHelp() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="NEON INVEST nápověda"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Nápověda k pojistnému NEON INVEST"
        onClick={() => setOpen(true)}
        className="ui-focus inline-flex min-h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-50 hover:text-violet-900"
      >
        <CircleHelp size={14} strokeWidth={1.8} aria-hidden="true" />
        NEON INVEST
      </button>
      {open && createPortal(
        <dialog
          ref={dialogRef}
          className={styles.dialog}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onCancel={(event) => { event.preventDefault(); setOpen(false); }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right ||
              event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
          }}
        >
          <header className={styles.header}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700">
              <AlertTriangle size={23} aria-hidden="true" />
            </span>
            <div className={styles.heading}>
              <h2 id={titleId}>NEON INVEST nápověda</h2>
            </div>
            <button type="button" className={styles.close} aria-label="Zavřít nápovědu" onClick={() => setOpen(false)}>
              <X size={19} aria-hidden="true" />
            </button>
          </header>
          <div className={`${styles.content} flex flex-col gap-4 text-sm leading-relaxed`}>
            <p id={descriptionId} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <strong>POZOR:</strong> V případě vkládání NEON INVEST zadávej pojistné <strong>ponížené o investovanou část!</strong>
            </p>
            <p>
              <strong>Příklad:</strong> Celkové měsíční pojistné činí <strong>1 500 Kč</strong>, investované pojistné <strong>100 Kč</strong>.
              {" "}V kalkulačce zadej <strong>1 400 Kč</strong>.
            </p>
            <p>Jedině tak bude provize spočítána správně. <strong>Provizi z investiční části nepočítáme.</strong></p>
          </div>
          <footer className={styles.footer}>
            <button type="button" className={styles.continueButton} onClick={() => setOpen(false)}>Rozumím</button>
          </footer>
        </dialog>,
        document.body
      )}
    </>
  );
}
