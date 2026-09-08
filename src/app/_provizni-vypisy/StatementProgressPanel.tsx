"use client";

import { useId } from "react";
import { Check, CheckCheck, CircleAlert, FileText, Loader2, Search } from "lucide-react";
import { StatementDocumentVisual, StatementImportSteps } from "./StatementImportPanel";
import type { ContractMatchStats } from "./statementTypes";
import styles from "./statementImport.module.css";

type StatementProgressPanelProps =
  | { mode: "reading"; fileCount: number }
  | { mode: "pairing"; stats: ContractMatchStats; hasUser: boolean }
  | { mode: "saving"; statementCount: number; completedCount: number };

export function StatementProgressPanel(props: StatementProgressPanelProps) {
  const titleId = useId();
  const pairing = props.mode === "pairing" ? props : null;
  const waitingForUser = pairing && !pairing.hasUser;
  const complete = pairing && pairing.stats.total > 0 && pairing.stats.completed >= pairing.stats.total;
  const total = props.mode === "pairing" ? props.stats.total : props.mode === "saving" ? props.statementCount : props.fileCount;
  const completed = pairing?.stats.completed ?? (props.mode === "saving" ? props.completedCount : 0);
  const progress = props.mode === "pairing" && total > 0
    ? Math.min(100, Math.max(0, Math.round(completed / total * 100)))
    : props.mode === "saving" && total > 1 ? Math.min(100, Math.max(0, Math.round(completed / total * 100))) : undefined;
  const title = props.mode === "reading" ? "Načítáme tvůj výpis"
    : props.mode === "saving" ? "Zapisujeme provizní položky"
      : waitingForUser ? "Čekáme na přihlášení"
        : complete ? "Kontrola je připravená" : "Hledáme souvislosti";
  const description = props.mode === "reading" ? "Čteme soubory a připravujeme položky ke kontrole."
    : props.mode === "saving" ? "Ukládáme výpis a aktualizujeme záznamy u smluv."
      : waitingForUser ? "Po přihlášení porovnáme výpis s tvými uloženými smlouvami."
        : "Porovnáváme čísla smluv z výpisu s uloženými záznamy.";
  const status = props.mode === "reading" ? `Načítané soubory: ${total}`
    : props.mode === "saving" ? total > 1 ? `Potvrzené výpisy: ${completed} z ${total}` : "Čekáme na potvrzení zpracování."
      : waitingForUser ? "Párování začne po přihlášení."
        : `Zkontrolováno ${completed} z ${total} smluv`;
  const Icon = props.mode === "reading" ? FileText : props.mode === "saving" ? CheckCheck : Search;
  const active = props.mode === "reading" ? 0 : complete ? 3 : 1;

  return (
    <section className={styles.progressPanel} aria-labelledby={titleId} data-paused={Boolean(waitingForUser || complete)}>
      <div className={styles.progressMain}>
        <div className={styles.progressVisual}><StatementDocumentVisual active={!waitingForUser && !complete} /></div>
        <div className={styles.progressContent}>
          <p className={styles.progressEyebrow}><Icon size={16} aria-hidden="true" />{props.mode === "saving" ? "ZPRACOVÁNÍ VÝPISU" : "KONTROLA VÝPISU"}</p>
          <h2 id={titleId}>{title}</h2>
          <p className={styles.progressDescription}>{description}</p>
          <div className={styles.progressReadout}>
            <p role="status" aria-live="polite" aria-atomic="true">{!waitingForUser && !complete ? <Loader2 className={styles.spinner} size={16} aria-hidden="true" /> : complete ? <Check size={16} aria-hidden="true" /> : null}{status}</p>
            {progress !== undefined && !waitingForUser ? <strong>{progress}<span>%</span></strong> : null}
          </div>
          <div className={styles.progressTrack} data-indeterminate={progress === undefined} role="progressbar" aria-label={props.mode === "saving" ? "Průběh zápisu výpisů" : "Průběh kontroly výpisu"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={waitingForUser ? undefined : progress} aria-valuetext={status}>
            <span style={progress === undefined ? undefined : { width: `${progress}%` }} />
          </div>
          {pairing ? (
            <dl className={styles.matchStats}>
              <div><dt><Check size={14} aria-hidden="true" />Nalezené smlouvy</dt><dd>{pairing.stats.matched}</dd></div>
              <div><dt><Search size={14} aria-hidden="true" />Bez shody</dt><dd>{pairing.stats.notFound}</dd></div>
              <div data-error={pairing.stats.errors > 0}><dt><CircleAlert size={14} aria-hidden="true" />Chyby načtení</dt><dd>{pairing.stats.errors}</dd></div>
            </dl>
          ) : <p className={styles.progressFootnote}>{props.mode === "reading" ? "Výsledky si nejdřív v klidu projdeš." : "Okno se zavře po potvrzení zápisu."}</p>}
        </div>
      </div>
      <StatementImportSteps active={active} saving={props.mode === "saving"} />
    </section>
  );
}
