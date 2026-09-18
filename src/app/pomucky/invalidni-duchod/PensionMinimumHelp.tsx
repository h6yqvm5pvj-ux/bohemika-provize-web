"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, CircleHelp, X } from "lucide-react";
import styles from "./pension.module.css";

export function PensionMinimumAgeHint({ clientAge, id, compact = false }: { clientAge?: number; id?: string; compact?: boolean }) {
  if (clientAge === undefined) return null;
  return <div id={id} className={styles.minimumAgeHint} data-available={clientAge < 28} data-compact={compact}>
    <CalendarDays size={17} strokeWidth={1.8} aria-hidden="true" />
    <div>
      <strong>Věk z kroku Klient: {clientAge} let</strong>
      <p>{compact
        ? clientAge >= 28 ? "Volba pro mladší 28 let je nedostupná."
          : clientAge < 18 ? "Před 18 lety platí zvláštní podmínky; viz Nápověda."
            : "Samotný věk nestačí. Podmínky ověř v nápovědě."
        : clientAge >= 28
        ? "Varianta pro mladší 28 let pro tento věk není dostupná. Režim „Alespoň 15 let pojištění“ závisí na skutečně získané době, nikoli jen na věku."
        : clientAge < 18
          ? "Věková podmínka je splněná. Při přiznání důchodu před 18. narozeninami platí zvláštní pravidlo; ověř samotný nárok u ČSSZ."
          : "Věková podmínka je splněná. Ještě ověř nárok na důchod a pokrytí období od 18. narozenin studiem, pojištěním či dalšími uznatelnými dobami. Samotný věk nestačí."}</p>
    </div>
  </div>;
}

export function PensionMinimumHelp({ clientAge }: { clientAge?: number }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const dialogId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const trigger = buttonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  return <>
    <button ref={buttonRef} type="button" className={styles.minimumHelpButton} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined}>
      <CircleHelp size={16} strokeWidth={1.8} aria-hidden="true" /> Nápověda
    </button>
    {open && <dialog ref={dialogRef} id={dialogId} className={styles.minimumDialog} aria-labelledby={titleId}
      onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className={styles.minimumDialogContent}>
        <header className={styles.minimumDialogHeader}>
          <div><span>ZVÝŠENÉ MINIMUM DŮCHODU</span><h2 id={titleId}>Kdy zvolit „Mladší 28 let“?</h2></div>
          <button type="button" className={styles.minimumHelpClose} onClick={() => setOpen(false)} aria-label="Zavřít nápovědu"><X size={19} aria-hidden="true" /></button>
        </header>
        <div className={styles.minimumDialogBody}>
          <PensionMinimumAgeHint clientAge={clientAge} />
          <p>{clientAge === undefined ? "V samostatné kalkulačce ověř věk k datu vzniku nároku zvlášť." : "Věk přebíráme z kroku Klient."} Zvýšené minimum se podle věku <strong>nezapíná automaticky</strong> — rozhoduje také průběh pojištění.</p>
          <h3>Co musí být splněno</h3>
          <ul>
            <li>Při vzniku nároku je klient <strong>mladší 28 let</strong> a má nárok na invalidní důchod.</li>
            <li>Od 18. narozenin do vzniku nároku je období pokryté uznatelnými dobami, nebo <strong>součet všech nepokrytých mezer je kratší než jeden rok</strong>.</li>
            <li>Pro tuto podmínku se počítá pojištěné zaměstnání či podnikání, uznatelné náhradní doby, evidence uchazeče na Úřadu práce a studium SŠ/VŠ v ČR — po 18. narozeninách prvních šest let studia.</li>
          </ul>
          <div className={styles.minimumExample}>
            <h3>Příklad: klientka, 25 let, pracuje 4,5 roku</h3>
            <p>Pokud od 18 let studovala SŠ/VŠ v ČR, poté nastoupila do pojištěného zaměstnání a nepokryté mezery celkem nedosahují roku, může při splnění nároku použít tuto volbu.</p>
            <p><strong>Osm měsíců nepokrytých dob:</strong> podmínka mezer je splněná. <strong>Rok nebo více:</strong> podmínka splněná není. Samotných 4,5 roku práce o této volbě nerozhoduje.</p>
          </div>
          <h3>Co zadat do „Celková započtená doba“</h3>
          <p>Nezadávej pouze 4,5 nebo zaokrouhlených 5 odpracovaných let. Pole zahrnuje i uznatelné náhradní doby a dopočtenou dobu do zákonného důchodového věku. Ze samotného věku ji přesně určit nelze, proto ji nedoplňujeme automaticky.</p>
          <p>Při přiznání důchodu před 18. narozeninami se podmínka pokrytí období od 18 let neuplatní; nárok na důchod je potřeba ověřit i tak.</p>
          <p>Pokud průběh pojištění není ověřený, ponech prozatím „Bez zvýšeného minima“. Nárok a uznatelné doby ověří ČSSZ.</p>
          <div className={styles.minimumSources}>
            <a href="https://www.cssz.gov.cz/invalidni-duchody-podrobne" target="_blank" rel="noopener noreferrer">Podmínky ČSSZ <ArrowUpRight size={13} aria-hidden="true" /></a>
            <a href="https://ppropo.mpsv.cz/zakon_155_1995" target="_blank" rel="noopener noreferrer">§ 42 odst. 3 zákona <ArrowUpRight size={13} aria-hidden="true" /></a>
          </div>
        </div>
        <footer className={styles.minimumDialogFooter}><button type="button" className={styles.minimumHelpDone} onClick={() => setOpen(false)}>Rozumím</button></footer>
      </div>
    </dialog>}
  </>;
}
