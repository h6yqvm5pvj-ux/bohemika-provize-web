"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { AlertCircle, CheckCircle2, Info, Link2Off, X } from "lucide-react";
import styles from "./statementWorkspace.module.css";

function StatementHelpDialog({ dialogId, returnFocusRef, onClose }: { dialogId: string; returnFocusRef: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = returnFocusRef.current ?? document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    closeRef.current?.focus({ preventScroll: true });

    return () => {
      if (dialog?.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);

  return (
    <dialog
      ref={dialogRef}
      id={dialogId}
      className={styles.helpDialog}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={event => event.stopPropagation()}
    >
      <div className={styles.helpDialogContent}>
        <header className={styles.helpDialogHeader}>
          <div>
            <p className={styles.eyebrow}>NÁPOVĚDA K VÝPISU</p>
            <h2 id={titleId}>Jak se ve výpisu vyznat</h2>
            <p id={descriptionId}>Co znamenají částky, co se zapíše po zpracování a k čemu slouží jednotlivá tlačítka.</p>
          </div>
          <button ref={closeRef} type="button" className={styles.helpClose} onClick={onClose} aria-label="Zavřít nápovědu"><X size={19} aria-hidden="true" /></button>
        </header>

        <div className={styles.helpContent}>
          <section className={styles.helpStep}>
            <h3><span aria-hidden="true">1</span>Zkontroluj souhrn částek</h3>
            <p>Nahoře najdeš částky z nahraného výpisu. Souhrn zůstává stejný, i když v seznamu vyhledáváš nebo zapneš filtr.</p>
            <dl className={styles.helpAmounts}>
              <div><dt>Vyplaceno dle výpisu</dt><dd>Celková částka uvedená ve výpisu.</dd></div>
              <div><dt>Provize za smlouvy</dt><dd>Součet provizních řádků za smlouvy.</dd></div>
              <div><dt>Ostatní platby</dt><dd>Další platby uvedené ve výpisu.</dd></div>
              <div><dt>Provize manažera</dt><dd>Meziprovize ze smluv tvého týmu.</dd></div>
            </dl>
          </section>

          <section className={styles.helpStep}>
            <h3><span aria-hidden="true">2</span>Projdi smlouvy a případné rozdíly</h3>
            <p>Začni filtrem <strong>K prověření</strong>. Konkrétní smlouvu najdeš podle jména, čísla smlouvy nebo produktu. Kliknutím na řádek otevřeš detail a porovnání částek.</p>
            <dl className={styles.helpLegend}>
              <div><dt><CheckCircle2 size={16} aria-hidden="true" />Vše sedí</dt><dd>Smlouva je propojená se systémem a dostupné kontroly neukázaly rozdíl.</dd></div>
              <div><dt><AlertCircle size={16} aria-hidden="true" />K prověření</dt><dd>Našli jsme rozdíl, chybějící údaj nebo smlouvu bez propojení. V detailu zjistíš, co zkontrolovat.</dd></div>
              <div><dt><Link2Off size={16} aria-hidden="true" />Bez propojení</dt><dd>Smlouvu se nepodařilo jednoznačně najít v systému. Zkontroluj její číslo a zda je už uložená.</dd></div>
            </dl>
            <p><strong>Smlouvy mimo Bohemka.App</strong> sdružují smlouvy bez jednoznačného propojení s uloženou smlouvou. Označení <strong>Detail kontroly</strong> znamená, že smlouva nemá potvrzený výsledek všech kontrol.</p>
            <p>Storna a provize manažera najdeš níže ve vlastních seznamech s vlastním hledáním. Storno znamená vrácení dříve vyplacené provize.</p>
          </section>

          <section className={styles.helpStep}>
            <h3><span aria-hidden="true">3</span>Co se stane po kliknutí na Zpracovat výpis</h3>
            <ol className={styles.helpWriteSteps}>
              <li><strong>Uložení provizního výpisu.</strong> Výpis včetně jeho obsahu, čísla, období a částek se uloží do tvé historie. Znovu ho otevřeš přes <strong>Zobrazit historii</strong>.</li>
              <li><strong>Zápis provizí ke smlouvám.</strong> U jednoznačně nalezených smluv se uloží položky výplaty: částka, druh provize, období a odkaz na zdrojový výpis. Evidují se také rozdíly a storna. Zápisy najdeš v detailu smlouvy v části <strong>Provizní výpisy u smlouvy</strong>.</li>
              <li><strong>Promítnutí do Cashflow.</strong> Výpis se stane podkladem pro skutečně vyplacené provize. V celkovém přehledu bez filtrů se měsíční částka provizí zobrazí podle výpisu s označením <strong>Dle výpisu</strong>. Měsíc se určuje podle data vystavení; pokud datum chybí, použije se následující měsíc po konci období, případně měsíc začátku období.</li>
              <li><strong>Porovnání s očekávanými výplatami.</strong> Cashflow podle smlouvy a druhu provize rozpoznává potvrzené výplaty. Pokud zjistí, že očekávaná provize ve výpisu chybí, posune její odhad do dalšího měsíce. Celková výplata dle výpisu může zahrnovat i smlouvy mimo Bohemka.App.</li>
              <li><strong>Doplnění údajů u smlouvy.</strong> Pokud výpis obsahuje příslušné odkazy, uloží se ke smlouvě údaje pro tlačítka <strong>Maxx</strong> a <strong>ExtraNet</strong>. U podporovaných produktů může zpracování také doplnit historii pojistného nebo zpřesnit provizní základnu a přepočítat provize podle údajů z výpisu.</li>
              <li><strong>Výsledek zpracování.</strong> V části <strong>Audit po zápisu</strong> uvidíš nové a aktualizované položky, přeskočené záznamy a věci k ruční kontrole. Při opakovaném zpracování se existující zápisy porovnávají a aktualizují; duplicitní položky se přeskakují.</li>
            </ol>
            <p><strong>Výpisy můžeš nahrávat i zpětně.</strong> Když nahraješ starší výpis po novějším, u propojené smlouvy se podle dostupných uložených výpisů přepočítá navazující historie v časovém pořadí. Provize zůstanou přiřazené k měsícům podle data výpisu. Pro správné zařazení zkontroluj datum vystavení a období výpisu.</p>
            <p><strong>Smlouva se nenašla nebo má více shod?</strong> Provize se k ní automaticky nepřiřadí. Chybějící smlouvu můžeš doplnit přes <strong>Přidat smlouvu</strong>. Potom otevři výpis z historie a zvol <strong>Zpracovat znovu podle aktuálních smluv</strong>.</p>
          </section>

          <section className={styles.helpStep}>
            <h3><span aria-hidden="true">4</span>Tlačítka Detail smlouvy, Extranet a MAXX</h3>
            <dl className={styles.helpActions}>
              <div><dt>Detail smlouvy / Detail</dt><dd>Otevře uloženou smlouvu přímo v Bohemka.App. Najdeš tam její údaje a zapsané provizní výpisy.</dd></div>
              <div><dt>Otevřít smlouvu v MAXX / MAXX</dt><dd>Otevře odkaz na smlouvu v MAXX v nové záložce. V detailu uložené smlouvy se odkaz jmenuje <strong>Maxx</strong>. K dispozici je, pokud je známý příslušný odkaz; externí systém může vyžadovat přihlášení.</dd></div>
              <div><dt>Otevřít extranet / Extranet</dt><dd>Otevře přes Sjednatel detail smlouvy v Extranetu v nové záložce. V detailu uložené smlouvy se tlačítko jmenuje <strong>ExtraNet</strong>. Zobrazuje se, pokud jsou dostupné údaje pro odkaz; externí systém může vyžadovat přihlášení.</dd></div>
              <div><dt>Přidat smlouvu</dt><dd>Otevře formulář předvyplněný údaji z výpisu. Údaje zkontroluješ, doplníš a smlouvu uložíš. Pokud je dostupný odkaz do MAXX, současně se otevře v nové záložce.</dd></div>
            </dl>
            <p><strong>Úpravy v MAXX a Extranetu se provádějí ručně.</strong> Zpracování výpisu může připravit podklady ke změně pojistného či účetní opravě. Samotné otevření odkazu změnu v externím systému neprovede.</p>
          </section>

          <section className={styles.helpStep}>
            <h3><span aria-hidden="true">5</span>Nesrovnalosti a storna</h3>
            <p>Volbou <strong>Označit k řešení</strong> vybereš položky pro <strong>Souhrn nesrovnalostí</strong>. K vybraným položkám můžeš přidat poznámky a stáhnout PDF pro další řešení.</p>
            <p>Storno ve výpisu se zapisuje jako provizní pohyb. Pokud je potřeba změnit také stav samotné smlouvy na storno, použij příslušnou akci v jejím detailu a potvrď datum.</p>
          </section>
        </div>

        <footer className={styles.helpDialogFooter}>
          <button type="button" className={styles.primaryButton} onClick={onClose}>Rozumím, zpět k výpisu</button>
        </footer>
      </div>
    </dialog>
  );
}

export function StatementHelp() {
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button" className={styles.toolButton} aria-haspopup="dialog" aria-controls={open ? dialogId : undefined} onClick={() => setOpen(true)}>
        <Info size={16} aria-hidden="true" />Info
      </button>
      {open && <StatementHelpDialog dialogId={dialogId} returnFocusRef={triggerRef} onClose={() => setOpen(false)} />}
    </>
  );
}
