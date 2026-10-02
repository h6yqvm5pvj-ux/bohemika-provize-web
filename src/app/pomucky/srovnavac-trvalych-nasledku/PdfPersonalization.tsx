import { useId } from "react";
import styles from "./comparison.module.css";

export function PdfPersonalization({ clientName, advisorName, onClientNameChange, onAdvisorNameChange }: {
  clientName: string;
  advisorName: string;
  onClientNameChange: (value: string) => void;
  onAdvisorNameChange: (value: string) => void;
}) {
  const id = useId();

  return (
    <details className={styles.pdfPersonalization}>
      <summary>Údaje do PDF <span>nepovinné</span></summary>
      <div className={styles.pdfPersonalizationFields}>
        <label htmlFor={`${id}-client`}>
          Jméno klienta
          <input id={`${id}-client`} type="text" value={clientName} onChange={event => onClientNameChange(event.target.value)} placeholder="Jméno a příjmení" maxLength={100} autoComplete="off" />
        </label>
        <label htmlFor={`${id}-advisor`}>
          Jméno poradce
          <input id={`${id}-advisor`} type="text" value={advisorName} onChange={event => onAdvisorNameChange(event.target.value)} placeholder="Jméno a příjmení" maxLength={100} autoComplete="off" />
        </label>
      </div>
    </details>
  );
}
