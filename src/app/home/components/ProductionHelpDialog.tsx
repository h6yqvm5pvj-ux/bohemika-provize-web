"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  CalendarDays,
  Check,
  HandCoins,
  HeartPulse,
  Layers3,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import styles from "./ProductionHelpDialog.module.css";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  showTeamBox: boolean;
  showOnlyTeamProduction: boolean;
};

export function ProductionHelpDialog({
  isOpen,
  onClose,
  showTeamBox,
  showOnlyTeamProduction,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>Nápověda</p>
            <h2 id={titleId}>Jak číst produkci</h2>
            <p id={descriptionId} className={styles.description}>
              Co znamenají částky a počty smluv v přehledu za aktuální měsíc.
            </p>
          </div>
          <div className={styles.headerArt} aria-hidden="true"><BarChart3 size={38} strokeWidth={1.6} /></div>
          <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Zavřít nápovědu">
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          <section className={styles.dateRule}>
            <span className={styles.dateIcon}><CalendarDays size={22} aria-hidden="true" /></span>
            <div>
              <h3>Rozhoduje datum uzavření</h3>
              <p>Do přehledu patří pouze smlouvy uzavřené v aktuálním měsíci. Datum vytvoření záznamu v aplikaci pro tento přehled nerozhoduje.</p>
            </div>
          </section>

          <div className={styles.cards}>
            {!showOnlyTeamProduction && (
              <section className={styles.card}>
                <div className={styles.cardHeading}>
                  <span className={styles.cardIcon}><UserRound size={20} aria-hidden="true" /></span>
                  <h3>Vlastní produkce</h3>
                </div>
                <p>Součet okamžitých provizí ze smluv, které má poradce sjednané v aktuálním měsíci.</p>
                <p>U produktů rozdělených na provizní kódy se počítá jen okamžitá část, například <code>A101</code>, <code>B0301</code> a polovina <code>B36/B3601</code>.</p>
                <p className={styles.cardNote}>Následné provize a souhrnné řádky se nezapočítávají.</p>
              </section>
            )}

            {showTeamBox && (
              <section className={styles.card}>
                <div className={styles.cardHeading}>
                  <span className={styles.cardIcon}><UsersRound size={20} aria-hidden="true" /></span>
                  <h3>Týmová produkce</h3>
                </div>
                <p>Meziprovize manažera ze smluv v podřízené týmové struktuře. I tady rozhoduje uzavření smlouvy v aktuálním měsíci.</p>
                <p className={styles.cardNote}>Počítají se jen okamžité části meziprovize, ne celá meziprovize ani pozdější následné části.</p>
              </section>
            )}

            {!showOnlyTeamProduction && (
              <section className={styles.card}>
                <div className={styles.cardHeading}>
                  <span className={`${styles.cardIcon} ${styles.tipIcon}`}><HandCoins size={20} aria-hidden="true" /></span>
                  <h3>TIP produkce</h3>
                </div>
                <p>Pokud má poradce TIP výplaty, zobrazují se samostatně. Počet TIPů vychází ze zdrojových smluv v aktuálním měsíci; částka sčítá kladné TIP výplaty.</p>
                <p className={styles.cardNote}>Používá se datum uzavření zdrojové smlouvy. Pokud není známé, použije se datum výplaty.</p>
              </section>
            )}

            {showTeamBox && !showOnlyTeamProduction && (
              <section className={`${styles.card} ${styles.total}`}>
                <div className={styles.cardHeading}>
                  <span className={styles.cardIcon}><Layers3 size={20} aria-hidden="true" /></span>
                  <h3>Celková produkce</h3>
                </div>
                <p>Součet vlastní produkce, týmové produkce a případných TIP výplat.</p>
                <div className={styles.formula} aria-label="Vlastní produkce plus týmová produkce plus TIP výplaty">
                  <span>Vlastní</span><span aria-hidden="true">+</span><span>Týmová</span><span aria-hidden="true">+</span><span>TIP</span>
                </div>
                <p className={styles.cardNote}>Počet smluv je součet vlastních a týmových smluv. TIP má vlastní počet zvlášť.</p>
              </section>
            )}
          </div>

          <section className={styles.premiums}>
            <h3>Pojistné sjednaných smluv</h3>
            <div className={styles.premiumTypes}>
              <div><HeartPulse size={19} aria-hidden="true" /><p><strong>Životní pojištění</strong><span>Součet měsíčního pojistného.</span></p></div>
              <div><ShieldCheck size={19} aria-hidden="true" /><p><strong>Vedlejší produkty</strong><span>Součet ročního pojistného ostatních pojištění. Splátky se přepočítávají podle frekvence placení.</span></p></div>
            </div>
            <p>Jde o pojistné evidované u stejných smluv jako počet smluv v přehledu, nikoli o provize nebo upravenou provizní základnu.</p>
            <p>{showOnlyTeamProduction
              ? "Tým zahrnuje celé pojistné podřízených smluv."
              : showTeamBox
                ? "Tým zahrnuje celé pojistné podřízených smluv. Celkem je součet vlastní a týmové části."
                : "Vlastní část zahrnuje pojistné vlastních smluv."}</p>
            <p className={styles.premiumNote}>Samostatné TIP výplaty se do pojistného nepřičítají.</p>
          </section>
        </div>

        <footer className={styles.footer}>
          <span>Přehled za aktuální měsíc</span>
          <button type="button" className={styles.confirm} onClick={onClose}><Check size={17} aria-hidden="true" />Rozumím</button>
        </footer>
      </div>
    </dialog>,
    document.body,
  );
}
