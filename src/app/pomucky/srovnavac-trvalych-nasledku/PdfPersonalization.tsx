import { useId } from "react";
import styles from "./comparison.module.css";
import type { PdfAdvisorDetails } from "./pdfAdvisorCard";

const advisorFields = [
  { key: "fullName", label: "Jméno a příjmení na vizitce", type: "text", maxLength: 120 },
  { key: "title", label: "Profese", type: "text", maxLength: 120 },
  { key: "phone", label: "Telefon", type: "tel", maxLength: 80 },
  { key: "email", label: "E-mail", type: "email", maxLength: 160 },
] as const;

export function PdfAdvisorFields({ details, onChange }: {
  details: PdfAdvisorDetails;
  onChange: (field: keyof PdfAdvisorDetails, value: string) => void;
}) {
  return (
    <div className={styles.pdfPersonalizationFields}>
      {advisorFields.map(({ key, label, type, maxLength }) => (
        <label key={key}>{label}<input type={type} maxLength={maxLength} autoComplete="off"
          value={details[key]} onChange={event => onChange(key, event.target.value)} /></label>
      ))}
    </div>
  );
}

export function PdfPersonalization({ clientName, advisorName, onClientNameChange, onAdvisorNameChange,
  advisorDetails, advisorLoading, advisorError, onEditAdvisor, onChangeAdvisorField }: {
  clientName: string;
  advisorName: string;
  onClientNameChange: (value: string) => void;
  onAdvisorNameChange: (value: string) => void;
  advisorDetails?: PdfAdvisorDetails;
  advisorLoading: boolean;
  advisorError: string | null;
  onEditAdvisor: () => void;
  onChangeAdvisorField: (field: keyof PdfAdvisorDetails, value: string) => void;
}) {
  const id = useId();

  return (
    <details className={styles.pdfPersonalization}>
      <summary>Údaje do PDF a vizitka <span>nepovinné</span></summary>
      <div className={styles.pdfPersonalizationFields}>
        <label htmlFor={`${id}-client`}>
          Jméno klienta
          <input id={`${id}-client`} type="text" value={clientName} onChange={event => onClientNameChange(event.target.value)} placeholder="Jméno a příjmení" maxLength={100} autoComplete="off" />
        </label>
        <label htmlFor={`${id}-advisor`}>
          Jméno poradce na titulní straně
          <input id={`${id}-advisor`} type="text" value={advisorName} onChange={event => onAdvisorNameChange(event.target.value)} placeholder="Jméno a příjmení" maxLength={100} autoComplete="off" />
        </label>
      </div>
      <div className={styles.pdfAdvisorEditor}>
        {advisorDetails ? (
          <fieldset>
            <legend>Vizitka poradce</legend>
            <p>Úpravy platí jen pro PDF. QR otevře zveřejněnou online vizitku. Pokud ji nemáš, uloží vyplněný kontakt.</p>
            <PdfAdvisorFields details={advisorDetails} onChange={onChangeAdvisorField} />
          </fieldset>
        ) : (
          <button type="button" onClick={onEditAdvisor} disabled={advisorLoading}>
            {advisorLoading ? "Načítám údaje…" : "Upravit vizitku poradce"}
          </button>
        )}
        {advisorError && <p role="alert">{advisorError}</p>}
      </div>
    </details>
  );
}
