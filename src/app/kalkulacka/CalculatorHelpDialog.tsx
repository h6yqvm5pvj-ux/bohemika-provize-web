"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ChevronDown, CircleHelp, ListChecks, X } from "lucide-react";

import styles from "./calculatorHelp.module.css";

type CalculatorHelpDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  productLabel?: string;
  showNeonHelp: boolean;
  showReplacementHelp: boolean;
};

function HelpQuestion({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className={styles.question}>
      <summary>{title}<ChevronDown size={16} aria-hidden="true" /></summary>
      <div className={styles.answer}>{children}</div>
    </details>
  );
}

export function CalculatorHelpDialog({
  isOpen,
  onClose,
  productLabel,
  showNeonHelp,
  showReplacementHelp,
}: CalculatorHelpDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom) {
          onClose();
        }
      }}
    >
      <header className={styles.header}>
        <span className={styles.headerIcon}><CircleHelp size={23} aria-hidden="true" /></span>
        <div className={styles.heading}>
          <h2 id={titleId}>Jak přidat smlouvu</h2>
          <p id={descriptionId}>Tři kroky od PDF k uložené smlouvě.</p>
          {productLabel && <span className={styles.product}>{productLabel}</span>}
        </div>
        <button type="button" className={styles.close} aria-label="Zavřít nápovědu" onClick={onClose}>
          <X size={19} aria-hidden="true" />
        </button>
      </header>

      <div className={styles.content}>
        <ol className={styles.steps} aria-label="Postup přidání smlouvy">
          <li>
            <span className={styles.stepNumber} aria-hidden="true">1</span>
            <div>
              <h3>Nahraj PDF smlouvy</h3>
              <p>Aplikace zkusí předvyplnit údaje. Nemáš PDF? Vyber produkt a vyplň smlouvu ručně.</p>
            </div>
          </li>
          <li>
            <span className={styles.stepNumber} aria-hidden="true">2</span>
            <div>
              <h3>Zkontroluj a doplň údaje</h3>
              <p>Klienta, produkt, číslo smlouvy, datum uzavření, pojistné, frekvenci platby, pozici a režim provize.</p>
            </div>
          </li>
          <li>
            <span className={styles.stepNumber} aria-hidden="true">3</span>
            <div>
              <h3>Klikni na „Uložit jako sepsáno“</h3>
              <p>Nahrané PDF se přiloží k detailu smlouvy. Smlouva se promítne do produkce, výplat a dalších přehledů.</p>
            </div>
          </li>
        </ol>

        <aside className={styles.reminder}>
          <ListChecks size={19} aria-hidden="true" />
          <p><strong>Načtené údaje vždy zkontroluj.</strong> Automatické načtení může být neúplné. Rozhodující jsou údaje ve smlouvě.</p>
        </aside>

        <section className={styles.questions} aria-label="Další otázky k přidání smlouvy">
          <p className={styles.questionsTitle}>Když potřebuješ vědět víc</p>
          <HelpQuestion title="Mám jen sken nebo fotku">
            <p>Automatické načtení funguje nejlépe u originálního PDF. U skenu nebo fotky počítej s ručním doplněním údajů. Sken ve formátu PDF můžeš nahrát jako přílohu smlouvy.</p>
          </HelpQuestion>
          <HelpQuestion title="Některé údaje se nenačetly">
            <p>Chybějící nebo nesprávné údaje doplň podle smlouvy. Pokud aplikace nerozpoznala produkt, vyber ho ručně a pokračuj ve vyplňování.</p>
          </HelpQuestion>
          <HelpQuestion title="Smlouva vznikla z tipu">
            <p>Klikni na <strong>Smlouva z TIPU</strong>, zadej firemní e-mail nebo jméno tipaře a nastav jeho procenta. Tipař nemusí mít účet v Bohemka.App.</p>
            <p>Po potvrzení se tipařská část automaticky odečte ze vznikové provize.</p>
          </HelpQuestion>
          {showNeonHelp && (
            <>
              <HelpQuestion title="NEON: jak zadat Refresh smlouvy">
                <p>Pro správný výpočet provize musí být v systému původní smlouva. Pokud chybí, zaškrtni <strong>Původní smlouva není v systému</strong>. Novou smlouvu můžeš uložit i tak.</p>
                <p>Po nahrání provizního výpisu se smlouva automaticky aktualizuje podle jeho údajů.</p>
              </HelpQuestion>
              <HelpQuestion title="NEON: jak zadat Změnu smlouvy">
                <p>Zadej <strong>nové celkové pojistné</strong> ze smlouvy. Aplikace ho porovná s původním pojistným a podle rozdílu sníží provizi nebo vypočítá provizi za navýšení.</p>
              </HelpQuestion>
            </>
          )}
          {showReplacementHelp && (
            <HelpQuestion title="Jak zadat náhradu smlouvy">
              <p>Zadej číslo původní smlouvy. Pokud se najde v systému, při uložení nové smlouvy se původní automaticky označí jako stornovaná k datu počátku nové smlouvy.</p>
            </HelpQuestion>
          )}
        </section>
      </div>

      <footer className={styles.footer}>
        <span>Nápovědu můžeš kdykoliv znovu otevřít.</span>
        <button type="button" className={styles.continueButton} onClick={onClose}>
          Rozumím, pokračovat <ArrowRight size={16} aria-hidden="true" />
        </button>
      </footer>
    </dialog>,
    document.body
  );
}
