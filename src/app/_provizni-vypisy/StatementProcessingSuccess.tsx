"use client";

import { useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { StatementProcessingSummary } from "./statementTypes";
import styles from "./statementProcessingSuccess.module.css";

const DISPLAY_MS = 3200;
const PARTICLES = Array.from({ length: 16 }, (_, index) => {
  const angle = (index / 16) * Math.PI * 2;
  const radius = 85 + (index % 3) * 18;
  return {
    "--particle-x": `${Math.round(Math.cos(angle) * radius)}px`,
    "--particle-y": `${Math.round(Math.sin(angle) * radius)}px`,
    "--particle-turn": `${index * 47}deg`,
    "--particle-delay": `${180 + (index % 4) * 45}ms`,
  } as CSSProperties;
});

export type StatementProcessingSuccessResult = {
  statementCount: number;
  summary: StatementProcessingSummary;
};

export function StatementProcessingSuccess({ result, onDismiss }: {
  result: StatementProcessingSuccessResult;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, DISPLAY_MS);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onDismiss]);

  if (typeof document === "undefined") return null;

  const { statementCount, summary } = result;
  const needsReview = summary.errors.length > 0 || summary.ambiguousContracts.length > 0 ||
    summary.skippedContracts.length > 0 || summary.accountingRepairDrafts > 0 || summary.externalUpdateTasks > 0;
  const title = summary.errors.length > 0 ? "Zpracováno s upozorněním"
    : statementCount === 1 ? "Výpis zpracován"
      : statementCount < 5 ? `${statementCount} výpisy zpracovány` : `${statementCount} výpisů zpracováno`;

  return createPortal(
    <div className={styles.overlay} style={{ "--display-duration": `${DISPLAY_MS}ms` } as CSSProperties}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.card} data-review={needsReview}>
        <button type="button" className={styles.close} onClick={onDismiss} aria-label="Zavřít oznámení o zpracování">
          <X size={17} aria-hidden="true" />
        </button>
        <div className={styles.visual} aria-hidden="true">
          <span className={styles.halo} />
          <span className={styles.ripple} />
          {!needsReview && PARTICLES.map((style, index) => <i key={index} className={styles.particle} style={style} />)}
          <div className={styles.badge}>
            <svg viewBox="0 0 64 64" fill="none">
              <circle className={styles.checkRing} cx="32" cy="32" r="25" pathLength="1" />
              {needsReview
                ? <path className={styles.check} d="M32 19v17m0 9v.1" pathLength="1" />
                : <path className={styles.check} d="m20 32 8 8 17-18" pathLength="1" />}
            </svg>
          </div>
        </div>
        <div className={styles.copy} role="status" aria-live="polite" aria-atomic="true">
          <p className={styles.eyebrow}>{needsReview ? "Dokončeno · ke kontrole" : "Hotovo"}</p>
          <h2>{title}</h2>
          <p className={styles.description}>{needsReview
            ? "Některé položky vyžadují kontrolu. Podrobnosti najdeš v auditu po zápisu."
            : "Zpracování je dokončené. Výsledky najdeš v přehledu."}</p>
        </div>
      </div>
    </div>,
    document.body
  );
}
