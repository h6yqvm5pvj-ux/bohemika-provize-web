"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import styles from "./careerImportHelp.module.css";
import { CareerAppDemo } from "./CareerAppDemo";

const STEP_DURATION_MS = 4_500;
const STEPS = [
  { title: "Označ tabulku", description: "V Maxxu otevři záložku Kariéra. Podrž levé tlačítko myši a označ všechny řádky od první pozice po poslední datum." },
  { title: "Zkopíruj obsah", description: "Na označený text klikni pravým tlačítkem a zvol Kopírovat. Použít můžeš i Ctrl + C, na Macu ⌘ + C." },
  { title: "Vlož do Bohemka App", description: "Přepni do Bohemka App, otevři Vložit kariéru z Maxxu a vlož text do pole. Použij pravé tlačítko → Vložit nebo Ctrl + V / ⌘ + V." },
  { title: "Předvyplň historii", description: "Klikni na Předvyplnit historii. Zkontroluj pozice a data, potom zvol Uložit historii. V úvodním průvodci zvol Pokračovat." },
];
const SETUP_STEPS = [
  ...STEPS.slice(0, 2),
  { title: "Vlož do Bohemka App", description: "V nastavení účtu otevři krok Kariéra a vlož zkopírovanou tabulku do pole. Použij pravé tlačítko → Vložit nebo Ctrl + V / ⌘ + V." },
  { title: "Předvyplň a pokračuj", description: "Klikni na Předvyplnit historii. Zkontroluj pozice a data, potom zvol Pokračovat. Historie se uloží a přejdeš k zabezpečení účtu." },
];

export type CareerImportContext = "settings" | "setup";

const DEMO_ROW_COUNT = 7;

function motionIsReduced() {
  return typeof window !== "undefined" && (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.dataset.motion === "off"
  );
}

export function CareerImportHelpDialog({ onClose, context = "settings" }: { onClose: () => void; context?: CareerImportContext }) {
  const steps = context === "setup" ? SETUP_STEPS : STEPS;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const remainingTimeRef = useRef(STEP_DURATION_MS);
  const stepDeadlineRef = useRef(0);
  const titleId = useId();
  const descriptionId = useId();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(() => !motionIsReduced());
  const [still, setStill] = useState(motionIsReduced);
  const [replay, setReplay] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    stepDeadlineRef.current = Date.now() + remainingTimeRef.current;
    const timer = window.setTimeout(() => {
      remainingTimeRef.current = STEP_DURATION_MS;
      if (step === steps.length - 1) {
        setPlaying(false);
        setStill(true);
        setFinished(true);
      } else {
        setStep(step + 1);
      }
    }, remainingTimeRef.current);
    return () => window.clearTimeout(timer);
  }, [playing, step, replay, steps.length]);

  const restart = (forcePlayback = false) => {
    const reduced = !forcePlayback && motionIsReduced();
    remainingTimeRef.current = STEP_DURATION_MS;
    setStep(0);
    setPlaying(!reduced);
    setStill(reduced);
    setFinished(false);
    setReplay((previous) => previous + 1);
  };

  const selectStep = (index: number) => {
    remainingTimeRef.current = STEP_DURATION_MS;
    setStep(index);
    setPlaying(false);
    setStill(true);
    setFinished(false);
    setReplay((previous) => previous + 1);
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className={styles.content}>
        <header className={styles.header}>
          <h2 id={titleId}>Jak zkopírovat kariéru z Maxxu</h2>
          <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Zavřít nápovědu"><X size={20} aria-hidden="true" /></button>
        </header>

        <div
          key={`${step}-${replay}`}
          className={styles.demonstration}
          data-step={step}
          data-context={context}
          data-playing={playing}
          data-still={still}
          aria-hidden="true"
        >
          <div className={styles.browserBar}>
            <div className={styles.windowDots}><i /><i /><i /></div>
            <div className={`${styles.browserTab} ${step < 2 ? styles.activeTab : ""}`}><span className={styles.maxxMark}>M</span>Maxx · Kariéra</div>
            <div className={`${styles.browserTab} ${step >= 2 ? styles.activeTab : ""}`}><span className={styles.bohemkaMark}>b</span>Bohemka App</div>
          </div>
          <div className={styles.viewport}>
            <div className={styles.maxxCanvas}>
              <Image src="/images/help/career-maxx.webp" width={1500} height={584} alt="" className={styles.screenshot} unoptimized />
              <div className={styles.selection}>
                {Array.from({ length: DEMO_ROW_COUNT }, (_, index) => <div key={index} className={styles.selectionRow}><span /><span /><span /></div>)}
              </div>
              {step < 2 && <div className={styles.maxxCursor}><MousePointer2 size={27} fill="white" strokeWidth={1.8} /><span className={styles.clickRing} /></div>}
              {step === 1 && <>
                <div className={styles.copyMenu}><Copy size={15} /> Kopírovat <span>Ctrl / ⌘ + C</span></div>
                <div className={styles.copiedBadge}><Check size={15} /> Tabulka zkopírována</div>
              </>}
            </div>

            {step >= 2 && <CareerAppDemo step={step} context={context} />}
          </div>
          {step === 2 && <div className={styles.switchCursor}><MousePointer2 size={27} fill="white" strokeWidth={1.8} /><span className={styles.clickRing} /></div>}
          {step < 2 && <div className={styles.sceneLabel}><span />MAXX<span className={styles.sceneLabelDetail}>Ukázka postupu</span></div>}
        </div>

        <nav className={styles.steps} aria-label="Kroky návodu">
          {steps.map((item, index) => <button
            key={item.title}
            type="button"
            aria-label={`${index + 1}. ${item.title}`}
            aria-current={step === index ? "step" : undefined}
            className={`${styles.step} ${step === index ? styles.currentStep : ""}`}
            onClick={() => selectStep(index)}
          ><span className={styles.stepNumber}>{index < step ? <Check size={14} aria-hidden="true" /> : index + 1}</span><span className={styles.stepLabel}>{item.title}</span></button>)}
        </nav>
        <p id={descriptionId} className={styles.stepDescription} aria-live="polite" aria-atomic="true"><strong className={styles.stepTitle}>{steps[step].title}</strong>{steps[step].description}</p>

        <footer className={styles.footer}>
          <div className={styles.controls}>
            <button type="button" aria-label={playing ? "Pozastavit návod" : "Přehrát návod"} onClick={() => {
              if (finished) { restart(true); return; }
              if (playing) remainingTimeRef.current = Math.max(0, stepDeadlineRef.current - Date.now());
              if (!playing) setStill(false);
              setPlaying(!playing);
            }}>{playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}{playing ? "Pozastavit" : "Přehrát"}</button>
            <button type="button" onClick={() => restart()} aria-label="Přehrát znovu"><RotateCcw size={15} aria-hidden="true" /> Znovu</button>
          </div>
          <a href="https://sjednatel.bohemiaservis.cz/broker-card" target="_blank" rel="noopener noreferrer" aria-label="Otevřít kariéru v Maxxu"><span className={styles.linkLong}>Otevřít kariéru v Maxxu</span><span className={styles.linkShort}>Maxx</span><ExternalLink size={14} aria-hidden="true" /></a>
        </footer>
      </div>
    </dialog>
  );
}
