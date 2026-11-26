"use client";

import { onAuthStateChanged } from "firebase/auth";
import { FileText } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { auth } from "@/app/firebase-auth";
import { ADMIN_IMPERSONATION_EVENT } from "@/app/lib/adminImpersonation";
import { AppLayout } from "@/components/AppLayout";
import { DocumentsHeader } from "../../dokumenty/DocumentsUi";
import documentStyles from "../../dokumenty/documents.module.css";
import { PdfPersonalization } from "../../srovnavac-trvalych-nasledku/PdfPersonalization";
import { loadPdfAdvisorDetails, PdfAdvisorCardError, type PdfAdvisorDetails, type PdfAdvisorDraft } from "../../srovnavac-trvalych-nasledku/pdfAdvisorCard";
import styles from "../clientDocuments.module.css";
import { SickLeavePrintDialog } from "./SickLeavePrintDialog";
import {
  compareSickLeave, coverageHeading, formatCents, formatDays, MAX_DAILY_KC, MAX_DAYS, MODEL_NOTE,
  parseDailyCents, parseStartDay, PAYOUT_RULES, PRODUCT_GROUPS, readCoverage, START_DAYS,
  type Comparison, type CoverageInput,
} from "./sickLeaveComparison";

const initialCurrent: CoverageInput = { product: "", startDay: "29", mode: "prospective", dailyAmount: "" };
const initialProposed: CoverageInput = { product: "", startDay: "15", mode: "retroactive", dailyAmount: "" };

function CoverageFields({ variant, input, onChange }: {
  variant: keyof typeof coverageHeading;
  input: CoverageInput;
  onChange: (input: CoverageInput) => void;
}) {
  const id = useId();
  const invalidDay = input.startDay !== "" && parseStartDay(input.startDay) === null;
  const invalidAmount = input.dailyAmount !== "" && parseDailyCents(input.dailyAmount) === null;
  const dayExample = `Zadejte celý den od 1 do ${MAX_DAYS.toLocaleString("cs-CZ")}.`;
  const amountExample = `Zadejte částku od 0,01 do ${MAX_DAILY_KC.toLocaleString("cs-CZ")} Kč.`;

  return (
    <fieldset className={styles.policy} data-variant={variant}>
      <legend>{coverageHeading[variant]}</legend>
      <label className={styles.field}>
        <span>Pojišťovna a produkt</span>
        <select value={input.product} onChange={event => onChange({ ...input, product: event.target.value })}>
          <option value="">Vyberte produkt</option>
          {PRODUCT_GROUPS.map(group => (
            <optgroup key={group.insurerName} label={group.insurerName}>
              {group.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span>Plnění od (den)</span>
          <input
            type="number" min={1} max={MAX_DAYS} step={1} inputMode="numeric"
            aria-invalid={invalidDay} aria-describedby={invalidDay ? `${id}-day-error` : undefined}
            value={input.startDay} onChange={event => onChange({ ...input, startDay: event.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>Částka (Kč / den)</span>
          <input
            type="text" inputMode="decimal" maxLength={16} autoComplete="off" placeholder="např. 500"
            aria-invalid={invalidAmount} aria-describedby={invalidAmount ? `${id}-amount-error` : undefined}
            value={input.dailyAmount} onChange={event => onChange({ ...input, dailyAmount: event.target.value })}
          />
        </label>
      </div>
      {invalidDay && <p className={styles.fieldError} id={`${id}-day-error`}>{dayExample}</p>}
      {invalidAmount && <p className={styles.fieldError} id={`${id}-amount-error`}>{amountExample}</p>}
      <div className={styles.presets} role="group" aria-label="Obvyklý den zahájení plnění">
        {START_DAYS.map(day => (
          <button
            key={day} type="button" aria-pressed={parseStartDay(input.startDay) === day}
            onClick={() => onChange({ ...input, startDay: String(day) })}
          >{day}. den</button>
        ))}
      </div>
      <fieldset className={styles.mode}>
        <legend>Způsob plnění</legend>
        <div>
          <label><input type="radio" name={`${id}-mode`} checked={input.mode === "retroactive"} onChange={() => onChange({ ...input, mode: "retroactive" })} />Zpětně</label>
          <label><input type="radio" name={`${id}-mode`} checked={input.mode === "prospective"} onChange={() => onChange({ ...input, mode: "prospective" })} />Nezpětně</label>
        </div>
      </fieldset>
    </fieldset>
  );
}

function PayoutCell({ amountCents }: { amountCents: number }) {
  return <td data-zero={amountCents === 0}><strong>{formatCents(amountCents)}</strong></td>;
}

function ComparisonTable({ comparison }: { comparison: Comparison }) {
  return (
    <table className={styles.table} aria-label="Modelové pojistné plnění">
      <thead>
        <tr>
          <th scope="col">Délka neschopnosti</th>
          <th scope="col">{coverageHeading.current}<small>{comparison.current.product}</small></th>
          <th scope="col">{coverageHeading.proposed}<small>{comparison.proposed.product}</small></th>
        </tr>
      </thead>
      <tbody>
        {comparison.rows.map(row => (
          <tr key={row.duration} data-start={row.isStartDay}>
            <th scope="row">{formatDays(row.duration)}</th>
            <PayoutCell amountCents={row.current.amountCents} />
            <PayoutCell amountCents={row.proposed.amountCents} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function SickLeavePage() {
  const [current, setCurrent] = useState(initialCurrent);
  const [proposed, setProposed] = useState(initialProposed);
  const [clientName, setClientName] = useState("");
  const [advisorName, setAdvisorName] = useState("");
  const [advisorDraft, setAdvisorDraft] = useState<(PdfAdvisorDraft & { details: PdfAdvisorDetails }) | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorError, setAdvisorError] = useState<string | null>(null);
  const [showPdf, setShowPdf] = useState(false);
  const assertDraftSession = advisorDraft?.assertSession;
  const comparison = useMemo(() => {
    const currentCoverage = readCoverage(current);
    const proposedCoverage = readCoverage(proposed);
    return currentCoverage && proposedCoverage ? compareSickLeave(currentCoverage, proposedCoverage) : null;
  }, [current, proposed]);

  useEffect(() => {
    if (!assertDraftSession) return;
    const checkSession = () => {
      try {
        assertDraftSession();
      } catch {
        setAdvisorDraft(null);
        setShowPdf(false);
      }
    };
    const unsubscribe = onAuthStateChanged(auth, checkSession);
    window.addEventListener(ADMIN_IMPERSONATION_EVENT, checkSession);
    window.addEventListener("storage", checkSession);
    return () => {
      unsubscribe();
      window.removeEventListener(ADMIN_IMPERSONATION_EVENT, checkSession);
      window.removeEventListener("storage", checkSession);
    };
  }, [assertDraftSession]);

  async function editAdvisor() {
    if (advisorLoading) return;
    setAdvisorError(null);
    setAdvisorLoading(true);
    try {
      const { details, assertSession } = await loadPdfAdvisorDetails();
      assertSession();
      setAdvisorDraft({ details, overrides: {}, assertSession });
    } catch (cause) {
      setAdvisorError(cause instanceof PdfAdvisorCardError ? cause.message : "Údaje vizitky se nepodařilo načíst.");
    } finally {
      setAdvisorLoading(false);
    }
  }

  return (
    <AppLayout active="tools">
      <div className={documentStyles.page}>
        <DocumentsHeader
          title="Pracovní neschopnost"
          description="Zadejte parametry stávajícího pojištění a nového návrhu. Tabulka ukáže, kolik by klient dostal při různé délce neschopenky."
          kicker="Srovnání pojistného plnění"
          backHref="/pomucky/dokumenty-pro-klienta"
          backLabel="Dokumenty pro klienta"
        />
        <div className={styles.policies}>
          <CoverageFields variant="current" input={current} onChange={setCurrent} />
          <CoverageFields variant="proposed" input={proposed} onChange={setProposed} />
        </div>
        <p className={styles.rules}>{PAYOUT_RULES}</p>
        <section className={styles.result} aria-labelledby="sick-leave-result">
          <div className={styles.resultHeader}>
            <h2 id="sick-leave-result">Plnění podle délky neschopnosti</h2>
            <button type="button" className={styles.printButton} onClick={() => setShowPdf(true)} disabled={!comparison || advisorLoading}>
              <FileText size={16} aria-hidden="true" /> Náhled a tisk do PDF
            </button>
          </div>
          {comparison ? <>
            <ComparisonTable comparison={comparison} />
            <p className={styles.note}>{MODEL_NOTE}</p>
          </> : <p className={styles.empty}>Vyberte oba produkty a vyplňte den zahájení i denní částku pro každou variantu.</p>}
          <PdfPersonalization
            clientName={clientName}
            advisorName={advisorName}
            onClientNameChange={setClientName}
            onAdvisorNameChange={setAdvisorName}
            advisorDetails={advisorDraft ? { ...advisorDraft.details, ...advisorDraft.overrides } : undefined}
            advisorLoading={advisorLoading}
            advisorError={advisorError}
            onEditAdvisor={() => void editAdvisor()}
            onChangeAdvisorField={(field, value) => setAdvisorDraft(previous => {
              if (!previous) return null;
              const overrides = { ...previous.overrides, [field]: value };
              if (value === previous.details[field]) delete overrides[field];
              return { ...previous, overrides };
            })}
          />
        </section>
        {comparison && showPdf && (
          <SickLeavePrintDialog comparison={comparison} clientName={clientName} advisorName={advisorName}
            advisorDraft={advisorDraft} onClose={() => setShowPdf(false)} />
        )}
      </div>
    </AppLayout>
  );
}
