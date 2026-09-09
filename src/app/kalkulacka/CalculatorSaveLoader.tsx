"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, CloudUpload, FileText, LoaderCircle } from "lucide-react";
import type { ContractSaveStage } from "./useContractSave";
import styles from "./calculatorSaveLoader.module.css";

type CalculatorSaveLoaderProps = {
  stage: ContractSaveStage;
  hasPdfAttachment?: boolean;
  clientName?: string | null;
  contractNumber?: string | null;
  isEndorsement?: boolean;
};

export function CalculatorSaveLoader({
  stage,
  hasPdfAttachment = false,
  clientName,
  contractNumber,
  isEndorsement = false,
}: CalculatorSaveLoaderProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const steps = [
    { id: "preparing", label: "Příprava" },
    { id: "saving", label: "Uložení" },
    ...(hasPdfAttachment ? [{ id: "attachment", label: "PDF příloha" }] : []),
  ];
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === stage));
  const title = stage === "attachment" ? "Přikládám PDF"
    : stage === "saving" ? (isEndorsement ? "Ukládám dodatek" : "Ukládám smlouvu")
      : (isEndorsement ? "Připravuji dodatek" : "Připravuji smlouvu");
  const description = stage === "attachment"
    ? `${isEndorsement ? "Dodatek je uložený" : "Smlouva je uložená"}. Ještě připojuji dokument.`
    : stage === "saving" ? "Zapisují se údaje do tvého přehledu smluv."
      : "Ověřuji údaje a připravuji vše k uložení.";
  const name = clientName?.trim();
  const number = contractNumber?.trim();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.overlay}>
      <section
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={(event) => {
          // Keep focus in the saving dialog until the request completes.
          if (event.key === "Tab") event.preventDefault();
        }}
      >
        <header className={styles.header}>
          <span className={styles.eyebrow}><span />{isEndorsement ? "Uložení dodatku" : "Uložení smlouvy"}</span>
          <span className={styles.stepCount}>Krok {activeIndex + 1} ze {steps.length}</span>
        </header>

        <div className={styles.scene} aria-hidden="true">
          <span className={styles.glow} />
          <span className={styles.orbit} />
          <span className={styles.orbitDot} />
          <span className={styles.backSheet} />
          <div className={styles.document}>
            <FileText className={styles.documentIcon} size={23} strokeWidth={1.7} />
            <span className={styles.documentLine} />
            <span className={styles.documentLine} />
            <span className={styles.documentLine} />
            <span className={styles.scan} />
            {stage === "attachment" && <span className={styles.documentCheck}><Check size={12} strokeWidth={3} /></span>}
          </div>
          <span className={styles.uploadBadge}>
            {stage === "attachment" ? <CloudUpload size={25} strokeWidth={1.8} /> : <LoaderCircle className={styles.spinner} size={25} strokeWidth={1.8} />}
          </span>
          <span className={styles.spark} />
        </div>

        <div className={styles.status} role="status" aria-live="polite" aria-atomic="true">
          <h2 id={titleId} className={styles.title}>{title}<span className={styles.ellipsis} aria-hidden="true"><i /><i /><i /></span></h2>
          <p id={descriptionId} className={styles.description}>{description}</p>
        </div>

        {(name || number) && (
          <div className={styles.contract}>
            <span className={styles.contractIcon}><FileText size={17} strokeWidth={1.8} aria-hidden="true" /></span>
            <div className={styles.contractText}>
              {name && <span className={styles.clientName} title={name}>{name}</span>}
              {number && <span className={styles.contractNumber} title={number}>Smlouva {number}</span>}
            </div>
          </div>
        )}

        <ol className={styles.steps} aria-label="Průběh uložení">
          {steps.map((step, index) => {
            const state = index < activeIndex ? "complete" : index === activeIndex ? "active" : "pending";
            return (
              <li key={step.id} className={styles.step} data-state={state} aria-current={state === "active" ? "step" : undefined}>
                <span className={styles.stepCircle} aria-hidden="true">
                  {state === "complete" ? <Check size={13} strokeWidth={2.7} /> : state === "active" ? <span className={styles.activeDot} /> : index + 1}
                </span>
                <span>{step.label}</span>
                <span className={styles.srOnly}> — {state === "complete" ? "dokončeno" : state === "active" ? "probíhá" : "čeká"}</span>
              </li>
            );
          })}
        </ol>
        <p className={styles.footer}>Po uložení se přehled automaticky aktualizuje.</p>
      </section>
    </div>,
    document.body
  );
}
