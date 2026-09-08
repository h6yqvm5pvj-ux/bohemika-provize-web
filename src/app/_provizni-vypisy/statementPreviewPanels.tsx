import { AlertTriangle, CalendarDays, CheckCircle2, Eye, ReceiptText } from "lucide-react";
import styles from "./statementWorkspace.module.css";

export function StatementPreviewHeader({
  fileName,
  statementNumber,
  statementDate,
  period,
  saved = false,
}: {
  fileName: string;
  statementNumber: string | null | undefined;
  statementDate: string | null | undefined;
  period?: string | null;
  saved?: boolean;
}) {
  return (
    <div className={styles.statementHeader}>
      <div className={styles.statementIdentity}>
        <span className={styles.statementIcon}><ReceiptText size={23} strokeWidth={1.5} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className={styles.statementTitle}>Výpis {statementNumber ?? "bez čísla"}</h2>
          <div className={styles.fileMeta}>
            <span className={styles.fileName}>{fileName}</span>
            {statementDate && <span className={styles.fileDate}>Vystaveno {statementDate}</span>}
          </div>
        </div>
      </div>
      <div className={styles.headerAside}>
        <p className={styles.period}><CalendarDays aria-hidden="true" /><span>Období {period ?? "neuvedeno"}</span></p>
        <span className={styles.statementStatus} data-saved={saved}>
          {saved ? <CheckCircle2 size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
          {saved ? "Zpracovaný výpis" : "Náhled · bez zápisu provizí"}
        </span>
      </div>
    </div>
  );
}

export function StatementParseWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className={styles.parseWarnings}>
      {warnings.map((warning) => (
        <div key={warning} className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
          <span>{warning}</span>
        </div>
      ))}
    </div>
  );
}
