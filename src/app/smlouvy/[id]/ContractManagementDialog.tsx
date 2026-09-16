"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, ArrowRightLeft, CalendarDays, Check, ChevronRight, FileText, Info, LoaderCircle, RotateCcw, Search, Settings2, Trash2, UserRound, X } from "lucide-react";
import { nameFromEmail } from "./contractDetailHelpers";
import styles from "./contractManagement.module.css";

export type ContractManagementAction =
  | { kind: "storno"; date: string }
  | { kind: "restore" }
  | { kind: "delete" }
  | { kind: "transfer"; targetEmail: string; effectiveDate: string };

type TransferTarget = { email: string; name: string | null };
type ActionKind = "storno" | "transfer" | "delete";
type Props = {
  contractNumber: string;
  clientName: string;
  productLabel: string;
  canSetStorno: boolean;
  canDelete: boolean;
  canRequestTransfer: boolean;
  isStorno: boolean;
  initialStornoDate: string;
  minimumStornoDate?: string | null;
  today: string;
  transferTargets: TransferTarget[];
  busy: boolean;
  error: string | null;
  onClearError: () => void;
  onConfirm: (action: ContractManagementAction) => Promise<boolean>;
  onClose: () => void;
};

const dateLabel = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${Number(day)}. ${Number(month)}. ${year}` : "—";
};
const targetLabel = (target: TransferTarget) => target.name?.trim() || nameFromEmail(target.email) || target.email;
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs-CZ").trim();

export function ContractManagementDialog({ contractNumber, clientName, productLabel, canSetStorno, canDelete, canRequestTransfer, isStorno, initialStornoDate, minimumStornoDate, today, transferTargets, busy, error, onClearError, onConfirm, onClose }: Props) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const submissionRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(0);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [stornoMode, setStornoMode] = useState<"set" | "restore">("set");
  const [stornoDate, setStornoDate] = useState(initialStornoDate || today);
  const [targetEmail, setTargetEmail] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [localError, setLocalError] = useState<string | null>(null);
  const locked = busy || submitting;
  const steps = action === "delete" ? ["Výběr akce", "Potvrzení"] : ["Výběr akce", "Údaje", "Potvrzení"];
  const isLastStep = step === steps.length - 1;
  const selectedTarget = transferTargets.find(target => target.email === targetEmail);
  const matchingTargets = transferTargets.filter(target => normalizeSearch(`${targetLabel(target)} ${target.email}`).includes(normalizeSearch(targetQuery)));
  const canContinue = action === "storno" ? canSetStorno : action === "delete" ? canDelete : action === "transfer" ? canRequestTransfer : false;
  const clearError = () => { setLocalError(null); onClearError(); };
  const close = () => { if (!locked && !submissionRef.current) onClose(); };

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected && trigger.getClientRects().length) trigger.focus({ preventScroll: true });
      else Array.from(document.querySelectorAll<HTMLButtonElement>("[data-contract-management], [data-contract-menu]"))
        .find(button => button.getClientRects().length > 0)?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const goBack = (nextStep: number) => {
    if (locked || submissionRef.current) return;
    clearError();
    setStep(nextStep);
  };

  const proceed = async () => {
    if (locked || submissionRef.current || !canContinue) return;
    clearError();
    if (!isLastStep) {
      if (step === 1) {
        if (action === "transfer" && !selectedTarget) {
          setLocalError("Vyber nového správce ze seznamu poradců.");
          return;
        }
        if ((action === "transfer" || stornoMode === "set") && !dateRef.current?.reportValidity()) return;
      }
      setStep(current => current + 1);
      return;
    }

    let command: ContractManagementAction;
    if (action === "delete") command = { kind: "delete" };
    else if (action === "storno") {
      if (stornoMode === "restore" && !isStorno) return;
      command = stornoMode === "restore" ? { kind: "restore" } : { kind: "storno", date: stornoDate };
    } else if (action === "transfer" && selectedTarget) command = { kind: "transfer", targetEmail: selectedTarget.email, effectiveDate };
    else return;

    submissionRef.current = true;
    setSubmitting(true);
    try {
      if (await onConfirm(command)) onClose();
    } catch {
      setLocalError("Akci se nepodařilo dokončit. Zkus to prosím znovu.");
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  };

  const choices = [
    { kind: "storno" as const, allowed: canSetStorno, icon: CalendarDays, title: "Storno smlouvy", description: isStorno ? "Upravit datum nebo zrušit stávající storno." : "Nastavit datum ukončení a stav smlouvy." },
    { kind: "transfer" as const, allowed: canRequestTransfer, icon: ArrowRightLeft, title: "Převod smlouvy", description: "Požádat o změnu správce smlouvy." },
    { kind: "delete" as const, allowed: canDelete, icon: Trash2, title: "Smazání smlouvy", description: "Trvale odstranit smlouvu z evidence." },
  ].filter(choice => choice.allowed);
  const selectedChoice = choices.find(choice => choice.kind === action);
  const summaryTitle = action === "delete" ? "Smazání smlouvy" : action === "transfer" ? "Žádost o převod" : stornoMode === "restore" ? "Zrušení storna" : isStorno ? "Úprava storna" : "Storno smlouvy";
  const submitLabel = action === "delete" ? "Smazat smlouvu" : action === "transfer" ? "Odeslat žádost" : stornoMode === "restore" ? "Zrušit storno" : isStorno ? "Uložit storno" : "Potvrdit storno";

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={`${id}-title`}
      onCancel={event => { event.preventDefault(); close(); }}
      onKeyDown={event => {
        if (event.key === "Escape") event.stopPropagation();
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }}
    >
      <header className={styles.header}>
        <span className={styles.headerIcon}><Settings2 size={23} strokeWidth={1.6} aria-hidden="true" /></span>
        <div><p>Smlouva {contractNumber || "bez čísla"}</p><h2 id={`${id}-title`}>Správa smlouvy</h2></div>
        <button type="button" className={styles.close} aria-label="Zavřít správu smlouvy" disabled={locked} onClick={close}><X size={19} aria-hidden="true" /></button>
      </header>
      <nav aria-label="Kroky správy smlouvy" className={styles.stepper}>
        <ol>{steps.map((label, index) => (
          <li key={label} data-current={index === step} data-complete={index < step}>
            <button type="button" disabled={index >= step || locked} aria-current={index === step ? "step" : undefined} onClick={() => goBack(index)}>
              <span className={styles.stepNumber}>{index < step ? <Check size={13} aria-hidden="true" /> : index + 1}</span>
              <span>{label}</span>
            </button>
          </li>
        ))}</ol>
      </nav>
      <form className={styles.form} noValidate onSubmit={event => { event.preventDefault(); void proceed(); }}>
        <div className={styles.content} ref={contentRef}>
          <div className={styles.stepHeading}>
            <p>Krok {step + 1} z {steps.length}</p>
            <h3 ref={headingRef} tabIndex={-1}>{step === 0 ? "Co chcete se smlouvou udělat?" : isLastStep ? "Zkontrolujte a potvrďte" : action === "transfer" ? "Komu smlouvu převést?" : isStorno ? "Jak upravit storno?" : "Kdy smlouva končí?"}</h3>
            <span>{step === 0 ? "Vyberte akci, kterou chcete pokračovat." : isLastStep ? "Ještě jednou si ověřte údaje před dokončením." : action === "transfer" ? "Zvolte nového správce a datum účinnosti." : "Datum storna si ověřte v MAXXu nebo Extranetu."}</span>
          </div>

          {step === 0 && <fieldset className={styles.choices} disabled={locked}>
            <legend className={styles.srOnly}>Vyberte akci smlouvy</legend>
            {choices.map(choice => <label key={choice.kind} className={styles.choice} data-selected={choice.kind === action} data-kind={choice.kind}>
              <input type="radio" name={`${id}-action`} value={choice.kind} checked={action === choice.kind} onChange={() => { setAction(choice.kind); clearError(); }} className={styles.srOnly} />
              <span className={styles.choiceIcon}><choice.icon size={21} strokeWidth={1.7} aria-hidden="true" /></span>
              <span className={styles.choiceText}><strong>{choice.title}</strong><span>{choice.description}</span></span>
              <span className={styles.choiceCheck} aria-hidden="true">{action === choice.kind ? <Check size={13} /> : <ChevronRight size={15} />}</span>
            </label>)}
          </fieldset>}

          {step === 1 && !isLastStep && action === "storno" && <>
            {isStorno && <fieldset className={styles.modeOptions} disabled={locked}>
              <legend className={styles.srOnly}>Úprava storna</legend>
              <label data-selected={stornoMode === "set"}><input type="radio" name={`${id}-storno-mode`} checked={stornoMode === "set"} onChange={() => { setStornoMode("set"); clearError(); }} /><CalendarDays size={16} aria-hidden="true" />Upravit datum</label>
              <label data-selected={stornoMode === "restore"}><input type="radio" name={`${id}-storno-mode`} checked={stornoMode === "restore"} onChange={() => { setStornoMode("restore"); clearError(); }} /><RotateCcw size={16} aria-hidden="true" />Zrušit storno</label>
            </fieldset>}
            {stornoMode === "set" ? <label className={styles.field}>
              <span id={`${id}-storno-label`}>Datum storna</span>
              <input ref={dateRef} type="date" aria-labelledby={`${id}-storno-label`} aria-describedby={minimumStornoDate ? `${id}-storno-hint` : undefined} value={stornoDate} required min={minimumStornoDate || undefined} disabled={locked} onChange={event => { setStornoDate(event.target.value); clearError(); }} />
              {minimumStornoDate && <small id={`${id}-storno-hint`}>Nejdříve {dateLabel(minimumStornoDate)} · počátek smlouvy</small>}
            </label> : <div className={styles.notice}><RotateCcw size={18} aria-hidden="true" /><p>Storno bude odstraněno a smlouva se vrátí do aktivního stavu.</p></div>}
          </>}

          {step === 1 && !isLastStep && action === "transfer" && <>
            <label className={styles.field} htmlFor={`${id}-search`}><span>Nový správce</span></label>
            <div className={styles.search}><Search size={17} aria-hidden="true" /><input id={`${id}-search`} type="search" value={targetQuery} autoComplete="off" placeholder="Hledat jméno nebo e-mail" disabled={locked} onChange={event => { setTargetQuery(event.target.value); clearError(); }} /></div>
            <fieldset className={styles.targets} disabled={locked}>
              <legend className={styles.srOnly}>Dostupní správci</legend>
              {matchingTargets.map(target => <label key={target.email} className={styles.target} data-selected={targetEmail === target.email}>
                <input type="radio" name={`${id}-target`} value={target.email} checked={targetEmail === target.email} onChange={() => { setTargetEmail(target.email); clearError(); }} />
                <span><strong>{targetLabel(target)}</strong><small>{target.email}</small></span>
              </label>)}
              {!matchingTargets.length && <p className={styles.noResults}>Žádný poradce neodpovídá hledání.</p>}
            </fieldset>
            {selectedTarget && <p className={styles.selectedTarget}><Check size={13} aria-hidden="true" />Vybráno: {targetLabel(selectedTarget)}</p>}
            <label className={styles.field}><span>Datum účinnosti převodu</span><input ref={dateRef} type="date" value={effectiveDate} required disabled={locked} onChange={event => { setEffectiveDate(event.target.value); clearError(); }} /></label>
          </>}

          {isLastStep && <>
            <div className={styles.summaryTitle} data-danger={action === "delete"}>
              {selectedChoice && <selectedChoice.icon size={21} strokeWidth={1.7} aria-hidden="true" />}<strong>{summaryTitle}</strong>
            </div>
            <dl className={styles.summary}>
              <div><dt>Klient</dt><dd>{clientName || "Neuvedeno"}</dd></div>
              <div><dt>Smlouva</dt><dd>{contractNumber || "Bez čísla"}</dd></div>
              <div><dt>Produkt</dt><dd>{productLabel}</dd></div>
              {action === "storno" && <div><dt>{stornoMode === "restore" ? "Nový stav" : "Datum storna"}</dt><dd>{stornoMode === "restore" ? "Aktivní" : dateLabel(stornoDate)}</dd></div>}
              {action === "transfer" && selectedTarget && <>
                <div><dt>Nový správce</dt><dd>{targetLabel(selectedTarget)}<small>{selectedTarget.email}</small></dd></div>
                <div><dt>Účinnost od</dt><dd>{dateLabel(effectiveDate)}</dd></div>
              </>}
            </dl>
            <div className={styles.notice} data-danger={action === "delete"}>
              {action === "delete" ? <AlertTriangle size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}
              <p>{action === "delete" ? "Smlouva bude trvale odstraněna. Tuto akci nelze vrátit zpět." : action === "transfer" ? "Žádost se odešle administrátorovi ke schválení. Novému správci od data účinnosti náleží dosud nevyplacené a budoucí provize. Již vyplacené provize se nemění." : stornoMode === "restore" ? "Smlouva se vrátí do aktivního stavu a datum storna se odstraní, včetně navazujících záznamů smlouvy." : "Datum a stav storna se uloží ke smlouvě i jejím navazujícím záznamům."}</p>
            </div>
          </>}

          {step === 0 && <p className={styles.contractContext}><UserRound size={13} aria-hidden="true" />{clientName || "Klient není uvedený"}<span>·</span><FileText size={13} aria-hidden="true" />{productLabel}</p>}
          {(localError || error) && <p className={styles.error} role="alert">{localError || error}</p>}
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.back} disabled={locked} onClick={() => step > 0 ? goBack(step - 1) : close()}>{step > 0 && <ArrowLeft size={15} aria-hidden="true" />}{step > 0 ? "Zpět" : "Zrušit"}</button>
          <button type="submit" className={styles.primary} data-danger={isLastStep && action === "delete"} disabled={!canContinue || locked} aria-busy={locked}>
            {locked ? <><LoaderCircle size={16} className={styles.spinner} aria-hidden="true" />{action === "delete" ? "Mažu…" : action === "transfer" ? "Odesílám…" : "Ukládám…"}</> : isLastStep ? submitLabel : <>Pokračovat<ArrowRight size={15} aria-hidden="true" /></>}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
