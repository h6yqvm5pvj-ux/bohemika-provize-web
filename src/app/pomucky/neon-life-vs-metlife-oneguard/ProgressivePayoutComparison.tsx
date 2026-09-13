"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, ChartNoAxesColumn, X } from "lucide-react";
import styles from "./comparison.module.css";

const COMPARISON_URL =
  "/pomucky/srovnavac-trvalych-nasledku?embed=1&preset=neon-oneguard-10x";

export function ProgressivePayoutComparison() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={styles.interactiveButton}
      >
        <ChartNoAxesColumn className="h-4 w-4" aria-hidden="true" />
        Zobrazit interaktivní srovnání
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.modalOverlay}
              role="dialog"
              aria-modal="true"
              aria-labelledby="progressive-payout-modal-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setOpen(false);
              }}
            >
              <div className={styles.modal}>
                <header className={styles.modalHeader}>
                  <div className="min-w-0">
                    <p>Progresivní plnění 10×</p>
                    <h2 id="progressive-payout-modal-title">
                      ČPP NEON vs. MetLife OneGuard
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Zavřít srovnání"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </header>
                <iframe
                  src={COMPARISON_URL}
                  title="Srovnání progresivního plnění ČPP NEON a MetLife OneGuard"
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
